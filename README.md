# kwin-window-tabbing

An adventurously hackish setup to enable window tabbing with KWin. Currently
semi-usable for *very* simple use cases, but still glitchy and missing features.
Doesn't support Plasma 6 yet.

Based on [this](https://github.com/RubixDev/kwin-typescript-template) TypeScript
KWin scripting template and [type definitions](https://github.com/RubixDev/kwin-types)
by [RubixDev](https://github.com/RubixDev). Refer to their READMEs, especially
[section 5](https://github.com/RubixDev/kwin-typescript-template?tab=readme-ov-file#step-5)
of the template.

## What Works

- Adding and removing windows to/from a group using a shortcut.
- Grouped windows have a tab bar above them that allows for switching between windows.
- Window resizing, repositioning and border toggling get applied to all grouped
windows in unison.
- The tab bar gets resized and moves virtual desktops with its group.

## What Does Not Work (Yet?)

These might be better off as issues at some point. Right now, this is just here to
give you an idea as to what **not** to expect when running this right now.

### Incomplete / Lack of Features

- It's still possible to move/resize the tab bar separately. It also can't be
used to manipulate the window group in any way.
- Maximized groups push their tab bar off-screen.
- Windows (of other groups or ungrouped) can be moved between the tab bar and the
top window/group, covering the tab bar but not the window or vice versa.
- It's still possible to group tab bars with other windows, with confusing results.
- No feedback whether one is currently in grouping mode or not, and no graceful way
to abort it either if one changes one's mind.
- No persistence - restarts of KWin or the KWin script will reset all groups and
restarts of the companion program will remove all tab bars.
- Tab bar is still displayed in window lists.
- The caption and icon of the current tab bar dont reflect the group's current
top window.
- When reactivating monitors in a multi-monitor setup, windows may be somewhere
else, disconnected from their tab bars.

### Bugs

- Scrolling in the tab bar widget is possible but doesn't do anything, which
means the wrong tab might be shown as active.
- Closing a window without detaching it from the group first breaks all functionality.

## How it Works

You can group windows together and have them decorated with a tab bar by using
the grouping shortcut (default: `Meta+Space`) to pick the currently focused window
(the "tabbee") to be grouped to another window (the "target"). You do this by
first focusing the tabbee and hitting the shortcut, then focusing the target
window and hitting the shortcut again. If the target window is already in a group,
the tabbee will get added to it.
Currently, if you want to abort that process midway, you'll have to make sure
the tabbee is focused and hit the grouping shortcut again.

Grouped windows are all stacked on top of each other. Their position or
geometry change in unison ([or are supposed to, anyway](#what-does-not-work-yet)
xD).
These changes are induced by the currently displayed window of the group (the
"top window"). If that window changes position or size, all the other windows
and the corresponding tab bar do as well.

In the future, it might be possible to move the group by moving the tab bar,
but right now, that just moves the tab bar (which will snap back once you move
the group).

This means that, if you move your windows by click-holding window titles,
you'll want to keep window decorations enabled.

To change to a different window in a group, click on the corresponding tab
in its tab bar.

You can remove a window from a group by focusing it and hitting
`Meta+Alt+Space`.

## Default Shortcuts

- Grouping: `Meta+Space`.
- Ungroup focused window: `Meta+Alt+Space`.

## Setup

### Set up the KWin script

- Even though the KWin script and the companion program don't need npm, this
repo and its packaging and install procedures are structured around it.
  - This project has an `.nvmrc` file, so you can just run `nvm use` if you
  have [nvm](https://github.com/nvm-sh/nvm).
  - On debian, you can run `apt-get install npm`.
- Run `npm i` to install the required dependencies.
  - Refer to [package.json](package.json) to see the list of dependencies it'll install.

### Set up the "tab_bar"

The KWin script will work without this, but in order to see anything, you need a
companion program that the KWin script communicates with which renders visible
tab bars for grouped windows. Currently, [py_tab_bar](tab_bars/py_tab_bar) serves
this purpose. Steps to set it up:

- You will need the dbus development files and python3 (with the "venv" module).
  - Install command for debian based systems (assuming python3 is already
  installed): `sudo apt-get install libdbus-1-dev python3-venv`.
- `cd tab_bars/py_tab_bar`.
- `python3 -m venv venv`.
- `. ./venv/bin/activate`.
- `pip install -r requirements.txt`.
  - Refer to [requirements.txt](tab_bars/py_tab_bar/requirements.txt) to see
  the list of dependencies it'll install.

### Notes

- The KWin script sources are in `contents/src`.
- `npm run dbus_printer` will start a DBus service the KWin script may print
to using `dbg.log`, `dbg.info` or `dbg.debug`.
- `npm run start` will recompile/load the script.

## NPM Lifecycle Scripts

### start

Compiles, installs and runs the KWin script in one fell swoop, overwriting
the previous install. You'll most likely want to use this most of the time
for installing the script, or when testing changes made to the source code
(in this repo, of course - don't edit the installed version of the
script, and definitely *don't* use this command (or most other commands in
this list) if you've made such edits).

Executes these scripts:

1. `lint`
2. `compile`
3. `package`
4. `install`
5. `run`

### lint

Checks the source files for errors using `tsc`

### compile

Compiles the TypeScript source files to a single `main.js` without checking for errors

### package

Packages the compiled script to a single `.kwinscript` file. Use the
`.pkgignore` file to specify files and folders of the root level to exclude

### install

Installs the packaged script to your system

### run

Enables the installed script and starts it. The output can be seen via
`journalctl -f`

### status

Shows the current install & load status of the script.

### dbus_printer

Starts a DBus service that prints the messages it receives to the console. The
source can be found [here](dev/dbus_printer/dbus_printer.js). To send messages
to it from the KWin script, either use `dbg.log("example")`, `dbg.info("example")`
or `dbg.debug("example")`. An example of how to send messages to it from the
command line can be found [here](dev/dbus_printer/scripts/test_dbus_printer.sh).

### publish

Executes these scripts:

1. `lint`
2. `compile`
3. `package`

#### uninstall

Fully stops and removes the installed script from your system.

#### update-metadata

Copies following information from the `package.json` to the `metadata.desktop`:

- `displayName`
- `description`
- `main`
- `author`
- `name`
- `version`

## Troubleshooting

### Removing old Registered Shortcuts

Try cleaning up orphaned shortcuts: `qdbus org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.cleanUp`.

## Licensing

The project is licensed under [GNU General Public License v2.0 only](LICENSE)
except for parts that are public domain or explicitely licensed differently,
which are listed below.

### Public Domain Parts

- [contents/src/bimap.ts](contents/src/bimap.ts)
