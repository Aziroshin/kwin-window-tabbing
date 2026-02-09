var config = {
    // Use `print` from the KWin scripting API for printing?
    print_using_print: false,
    // Use `console` for printing?
    print_using_console: false,
    // Use DBus for printing?
    print_using_dbus: true,
    
    // DBus services we're going to use using `callDBu.
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
}


let last_generated_id_epoch = Date.now()
let last_generated_id_disambiguator = 0
class ID {    
    constructor() {
        this.epoch = Date.now()
        if (this.epoch == last_generated_id_epoch ) {
            this.disambiguator = last_generated_id_disambiguator + 1
        }
        else {
            this.disambiguator = 0
        }
        
        last_generated_id_epoch = this.epoch
        last_generated_id_disambiguator = this.disambiguator
    }
    
    as_string() {
        return this.epoch + "_" + this.disambiguator
    }
}


var dbus_console = {
    dbus_config = config.dbus_services.dbus_console,
    _status_callback: function(status) {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            this.debug('DBus debug connection failed.')
        }
    },
    _call(method_name, item) {
        callDBus(
            this.dbus_config.service,
            this.dbus_config.object,
            this.dbus_config.service
            + '.' + this.dbus_config.interfaces.console.name,
            method_name,
            item,
            this._status_callback
        )
    },
    log: function(item) {
        this._call(config.dbus_services.dbus_console.interfaces.console.methods.log, item)
    },
    info: function(item) {
        this._call(config.dbus_services.dbus_console.interfaces.console.methods.info, item)
    },
    debug: function(item) {
        this._call(config.dbus_services.dbus_console.interfaces.console.methods.debug, item)
    }
}


var log = function(item) {
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


var info = function(item) {
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

var debug = function(item) {
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

let dbus_packet_order_experiment = {
    dbus_config = config.dbus_services.dbus_packet_order_experiment,    
    _status_callback: function(status) {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            dbg.debug('DBus debug connection failed.')
        }
    },
    test(msg) {
        callDBus(
            this.dbus_config.service,
            this.dbus_config.object,
            this.dbus_config.service
            + '.' + dbus_config.interfaces.test.name,
            this.dbus_config.interfaces.test.methods.test,
            msg,
            this._status_callback
        )
    }
}


var dbus_queue_polling_callback = function() {
    dbus_packet_order_experiment.test("kwin-window-tabbing:" + new ID().as_string())
}


let dbus_queue_polling_timer = new QTimer();
dbus_queue_polling_timer.interval = 0.1
dbus_queue_polling_timer.timeout.connect(dbus_queue_polling_callback)
dbus_queue_polling_timer.start()
