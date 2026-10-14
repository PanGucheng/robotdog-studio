# 深色模式与主题切换

日期：2026-10-14，版本保持 1.1.0。用户暂缓参考 VS Code 调整浅色配色，本次保留浅色 `#F2F8FB` 导航与白色文件树、课程目录，新增深色模式。

## 使用方式

点击左上角汉堡菜单，切换“深色模式”。开关立即生效，菜单保持打开，方便比较；关闭开关恢复浅色。各 Edition 分别记住选择，重新启动时恢复。切换不重建代码编辑器、不改课程或工程内容。

## 实现与颜色

| 文件 | 修改 |
| --- | --- |
| `src/shared/studio-theme.ts` | 单一来源的浅色/深色 Token，以及模式值校验；将正文墨色与实心按钮/日志底色分开 |
| `src/shared/window-chrome.ts`、`src/main/index.ts`、`src/preload/index.ts`、renderer `env.d.ts` | 只接受 light/dark 的主题 IPC；更新当前窗口原生按钮区和窗口背景；通过启动参数在首次渲染前传递偏好 |
| `src/main/services/studio-theme-preference.ts` | 独立 `studio-theme.json` 保存窗口主题；损坏或缺失时回到浅色 |
| renderer `lib/studio-theme.ts`、`main.tsx`、`App.tsx` | 初始化 CSS 变量，保存 renderer 偏好，通知已打开编辑器，连接菜单状态 |
| `components/AppMenu.tsx`、`styles.css` | 菜单内增加带图标和开关的“深色模式”，保留已有菜单入口及键盘焦点；日志与按钮背景读取独立 Token |
| `dark-theme.css` | 深色专用语义颜色适配：历史组件文字、边框、状态底色、输入框和进度标记；不改布局 |
| `components/StudentCodeEditor.tsx` | Monaco 实时更新主题与语法、选区、行号、缩进线；讲义代码预览复用同一配置 |
| 主题偏好、AppMenu、AboutPage 相关测试 | 偏好恢复、无存储容错、非法值拒绝、双向切换及原有菜单入口回归 |
| `scripts/studio-visual-smoke.mjs` | 经真实菜单双向切换、renderer 重载恢复、非法 IPC 拒绝、编辑器节点/代码保留与两套颜色断言 |

| 用途 | 深色颜色 |
| --- | --- |
| 页面外围 | `#141C24` |
| 公共导航/标题栏 | `#1A2631` |
| 内容表面 | `#202D38` |
| 主文字 / 次级文字 | `#E2EDF4` / `#A6BBC9` |
| 选中底色 / 文字 | `#164956` / `#94E2EB` |
| 悬停底色 | `#2E4351` |
| 青蓝文字 / 焦点 | `#72D5E2` |
| 实心操作背景 | `#08788A`，保留白色文字 |
| 分区线 | `#3B4D5C` |
| 成功 / 警告 / 错误文字 | `#85D9AD` / `#F1CA82` / `#FFAAA2` |

初始浅色不跟随操作系统自动切换。renderer 的有效已保存值优先于窗口启动参数，以便同一窗口重新加载后恢复最近选择；启动参数提供首次渲染与不可用浏览器存储的回退。主进程提前读取偏好决定窗口底色及原生按钮区，减少重启时闪白。

深色适配使用显式组件选择器和共享语义 Token，没有反色滤镜、新 UI 框架或依赖；图像、Logo 和数据曲线保持内容含义。Windows 原生最小化、最大化与关闭按钮保留。

## 验证

检查使用隔离用户数据的隐藏 Electron 窗口；不显示、激活或控制用户桌面。原图通过 `capturePage` 无损保存，DPI 与应用缩放分开记录。

- 类型检查、生产构建、视觉脚本语法检查通过。
- 完整 Vitest：368 项通过、1 项跳过，67 个文件通过、1 个跳过。随后增加菜单开关测试，连同菜单原入口、编辑器工具函数和主题偏好进行专项复验：5 个文件、28 项通过。完整运行在新增最后一项菜单测试之前，未把专项结果冒充又一次完整运行。
- MCU 深色：26 张采集、24 组布局、37 个底色检查场景；TI 深色：24 张采集、23 组布局、35 个底色检查场景。覆盖课程、讲义、知识参考、任务、文件树、终端、AI 浮窗、设置、关于及窄窗口；代表性小字最低实测对比度为 4.98:1。
- MCU 恢复浅色：26 张采集、24 组布局、37 个底色检查场景通过，最低对比度仍为 4.89:1。双向切换、开关状态、renderer 重载恢复、非法模式拒绝、主进程偏好文件与窗口背景读回通过。MCU/TI 已打开编辑器切换时节点与代码文本保持不变。
- Fun 完整运行在等待 Monaco 代码行渲染时超时，与本轮之前浅色检查现象一致。随后显式跳过该场景复验其他页面：19 张采集、12 组布局、19 个底色场景通过；JSON 的 `skippedScenes` 明确保留未覆盖项。不能据此声称 Fun 编辑器已完成整页验收；公共编辑器在 MCU/TI 中已验证。
- Fun 仍有原来的 `course:update-status:get` 未注册日志；`INVALID_STUDIO_THEME` 是本次测试故意发送非法值后的预期拒绝。没有修改这些既有功能或为截图伪造 AI/硬件结果。

尺寸覆盖普通、最大化对应内容尺寸与窄窗口，以及 100%～175% 应用缩放。没有点击用户桌面的最大化按钮。原生控制按钮完整绘制与点击仍需手动验收。未调用真实 AI、烧录硬件、发布课程或安装包。

## 原始截图

本次保留 14 张代表性原图和 4 份检查 JSON，全部采集结果的数量见 `totalCaptured`，`screenshots` 只列保留的文件；布局、颜色、对比度和主题检查记录保留完整。

| 场景 | 原图 |
| --- | --- |
| 菜单切换 | [深色模式开关](assets/dark-theme-20261014/mcu/after-theme-menu.png) |
| MCU 课程 / 讲义 | [课程中心](assets/dark-theme-20261014/mcu/after-course.png)、[讲义](assets/dark-theme-20261014/mcu/after-reader.png) |
| MCU 工作台 / AI | [工作台](assets/dark-theme-20261014/mcu/after-workbench.png)、[AI 浮窗](assets/dark-theme-20261014/mcu/after-ai-assistant.png) |
| 设置 / 提示框 | [设置](assets/dark-theme-20261014/mcu/after-settings.png)、[175% 设置](assets/dark-theme-20261014/mcu/after-settings-narrow.png)、[前置课提示](assets/dark-theme-20261014/mcu/after-prerequisite-dialog.png) |
| TI | [工作台](assets/dark-theme-20261014/ti/after-workbench.png)、[设置](assets/dark-theme-20261014/ti/after-settings.png) |
| Fun | [操作示范](assets/dark-theme-20261014/fun-partial/after-learning-center.png)、[设置](assets/dark-theme-20261014/fun-partial/after-settings.png) |
| 切回浅色 | [工作台](assets/dark-theme-20261014/light/after-workbench.png)、[讲义](assets/dark-theme-20261014/light/after-reader.png) |

上述记录来自实现阶段，当时仅更新源码与本地构建。该功能纳入软件 1.2.0 发版范围，最终上线版本以公开 App Update 清单为准。因为涉及主进程与 preload，开发版需要重启，旧安装包不会自动获得开关。
