# -*- coding: utf-8 -*-

# Imports: Python
from typing import Any
import collections.abc

# Imports: Third Party
import PySide6.QtCore
from PySide6.QtCore import Signal, Slot
from pydantic import BaseModel


class PydanticSingleDictSlotWrapper[OUTER_ARG: (BaseModel), RETURN]:
    """Wraps a Qt slot with a single dict arg with a different `OUTER_ARG` type.

    The `OUTER_ARG` type is expected to be a Pydantic model and to be used by
    `PydanticSingleDictSignalWrapper` to facilitate static type checking.
    Since Qt/PySide6 only know basic Qt types for signaling, `.wrapped_method`
    receives the Pydantic model as a model dump (`dict[str, Any]`).
    """
    slot: Slot
    wrapped_method: collections.abc.Callable[[dict[str, Any]], RETURN]

    def __init__(self, wrapped_method: collections.abc.Callable[[dict[str, Any]], RETURN]):
        self.slot = Slot(dict)
        self.wrapped_method = wrapped_method


class PydanticSingleDictSignalWrapper[ARG: (BaseModel), RETURN]:
    """Wraps a Qt signal (instance) with a single arg: A Pydantic model.

    The interface closely resembles `PySide6.QtCore.SignalInstance`, with
    slight differences: Only one arg is supported, it has to be a
    `Pydantic.BaseModel` and `.connect takes a `PydanticSingleDictSlotWrapper`.
    `.emit` calls `.model_dump` on the model and passes the return value to the
    `.emit` method of the wrapped signal instance.
    """
    class _Signal(PySide6.QtCore.QObject):
        signal = Signal(dict)
    _signal = _Signal()
    signal_instance: PySide6.QtCore.SignalInstance

    def __init__(self):
        # Ignoring error about __get_item__ not being implemented for `Signal`.
        self.signal_instance = self._signal.signal[dict]  # pyright: ignore [reportGeneralTypeIssues]

    def connect(self, slot: PydanticSingleDictSlotWrapper[ARG, RETURN]):
        self.signal_instance.connect(slot.wrapped_method)

    def emit(self, /, model: ARG) -> None:
        # To avoid additional overhead we don't validate here, since it's
        # expected that the model got statically type checked at this point.
        self.signal_instance.emit(model.model_dump())


