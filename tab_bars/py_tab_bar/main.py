#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Needs PySide2-stubs installed to typecheck properly.


# Imports: Python
import sys
import json
from types import TracebackType
from typing import Optional, Type
import traceback

# Imports: Third Party
from PySide6.QtCore import QRect, Slot, QObject, Signal, SignalInstance
from PySide6.QtWidgets import QApplication, QTabWidget, QWidget
from PySide6.QtDBus import QDBusConnection
from PySide6 import QtAsyncio
import PySide6.QtCore

# Imports: Project
from record import Record, RecordCollection


DEVFIXTURE_rect = QRect(300, 500, 200, 22)
DEVFIXTURE_bar_offset = 50

SERVICE_NAME = "com.aziroshin.KWinWindowTabbingTabBar"
OBJECT_NAME = "/com/aziroshin/KWinWindowTabbingTabBar"
INTERFACE_NAME = "com.aziroshin.KWinWindowTabbingTabBar.TabBar"
DBUS_RETURN_STATUS_RECEIVED = "RECEIVED"

class ContextManagedQTabWidget(QTabWidget):
    def __enter__(self) -> "ContextManagedQTabWidget":
        self.setUpdatesEnabled(False)
        return self

    def __exit__(
        self,
        exception_type: Optional[Type[BaseException]],
        exception_value: Optional[BaseException],
        exception_traceback: Optional[TracebackType]
    ) -> None:
        self.setUpdatesEnabled(True)
        pass


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

    #def remove_tab(self, )


class Window(Record):
    caption: str

    def __init__(self, id: str, caption: str) -> None:
        super().__init__(id)
        self.caption = caption


class Group(Record):
    bar: Optional[Bar]
    _rect: QRect
    _windows: RecordCollection[Window]

    def __init__(self, id: str, rect: QRect) -> None:
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
            self.bar = Bar(self)
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


# Makes it possible to __get_attr__ the instance of the type `signal_type` of
# a `SignalInstance` object without incurring type errors.
# e.g. if the signal was defined with `str` and you wanted to get that, you'd
# pass `str` for `signal_type`.
# Also, even though this is referring to `SignalType`, in practice you can
# just pass a `Signal` object for `signal`.
def signal_type_fix_get_str(signal: SignalInstance, signal_type: type) -> SignalInstance:
    # We're suppressing the warning about __get_item__ not being implemented.
    return signal[signal_type]  # pyright: ignore [reportUnknownVariableType, reportGeneralTypeIssues]


class DBusService(QObject):
    message_put_signal = Signal(str)

    def __init__(self, parent: PySide6.QtCore.QObject | None = None):
        super().__init__(parent)  # pyright: ignore [reportGeneralTypeIssues]
        signal_type_fix_get_str(self.message_put_signal, str).connect(self.on_messages_put)

    @Slot(str, result=str)
    def PutMessages(self, raw_messages: str) -> str:
        self.message_put_signal.emit(raw_messages)

        return DBUS_RETURN_STATUS_RECEIVED

    @Slot(str)
    def on_messages_put(self, messages: str):
        # Barebones prototype to get enough info out of the message to
        # spawn tabs.
        try:
            messages = json.loads(messages)
        except json.decoder.JSONDecodeError:
            print("ERROR: Non-JSON DBus message received for", "PutMessages", "method.", "What we got:", messages)
            print("Below is the JSON error we got related to this:")
            print(traceback.format_exc())
        for message in messages:
            if not "code" in message:
                print("'code' not in message. Message:", message)
                continue
            if "code" in message and message["code"] == "GROUP_DATA":
                if not "payload" in message:
                    print("'payload' key not in 'GROUP_DATA' message. Message:", message)
                    continue
                if not "windows" in message["payload"]:
                    print("'windows' key not in 'GROUP_DATA' payload. Message:", message)
                    continue
                for window in message["payload"]["windows"]:
                    if not "group_id" in window:
                        print("'group_id' not in window. Message:", message)
                        continue
                    if not "epoch" in window["group_id"]:
                        print("'epoch' missing in 'group_id' of window. Message:", message)
                        continue
                    if not "disambiguator" in window["group_id"]:
                        print("'disambiguator' missing in 'group_id' of window. Message:", message)
                        continue
                    group_id = str(window["group_id"]["epoch"]) + "_" + str(window["group_id"]["disambiguator"])
                    groups.append(Group(group_id, DEVFIXTURE_rect))
                    groups[group_id].on_window_received(Window(str(window["kwin_window_id"]), str(window["caption"])))
        print(messages)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    groups = RecordCollection[Group]()

    dbus = QDBusConnection.sessionBus()
    dbus.registerService(SERVICE_NAME)
    dbus_message_object = DBusService()

    dbus.registerObject(OBJECT_NAME, dbus_message_object, QDBusConnection.RegisterOption.ExportAllSlots)
    QtAsyncio.run(handle_sigint=True)  # pyright: ignore [reportUnknownMemberType]
