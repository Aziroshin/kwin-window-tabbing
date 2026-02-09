import config from "./config";
import dbg from "./dbg";


let dbus_config = config.dbus_services.dbus_packet_order_experiment


let dbus_packet_order_experiment = {
    _status_callback: function(status: any): void {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            dbg.debug('DBus debug connection failed.')
        }
    },
    test(msg: string): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.test.name,
            dbus_config.interfaces.test.methods.test,
            msg,
            this._status_callback
        )
    }
} as const

export default {
    dbus_packet_order_experiment
}
