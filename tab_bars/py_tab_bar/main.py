#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Needs PySide2-stubs installed to typecheck properly.


# Imports: Python
import sys
import json
from typing import Any, Optional

# Imports: Third Party
from PySide6.QtCore import QRect, Slot, QObject, Signal, SignalInstance
from PySide6.QtWidgets import QApplication, QTabWidget, QWidget
from PySide6.QtDBus import QDBusConnection
from PySide6 import QtAsyncio
import PySide6.QtCore

# Imports: Project
from record import Record, RecordCollection
import dbus_types
from pyside6_typed_signal import PydanticSingleDictSignalWrapper, PydanticSingleDictSlotWrapper


DEVFIXTURE_rect = QRect(300, 500, 200, 22)
DEVFIXTURE_bar_offset = 50

SERVICE_NAME = "com.aziroshin.KWinWindowTabbingTabBar"
OBJECT_NAME = "/com/aziroshin/KWinWindowTabbingTabBar"
INTERFACE_NAME = "com.aziroshin.KWinWindowTabbingTabBar.TabBar"
DBUS_RETURN_STATUS_RECEIVED = "RECEIVED"


def signal_type_fix_get_typed(signal: SignalInstance | Signal, signal_type: type) -> SignalInstance:
    """Makes it possible to __get_attr__ the instance of the type `signal_type` of
    a `SignalInstance` object without incurring type errors.
    e.g. if the signal was defined with `str` and you wanted to get that, you'd
    pass `str` for `signal_type`.
    """
    # We're suppressing the warning about __get_item__ not being implemented.
    return signal[signal_type]  # pyright: ignore reportIndexIssue


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
    _indexes_by_window_id: dict[str, int] = {}

    def __init__(self, group: "Group") -> None:
        self.group = group
        self._widget = ContextManagedQTabWidget()
        self._widget.setWindowTitle("kwin-window-tabbing-tab-bar:{group_id}".format(
            group_id = group.id
        ))
        self.rect = group.rect

    def show(self) -> None:
        self._widget.show()

    def hide(self) -> None:
        self._widget.hide()

    def delete(self) -> None:
        self._widget.close()
        self._widget.deleteLater()

    def append_new_tab_for_window(self, window: "Window") -> None:
        # We're not interested in the tab's content, since we're just
        # "misusing" the QTabWidget for its tab bar. Hence the dummy.
        dummy = QWidget()
        
        with self._widget as widget:
            self._indexes_by_window_id[window.id] = widget.addTab(dummy, window.caption)

    def remove_tab_for_window(self, window_id: str) -> None:
        with self._widget as widget:
            widget.removeTab(self._indexes_by_window_id[window_id])
            del self._indexes_by_window_id[window_id]

    def activate_tab_for_window(self, window: "Window") -> None:
        with self._widget as widget:
            widget.setCurrentIndex(self._indexes_by_window_id[window.id])

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

    # Emitted when the tab bar widget is clicked, but with extra steps.
    # When the tab bar widget is clicked, that signal is captured
    # in `Group._on_tab_bar_clicked`. The tab index passed via that signal
    # is then used to find the corresponding window and its KWin window ID.
    # That ID is then emitted in a ready-to-send-via-DBus message using
    # this here signal.
    tab_bar_clicked: PydanticSingleDictSignalWrapper[dbus_types.MessageForKWin, None]
    # TODO: Make protected and replace with getter. It should be clear that
    # there are only specific ways of canonically setting this, and direct
    # assignment from outside isn't one of them.
    top_window: Window | None = None
            

    bar: Optional[Bar]
    _rect: QRect
    _windows: RecordCollection[Window]

    def __init__(self,
        id: str,
        rect: QRect
    ) -> None:
        super().__init__(id)
        self.tab_bar_clicked = PydanticSingleDictSignalWrapper()
        self.bar = None
        self.rect = rect
        self._windows = RecordCollection[Window]()

    def on_rect_changed(self, changed_rect: QRect) -> None:
        self.rect = changed_rect

    def on_top_window_id_received(self, window_id: str) -> None:
        window = self._windows.get_by_id(window_id)
        if window:
            self._set_top_window(window)
        else:
            print("[ERROR] Group got told top_window (ID: {id}) it doesn't have (yet?).".format(
                id=window_id)
            )
            self.activate_defunct_state()

    def _set_top_window(self, window: Window):
        self.top_window = window
        if self.bar:
            self.bar.activate_tab_for_window(window)

    def on_window_received(self, window: Window) -> None:
        if window in self._windows:
            return

        self._windows.append(window)
        if len(self._windows) == 2:
            # This section is why `_create_tab_bar` is static, so `self.bar`
            # is understood by the type checker to not be `None` here.
            self.bar = self._create_tab_bar(self)
            self.bar.show()
            self.bar.append_new_tab_for_window(self._windows[0])
            self.bar.append_new_tab_for_window(self._windows[1])
            # In case the top window was already set when group size was == 1.
            if self.top_window:
                self.bar.activate_tab_for_window(self.top_window)
        elif len(self._windows) > 2:
            if not self.bar is None:
                self.bar.append_new_tab_for_window(window)

    # This gets called when we get notified of the KWin script having removed
    # a window.
    # Since we'll need to know which one is the new top window in case the
    # window that got removed was the current top window, we also take a
    # `top_window_id` here.
    #
    # `top_window_id` may only be `None` if the removed window was the last
    # in the group, since then no window would be left to be the top window.
    # In the current implementation, if `top_window_id` is `None` in any
    # other case, the tab bar is hidden to prevent misleading the user.
    def on_window_removed(self,
        id_of_removed_window: str,
        top_window_id: str | None
    ) -> None:
        if not id_of_removed_window in self._windows:
            print((
                "[ERROR] Tried removing window (ID: {window_id}) from group "
                "(ID: {group_id}) that doesn't have it."
                ).format(
                    window_id=id_of_removed_window,
                    group_id=self.id
                )
            )
            return

        if len(self._windows) > 1:
            if top_window_id == None:
                print((
                    "[ERROR] Received window removal (window ID: {window_id}) "
                    "for group (ID: {group_id}) with more than one window, but "
                    "the provided top window (ID: {top_window_id}) is `None`, "
                    "which is only allowed if the removed window was the last "
                    "window in the group."
                    ).format(
                        window_id=id_of_removed_window,
                        group_id=self.id,
                        top_window_id=top_window_id
                    )
                )
                # TODO: This is a serious issue that either needs proper recovery
                # or should result either in a very visible error state or outright
                # hide the entire tab bar for that group. Showing the wrong tab 
                # as active could result in making the user think they're in a
                # different application/folder/document than they really are, with
                # potentially disastrous consequences.
                self.activate_defunct_state()
                return

            if len(self._windows) == 2:
                self._delete_tab_bar()
            self.on_top_window_id_received(top_window_id)
        elif len(self._windows) == 1:
            self.top_window = None

        self._remove_window(id_of_removed_window)

    def _remove_window(self, id_of_removed_window: str) -> None:
        if self.bar:
            self.bar.remove_tab_for_window(id_of_removed_window)
        self._windows.remove_by_id(id_of_removed_window)

    def activate_defunct_state(self) -> None:
        """Helps avoid dangerous UX situations by warning and/or disabling functionality.

        Intended for when errors are detected that could make it dangerous to continue
        making the UI available as-is.

        In the current implementation, this simply hides the tab bar.
        """
        # Just hiding the tab bar and doing nothing else is going to be very
        # irritating, as the grouping will still be active - but it'll have
        # to do for now.
        if self.bar:
            self.bar.hide()
        print("[ERROR] Defunct state activated for group (ID: {id}).".format(id=self.id))

    @property
    def rect(self) -> QRect:
        return self._rect

    @rect.setter
    def rect(self, rect: QRect):
        self._rect = rect
        if self.bar:
            self.bar.rect = rect

    def _on_tab_bar_clicked(self, tab_index: int) -> None:
        if tab_index < len(self._windows):
            # TODO: Check type sanity.
            message = dbus_types.Message(
                code = "REQUEST_TOP_WINDOW_CHANGE",
                # TODO: Needs a way to create an ID.
                id = dbus_types.ID(epoch = 0, disambiguator = 0),
                payload = self._windows[tab_index].as_payload_for_kwin()
            )
            self.tab_bar_clicked.emit(message)

    # It's static so the result can be assigned at the call site, which
    # allows the the type checker to infer that `self.bar` is not `None`.
    @staticmethod
    def _create_tab_bar(group: "Group") -> Bar:
        new_bar = Bar(group)
        new_bar.clicked.connect(group._on_tab_bar_clicked)
        return new_bar

    def _delete_tab_bar(self) -> None:
        if self.bar is None:
            print("[ERROR] Attempted to delete non-existant tab bar on group (ID: {id})".format(
                id=self.id)
            )
            return
        self.bar.clicked.disconnect(self._on_tab_bar_clicked)
        self.bar.delete()
        self.bar = None


class DBusService(QObject):
    class _MessagesForKWin:
        """A pop-everything-at-once-queue for messages for KWin.

        No validation is performed. Only put messages that already passed
        a stage of either validation or sufficient static type checking.
        """
        _messages: list[dict[str, Any]]

        def __init__(self):
            self._messages = []

        def put_message(self, message: dict[str, Any]) -> None:
            """Put a message in the queue to be batch-fetched by KWin.

            Doesn't validate and the static typing of this method isn't
            sufficient. Only put messages that already passed a stage of
            either validation or sufficient static type checking.
            """
            self._messages.append(message)


        def pop_all_messages_as_json(self) -> str:
            """Get all queued messages as JSON and clear the queue.

            There is no validation. We rely upon that only sufficiently
            checked messages have been queued."""
            popped_messages = json.dumps(self._messages, cls=dbus_types.JSONEncoder)
            self._messages.clear()
            return popped_messages

    put_messages_signal = Signal(str)
    on_put_message_for_kwin: PydanticSingleDictSlotWrapper[dbus_types.MessageForKWin, None]
    _messages_for_kwin = _MessagesForKWin()

    def __init__(self, parent: PySide6.QtCore.QObject | None = None):
        super().__init__(parent)
        signal_type_fix_get_typed(self.put_messages_signal, str).connect(self.on_put_messages)
        
        self.on_put_message_for_kwin = PydanticSingleDictSlotWrapper(
            lambda message: self._messages_for_kwin.put_message(message)
        )

    @Slot(str, result=str)
    def PutMessages(self, raw_messages: str) -> str:
        """Used by KWin to send us messages."""
        self.put_messages_signal.emit(raw_messages)

        return DBUS_RETURN_STATUS_RECEIVED

    @Slot(result=str)
    def PopMessages(self) -> str:
        """Used by KWin to pop the messages we have for it."""
        return self._messages_for_kwin.pop_all_messages_as_json()

    @Slot(str)
    def on_put_messages(self, raw_messages: str):
        """Receives messages sent to us.

        Intended to be used by DBus in response to DBus calls by other
        processes.
        """

        # TODO: De-spaghettify this.
        messages = dbus_types.MessagesForTabBar.validate_json(raw_messages)
        for message in messages:
            if message.code == "GROUP_DATA":
                group_id = str(message.payload.id.epoch) + "_" + str(message.payload.id.disambiguator)
                
                group: Group
                if group_id in groups:
                    group = groups[group_id]
                else:
                    group = Group(group_id, DEVFIXTURE_rect)
                    groups.append(group)
                    groups[group_id].tab_bar_clicked.connect(self.on_put_message_for_kwin)
                    
                for window in message.payload.windows:
                    # TODO: window.caption is already `str`. Remove cast.
                    group.on_window_received(Window(str(window.kwin_window_id), str(window.caption)))
                if message.payload.top_window:
                    group.on_top_window_id_received(str(message.payload.top_window.kwin_window_id))
            
            elif message.code == "WINDOW_REMOVED":
                group_id = str(message.payload.removed_window.group_id.epoch) + "_" + str(message.payload.removed_window.group_id.disambiguator)
                if group_id in groups:
                    group = groups[group_id]
                    group.on_window_removed(
                        str(message.payload.removed_window.kwin_window_id),
                        str(message.payload.top_window_id.kwin_window_id)
                    )


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    groups = RecordCollection[Group]()

    dbus = QDBusConnection.sessionBus()
    dbus.registerService(SERVICE_NAME)
    dbus_message_object = DBusService()

    dbus.registerObject(OBJECT_NAME, dbus_message_object, QDBusConnection.RegisterOption.ExportAllSlots)
    QtAsyncio.run(handle_sigint=True)  # pyright: ignore [reportUnknownMemberType]
