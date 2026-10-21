# 工作区编辑器 Loading 与离线加载修复

日期：2026-10-21。适用于学生进入工作区后，文件树和工具栏已出现，但代码区域持续显示英文 `Loading...` 的情况。

## 原因与复现

工作区编辑器和讲义代码预览使用 `@monaco-editor/react`。此前没有配置本地 Monaco 实例，包装器默认请求 `https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js`，而仓库安装了 `monaco-editor` 依赖并不等于运行时已经使用本地资源。外部脚本被网络环境阻断时，代码编辑器会一直显示 Loading。库的 [Electron 说明](https://github.com/suren-atoyan/monaco-react#for-electron-users) 也记录了这类现象。

在修复前的真实生产 Renderer 中使用独立空缓存、阻断所有 HTTP/HTTPS/WebSocket 请求，TI、沁恒和趣味版均复现此问题，并捕获上述 CDN 请求。这确认了一个可复现的公共软件缺陷；不能据此断言每位学生遇到的所有加载故障都只有同一原因。

## 修复

- Renderer 启动时、React 挂载前导入 `monaco-bootstrap.ts`，把打包的 Monaco 实例传给 loader。
- 使用 Vite 的 Worker 打包方式，随软件携带编辑器、JSON、CSS、HTML、TypeScript/JavaScript 五类后台线程和代码语言资源。
- 工作区与讲义代码预览共享本地实例，初始化文字改为中文。
- 保留现有编辑、保存、只读权限、主题和诊断行为；没有改动课程数据、学生工程或硬件配置。

## 实际验收

命令：

```powershell
npm run smoke:editor:offline
```

该命令先构建，再使用隐藏的真实 Electron 窗口加载生产 Renderer。只使用已有浏览器演示 API，每版使用独立无缓存会话，并拦截全部 HTTP/HTTPS/WS/WSS 请求；不会接触学生工作区或硬件。

- 修复前：三个版本均捕获 Monaco CDN 请求，并复现英文 Loading。
- 修复后：三个版本均显示真实 Monaco 代码区域，外网请求数为 0。
- TI / 沁恒：通过真实编辑器输入并点击保存，保存状态恢复为已保存。
- 后台线程：实际启动五类本地 Worker，通过调试协议确认线程脚本执行上下文和消息处理器已初始化，文件均来自 `file:` 打包资源。
- Main / Renderer 类型检查和生产构建通过。
- Renderer 回归测试：23 个文件、120 项全部通过。

冒烟脚本的 `--expect-loading` 仅用于在修复前构建中确认原故障；修复后正常验收不使用这个参数。此测试不等同于新 NSIS 安装包验收，本轮未发布新安装包。

1.2.2 发布准备：正式打包脚本在生成来源记录前，使用 `--renderer-root` 对实际 `app.asar/out/renderer` 再执行上述断网检查，覆盖打包后代码显示、编辑保存和五类本地后台线程。发布状态以对应版本发布记录和公开清单为准。

## 已安装学生端

这是软件 Renderer 加载方式的问题，课程、工程模板和固件基线热更新无法替换它。现有 TI 1.2.1 和 MCU 1.2.0 安装包不会自动获得本地源码修复，需发布包含修复的软件版本。不要将重新下载课程或删除学生工程作为修复步骤。编辑器 Loading 本身不代表已保存的源码文件丢失。
