import config from "./config";
import dbg from "./dbg";


let dbus_config = config.dbus_services.tab_bar


let tab_bar = {
    _status_callback: function(status: any): void {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            dbg.debug('DBus debug connection failed.')
        }
    },
    pop_commands_queued_for_kwin(): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.pop_commands_queued_for_kwin,
            this._status_callback
        )
    },
    put_groups(): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.put_groups,
            this._status_callback
        )
    },
    test(): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.test,
            "test",
            this._status_callback
        )
    }
}

export default {
    tab_bar
}
