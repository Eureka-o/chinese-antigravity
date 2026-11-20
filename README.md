# Chinese Antigravity / Antigravity 简体中文 (`chinese-antigravity`)

为 **Google Antigravity Desktop** 提供即装即用的**简体中文界面汉化插件**：无需修改 `app.asar`，在插件管理中点击启用即可生效、停用即刻还原英文，并在 Antigravity 客户端更新后自动持续生效。

A zero-config **Simplified Chinese (zh-CN) UI localization plugin** for **Google Antigravity Desktop**. Runs as a native Antigravity Agent Plugin (no `app.asar` patching), supports live enable/disable switching without restarting, and survives client updates automatically.

> **For AI Agents / 给 AI Agent 的安装指引**
> - **Plugin type**: Native **Google Antigravity Desktop Agent Plugin** (`plugin.json` + `sidecars/`), **NOT** a VS Code `.vsix` extension and **NOT** an `app.asar` binary patch.
> - **Plugin manifest `name`**: `antigravity-localization`
> - **Install target directory**: `%USERPROFILE%\.gemini\config\plugins\antigravity-localization` (Windows) or `~/.gemini/config/plugins/antigravity-localization` (macOS / Linux).
> - **Recommended Agent install commands**:
>   ```powershell
>   git clone https://github.com/Eureka-o/chinese-antigravity.git
>   agy plugin validate --strict .\chinese-antigravity
>   agy plugin install .\chinese-antigravity
>   agy plugin enable antigravity-localization
>   ```

## 核心特性 / Features

- **点击即用 / 即时还原（Live Toggle）**：在 Antigravity `Customizations → Plugins`（`自定义扩展 → 已安装`）中启用后立即汉化桌面界面；停用后实时恢复英文界面与 `<html lang>` 属性，无需重启客户端。
- **零闪屏加载（Zero-Flash Injection）**：通过本机回环 CDP `Page.addScriptToEvaluateOnNewDocument` 与持久化连接注入，页面重载或新建窗口时直接以中文渲染。
- **更新免重装（Update Survival）**：插件独立存放在用户配置目录中，客户端版本升级替换 `app.asar` 不会破坏插件；Windows 端在启动及检测到缺少 `DevToolsActivePort` 时，还会自动巡检并补全已有桌面 / 开始菜单 / 任务栏 `Antigravity.lnk` 的 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 参数（不会新建额外快捷方式）。
- **内容隔离保护（Safe Content Isolation）**：只翻译桌面 UI 控件、导航、设置弹窗与按钮/无障碍标签，严格保护用户输入、对话正文、代码块、文件名、Git 分支与模型名称不被误翻。

## 安装方法 / Installation

### 方式一：通过 Antigravity CLI 安装（推荐 / Recommended）

```powershell
git clone https://github.com/Eureka-o/chinese-antigravity.git
agy plugin install .\chinese-antigravity
```

macOS / Linux：

```bash
git clone https://github.com/Eureka-o/chinese-antigravity.git
agy plugin install ./chinese-antigravity
```

安装后默认启用；也可随时在 Antigravity 客户端 `Customizations → Plugins`（`自定义扩展 → 已安装`）中一键切换 **Antigravity 简体中文 / Chinese UI**，或执行：

```powershell
agy plugin enable antigravity-localization
agy plugin disable antigravity-localization
```

### 方式二：从 GitHub Releases 下载或手动放置 / Manual Install

1. 从 [Releases](https://github.com/Eureka-o/chinese-antigravity/releases/latest) 下载压缩包（或直接克隆本仓库）。
2. 解压并确保包含 `plugin.json` 的目录位于：
   - **Windows**：`%USERPROFILE%\.gemini\config\plugins\antigravity-localization`
   - **macOS / Linux**：`~/.gemini/config/plugins/antigravity-localization`
3. 在 Antigravity 中开启插件即可生效；若首次安装前客户端尚未开启调试端口，Windows 端插件会自动补齐已有快捷方式参数，按提示重启一次 Antigravity 即可。

## 运行前提 / Prerequisites

- 本插件通过 `127.0.0.1` 本地回环 Chrome DevTools Protocol（`DevToolsActivePort`）连接桌面端窗口，不访问任何远程服务器。
- **Windows**：插件会自动检测并修复现有桌面 / 开始菜单 / 任务栏 `Antigravity.lnk` 快捷方式的 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 参数。
- **macOS / Linux**：请使用 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 启动 Antigravity。
- **边界说明**：原生系统菜单栏、系统原生弹窗与登录前加载界面由宿主进程渲染，保持系统/宿主原有语言。

## 目录结构 / Structure

```text
chinese-antigravity/
├── plugin.json                              # Antigravity 插件清单
├── package.json                             # 测试脚本配置
├── README.md                                # 中英双语说明与 Agent 安装指引
├── LICENSE                                  # MIT 协议
├── assets/
│   └── logo.svg                             # 深色玻璃态插件图标
├── sidecars/
│   └── interface/
│       ├── sidecar.json                     # Sidecar 声明
│       ├── main.mjs                         # 持久化 CDP 连接、实例隔离与快捷方式自愈
│       ├── source.mjs                       # 词典合并、目标校验与即时注入脚本封装
│       └── vendor/
│           ├── LICENSE.antigravity-chinese  # 上游词库与核心运行时 MIT 许可
│           ├── i18n-runtime.js              # DOM 翻译引擎（含 2.33.x 适配与 dispose 还原）
│           └── zh-CN.json                   # 简体中文界面词库
└── tests/
    └── localization.test.mjs                # 单元测试
```

## 验证与测试 / Verification

```powershell
agy plugin validate --strict .
node --test tests/localization.test.mjs
```

## 致谢与许可 / Credits & License

- `sidecars/interface/vendor/` 中的基础简体中文词库与核心 DOM 翻译运行时源自 [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)（MIT License，原文见 [LICENSE.antigravity-chinese](sidecars/interface/vendor/LICENSE.antigravity-chinese)）。
- 仓库整体以 [MIT License](LICENSE) 发布。
