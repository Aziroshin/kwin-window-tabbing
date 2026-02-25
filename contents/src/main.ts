import config from "./config";
import dbg from "./dbg";
import { ID } from "./id";
import { Message, GroupPayload, WindowPayload, WindowsPayload, tab_bar_dbus } from "./tab_bar";


type SignalCallbackType<S> = S extends Signal<infer C> ? C : never


class CallbackLockupWorkaroundTracker {
    counter: number
    last_seen_count: number
    times_seen_counter_frozen: number
    timer?: QTimer

    constructor() {
        this.counter = 0
        this.last_seen_count = 0
        this.times_seen_counter_frozen = 0
    }
}


type CallbackLockupWorkaroundTrackers<TCallbackNames extends string> = {
    [T in TCallbackNames]: {
        counter: number
        last_seen_count: number
        times_seen_counter_frozen: number
    }
}

/** Used to determine how to respond when the grouping toggle is used. */
enum GroupingState {
    Disabled,
    // NOTE: A configurable timeout on this mode might be a good idea;
    // if the user selects a target, but then decides differently and
    // forgets, and then wants to select a target much later, it'd be a
    // problem if that window suddenly got grouped with the much earlier
    // target instead.
    // NOTE: A way to cancel this mode deliberatly should also be added.
    /** We've already selected a window we want to put in a group (the
     * "target") and are now in "select a window (the "tabbee") for the
     * target window to get put into"-mode. Next time the grouping
     * toggle is used the target is supposed to get added to the group of
     * the tabbee.
     *
     * During normal use we probably won't spend much time in this mode,
     * since the user is likely to select a "tabbee" right away.
     * */
    SelectingTabbee,
    /** We're in "normal" mode, waiting for a window (the "target") to be
     * selected for grouping.
     * */
    SelectingTarget
}


class Store {
    tabbee: WrappedGroupableWindow
    grouping_state: GroupingState
    groups: Map<string, Group>
    windows: WrappedGroupableStoreWindows
    test_count: number
    test_count_2: number
    callback_lockup_workaround_trackers: CallbackLockupWorkaroundTrackers<
        | "dbus_queue_polling_timer"
    >

    constructor() {
        this.groups = new Map<string, Group>
        this.windows = new WrappedGroupableStoreWindows(this.groups)
        this.grouping_state = GroupingState.SelectingTabbee
        this.tabbee = this.windows.get_wrapped(workspace.activeClient)
        this.test_count = 0
        this.test_count_2 = 0
        this.callback_lockup_workaround_trackers = {
            dbus_queue_polling_timer: new CallbackLockupWorkaroundTracker()
        }
    }
}

// The current design for groups is that they're immediately associated with
// a window the moment the script creates a handler for it. This is a mixed
// bag: 
//   - The advantage is that we can rely on there being a group at all times,
//   and write the rest of the code around that assumption.
//   - The disadvantage is that it moves some of the mess we'd otherwise
//   have elsewhere into this class, and it makes it less clear in the rest of
//   the code whether we have a "proper" group with two or more windows,
//   a pseudo-group with one window or an empty group. The latter case at least
//   should only happen in obvious edge cases such as when (de)initializing
//   something. It should be the aim to encapsulate the fallout of these
//   problems as much possible from the rest of the program.
/** A group of windows that resize and move together.
 */
class Group {
    private awake: boolean
    protected id: ID
    protected windows: WrappedGroupableWindows
    protected top_window: WrappedGroupableWindow | null
    protected tab_bar_window: WrappedWindow | null
    on_top_window_changed_resize_all_callback:
        | SignalCallbackType<KWin.Toplevel["clientGeometryChanged"]>
        | undefined

    constructor() {
        this.id = new ID()
        this.windows = new WrappedGroupableWindows()
        this.awake = false
        this.top_window = null
        this.tab_bar_window = null
    }

    get_id(): ID {
        return this.id
    }

    is_empty(): boolean {
        return this.windows.all.length == 0
    }

    is_awake(): boolean {
        return this.awake
    }

    has_window(window: WrappedGroupableWindow | KWin.AbstractClient): boolean {
        return this.windows.has_window(window)
    }

    // TODO: Rework the whole top window thing to depend on the window
    // returned by `this.get_top_window()`, which should return the
    // window with the highest stackingOrder. The callback management
    // in this function should be triggered whenever the stacking order
    // is changed in a way that puts a new window (in the group) at the
    // top. This could be managed/triggered using callbacks for
    // `stackingOrderChanged` (which would be managed somewhere else, I guess).
    //
    // Keeping some stack order information on hand could be useful, either
    // in an int, or an array sorted by stacking order.
    //
    // Another approach might be the windows managing themselves, connecting
    // and disconnecting the resize callback depending on whether they're
    // atop their group.
    set_top_window(window: WrappedGroupableWindow | null): boolean {
        if (window !== null && !this.windows.has_window(window)) {
            return false
        }

        if (this.top_window && this.on_top_window_changed_resize_all_callback) {
            this.top_window.kwin_window.clientGeometryChanged.disconnect(
                this.on_top_window_changed_resize_all_callback
            )
        }

        if (window === null) {
            this.top_window = null
        } else if (this.has_two_or_more_windows()) {
            this.top_window = window

            //let tab_bar_window = this.tab_bar_window
            //let windows = this.windows
            this.on_top_window_changed_resize_all_callback = (toplevel): void => {
                this.windows.all.forEach((window_) => {
                    window_.kwin_window.frameGeometry = toplevel.frameGeometry
                })

                // This assignment is due to some weird issue where `this.tab_bar_window`
                // suddenly turns `undefined` after the if-check, but only within the block.
                // Tried a version where the callback is explicitly bound to `this`, which
                // worked - but binding issues shouldn't cause this if-block isolated issue.
                // It's also not related to access - accessing the variable more than once
                // before entering the if-block doesn't change anything.
                // TODO: Figure out why that happens and refactor the function accordingly.
                let tab_bar_window = this.tab_bar_window
                if (tab_bar_window) {
                    // Here, `this.tab_bar_window` is `undefined` - despite not being so
                    // during the if-check as well as the whole surrounding context before
                    // and after the if-block.
                    // dbg.log("tab_bar in block: " + this.tab_bar_window)
                    if(tab_bar_window) {
                    }
                    tab_bar_window.kwin_window.frameGeometry = {
                        x: toplevel.frameGeometry.x,
                        y: toplevel.frameGeometry.y - tab_bar_window.kwin_window.frameGeometry.height,
                        width: toplevel.frameGeometry.width,
                        // Spread syntax results in `Unexpected token `='` at
                        // runtime, so we do this (for now?).
                        height: tab_bar_window.kwin_window.frameGeometry.height
                    }
                }
            }
            window.kwin_window.clientGeometryChanged.connect(
                this.on_top_window_changed_resize_all_callback
            )
        }

        return true
    }

    set_tab_bar_window(tab_bar_window: WrappedWindow) {
        this.tab_bar_window = tab_bar_window
        dbg.log("tab_bar_window right after setting: " + this.tab_bar_window)
    }

    get_tab_bar_window(): WrappedWindow | null {
        return this.tab_bar_window
    }

    get_next_window_in_line_for_top(): WrappedGroupableWindow | null {
        if (this.is_empty()) {
            return null
        }
        return this.windows.all[0]
    }

    get_top_window(): WrappedGroupableWindow | null {
        return this.top_window ? this.top_window : null
    }

    has_two_or_more_windows(): boolean {
        return this.windows.all.length >= 2
    }
    
    ensure_correct_top_window(): void {
        this.set_top_window(this.windows.get_top_stack_window())
    }

    add_window(window: WrappedGroupableWindow, request_top: boolean): boolean {
        if (this.has_window(window)) {
            dbg.log(
                "WARNING: Tried adding window to group it was already in: "
                + window.kwin_window.caption
            )
            return false
        }

        // If we'd get that after adding the window, it'd be included when
        // determining the window atop the stack, and very likely be it.
        let top_stack_window_before_adding = this.windows.get_top_stack_window()
        this.windows.add_window(window)

        if (this.has_two_or_more_windows()) {
            if (request_top) {
                workspace.activeClient = window.kwin_window
            } else {
                if (top_stack_window_before_adding) {
                    workspace.activeClient = top_stack_window_before_adding.kwin_window
                }
            }
        }
        if (!request_top && this.has_two_or_more_windows()) {

        }
        this.ensure_correct_top_window()
        this.evaluate_wakeness()
        
        return true
    }

    remove_window(window: WrappedGroupableWindow): void {
        this.windows.remove_window(window)
        this.ensure_correct_top_window()
        this.evaluate_wakeness()
    }

    // Add decor box.
    private wake_up(): void {
        this.awake = true
    }

    // remove decor box.
    private go_dormant(): void {
        this.awake = false
    }

    /** Wakes the group if it has two or windows and makes it go dormant
     * if it has one or none.
     * */
    evaluate_wakeness(): void {
        if (!this.is_awake() && this.has_two_or_more_windows()) {
            this.wake_up()
        } else if (this.is_awake() && !this.has_two_or_more_windows()) {
            this.go_dormant()
        }
    }

    as_payload(): GroupPayload {
        return {
            id: this.id,
            windows: this.windows.as_payload(),
            top_window: this.top_window?.as_payload()
        }
    }
}


class WrappedWindow {
    kwin_window: KWin.AbstractClient
    constructor(
        kwin_window: KWin.AbstractClient,
    ) {
        this.kwin_window = kwin_window
    }
}


/** A wrapper for `KWin.AbstractClient`. Whenever possible, code
 * throughout the code base will use this, and when variable names contain
 * "window", that's what that refers to. Variables directly referring to
 * a `KWin.AbstractClient` object would contain `kwin_window` instead.
 * */
class WrappedGroupableWindow extends WrappedWindow{
    group: Group

    private constructor(
        kwin_window: KWin.AbstractClient,
        group: Group
    ) {
        super(kwin_window)
        // TODO: What if the window isn't a part of this group?
        this.group = group
    }

    static new_or_get_wrapped_store_bound(
        store_windows: WrappedGroupableStoreWindows,
        store_groups: Map<string, Group>,
        kwin_window: KWin.AbstractClient,
        maybe_group: Group | null = null
    ): WrappedGroupableWindow {
        let maybe_wrapped_window = store_windows.all.find((wrapped_window) => {
            return wrapped_window.kwin_window.windowId == kwin_window.windowId
        })
        if (maybe_wrapped_window) {
            return maybe_wrapped_window
        }
        
        let group: Group
        if (maybe_group == null) {
            group = new Group()
        } else {
            group = maybe_group
        }

        let new_wrapped = new WrappedGroupableWindow(kwin_window, group)
        if (maybe_group == null) {
            group.add_window(new_wrapped, true)
        }

        if (!store_groups.has(group.get_id().as_string())) {
            store_groups.set(group.get_id().as_string(), group)
        }

        store_windows.all.push(new_wrapped)
        return new_wrapped
    }

    /** Is this window grouped with at least one other window? */
    is_grouped(): boolean {
        return this.group.has_two_or_more_windows()
    }

    /** Move this window into the target window's group.
     * This is the principal method for grouping windows.
     * */
    group_with(target_window: WrappedGroupableWindow): void {
        this.group.remove_window(this)
        target_window.group.add_window(this, true)
        this.group = target_window.group
    }
    
    as_payload(): WindowPayload {
        return {
            kwin_window_id: this.kwin_window.windowId,
            group_id: this.group.get_id(),
            caption: this.kwin_window.caption
        }
    }
}


class WrappedGroupableWindows {
    // TODO: Makes this class an iterable.
    all: Array<WrappedGroupableWindow>

    constructor() {
        this.all = []
    }

    is_empty(): boolean {
        return this.all.length > 0
    }

    has_window(any_window: WrappedGroupableWindow | KWin.AbstractClient): boolean {
        let kwin_window = isKWinWindow(any_window) ? any_window : any_window.kwin_window
        
        return this.all.some((wrapped_window) => {
            return wrapped_window.kwin_window == kwin_window
        })
    }

    add_window(window: WrappedGroupableWindow): void {
        this.all.push(window)
    }

    remove_window(window_to_remove: WrappedGroupableWindow): void {
        let index = this.all.findIndex((prospective_window) => {
            return prospective_window == window_to_remove
        })
        if (index > -1) {
            this.all.splice(index, 1)
        }
    }

    /** Get the window at the top of the stacking order. */
    get_top_stack_window(): WrappedGroupableWindow | null {
        let highest_window: WrappedGroupableWindow | null = null
        for (let window of this.all) {
            if (highest_window == null) {
                highest_window = window
                continue
            }
            if (window.kwin_window.stackingOrder > highest_window.kwin_window.stackingOrder) {
                highest_window = window
            }
        }
        return highest_window
    }
    as_payload(): WindowsPayload {
        return this.all.map((window: WrappedGroupableWindow) => window.as_payload())
    }
}


class WrappedGroupableStoreWindows extends WrappedGroupableWindows {
    store_groups: Map<string, Group>
    
    constructor (store_groups: Map<string, Group>) {
        super()
        this.store_groups = store_groups
    }

    /** Get an existing handler corresponding to `window` or get a new one.
     * This is the principal method for getting a `WrappedGroupableWindow`.
     * */
    get_wrapped(kwin_window: KWin.AbstractClient): WrappedGroupableWindow {
        let new_wrapped = WrappedGroupableWindow.new_or_get_wrapped_store_bound(
            this,
            this.store_groups,
            kwin_window,
        )
        return new_wrapped
    }
}


var isKWinWindow = (item: WrappedGroupableWindow | KWin.AbstractClient): item is KWin.AbstractClient => {
    return "fullScreenable" in item
}


var isWrappedWindow = (item: WrappedGroupableWindow | KWin.AbstractClient): item is WrappedGroupableWindow => {
    return !isKWinWindow(item)
}


var store = new Store()


var grouping_action_callback = function(): void {
    dbg.log("grouping_action_callback called.")
    if (store.grouping_state == GroupingState.SelectingTabbee) {
        store.tabbee = store.windows.get_wrapped(workspace.activeClient)
        store.grouping_state = GroupingState.SelectingTarget
    } else if (store.grouping_state == GroupingState.SelectingTarget) {
        let target = store.windows.get_wrapped(workspace.activeClient)
        if (target === store.tabbee) {
            store.grouping_state = GroupingState.SelectingTabbee
            return
        }
        store.tabbee.group_with(target)
        store.tabbee.kwin_window.frameGeometry = target.kwin_window.frameGeometry
        store.grouping_state = GroupingState.SelectingTabbee

        tab_bar_dbus.put_messages([
            new Message("GROUP_DATA", store.tabbee.group.as_payload())
        ])

        dbg.log("tab bar window from grouping action callback group ID: " + store.groups.get(store.tabbee.group.get_id().as_string()))

        // TODO: Update group on the tab_bar service via DBus. Each update
        //   is to contain the group ID and a list of windows, whereas the 
        //   window objects in that list each contain a window ID, title and
        //   optional icon information of some kind.
        //   What about group resizing and repositioning, though? It would be
        //   potentially slow to send and process big updates like that at such
        //   a rate - maybe these are different DBus messages, and if the group
        //   isn't recognizd on the other end, it just drops it? That could 
        //   potentially lead to desyncs, though.
        //
        //   This could be avoided by simply moving/resizing the tab bars in
        //   the KWin script directly. If they're named distinctly and the name
        //   contains the group ID that'd work.
        //
        //   Problem: Updates could still be sent out of order (?) and
        //   overwrite newer updates. Maybe there's no way around numbering
        //   messages.
    }
}


var ungrouping_action_callback = function(): void {
    dbg.debug('NOT IMPLEMENTED: ungrouping_action_callback.')
}


var cycle_forward_action_callback = function(): void {
    dbg.debug('NOT IMPLEMENTED: cycle_forward_action_callback.')
}


var cycle_backward_action_callback = function(): void {
    dbg.debug('NOT IMPLEMENTED: cycle_backward_action_callback.')
}


//=========================================================================
// BEGIN: DBus Queue Polling Functions
//=========================================================================

/* var dbus_queue_polling_callback = function(): void {
    store.test_count += 1
    if (store.test_count % 10 == 0) {
        //dbg.debug(new Group().get_id())
        //dbg.log("dbus_queue_polling_callback called. Test count: " + store.test_count)
        
    }
    dbus_packet_order_experiment.dbus_packet_order_experiment.test("kwin-window-tabbing:" + new ID().as_string())
} */


/* var start_dbus_queue_polling = function(timer: QTimer): void {
    timer.interval = 1.0
    timer.timeout.connect(dbus_queue_polling_callback)
    timer.start()
}


var stop_dbus_queue_polling = function(timer: QTimer): void {
    timer.timeout.disconnect(dbus_queue_polling_callback)
}


var set_up_dbus_queue_polling = function(): void {

}


var reset_dbus_queue_polling = function(): void {
    store.callback_lockup_workaround_trackers.dbus_queue_polling_timer
} */


//=========================================================================
// END: DBus Queue Polling Functions
//=========================================================================


/* var test_timer_callback = function(): void {
    store.test_count += 1
    if (store.test_count % 1000 == 0) {
        //dbg.debug("test_timer_callback called. Test count: " + store.test_count_2)
    }
    if (store.test_count == 1) {
        let dbus_queue_polling_timer_a = new QTimer();
        dbus_queue_polling_timer_a.interval = 0.1
        dbus_queue_polling_timer_a.timeout.connect(dbus_queue_polling_callback)
        dbus_queue_polling_timer_a.start()
    }
    if (store.test_count == 7) {
        let dbus_queue_polling_timer_b = new QTimer();
        dbus_queue_polling_timer_b.interval = 0.1
        dbus_queue_polling_timer_b.timeout.connect(dbus_queue_polling_callback)
        dbus_queue_polling_timer_b.start()
    }
} */


var main = function(): void {
    // TODO: There are some comments below about which keys are getting registered
    //   and which aren't - this probably depends on one's setup and might differ
    //   between setups. Figure out what the problem is and fix it. It doesn't seem
    //   to be tied to existing shortcuts, at least not ones that can be found in
    //   the `Shortcuts` control panel using the search bar.
    registerShortcut(
        // TODO [bug]: Title doesn't show up in system settings.
        'Grouping Key',
        // TODO: Description is too long for system settings.
        // Title included is included here for now.
        'Grouping Key: First use selects focused window for getting tabbed, second use selects a window to tab it to.',
        // TODO [bug]: Somehow the shortcut doesn't get set - for now, we have to
        //   set the shortcut ourselves in the system settings.
        'Meta+Space',
        grouping_action_callback
    );
    registerShortcut(
        'Ungrouping Key',
        'Ungrouping Key: Removes the focused window from its group.',
        // Interestingly, this one is getting registered right away.
        'Meta+Alt+Space',
        ungrouping_action_callback
    );
    registerShortcut(
        'Cycle Forward Key',
        'Cycle Forward Key: Switches one window to the left in its group.',
        // This one gets registered as well.
        'Meta+Alt+F',
        cycle_forward_action_callback
    );
    registerShortcut(
        'Cycle Backward Key',
        'Cycle Backward Key: Switches one window to the right in its group.',
        // This one doesn't get registered.
        'Meta+Alt+C',
        cycle_forward_action_callback
    );
    workspace.clientAdded.connect((kwin_window: KWin.AbstractClient) => {
        let caption = kwin_window.caption
        if (!(caption.startsWith(config.tab_bar_caption_identifier_prefix))) {
            return
        }

        let caption_elements = caption.split(":")
        if (caption_elements.length < 2) {
            dbg.debug("Malformed window caption for tab bar window found. KWin-Window ID: " + kwin_window.windowId)
            return
        }
        // An awkward way of using the sanity checks of `new_from_string`.
        let group_id = ID.new_from_string(caption_elements[1])?.as_string()
        if (group_id == null) {
            dbg.debug("Malformed group ID in tab bar window caption found. KWin-Window ID: " + kwin_window.windowId)
            return
        }
        if (!store.groups.has(group_id)) {
            dbg.debug("Group ID in tab bar window caption for group that doesn't exist. KWin-Window ID: "
                + kwin_window.windowId + ", group ID: "+ group_id
            )
            return
        }
        dbg.log("group_id: " + group_id + ", group: " + store.groups.get(group_id))
        store.groups.get(group_id)?.set_tab_bar_window(new WrappedWindow(kwin_window))
    })
    
/*     let dbus_queue_polling_timer = new QTimer();
    dbus_queue_polling_timer.interval = 1.0
    dbus_queue_polling_timer.timeout.connect(dbus_queue_polling_callback)
    dbus_queue_polling_timer.start() */
    
/*     let test_timer = new QTimer();
    test_timer.interval = 500.0
    test_timer.timeout.connect(test_timer_callback)
    test_timer.start() */

}


main();
