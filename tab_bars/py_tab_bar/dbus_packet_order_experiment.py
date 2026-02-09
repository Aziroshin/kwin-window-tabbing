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
    count: int = 0

    def __init__(self, name: str):
        super().__init__(name)

    @method()
    def Test(self, msg: "s") -> "s":
        _site, id = msg.partition(":")[0::2]
        print("running DBUS-method 'Test' the " + str(self.count) + "th time:")
        print("\t_site: " + _site + ", ID: " + id)
        print("\t                                " + ID(id).as_string())
        self.count += 1
        return msg


async def main():
    bus = await MessageBus().connect()
    interface= TabBarDBusInterface(INTERFACE_NAME)
    bus.export(OBJECT_NAME, interface)
    await bus.request_name(SERVICE_NAME)

    print("running main")

    await bus.wait_for_disconnect()

asyncio.run(main())
