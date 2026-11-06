# Better Orpheus

[English Version](docs/README_en.md)

以 Open Orpheus 为基础， 添加了 [BetterNCM](https://github.com/std-microblock/chromatic/tree/v2) 的兼容层

## 功能

- 跨平台支持
  - 优秀的原生 Wayland 支持
  - X11
  - macOS
  - Windows
- 开源

## 改动

- 添加对 Better-NCM 支持的兼容层
- 鉴于2.x版本的插件库更丰富~~（以及本人更喜欢2.x的ui）~~，软件包降级为 2.10.13.202675 版本

## 截图

<details>
<summary>主界面</summary>

![主界面](assets/screenshots/1.png)

</details>

<details>
<summary>播放界面</summary>

![播放界面](assets/screenshots/2.png)

</details>

<details>
<summary>设置界面</summary>

![设置界面](assets/screenshots/3.png)

</details>

<details>
<summary>迷你播放器和桌面歌词</summary>

![迷你播放器和桌面歌词](assets/screenshots/4.png)

</details>

<details>
<summary>迷你播放器列表</summary>

![迷你播放器列表](assets/screenshots/5.png)

</details>

## 安装

### Debian Linux、Flatpak、AppImage、Windows、macOS

_自动维护_

前往 [Releases](https://github.com/EatKFCinMc/better-orpheus/releases/latest) 下载

### 资源文件

这个项目不会打包某些必需资源，因为它们归网易所有。

Better Orpheus 在首次启动时如果检测到资源缺失，会自动从网易的 CDN 自动下载，通常无需手动配置。也可手动选择本地 2.10.13.202675 版本 EXE 安装包。

资源存放在数据目录的子文件夹 `package` 中：

- 开发模式：`data/package/`（相对于工作目录）
- 打包后：`{userData}/package/`

#### `package` 和 `resource` 文件夹

整个 `package` 和 `resource` 文件夹都是必需的。

如果自动下载失败，可以从官方网易云音乐的安装目录手动复制这两个文件夹，例如 C:\path\to\your\installation\CloudMusic\package，并将其放入上述数据目录中。注意：package 是 package 文件夹的子文件夹，也就是说复制完后应该是 package/package/！

## 使用文档

- [Wayland 窗口规则配置文档](./docs/WM_RULES.md)
- [D-Bus 服务文档](./docs/DBUS_SERVICES.md)
- [日志配置文档](./docs/LOGGING.md)

## 致谢

Better Orpheus 由 EatKFCinMc 维护，基于 YUCLing 及其他贡献者开发的 Open Orpheus，以及 std-microblock 开发的 BetterNCM。

Open Orpheus 的原始代码保留其 MIT 许可证及版权声明。BetterNCM 相关代码保留上游的 GPLv3 许可证和原始通知。Better Orpheus 的整合版本按 GPLv3 分发，各组件的原始版权归其权利人所有。

## 免责声明

Better Orpheus 是一个以**互操作性**为目的的独立开源项目，与网易公司没有任何关联、授权或认可关系。

- **本项目不包含、不分发任何归网易所有的资产或代码。** 运行所需的资源文件（如 `orpheus.ntpk`）归网易公司所有，程序首次启动会从网易云官方服务器下载安装包并在本机提取，也支持用户从合法取得的官方客户端中手动导入。
- **本项目不提供、不鼓励任何用于绕过广告、付费内容、会员权益或数字版权保护机制（DRM）的功能或修改。** 任何此类用途均明确超出本项目的范围，且会被主动抵制。
- 使用本项目时，您仍需遵守网易云音乐的[网易云音乐服务条款](https://st.music.163.com/official-terms/service)及相关法律法规。
- 本项目按"现状"提供，不对因使用本项目所产生的任何后果（包括但不限于账号封禁、服务中断或法律责任）承担责任。

> "网易云音乐"、"Orpheus" 等名称及相关商标归网易公司所有。
