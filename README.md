# kwin-window-tabbing
An attempt at window tabbing for KWin. Currently in its initial stage of development and not yet usable.

Based on [this](https://github.com/RubixDev/kwin-typescript-template) TypeScript KWin scripting template and [type definitions](https://github.com/RubixDev/kwin-types) by [RubixDev](https://github.com/RubixDev). Refer to their READMEs, especially [section 5](https://github.com/RubixDev/kwin-typescript-template?tab=readme-ov-file#step-5) of the template.

## What Works:
- Adding windows to a group using a shortcut.
- All windows in a group getting resized in unison.

## Setup
### Notes
- If you use nvm, there's an `.nvmrc`.
- Run `npm i` to install the required dependencies.
- The KWin script sources are in `contents/src`.
- `npm run dbus_printer` will start a DBus service the KWin script may print to using `dbg.log`, `dbg.info` or `dbg.debug`.
- `npm run start` will recompile/load the script.

### NPM Scripts
#### lint
Checks the source files for errors using `tsc`

#### compile
Compiles the TypeScript source files to a single `main.js` without checking for errors

#### package
Packages the compiled script to a single `.kwinscript` file. Use the `.pkgignore` file to specify files and folders of the root level to exclude

#### install
Installs the packaged script to your system

#### run
Enables the installed script and starts it. The output can be seen via `journalctl -f`

#### status
Shows the current install & load status of the script.

#### dbus_printer
Starts a DBus service that prints the messages it receives to the console. The source can be found [here](dev/dbus_printer/dbus_printer.js). To send messages to it from the KWin script, either use `dbg.log("example")`, `dbg.info("example")` or `dbg.debug("example")`. An example of how to send messages to it from the command line can be found [here](dev/dbus_printer/scripts/test_dbus_printer.sh). 

#### publish
Executes these scripts:
1. `lint`
2. `compile`
3. `package`

#### start
Executes these scripts:
1. `lint`
2. `compile`
3. `package`
4. `install`
5. `run`

#### uninstall
Fully stops and removes the installed script from your system

#### update-metadata
Copies following information from the `package.json` to the `metadata.desktop`:
- `displayName`
- `description`
- `main`
- `author`
- `name`
- `version`