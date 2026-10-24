# companion-module-middleatlantic-racklink

**Requires Companion 4.3 or newer** (module API 2.0). Tested on Companion 5.1.

Bitfocus Companion module for Middle Atlantic RackLink power controllers (Select, Premium, Premium+), including the RLNK-915R.
It is implemented from Middle Atlantic's *Control System Communication Protocol Manual* (I-00472).

## Install as a developer module (macOS)

### 1. Install Node.js (one time)
Companion ships its own runtime for running modules, but you need Node.js on the Mac to install dependencies and build the package.
- Download the **LTS** installer from https://nodejs.org and run it, or install it with Homebrew: `brew install node`
- Check that it worked in Terminal (Applications → Utilities → Terminal):
  ```
  node -v
  npm -v
  ```
  `node -v` should report v18 or newer.

### 2. Put the module in a dev folder
```
mkdir -p ~/companion-dev
cd ~/companion-dev
unzip ~/Downloads/companion-module-middleatlantic-racklink.zip
```
You can also double-click the zip in Finder and drag the resulting `companion-module-middleatlantic-racklink` folder into `~/companion-dev`. Either way, the layout must be:
```
~/companion-dev/companion-module-middleatlantic-racklink/package.json
```
(not nested one level deeper).

### 3. Install the dependency
```
cd ~/companion-dev/companion-module-middleatlantic-racklink
sudo corepack enable
yarn install
```
This creates a `node_modules` folder. Companion won't load the module without it.

### 4. Point Companion at the folder
1. Open the Companion launcher window (click the Companion icon in the menu bar → **Show/Hide window** if it isn't visible).
2. Click the **cog** icon, then under **Developer modules path** click **Select** and choose `~/companion-dev`.
   Tip: in the folder picker press **⌘⇧G** and type `~/companion-dev`.
3. Quit Companion completely (menu bar icon → **Quit**) and start it again.

### 5. Allow network access (macOS 15 Sequoia and later)
macOS asks apps for permission to reach devices on your local network. If Companion can't connect to the RackLink but the unit's web page opens in your browser, go to **System Settings → Privacy & Security → Local Network** and turn **Companion** on. Then restart Companion.

### 6. Add the connection
In the Companion web UI, go to **Connections** and search for **Middle Atlantic RackLink**. Enter:
- the unit's IP address
- Model: **Select** (for the RLNK-915R)
- Username: `user`
- the password you set on the unit's web page

### Editing the module
Edit the files in `src/` with any text editor (VS Code, BBEdit, etc.). To reload your changes, disable and re-enable the connection in Companion.

### Removing it
Delete `~/companion-dev/companion-module-middleatlantic-racklink` and clear the Developer modules path in the launcher settings.

## Install on Windows / Linux
Same steps, using your own folder (e.g. `C:\companion-dev\`), then run `corepack enable` and `yarn install` inside the module folder and set the Developer modules path in the launcher settings.

## Build an installable package (.tgz)

Needs Node.js 22 or newer and Yarn 4 (via Corepack, included with Node):
```
sudo corepack enable
yarn install
yarn package
```
This creates the package `.tgz` in the module folder. In Companion, go to **Modules → Import module package** and choose it.

## Test without hardware

```
yarn mock          # simulated 9-outlet unit on port 60000 (login user / password)
yarn test # checks framing against the manual's example bytes
```
Point a connection at `127.0.0.1`. On a Mac, click **Allow** if the firewall asks whether `node` may accept incoming connections. Press Ctrl+C in Terminal to stop the mock. Typing an outlet number and pressing Enter in the mock terminal simulates a front-panel change.

## Compatibility notes
- Built on `@companion-module/base ~2.0.4` (module API 2.0), which Companion 4.3, 5.0 and 5.1+ accept. Don't raise it to 2.1 / 2.2 without also raising the minimum Companion version (5.0 / 5.1).
- Premium-only commands sent to a Select unit return a NACK, which is shown in `$(racklink:last_error)`. They are harmless.

## Files
- `src/protocol.js`: framing, checksum, escaping, parser, command tables
- `src/main.js`: connection, login and ping handshake, stop-and-wait command queue, state, polling, watchdog
- `src/actions.js`, `src/feedbacks.js`, `src/variables.js`, `src/presets.js`
- `tools/mock-racklink.js`: device simulator
