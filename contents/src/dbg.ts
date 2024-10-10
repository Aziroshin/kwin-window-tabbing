import config from "./config";


let dbus_config = config.dbus_services.dbus_console


var dbus_console = {
    _status_callback: function(status: any): void {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            this.debug('DBus debug connection failed.')
        }
    },
    _call(method_name: string, item: any): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.console.name,
            method_name,
            item,
            this._status_callback
        )
    },
    log: function(item: any): void {
        this._call(dbus_config.interfaces.console.methods.log, item)
    },
    info: function(item: any): void {
        this._call(dbus_config.interfaces.console.methods.info, item)
    },
    debug: function(item: any): void {
        this._call(dbus_config.interfaces.console.methods.debug, item)
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
