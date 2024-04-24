// Reference: https://github.com/Shouqun/node-dbus/blob/master/examples/service.js
// Example command with gdbus:
// `gdbus call --session --dest com.aziroshin.DBusPrinter --object-path /com/aziroshin/DBusPrinter --method com.aziroshin.DBusPrinter.Console.log "{thud:'Test'}"`

var DBus = require('dbus');

const SERVICE_NAME = 'com.aziroshin.DBusPrinter'
const OBJECT_PATH = '/com/aziroshin/DBusPrinter'
const INTERFACE_NAME = 'Console'


var service = DBus.registerService('session', SERVICE_NAME)
var obj = service.createObject(OBJECT_PATH)
var iface = obj.createInterface(SERVICE_NAME + '.' + INTERFACE_NAME)


iface.addMethod(
    'log',
    {
        in: DBus.Define('Auto'),
    },
    function (variant) {
        console.log(variant)
    }
)


iface.addMethod(
    'info',
    {
        in: DBus.Define('Auto'),
    },
    function (variant) {
        console.info(variant)
    }
)


iface.addMethod(
    'debug',
    {
        in: DBus.Define('Auto'),
    },
    function (variant) {
        console.debug(variant)
    }
)


iface.update()


