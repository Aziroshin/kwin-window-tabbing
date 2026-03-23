import config from "./config";
import dbg from "./dbg";
import { ID } from "./id";
import { Slot } from "./slot";
import * as tab_bar from "./tab_bar";


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
    dbus_queue_polling_timer: QTimer

    constructor() {
        this.groups = new Map<string, Group>
        this.windows = new WrappedGroupableStoreWindows(this.groups)
        this.grouping_state = GroupingState.SelectingTabbee
        this.tabbee = this.windows.get_wrapped(workspace.activeClient)
        this.test_count = 0
        this.test_count_2 = 0
        this.dbus_queue_polling_timer = new QTimer()
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
    protected tab_bar_window: WrappedTabBarWindow | null
    on_top_window_changed_resize_all_slot = Slot.new<KWin.Toplevel["bufferGeometryChanged"]>()
    on_top_window_decoration_changed_slot = Slot.new<KWin.AbstractClient["decorationChanged"]>()
    on_top_window_desktop_changed_slot = Slot.new<KWin.AbstractClient["desktopChanged"]>()

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

    set_all_windows_to_geometry(rect: QRect) {
        this.windows.all.forEach((window_) => {
            window_.kwin_window.frameGeometry = rect
        })
    }

    set_desktop_of_all_windows(desktop: number) {
        this.windows.all.forEach((window_) => {
            dbg.log("current desktops: " + window_.kwin_window.desktop + ", new desktops: " + desktop)
            window_.kwin_window.desktop = desktop
        })
    }

    enable_decoration() {
        this.windows.all.forEach((window_) => {
            window_.kwin_window.noBorder = false
        })
    }

    disable_decoration() {
        this.windows.all.forEach((window_) => {
            window_.kwin_window.noBorder = true
        })
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

        if (window === null) {
            this.top_window = null
        } else if (this.has_two_or_more_windows()) {
            this.top_window = window

            this.on_top_window_changed_resize_all_slot.set_function(((toplevel) => {
                this.set_all_windows_to_geometry(toplevel.frameGeometry)
                if (this.tab_bar_window) {
                    this.tab_bar_window.align_geometry_with_group_by_group_rect(
                        toplevel.frameGeometry
                    )
                }
            }), this).connect(window.kwin_window.bufferGeometryChanged)
            
            this.on_top_window_decoration_changed_slot.set_function((() => {
                if (window.kwin_window.noBorder) {
                    this.disable_decoration()
                } else {
                    this.enable_decoration()
                }
            }), this).connect(window.kwin_window.decorationChanged)

            this.on_top_window_desktop_changed_slot.set_function((() => {
                this.set_desktop_of_all_windows(window.kwin_window.desktop)
                if (this.tab_bar_window) {
                    this.tab_bar_window.kwin_window.desktop = window.kwin_window.desktop
                }
            }), this).connect(window.kwin_window.desktopChanged)

            workspace.activeClient = window.kwin_window
        }

        return true
    }

    set_tab_bar_window(tab_bar_window: WrappedTabBarWindow) {
        this.tab_bar_window = tab_bar_window
        if (this.top_window) {
            this.tab_bar_window.align_geometry_with_group_by_group_rect(
                this.top_window.kwin_window.frameGeometry
            )
        }
    }

    get_tab_bar_window(): WrappedTabBarWindow | null {
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

    as_payload(): tab_bar.GroupPayload {
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
    
    as_payload(): tab_bar.WindowPayload {
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

    /** Get a window by KWin window ID.
     * Returns `-1` if no match is found.
     */
    get_window_by_id(kwin_window_id: number): WrappedGroupableWindow | null {
        // TODO: Implement a more efficient way of doing this (e.g. use `Map`).
        let index = this.all.findIndex((prospective_window) => {
                return prospective_window.kwin_window.windowId === kwin_window_id
        })
        return index === -1 ? null : this.all[index]
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

    as_payload(): tab_bar.WindowPayload[] {
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


class WrappedTabBarWindow extends WrappedWindow {
    /** Moves and sizes the window to assume its intended position as a
     * tab bar for a set of tabbed windows.
     */
    align_geometry_with_group_by_group_rect(group_rect: QRect) {
        this.kwin_window.frameGeometry = {
            x: group_rect.x,
            y: group_rect.y - this.kwin_window.frameGeometry.height,
            width: group_rect.width,
            // Spread syntax results in `Unexpected token `='` at
            // runtime, so we do this (for now?).
            height: this.kwin_window.frameGeometry.height
        }
    }
}


var isKWinWindow = (
    item: | Exclude<WrappedWindow, {fullScreenable: boolean}> | KWin.AbstractClient
): item is KWin.AbstractClient => {
    return "fullScreenable" in item
}


var isWrappedWindow = (
    item: | Exclude<WrappedWindow, {fullScreenable: boolean}> | KWin.AbstractClient
): item is Exclude<WrappedWindow, {fullScreenable: boolean}> => {
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

        tab_bar.dbus.put_messages([
            new tab_bar.Message("GROUP_DATA", store.tabbee.group.as_payload())
        ])
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
    tab_bar.dbus.pop_messages((raw_messages) => {
        let messages = JSON.parse(raw_messages)
        // Yes, we could just make the tab_bar include the group ID in this
        // message, but that'd put more responsibility on it. The idea is to
        // minimize the business logic involvement of the tab_bar to reduce
        // complexity.
        // TODO: Get this statically type checked.
        messages.forEach((message: tab_bar.MessageTypes) => {
            if (message["code"] === "REQUEST_TOP_WINDOW_CHANGE") {
                let window = store.windows.get_window_by_id(Number(message["payload"]["kwin_window_id"]))
                window?.group.set_top_window(window)
            }
        })
    })
}


var start_dbus_queue_polling = function(timer: QTimer): void {
    timer.interval = 100.0
    timer.timeout.connect(dbus_queue_polling_callback)
    timer.start()
}

/*
var stop_dbus_queue_polling = function(timer: QTimer): void {
    timer.timeout.disconnect(dbus_queue_polling_callback)
}


var set_up_dbus_queue_polling = function(): void {

}
*/


//=========================================================================
// END: DBus Queue Polling Functions
//=========================================================================


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
        cycle_backward_action_callback
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
        store.groups.get(group_id)?.set_tab_bar_window(new WrappedTabBarWindow(kwin_window))
    })

    start_dbus_queue_polling(store.dbus_queue_polling_timer)
}


main();
