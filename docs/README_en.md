# Better Orpheus

Better Orpheus is a fork of [Open Orpheus](https://github.com/YUCLing/open-orpheus) maintained by EatKFCinMc. It includes a compatibility layer for [BetterNCM](https://github.com/std-microblock/chromatic/tree/v2).

## Features

- Cross-platform support
  - Excellent native Wayland support
  - X11
  - macOS
  - Windows
- Open-source

## Changes

- Downgraded the client package to version 2.10.13.202675 because the 2.x plugin ecosystem is richer ~~(and I prefer the 2.x UI)~~.
- Added a compatibility layer for BetterNCM support.

## Screenshots

<details>
<summary>Main Interface</summary>

![Main Interface](../assets/screenshots/1.png)

</details>

<details>
<summary>Playback Interface</summary>

![Playback Interface](../assets/screenshots/2.png)

</details>

<details>
<summary>Settings Interface</summary>

![Settings Interface](../assets/screenshots/3.png)

</details>

<details>
<summary>Mini Player & Desktop Lyrics</summary>

![Mini Player & Desktop Lyrics](../assets/screenshots/4.png)

</details>

<details>
<summary>Mini Player List</summary>

![Mini Player List](../assets/screenshots/5.png)

</details>

## Installation

### Debian Linux, Flatpak, AppImage, Windows, macOS

_Automated Publish_

Download from [Releases](https://github.com/EatKFCinMc/better-orpheus/releases/latest).

### Resources

This project does not bundle some required resources because they are owned by NetEase.

Better Orpheus will **automatically download** the package from NetEase's CDN on first launch if it is missing, so manual setup is usually not required. You can also manually select a local EXE installer for version 2.10.13.202675.

Resources are stored in the `package` subfolder of the data directory:

- Development: `data/package/` (relative to working directory)
- Packaged: `{userData}/package/`

#### `package` and `resource` folders

The entire `package` and `resource` folders are required.

If the automatic download fails, you can manually copy both folders from your official NetEase Cloud Music installation (e.g. `C:\path\to\your\installation\CloudMusic\package`) into the data directory above. **Note: `package` is a subfolder of the data directory's `package` folder, meaning the final structure should be `package/package/`!**

## Usage documentation

- [D-Bus services](./DBUS_SERVICES_en.md)
- [Logging configuration](./LOGGING.md)

## Credits

Better Orpheus is maintained by EatKFCinMc and is based on Open Orpheus, developed by YUCLing and other contributors, and BetterNCM, developed by std-microblock.

The original Open Orpheus code retains its MIT license and copyright notices. BetterNCM-related code retains the upstream GPLv3 license and original notices. The integrated version of Better Orpheus is distributed under GPLv3, and the original copyrights of each component remain with their respective rights holders.

## Disclaimer

Better Orpheus is an independent open-source project aimed at **interoperability**. It is not affiliated with, authorized by, or endorsed by NetEase in any way.

- **This project does not include or distribute any assets or code owned by NetEase.** Required resources such as `orpheus.ntpk` are the property of NetEase. Users must obtain them from a legally acquired official client installation, or allow the application to download them automatically from NetEase's official CDN on first launch.
- **This project does not provide, encourage, or support any functionality or modification intended to bypass advertisements, paid content, membership benefits, or digital rights management (DRM) mechanisms.** Any such use is explicitly outside the scope of this project and will be actively rejected.
- By using this project, you remain bound by the [NetEase Cloud Music Terms of Service](https://st.music.163.com/official-terms/service) and all applicable laws and regulations.
- This project is provided "as is". The maintainers accept no responsibility for any consequences arising from its use, including but not limited to account suspension, service disruption, or legal liability.

> "NetEase Cloud Music", "Orpheus", and related trademarks are the property of NetEase, Inc.
