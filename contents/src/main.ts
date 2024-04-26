import dbg from "./dbg";


type SignalCallbackType<S> = S extends Signal<infer C> ? C : never


enum GroupingSelectorState {
    Disabled,
    SelectingTabbee,
    SelectingTarget
}


class Store {
    tabbee: WrappedWindow
    grouping_selector_state: GroupingSelectorState
    windows: WrappedWindows

    constructor() {
        this.windows = new WrappedWindows()
        this.grouping_selector_state = GroupingSelectorState.SelectingTabbee
        this.tabbee = this.windows.get_wrapped(workspace.activeClient)
    }
}


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
                dbg.log("=== Resizing all windows ===")
                dbg.log("Current top window for this group: " + this.top_window?.kwin_window.caption)
                dbg.log("in callback: Current window count: " + this.windows.all.length)
                this.windows.all.forEach((window_) => {
                    window_.kwin_window.frameGeometry = {
                        x: toplevel.frameGeometry.x,
                        y: toplevel.frameGeometry.y,
                        width: toplevel.frameGeometry.width,
                        height: toplevel.frameGeometry.height,
                    }
                    dbg.log("Resized width: " + window_.kwin_window.frameGeometry.width + " for window: " + window_.kwin_window.caption)
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

        let top_stack_window = this.windows.get_top_stack_window()
        this.windows.add_window(window)

        if (request_top || this.windows.all.length == 1) {
            workspace.activeClient = window.kwin_window
        } else if (this.has_two_or_more_windows()) {
            if (top_stack_window) {
                workspace.activeClient = top_stack_window.kwin_window
            }
/*             let maybe_other_window = this.windows.all.find((prospective_window) => {
                prospective_window !== window
            })
            if (maybe_other_window) {
                workspace.activeClient = maybe_other_window.kwin_window
            } */
        }
        this.ensure_correct_top_window()
        this.evaluate_wakeness()
        dbg.log("Current window count: " + this.windows.all.length)
        
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


class WrappedWindow {
    kwin_window: KWin.AbstractClient
    group: Group

    constructor(
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

    is_grouped(): boolean {
        return this.group.has_two_or_more_windows()
    }

    group_with(target_window: WrappedWindow): void {
        this.group.remove_window(this)
        target_window.group.add_window(this, true)
        this.group = target_window.group
    }
}


class WrappedWindows {
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

    // This should probably be on a sub-class that is only used on the store,
    // since there should only be one source of `WrappedWindow`, to make sure
    // each KWin window only has one unique wrapper.
    /** Get an existing handler corresponding to `window` or get a new one. */
    get_wrapped(kwin_window: KWin.AbstractClient): WrappedWindow {
        let maybe_wrapped_window = this.all.find((wrapped_window) => {
            return wrapped_window.kwin_window.windowId == kwin_window.windowId
        })
        if (maybe_wrapped_window) {
            return maybe_wrapped_window
        }
        
        dbg.log("Making new wrapper for: " + kwin_window.caption)
        let new_wrapped = new WrappedWindow(kwin_window)
        this.all.push(new_wrapped)
        return new_wrapped
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


var isKWinWindow = (item: WrappedWindow | KWin.AbstractClient): item is KWin.AbstractClient => {
    return "fullScreenable" in item
}


var isWindowHandler = (item: WrappedWindow | KWin.AbstractClient): item is WrappedWindow => {
    return !isKWinWindow(item)
}


var store = new Store()


var grouping_key_callback = function(): void {
    if (store.grouping_selector_state == GroupingSelectorState.SelectingTabbee) {
        dbg.log(">>Grouping state: SelectingTabbee - now switching to SelectingTarget")
        store.tabbee = store.windows.get_wrapped(workspace.activeClient)
        store.grouping_selector_state = GroupingSelectorState.SelectingTarget
    } else if (store.grouping_selector_state == GroupingSelectorState.SelectingTarget) {
        dbg.log("Calling get_wrapped in target grouping...")
        let target = store.windows.get_wrapped(workspace.activeClient)
        if (target === store.tabbee) {
            store.grouping_selector_state = GroupingSelectorState.SelectingTabbee
            return
        }
        
        store.tabbee.group_with(target)
        store.tabbee.kwin_window.frameGeometry = {
            x: target.kwin_window.frameGeometry.x,
            y: target.kwin_window.frameGeometry.y,
            width: target.kwin_window.frameGeometry.width,
            height: target.kwin_window.frameGeometry.height,
        }
        
        dbg.log("tabbee name: " + store.tabbee.kwin_window.caption)
        dbg.log(">>Grouping state: SelectingTarget - now switching to SelectingTabbee.")

        store.grouping_selector_state = GroupingSelectorState.SelectingTabbee
    }
    for (let window of store.windows.all) {
        dbg.log("Windows found: " + window.kwin_window.caption)
    }
}


var main = function(): void {
    registerShortcut(
        // TODO [bug]: Title doesn't show up in system setings.
        'Grouping Key',
        // TODO: Description is too long for system settings.
        'Grouping Key: First use selects focused window for getting tabbed, second use selects a window to tab it to.',
        // TODO [bug]: Somehow the shortcut doesn't get set - for now, we have to
        //   set the shortcut ourselves in the system settings.
        'Meta+Space',
        grouping_key_callback
    )
}


main();
