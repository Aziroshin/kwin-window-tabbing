#!/usr/bin/env python3
#-*- coding: utf-8 -*-

# Import: Python
import asyncio

# Import: Third Party
from dbus_fast.aio.message_bus import MessageBus
from dbus_fast.service import ServiceInterface, method

# Import: Project
from dbus_fast_types import s
from id import ID

SERVICE_NAME = "com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment"
OBJECT_NAME = "/com/aziroshin/KWinWindowTabbingDBusPacketOrderExperiment"
INTERFACE_NAME = "com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment.Test"


class TabBarDBusInterface(ServiceInterface):
    def __init__(self, name: str):
        super().__init__(name)

    @method()
    def Test(self, msg: "s") -> "s":
        _site, id = msg.partition(":")[0::2]
        print("_site: " + _site + ", ID: " + id)
        print("running DBus-method 'Test': " + ID(id).as_string())
        return msg


async def main():
    bus = await MessageBus().connect()
    interface= TabBarDBusInterface(INTERFACE_NAME)
    bus.export(OBJECT_NAME, interface)
    await bus.request_name(SERVICE_NAME)

    print("running main")

    await bus.wait_for_disconnect()

asyncio.run(main())
