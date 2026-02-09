var config = {
    // Use `print` from the KWin scripting API for printing?
    print_using_print: false,
    // Use `console` for printing?
    print_using_console: false,
    // Use DBus for printing?
    print_using_dbus: true,
    
    // DBus services we're going to use using `callDBus`.
    dbus_services: {
        dbus_console: {
            service: "com.aziroshin.DBusPrinter",
            object: "/com/aziroshin/DBusPrinter",
            interfaces: {
                console: {
                    name: "Console",
                    methods: {
                        log: "log",
                        info: "info",
                        debug: "debug",
                    }
                }
            }
        },
        tab_bar: {
            service: "com.aziroshin.KWinWindowTabbingTabBar",
            object: "/com/aziroshin/KWinWindowTabbingTabBar",
            interfaces: {
                tab_bar: {
                    name: "TabBar",
                    methods: {
                        pop_commands_queued_for_kwin: "popCommandsQueuedForKwin",
                        put_groups: "putGroups",
                        test: "test"
                    }
                }
            }
        },
        dbus_packet_order_experiment: {
            service: "com.aziroshin.KWinWindowTabbingDBusPacketOrderExperiment",
            object: "/com/aziroshin/KWinWindowTabbingDBusPacketOrderExperiment",
            interfaces: {
                test: {
                    name: "Test",
                    methods: {
                        test: "Test"
                    }
                }
            }
        }
    }
} as const

export default config
