import config from "./config";
import dbg from "./dbg";
import { ID } from "./id";


let dbus_config = config.dbus_services.tab_bar


// Payloads could potentially be used in more than one message type, so they
// may get their own type instead of being directly integrated into
// `MessageTypes`.


export type WindowIdPayload = {
    kwin_window_id: number
}


export type WindowPayload = {
    kwin_window_id: number
    group_id: ID
    caption: string
}


export type GroupPayload = {
    id: ID
    windows: WindowPayload[]
    top_window?: WindowPayload
}


export type WindowRemovedPayload = {
    removed_window: WindowPayload
    top_window_id: WindowIdPayload
}


export type MessageTypes = 
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
    | {
        code: "REQUEST_TOP_WINDOW_CHANGE"
        id: ID
        payload: WindowIdPayload
    }
    | {
        code: "WINDOW_REMOVED"
        id: ID
        payload: WindowRemovedPayload
    }
export type MessageCodes = Extract<MessageTypes, {code: string}>["code"]
export type GetMessageType<CODE extends MessageCodes> = Extract<
    MessageTypes,
    {code: CODE, payload?: any}
>
type OrNull<T> = unknown extends T ? null : T
export type GetMessagePayload<CODE extends MessageCodes> = OrNull<GetMessageType<CODE>["payload"]>


export class Message<CODE extends MessageCodes> {
    code: CODE
    id: ID
    payload: GetMessagePayload<CODE>

    constructor(code: CODE, payload: GetMessagePayload<CODE>) {
        this.code = code
        this.id = new ID()
        this.payload = payload
    }
}


export let dbus = {
    _status_callback: function(status: any): void {
        //this.debug("_status_callback of dbus_console called with args: a: " + status + ".")
        if (status !== 'RECEIVED') {
            dbg.debug('DBus debug connection failed.')
        }
    },
    pop_messages(callback: (result: any) => void): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.pop_commands_queued_for_kwin,
            callback
        )
    },
    put_messages(messages: MessageTypes[]): void {
        callDBus(
            dbus_config.service,
            dbus_config.object,
            dbus_config.interfaces.tab_bar.name,
            dbus_config.interfaces.tab_bar.methods.put_messages,
            JSON.stringify(messages),
            this._status_callback
        )
    },
} as const

export declare namespace tab_bar {
    export {
        dbus,
        Message
    }
}
