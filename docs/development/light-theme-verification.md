# 浅色界面与应用内提示框验收

日期：2026-10-14。视觉方向为浅色主界面、深蓝品牌文字、青蓝交互强调。保留课程中心左右分栏、Logo、黄色课次编号和课程状态标签。

后续复核：用户反馈讲义目录、工作台文件树、终端和任务区仍有不一致的历史底色。本记录保留上轮执行事实，不能作为全软件底色一致性的验收结论；统一规则见[全软件浅色界面与底色职责规划](surface-system-plan.md)，本轮实际结果见[全软件底色统一与视觉验收](surface-system-verification.md)。

## 审查与修改范围

现有 `styles.css` 已有颜色变量、课程卡片及响应式容器规则，可直接复用。主要割裂来自公共 `.topbar`、深色 `.course-center-hero` 和系统弹窗。代码、构建日志等功能区域保留原有主题，不做整体重设计。

| 文件 | 修改内容 |
| --- | --- |
| `src/shared/studio-theme.ts` | 统一颜色 Token，供 renderer 与 Electron 原生按钮区共同使用 |
| `src/shared/window-chrome.ts` | 标题栏高度 36 px，独立于应用 UI 缩放 |
| `src/main/index.ts` | Windows 使用浅色 titleBarOverlay；增加隐藏窗口视觉检查入口与 viewport smoke 检查 |
| `src/preload/index.ts` | 仅暴露是否使用自定义标题栏及其高度，不增加窗口控制 IPC |
| `src/renderer/src/env.d.ts` | 声明标题栏信息类型 |
| `src/renderer/src/main.tsx` | 启动时应用公共主题变量、预留标题栏空间 |
| `src/renderer/src/styles.css` | 浅色导航、面包屑、菜单、项目选择与状态标签；白色课程横幅；删除横幅装饰与重阴影；统一弹窗；窄窗口规则 |
| `src/renderer/src/components/WindowTitleBar.tsx` | 保留小 Logo 与软件名称，拖动区由 CSS 定义 |
| `src/renderer/src/components/StudioDialog.tsx` | 原生 HTML dialog：模态焦点、Esc 取消、初始焦点、提交中防重复、错误提示与焦点归还 |
| `src/renderer/src/components/CourseCenter.tsx` | 前置课确认使用应用内提示框，展示尚未完成的课名 |
| `src/renderer/src/App.tsx` | 项目重命名使用相同弹窗；名称长度与后端的 48 字符限制一致 |
| `src/renderer/src/components/StudioDialog.test.tsx` | 取消、焦点、空名称、重复提交与保存失败保留输入测试 |
| `src/renderer/src/components/CourseCenter.test.tsx` | 取消保持当前页面、确认进入所选课、前置课完成后直接进入测试 |
| `scripts/studio-visual-smoke.mjs` | 仅操作 smoke 的隐藏 Electron 窗口，检查布局、模态行为并保存无损 PNG |
| `docs/README.md` | 加入本记录导航 |
| `docs/development/assets/light-theme-20261014/` | 三个 Edition 的渲染图与几何检查 JSON |

课程润色按此前用户请求单独提交为 `ef39a6b`，课程内容版本递增至 MCU v16 / TI v6，旧冻结指纹保留。本次视觉提交不再修改课程数据、教学步骤、硬件交互、固件或软件版本，也未增加 UI 框架与依赖。

## 颜色与布局

| 用途 | 颜色 |
| --- | --- |
| 页面背景 | `#F5F8FA` |
| 导航与窗口标题栏 | `#EAF2F6` |
| 卡片 | `#FFFFFF` |
| 主标题与品牌文字 | `#142F46` |
| 公共次级文字 | `#526B7A` |
| 青蓝交互色 | `#07788A` |
| 边框 / 导航 hover | `#D8E3EA` / `#DCEAF0` |

次级文字与强调色比参考值略深，以保持小字号可读性。新导航主文字对比度约 12.15:1，次级文字约 4.95:1，青蓝文字约 4.56:1；主按钮白字约 5.17:1。此检查针对本次公共主题文字，不表示已经逐项审计全部历史样式。

沿用原有 Inter、Noto Sans SC、Bahnschrift 与等宽字体。主导航高度从 78 降至 68 px；横幅最小高度从 122 降至 98 px，内边距减小，标题 24 → 22 px。窄窗口中采用紧凑的信息行，保留教学对象、课次和平台全部信息。边框与适度圆角建立层次，不增加渐变、发光或装饰图案。

Windows 使用 [Electron titleBarOverlay](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) 保留原生最小化、最大化和关闭按钮。renderer 不自行模拟窗口控制按钮；品牌区域作为拖动区。

## 页面检查

| 页面 | 结果 |
| --- | --- |
| MCU / TI 首页 | 浅色公共导航与首页白色入口卡片衔接，Logo 保留 |
| MCU / TI 课程中心 | 白色横幅和浅色主体过渡自然，课次选择、目标、状态与入口保留 |
| MCU / TI 讲义 | 公共导航与白色阅读页统一，目录、阅读进度和实验入口正常 |
| MCU / TI 工作台 | 浅色导航、文件树、任务栏与代码区域衔接；打开实际课程文件查看代码 |
| 前置课提示 | 标题、说明和动作清楚；焦点默认在返回按钮；背景不能取得焦点，Esc 保持在课程中心 |
| Fun 项目重命名 | 输入默认选中原名称；取消关闭；空名称不能提交，失败保留输入 |
| 关于窗口 / Fun 工作台 | 继承浅色公共导航；已有功能日志与代码配色不强制改白 |

课程中心检查 1440 × 900（100%、125%）、1707 × 983（150%）及 1080 × 700（100%、150%、175%）内容尺寸。横向边界检查通过；较大的缩放允许正文纵向滚动。1707 × 983 是本机最大化对应的内容尺寸检查，没有再次操纵用户桌面去点击最大化或测试系统贴靠。

## 截图与复现

截图来自真实应用的隐藏测试窗口，使用 `webContents.capturePage` 无损 PNG，没有桌面输入或焦点切换。常规截图 2160 × 1350，窄窗口图 1620 × 1050。Windows 原生按钮不属于网页截图范围；截图不能作为原生按钮手动点击验收证据。

“优化前”在同一课程页面重放 `a3eea0f` 的旧 CSS，使用相同的 125% UI 缩放。它用于比较旧配色与布局，不是此前安装版的整窗截图。

| 图 | 链接 |
| --- | --- |
| 课程中心优化前 | [旧样式](assets/light-theme-20261014/mcu/before-course.png) |
| 课程中心优化后 | [新样式](assets/light-theme-20261014/mcu/after-course.png) |
| 窄窗口 / 175% | [课程中心](assets/light-theme-20261014/mcu/after-course-narrow.png) |
| MCU 首页、讲义、工作台 | [首页](assets/light-theme-20261014/mcu/after-home.png)、[讲义](assets/light-theme-20261014/mcu/after-reader.png)、[工作台](assets/light-theme-20261014/mcu/after-workbench.png) |
| TI 首页、讲义、工作台 | [首页](assets/light-theme-20261014/ti/after-home.png)、[讲义](assets/light-theme-20261014/ti/after-reader.png)、[工作台](assets/light-theme-20261014/ti/after-workbench.png) |
| 应用内提示框 | [前置课](assets/light-theme-20261014/mcu/after-prerequisite-dialog.png)、[项目重命名](assets/light-theme-20261014/fun/after-rename-dialog.png) |

构建完成后，在 PowerShell 设置 `ROBOTDOG_EDITION`、`ROBOTDOG_VISUAL_ONLY=1`、`ROBOTDOG_VISUAL_REVIEW_DIR`，运行 `node scripts/smoke-electron.mjs`。可设置 `ROBOTDOG_VISUAL_BEFORE_CSS` 指向 `git show a3eea0f:src/renderer/src/styles.css` 导出的临时 CSS。测试隔离用户数据，关闭新工程导览后采集代码区域，避免导览中的异步文件切换干扰截图。

## 验证结果与边界

- 课程校验与类型检查通过；生产构建通过。
- 完整 Vitest：362 项通过、1 项跳过（65 个文件通过、1 个跳过），采用 `--maxWorkers=2`。
- MCU、TI、Fun 常规 Electron smoke 均通过；包括课程工程构建、自由工程编辑和过期产物拒绝检查。TI 的旧产物请求在校验阶段被拒绝，未执行烧录。
- 隐藏窗口视觉检查通过：MCU 8 图 / 9 组几何检查，TI 6 图 / 8 组，Fun 3 图 / 2 组。原图与实际渲染结果已检查。
- Fun 关于页沿用原实现，日志有课程更新 IPC 未注册提示，本次未扩展其课程功能。
- 原生窗口控制按钮、拖动、系统贴靠及安装包内效果尚未做新一轮手动验收；没有发布安装包。
