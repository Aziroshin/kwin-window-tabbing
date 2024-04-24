import dbg from "./dbg";


enum GroupingSelectorState {
    Disabled,
    SelectingTabbee,
    SelectingTarget
}


interface Store {
    tabbee: KWin.AbstractClient
    grouping_selector_state: GroupingSelectorState
}


var store: Store = {
    tabbee: workspace.activeClient,
    grouping_selector_state: GroupingSelectorState.SelectingTabbee
}

var grouping_key_callback = function(): void {
    dbg.log("Key: Grouping Key")
    if (store.grouping_selector_state == GroupingSelectorState.SelectingTabbee) {
        dbg.log("Grouping state: SelectingTabbee - now switching to SelectingTarget")
        store.tabbee = workspace.activeClient
        store.grouping_selector_state = GroupingSelectorState.SelectingTarget
    } else if (store.grouping_selector_state == GroupingSelectorState.SelectingTarget) {
        let target = workspace.activeClient
        store.tabbee.frameGeometry = {
            x: target.frameGeometry.x,
            y: target.frameGeometry.y,
            width: target.frameGeometry.width,
            height: target.frameGeometry.height,
        }
        dbg.log("Grouping state: SelectingTarget - now switching to SelectingTabbee.")
        store.grouping_selector_state = GroupingSelectorState.SelectingTabbee
        // workspace.activeClient.clientPos
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
