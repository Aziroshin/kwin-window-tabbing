import config from "./config";
import dbg from "./dbg";
import { ID } from "./id";


let dbus_config = config.dbus_services.tab_bar


// Payloads could potentially be used in more than one message type, so they
// get their own type instead of being directly integrated into `MessageTypes`.

export type WindowPayload = {
    kwin_window_id: number
    group_id: ID
}

export type WindowsPayload = WindowPayload[]

export type GroupPayload = {
    id: ID
    windows: WindowsPayload
    top_window?: WindowPayload
}


type MessageTypes = 
    | {
        code: "GROUP_DATA"
        id: ID
        payload: GroupPayload
    }
    | {
        code: "TOP_WINDOW"
        id: ID
        payload: WindowPayload
    }
type MessageCodes = Extract<MessageTypes, {code: string}>["code"]
type OrNull<T> = unknown extends T ? null : T
type GetMessagePayload<Code> = OrNull<Extract<MessageTypes, {code: Code, payload?: any}>["payload"]>


export class Message<Code = MessageCodes> {
    code: Code
    id: ID
    payload: GetMessagePayload<Code>

    constructor(code: Code, payload: GetMessagePayload<Code>) {
        this.code = code
        this.id = new ID()
        this.payload = payload
    }
}


export let tab_bar_dbus = {
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
    put_messages(messages: MessageTypes[]): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.service
                + '.' + dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.put_messages,
            JSON.stringify(messages),
            this._status_callback
        )
    },
} as const

export declare namespace tab_bar {
    export {
        tab_bar_dbus,
        Message,
        WindowPayload,
        WindowsPayload,
        GroupPayload
    }
}
