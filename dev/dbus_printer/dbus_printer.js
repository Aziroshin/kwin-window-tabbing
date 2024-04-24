// Reference: https://github.com/Shouqun/node-dbus/blob/master/examples/service.js
// Example command with gdbus:
// `gdbus call --session --dest com.aziroshin.DBusPrinter --object-path /com/aziroshin/DBusPrinter --method com.aziroshin.DBusPrinter.Console.log "{thud:'Test'}"`

var DBus = require('dbus');

const SERVICE_NAME = 'com.aziroshin.DBusPrinter'
const OBJECT_PATH = '/com/aziroshin/DBusPrinter'
const INTERFACE_NAME = 'Console'
const RECEIVED = 'RECEIVED'


var service = DBus.registerService('session', SERVICE_NAME)
var obj = service.createObject(OBJECT_PATH)
var iface = obj.createInterface(SERVICE_NAME + '.' + INTERFACE_NAME)


iface.addMethod(
    'log',
    {
        in: DBus.Define('Auto'),
    },
    function (variant, callback) {
        console.log(variant)
        callback(null, RECEIVED)
    }
)


iface.addMethod(
    'info',
    {
        in: DBus.Define('Auto'),
    },
    function (variant, callback) {
        console.info(variant)
        callback(null, RECEIVED)
    }
)


iface.addMethod(
    'debug',
    {
        in: DBus.Define('Auto'),
    },
    function (variant, callback) {
        console.debug(variant)
        callback(null, RECEIVED)
    }
)


iface.update()


