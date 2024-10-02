import config from "./config";

var dbus_console = {
    _status_callback: function(status: any): void {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            this.debug('DBus debug connection failed.')
        }
    },
    _call(method_name: string, item: any): void {
        callDBus(
            config.dbus_console_service,
            config.dbus_console_object,
            config.dbus_console_service
                + '.' + config.dbus_console_interface,
            method_name,
            item,
            this._status_callback
        )
    },
    log: function(item: any): void {
        this._call(config.dbus_console_log_method_name, item)
    },
    info: function(item: any): void {
        this._call(config.dbus_console_info_method_name, item)
    },
    debug: function(item: any): void {
        this._call(config.dbus_console_debug_method_name, item)
    }
}


var log = function(item: any): void {
    if (config.print_using_print) {
        print(item)
    }
    if (config.print_using_console) {
        console.log(item)
    }
    if (config.print_using_dbus) {
        dbus_console.log(item)
    }

}


var info = function(item: any): void {
    if (config.print_using_print) {
        print(item)
    }
    if (config.print_using_console) {
        console.info(item)
    }
    if (config.print_using_dbus) {
        dbus_console.info(item)
    }
}


var debug = function(item: any): void {
    if (config.print_using_print) {
        print(item)
    }
    if (config.print_using_console) {
        console.info(item)
    }
    if (config.print_using_dbus) {
        dbus_console.debug(item)
    }
}

export default {
    log,
    info,
    debug
}
