# 许可证与适用范围

Better Orpheus 由 EatKFCinMc 维护，基于 YUCLing 及其他贡献者开发的 Open Orpheus，并集成 BetterNCM。各部分的原始版权归其权利人所有。

## 整体发行版

包含 BetterNCM 的 Better Orpheus 组合程序按 GNU General Public License 第 3 版发布，使用 SPDX 标识 `GPL-3.0-only`。完整许可文本见 [LICENSE](LICENSE)。这里不授予将 BetterNCM 部分按 MIT 使用的权利，也不额外授予使用后续 GPL 版本的选择权。

整体发行许可不撤销下文列出的 MIT 部分的独立授权。用户可以单独按 MIT 使用这些部分；分发包含 BetterNCM 的组合程序时，仍须满足 GPLv3 的条件。

## BetterNCM 上游代码

`chromatic/` 保留上游 GPLv3 许可、版权声明及其他通知，见 [chromatic/LICENSE](chromatic/LICENSE) 和 [LICENSES/GPLv3-BetterNCM.txt](LICENSES/GPLv3-BetterNCM.txt)。其中另有独立许可的第三方内容继续遵循其自身条款。

本项目在构建时导入 BetterNCM 的 JS 框架，对部分源码进行转换并替换部分 API 实现，再与本地运行时代码打包。构建还会复制上游 `chromatic/resource/PluginMarket.plugin`。子模块源码未直接修改，并不表示输出中使用的代码未经适配。

上游来源：<https://github.com/std-microblock/chromatic/tree/v2>。

## 本项目采用 GPLv3 的兼容层与配套代码

EatKFCinMc 对下列路径中由其拥有授权权利的新增和修改部分采用 `GPL-3.0-only`。从 BetterNCM 复制或改编的部分继续按上游 GPLv3 使用，并保留原声明；本声明不改变第三方内容的许可。

下列目录递归适用：

- `src/betterncm/`：框架运行时、本地 API、加载器和兼容元数据。
- `src/main/betterncm/`：Electron 主进程宿主、插件管理和资源适配。
- `scripts/betterncm/`：上游源码转换及兼容数据维护工具。

下列文件单独适用：

- `src/preload/betterncm.ts`
- `src/preload/betterncm-bridge.ts`
- `gui/src/routes/Plugins.svelte`
- `scripts/build-betterncm.ts`
- `scripts/check-betterncm-runtime.mjs`
- `scripts/prepare-betterncm-api-profile.mjs`
- `scripts/report-betterncm-api.mjs`

相关测试适用：

- `__test__/main/betterncm-*.spec.ts`
- `__test__/preload/betterncm-*.spec.ts`

## 保留 MIT 的代码

源自 Open Orpheus 的代码保留其 MIT 授权及版权声明，完整文本见 [LICENSES/MIT-open-orpheus.txt](LICENSES/MIT-open-orpheus.txt)。包括 `modules/` 下各模块，其现有 `package.json` 中的 MIT 声明继续有效。

除上述 GPLv3 范围和具有单独许可的第三方内容外，本项目中由 EatKFCinMc 独立编写、拥有授权权利的新增代码及修改采用 MIT 许可，许可条款同上述 MIT 文本；这些贡献的版权为 Copyright 2026 EatKFCinMc。该授权不覆盖从 GPL 代码复制或改编的内容。

原 MIT 文件仅为调用兼容层而新增导入或接口调用，不因此自动改变其独立 MIT 授权。如果文件包含复制或改编的 GPL 实现，该部分应按 GPLv3 处理，并在相应文件中标明来源和适用范围；不得用本节的默认 MIT 声明覆盖它。

## 第三方内容与生成文件

依赖、插件、字体、图标、客户端资源等第三方内容遵循各自许可证。本声明不为其授予新的权利，也不统一将其改为 MIT 或 GPLv3。已有的版权和许可通知应保留。

`assets/betterncm/framework.js` 是上游框架和本地兼容代码的组合输出，按 GPLv3 条件分发，并保留其内含第三方组件的通知。`assets/betterncm/PluginMarket.plugin` 保留上游适用许可。构建输出不会因为位于生成目录而免除其许可义务。

## 发布与对应源码

分发组合程序时，应随附 GPLv3 及需要保留的组件许可和版权声明，并按 GPLv3 第 6 条提供与该发行版本对应的源码，包括本地适配、构建脚本和实际使用的 BetterNCM 子模块源码。仅提供不含子模块内容的源码压缩包并不足以提供完整对应源码。

修改过的 GPL 部分还应有显著的修改说明和相关日期。本文件说明许可范围，不替代具体版本的修改记录、第三方通知或完整的发布检查。
