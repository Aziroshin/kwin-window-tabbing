# -*- coding: utf-8 -*-

#Imports: Python
from typing import Any, Optional, Literal, Union
from pydantic import BaseModel, TypeAdapter
from pydantic_core import ValidationError
import json


class ID(BaseModel):
    epoch: int
    disambiguator: int


# Every message is expected to be of this type.
class Message[CODE: str, PAYLOAD](BaseModel):
    code: CODE
    id: ID
    payload: PAYLOAD

# ====================================
# Messages & Payloads: From KWin to us
# ====================================


# ===============
# BEGIN: Payloads


class WindowForTabBarPayload(BaseModel):
    kwin_window_id: int
    group_id: ID
    caption: str


class GroupForTabBarPayload(BaseModel):
    id: ID
    windows: list[WindowForTabBarPayload]
    top_window: Optional[WindowForTabBarPayload]


# END: Payloads
# ===============


# Union of all message types we might receive from KWin.
type MessageForTabBar = Union[
    Message[Literal["GROUP_DATA"], GroupForTabBarPayload],
    Message[Literal["TOP_WINDOW"], WindowForTabBarPayload]
]


type MessagesForTabBarList = list[MessageForTabBar]


# The type of the list of messages we receive from KWin
# when we receive messages in bulk.
MessagesForTabBar = TypeAdapter(MessagesForTabBarList)


# ====================================
# Messages & Payloads: From us to KWin
# ====================================


# ===============
# BEGIN: Payloads


class WindowForKWinPayload(BaseModel):
    kwin_window_id: int


# END: Payloads
# ===============


# Union of all message types we might send to KWin.
type MessageForKWin = Union[
    Message[Literal["REQUEST_STATE"], None],
    Message[Literal["REQUEST_TOP_WINDOW_CHANGE"], WindowForKWinPayload]
]


type MessagesForKWinList = list[MessageForKWin]


# The type of the list of messages we send to KWin
# when we send messages in bulk.
MessagesForKWin = TypeAdapter(MessageForKWin)


# ====================================
# JSON Serialization
# ====================================


class BadModel(BaseModel):
    thud: str


class JSONEncoder(json.JSONEncoder):
    """Enables the serialization of Pydantic models."""

    def default(self, o: Any):
        if isinstance(o, BaseModel):
            # Since the models are already statically type checked and runtime
            # validated upon instantiation, we skip validation here.
            return o.model_dump()
        return super().default(o)
