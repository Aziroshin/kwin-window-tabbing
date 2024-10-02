import dbg from "./dbg";


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


enum GroupingState {
    Disabled,
    SelectingTabbee,
    SelectingTarget
}


class Store {
    tabbee: WrappedWindow
    grouping_state: GroupingState
    windows: WrappedStoreWindows
    test_count: number
    test_count_2: number
    callback_lockup_workaround_trackers: CallbackLockupWorkaroundTrackers<
        | "dbus_queue_polling_timer"
    >

    constructor() {
        this.windows = new WrappedStoreWindows()
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
    protected windows: WrappedWindows
    protected top_window: WrappedWindow | null
    on_top_window_changed_resize_all_callback:
        | SignalCallbackType<KWin.Toplevel["clientGeometryChanged"]>
        | undefined

    constructor() {
        this.windows = new WrappedWindows()
        this.awake = false
        this.top_window = null
    }

    is_empty(): boolean {
        return this.windows.all.length == 0
    }

    is_awake(): boolean {
        return this.awake
    }

    has_window(window: WrappedWindow | KWin.AbstractClient): boolean {
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
    set_top_window(window: WrappedWindow | null): boolean {
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
            this.on_top_window_changed_resize_all_callback = (toplevel): void => {
                this.windows.all.forEach((window_) => {
                    window_.kwin_window.frameGeometry = toplevel.frameGeometry
                })
            }
            window.kwin_window.clientGeometryChanged.connect(
                this.on_top_window_changed_resize_all_callback
            )

        }
        return true
    }

    get_next_window_in_line_for_top(): WrappedWindow | null {
        if (this.is_empty()) {
            return null
        }
        return this.windows.all[0]
    }

    get_top_window(): WrappedWindow | null {
        return this.top_window ? this.top_window : null
    }

    has_two_or_more_windows(): boolean {
        return this.windows.all.length >= 2
    }
    
    ensure_correct_top_window(): void {
        this.set_top_window(this.windows.get_top_stack_window())
    }

    add_window(window: WrappedWindow, request_top: boolean): boolean {
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

    remove_window(window: WrappedWindow): void {
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

    evaluate_wakeness(): void {
        if (!this.is_awake() && this.has_two_or_more_windows()) {
            this.wake_up()
        } else if (this.is_awake() && !this.has_two_or_more_windows()) {
            this.go_dormant()
        }
    }
}


/** A wrapper for `KWin.AbstractClient`. Whenever possible, code
 * throughout the code base will use this, and when variable names contain
 * "window", that's what that refers to. Variables directly referring to
 * a `KWin.AbstractClient` object would contain `kwin_window` instead.
 * */
class WrappedWindow {
    kwin_window: KWin.AbstractClient
    group: Group

    private constructor(
        kwin_window: KWin.AbstractClient,
        group: Group | null = null
    ) {
        this.kwin_window = kwin_window
        if (group == null) {
            this.group = new Group()
            this.group.add_window(this, true)
        } else {
            this.group = group
        }
    }

    
    static new_or_get_wrapped_store_bound(
        store_windows: WrappedStoreWindows,
        kwin_window: KWin.AbstractClient,
        group: | null = null
    ): WrappedWindow {
        let maybe_wrapped_window = store_windows.all.find((wrapped_window) => {
            return wrapped_window.kwin_window.windowId == kwin_window.windowId
        })
        if (maybe_wrapped_window) {
            return maybe_wrapped_window
        }
        
        let new_wrapped = new WrappedWindow(kwin_window, group)
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
    group_with(target_window: WrappedWindow): void {
        this.group.remove_window(this)
        target_window.group.add_window(this, true)
        this.group = target_window.group
    }
}


class WrappedWindows {
    // TODO: Makes this class an iterable.
    all: Array<WrappedWindow>

    constructor() {
        this.all = []
    }

    is_empty(): boolean {
        return this.all.length > 0
    }

    has_window(any_window: WrappedWindow | KWin.AbstractClient): boolean {
        let kwin_window = isKWinWindow(any_window) ? any_window : any_window.kwin_window
        
        return this.all.some((wrapped_window) => {
            return wrapped_window.kwin_window == kwin_window
        })
    }

    add_window(window: WrappedWindow): void {
        this.all.push(window)
    }

    remove_window(window_to_remove: WrappedWindow): void {
        let index = this.all.findIndex((prospective_window) => {
            return prospective_window == window_to_remove
        })
        if (index > -1) {
            this.all.splice(index, 1)
        }
    }

    /** Get the window at the top of the stacking order. */
    get_top_stack_window(): WrappedWindow | null {
        let highest_window: WrappedWindow | null = null
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
}


class WrappedStoreWindows extends WrappedWindows {
    /** Get an existing handler corresponding to `window` or get a new one.
     * This is the principal method for getting a `WrappedWindow`.
     * */
    get_wrapped(kwin_window: KWin.AbstractClient): WrappedWindow {
        let new_wrapped = WrappedWindow.new_or_get_wrapped_store_bound(this, kwin_window)
        return new_wrapped
    }
}


var isKWinWindow = (item: WrappedWindow | KWin.AbstractClient): item is KWin.AbstractClient => {
    return "fullScreenable" in item
}


var isWrappedWindow = (item: WrappedWindow | KWin.AbstractClient): item is WrappedWindow => {
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

var dbus_queue_polling_callback = function(): void {
    store.test_count += 1
    if (store.test_count % 10 == 0) {
        dbg.log("dbus_queue_polling_callback called. Test count: " + store.test_count)
    }
}


var start_dbus_queue_polling = function(timer: QTimer): void {
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
}


//=========================================================================
// END: DBus Queue Polling Functions
//=========================================================================


var test_timer_callback = function(): void {
    store.test_count_2 += 1
    if (store.test_count_2 % 1000 == 0) {
        dbg.debug("test_timer_callback called. Test count: " + store.test_count_2)
    }
}


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
    
    let dbus_queue_polling_timer = new QTimer();
    dbus_queue_polling_timer.interval = 2.0
    dbus_queue_polling_timer.timeout.connect(dbus_queue_polling_callback)
    dbus_queue_polling_timer.start()
    
    let test_timer = new QTimer();
    test_timer.interval = 4.0
    test_timer.timeout.connect(test_timer_callback)
    test_timer.start()
}


main();
