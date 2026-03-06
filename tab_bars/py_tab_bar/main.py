#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Needs PySide2-stubs installed to typecheck properly.


# Imports: Python
import sys
import json
from typing import Optional

# Imports: Third Party
from PySide6.QtCore import QRect, Slot, QObject, Signal, SignalInstance
from PySide6.QtWidgets import QApplication, QTabWidget, QWidget
from PySide6.QtDBus import QDBusConnection
from PySide6 import QtAsyncio
import PySide6.QtCore

# Imports: Project
from record import Record, RecordCollection
import dbus_types


DEVFIXTURE_rect = QRect(300, 500, 200, 22)
DEVFIXTURE_bar_offset = 50

SERVICE_NAME = "com.aziroshin.KWinWindowTabbingTabBar"
OBJECT_NAME = "/com/aziroshin/KWinWindowTabbingTabBar"
INTERFACE_NAME = "com.aziroshin.KWinWindowTabbingTabBar.TabBar"
DBUS_RETURN_STATUS_RECEIVED = "RECEIVED"


# Makes it possible to __get_attr__ the instance of the type `signal_type` of
# a `SignalInstance` object without incurring type errors.
# e.g. if the signal was defined with `str` and you wanted to get that, you'd
# pass `str` for `signal_type`.
def signal_type_fix_get_typed(signal: SignalInstance | Signal, signal_type: type) -> SignalInstance:
    # We're suppressing the warning about __get_item__ not being implemented.
    return signal[signal_type]  # pyright: ignore [reportUnknownVariableType, reportGeneralTypeIssues]


class ContextManagedQTabWidget(QTabWidget):
    """A `QTabWidget` that automatically toggles `updatesEnabled`.

    Disables updates to the widget inside the `with`-statement.
    Note: `__exit__` always returns `None` and doesn't do any exception
    handling.
    """
    def __enter__(self) -> "ContextManagedQTabWidget":
        self.setUpdatesEnabled(False)
        return self

    def __exit__(self, *_) -> None:
        self.setUpdatesEnabled(True)
        # If we do something that causes exceptions in a `with` statement,
        # we should handle that there. If we make this return a boolean
        # value, it'll unnecessarily complicate properties like
        # `Bar.rect`, even though the only reason we context manage
        # this is for the calls to `setUpdatesEnabled`, not to deal with
        # exceptions.


class Bar:
    group: "Group"
    _widget: ContextManagedQTabWidget

    def __init__(self, group: "Group") -> None:
        self.group = group
        self._widget = ContextManagedQTabWidget()
        self._widget.setWindowTitle("kwin-window-tabbing-tab-bar:{group_id}".format(
            group_id = group.id
        ))
        self.rect = group.rect
        #self.resize(int(self.group.rect.width() - DEVFIXTURE_bar_offset * 2), 1)
        #self.move(group.rect.x() + DEVFIXTURE_bar_offset, group.rect.y())

    def show(self) -> None:
        self._widget.show()

    def hide(self) -> None:
        self._widget.hide()

    def add_tab_for_window(self, window: "Window") -> None:
        dummy = QWidget()
        with self._widget as widget:
            widget.addTab(dummy, window.caption)

    def resize(self, width: int, height: int) -> None:
        with self._widget as widget:
            widget.resize(width, height)

    def move(self, x: int, y: int) -> None:
        with self._widget as widget:
            widget.move(x, y)

    @property
    def rect(self) -> QRect:
        with self._widget as widget:
            return widget.rect()

    @rect.setter
    def rect(self, rect: QRect):
        with self._widget as widget:
            widget.setGeometry(rect)

    @property
    def clicked(self) -> SignalInstance:
        """Emitted when the tab bar widget is clicked."""
        return self._widget.tabBarClicked
        
    #def remove_tab(self, )


class Window(Record):
    caption: str

    def __init__(self, id: str, caption: str) -> None:
        super().__init__(id)
        self.caption = caption
    def as_payload_for_kwin(self) -> dbus_types.WindowForKWinPayload:
        return dbus_types.WindowForKWinPayload(
            kwin_window_id=int(self.id)
        )


class Group(Record):
    # This exists because `Group` isn't a QObject, so it can't have signals
    # directly.
    class Signals(QObject):
        # Emitted when the tab bar widget is clicked, but with extra steps.
        # When the tab bar widget is clicked, that signal is captured
        # in `Group._on_tab_bar_clicked`. The tab index passed via that signal
        # is then used to find the corresponding window and its KWin window ID.
        # That ID is then emitted in a ready-to-send-via-DBus message using
        # this here signal.
        # TODO: Fix typing/make it more specific.
        tab_bar_clicked = Signal(
            #dbus_types.MessageForKWin
            dict
        )

    bar: Optional[Bar]
    _rect: QRect
    _windows: RecordCollection[Window]
    signals = Signals()

    def __init__(
        self, id: str,
        rect: QRect
    ) -> None:
        super().__init__(id)
        self.bar = None
        self.rect = rect
        print("Group init, rect: ", self.rect)
        self._windows = RecordCollection[Window]()

    def on_rect_changed(self, changed_rect: QRect) -> None:
        self.rect = changed_rect

    def on_window_received(self, window: Window) -> None:
        self._windows.append(window)
        if len(self._windows) == 2:
            # This section is why `_create_tab_bar` is static, so `self.bar`
            # is understood by the type checker to not be `None` here.
            self.bar = self._create_tab_bar(self)
            self.bar.show()
            self.bar.add_tab_for_window(self._windows[0])
            self.bar.add_tab_for_window(self._windows[1])
        elif len(self._windows) > 2:
            if not self.bar is None:
                self.bar.add_tab_for_window(window)

    # TODO
    def on_window_left(self, window_id: str) -> None:
        if len(self._windows) == 2:
            self.bar = None
            self._windows.remove_by_id(window_id)

    def _remove_window_by_id(self, window_id: str) -> None:
        [self._windows.remove(window) for window in self._windows if window.id == window_id]


    @property
    def rect(self) -> QRect:
        return self._rect

    @rect.setter
    def rect(self, rect: QRect):
        print("rect setter called")
        self._rect = rect
        if self.bar:
            self.bar.rect = rect

    def _on_tab_bar_clicked(self, tab_index: int) -> None:
        if tab_index < len(self._windows):
            # TODO: Fix typing.
            self.signals.tab_bar_clicked.emit(
                {
                    "code": "REQUEST_TOP_WINDOW_CHANGE",
                    # TODO: Needs a way to create an ID.
                    "id": "",
                    "payload": self._windows[tab_index].as_payload_for_kwin()
                }
            )

    # It's static so the result can be assigned at the call site, which
    # allows the the type checker to infer that `self.bar` is not `None`.
    @staticmethod
    def _create_tab_bar(group: "Group") -> Bar:
        new_bar = Bar(group)
        new_bar.clicked.connect(group._on_tab_bar_clicked)
        return new_bar
            

class MessagesForKWin:
    _messages: dbus_types.MessagesForKWinList

    def __init__(self):
        self._messages = []

    def put_message(self, message: dbus_types.MessageForKWin) -> None:
        self._messages.append(message)


    def pop_all_messages_as_json(self) -> str:
        popped_messages = json.dumps(self._messages, cls=dbus_types.JSONEncoder)
        self._messages.clear()
        return popped_messages


class DBusService(QObject):
    put_messages_signal = Signal(str)
    messages_for_kwin = MessagesForKWin()

    def __init__(self, parent: PySide6.QtCore.QObject | None = None):
        super().__init__(parent)
        signal_type_fix_get_typed(self.put_messages_signal, str).connect(self.on_put_messages)

    @Slot(str, result=str)
    def PutMessages(self, raw_messages: str) -> str:
        """Used by KWin to send us messages."""
        self.put_messages_signal.emit(raw_messages)

        return DBUS_RETURN_STATUS_RECEIVED

    @Slot(result=str)
    def PopMessages(self) -> str:
        """Used by KWin to pop the messages we have for it."""
        return self.messages_for_kwin.pop_all_messages_as_json()

    @Slot(str)
    def on_put_messages(self, raw_messages: str):
        """Receives messages sent to us.

        Intended to be used by DBus in response to DBus calls by other
        processes.
        """

        messages = dbus_types.MessagesForTabBar.validate_json(raw_messages)
        for message in messages:
            if message.code == "GROUP_DATA":
                for window in message.payload.windows:
                    group_id = str(window.group_id.epoch) + "_" + str(window.group_id.disambiguator)
                    if not group_id in groups:
                        group = Group(group_id, DEVFIXTURE_rect)
                        groups.append(group)
                        # TODO: Fix the typing issue with this and replace the line after with this (or similar).
                        # signal_type_fix_get_typed(
                        #    groups[group_id].signals.tab_bar_clicked,
                        #    dbus_types.MessageForKWin
                        #).connect(self.on_put_message_for_kwin)
                        groups[group_id].signals.tab_bar_clicked.connect(self.on_put_message_for_kwin)
                    else:
                        group = groups[group_id]
                    groups[group_id].on_window_received(Window(str(window.kwin_window_id), str(window.caption)))
        print("[DEBUG] messages: ", messages)

    @Slot(str)
    def on_put_message_for_kwin(self, message: dbus_types.MessageForKWin) -> None:
        """Receives messages to be queued for getting collected by KWin.

        Primarily intended for internal code use instead of being a response
        function to DBus calls, but could be used for a relay if such a thing
        were ever implemented for some reason.
        """
        self.messages_for_kwin.put_message(message)

        

if __name__ == "__main__":
    app = QApplication(sys.argv)
    groups = RecordCollection[Group]()

    dbus = QDBusConnection.sessionBus()
    dbus.registerService(SERVICE_NAME)
    dbus_message_object = DBusService()

    dbus.registerObject(OBJECT_NAME, dbus_message_object, QDBusConnection.RegisterOption.ExportAllSlots)
    QtAsyncio.run(handle_sigint=True)  # pyright: ignore [reportUnknownMemberType]
