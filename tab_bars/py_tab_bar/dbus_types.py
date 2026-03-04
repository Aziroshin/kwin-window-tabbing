# -*- coding: utf-8 -*-

#Imports: Python
from typing import TypedDict, Literal, Union


# Every message is expected to be of this type.
class Message[CODE: str, PAYLOAD](TypedDict):
    code: CODE
    id: str
    payload: PAYLOAD


# Union of all message types we might send to KWin.
type MessageForKWin = Union[
    Message[Literal["REQUEST_STATE"], None],
    Message[Literal["REQUEST_TOP_WINDOW_CHANGE"], WindowForKWinPayload]
]


# The type of the list of messages we send to KWin
# when we send messages in bulk.
type MessagesForKWinList = list[MessageForKWin]


# ========
# Payloads
# ========


class WindowForKWinPayload(TypedDict):
    window_id: str
