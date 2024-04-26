var config = {
    // Use `print` from the KWin scripting API for printing?
    print_using_print: false,
    // Use `console` for printing?
    print_using_console: false,
    // Use DBus for printing?
    print_using_dbus: true,
    dbus_console_service: 'com.aziroshin.DBusPrinter',
    dbus_console_object: '/com/aziroshin/DBusPrinter',
    dbus_console_interface: 'Console',
    dbus_console_log_method_name: 'log',
    dbus_console_info_method_name: 'info',
    dbus_console_debug_method_name: 'debug'
}

export default config
