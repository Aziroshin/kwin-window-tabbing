#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Needs PySide2-stubs installed to typecheck properly.


# Imports: Python
import sys
from types import TracebackType
from typing import Optional, Type

# Imports: Third Party
from PySide2.QtCore import QRect
from PySide2.QtWidgets import QApplication, QTabWidget, QWidget
from dbus_fast.aio.message_bus import MessageBus
from dbus_fast.service import ServiceInterface, method

# Imports: Project
from record import Record, RecordCollection
from dbus_fast_types import s


DEVFIXTURE_rect = QRect(300, 500, 200, 200)
DEVFIXTURE_bar_offset = 50


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
        self.resize(int(self.group.rect.width() - DEVFIXTURE_bar_offset * 2), 1)
        self.move(group.rect.x() + DEVFIXTURE_bar_offset, group.rect.y())

    def show(self) -> None:
        self._widget.show()

    def hide(self) -> None:
        self._widget.hide()

    def add_tab_for_window(self, window: "Window") -> None:
        dummy = QWidget()
        with self._widget as widget:
            widget.addTab(dummy, window.title)

    def resize(self, width: int, height: int) -> None:
        with self._widget as widget:
            widget.resize(width, height)

    def move(self, x: int, y: int) -> None:
        with self._widget as widget:
            widget.move(x, y)

    #def remove_tab(self, )


class Window(Record):
    title: str

    def __init__(self, id: str, title: str) -> None:
        super().__init__(id)
        self.title = title


class Group(Record):
    bar: Optional[Bar]
    rect: QRect
    _windows: RecordCollection[Window]

    def __init__(self, id: str, rect: QRect) -> None:
        super().__init__(id)
        self.rect = rect
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


# Misc notes:
# - The name for the event responder function for a window getting grouped
# should probably be `on_window_grouped`.


class TabBarDBusInterface(ServiceInterface):
    def __init__(self, name: str):
        super().__init__(name)

    # List of groups.
    @method()
    def PutGroups(
        self
    ) -> "s":
        return ""


if __name__ == "__main__":
    app = QApplication(sys.argv)
    groups = RecordCollection[Group]()

    groups.append(Group("test", DEVFIXTURE_rect))
    groups.append(Group("test2", DEVFIXTURE_rect))
    groups["test"].on_window_received(Window("test_window_a", "Test Window A"))
    groups["test"].on_window_received(Window("test_window_a_2", "Test Window A 2"))
    groups["test2"].on_window_received(Window("test_window_b", "Test Window B"))
    groups["test2"].on_window_received(Window("test_window_b_2", "Test Window B 2"))

    sys.exit(app.exec_())
