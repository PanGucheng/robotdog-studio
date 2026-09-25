# RoboHorse 品牌升级交付记录

保留浅色软件主体、课程与代码工作台结构以及 AI 助教流程。本次仅涉及品牌资产、展示样式、窗口身份及图标打包；没有修改业务逻辑。按用户要求未使用 computeruse，最终视觉检查由用户完成。

## 修改文件

| 文件 | 修改内容 |
| --- | --- |
| `src/renderer/src/App.tsx` | 四节点 CSS 标记换成透明小马 PNG；原有 HTML h1 保留 |
| `src/renderer/src/styles.css` | 32px 透明标记、HTML 完整组合样式、浅青和深青变量；归并已有青蓝硬编码色；教学首页沿用 Canvas，橙色自由练习入口换成青蓝 |
| `src/renderer/src/components/McuHome.tsx` | 首页 HTML 完整 Logo；轻量 SVG 流线节点替换原装饰 CPU |
| `src/renderer/src/components/LearningCenter.tsx` | 操作示范的图形替换为透明小马，保留原布局与全部内容 |
| `src/renderer/index.html` | 新品牌 32px favicon |
| `src/main/index.ts` | 窗口 ICO；启动背景与 Canvas 对齐；Windows AppUserModelId 使用已有发行版 appId |
| `scripts/package-windows.mjs` | 三发行版共用 EXE、NSIS 安装器、卸载器和向导头部 ICO；打包窗口运行时图标 |
| `README.md` | 可见名称从 RobotDog Studio 更新为 RoboHorse Studio；增加横向 Logo 及品牌说明链接 |
| `package.json` | 增加品牌生成、renderer 自动检查与 Windows 图标检查命令；无新增依赖 |

## 新增文件与资产

| 文件 / 文件组 | 用途 |
| --- | --- |
| `resources/brand/sources/robohorse-app.png` | 用户提供的应用母图原件 |
| `resources/brand/sources/robohorse-horizontal.png` | 用户提供的透明横向母图原件 |
| `resources/brand/robohorse-mark.png` | 透明小马，32px 顶部、首页组合和操作示范，高 DPI 使用 512px 源 |
| `resources/brand/robohorse-{16,24,32,48,64,128,256,512}.png` | 各尺寸应用图标 PNG |
| `resources/brand/robohorse.ico` | 七个尺寸的 Windows 图标 |
| `resources/brand/robohorse-logo.svg` | README 横向完整 Logo，文字为 SVG text；应用不使用它渲染文字 |
| `resources/brand/robohorse-motif.svg` | 浅青色原生矢量流线与电路节点 |
| `resources/brand/preview.html`、`README.md` | 本地资产预览和使用/再生成说明 |
| `src/renderer/src/components/BrandLogo.tsx` | Welcome 完整组合：PNG 小马与 HTML 文字 |
| `scripts/generate-brand-assets.cjs` | 使用 Electron 从原件确定性裁切、缩放并生成 ICO，无生图依赖 |
| `scripts/verify-brand.cjs` | 真实构建 renderer 的三版本 × 四档缩放 × 两档像素密度检查和截图 |
| `scripts/verify-windows-brand.mjs` | 独立 Windows 图标验证 EXE / NSIS 编译及七帧嵌入检查 |
| `docs/brand-validation/` | 6 张待人工验收的 UI 截图、两份 renderer 检查报告、一份 Windows 图标检查报告 |
| `docs/brand-upgrade.md` | 本交付记录 |

## 原元素替换与保留

- 顶部旧菱形及四个 CSS 节点已停止引用并移除样式，使用无背景的小马；RoboHorse 白色、Studio 浅青，字体和文字结构保留。
- 未配置的默认应用图标改为用户第二张图：深蓝圆角背景、白色小马、青蓝鬃毛/节点、一个橙色节点。
- 原首页大写品牌 eyebrow 改为完整 HTML 品牌组合。装饰仍在原右侧位置，低透明度且不覆盖正文。
- 原 README 可见旧产品名已替换；完整横向 SVG 仅用于宽空间。
- 没有发现一方旧 RobotDog / RoboHorse 图片可移除。课程实物图、第三方 Reasonix 品牌、固件资源与历史开发档案未删除。
- appId、EXE 文件名、包名、数据目录、固件产物、IPC 和 localStorage 的旧内部标识保留，避免改变兼容性和业务行为。

## 自动化验证

- `npm run build`：通过，包含 TypeScript 检查及 Electron/Vite 生产构建。
- `npm test`：44 个测试文件通过、1 个跳过；218 项测试通过、1 项跳过。
- Electron 冒烟：MCU 和 TI 两版通过。趣味巡线版失败，报告 `baselineReady=false`、`firmwareState=failed`，尚不能认定该版端到端通过；没有修改对应固件/基线逻辑。另行执行 `npm run baseline:release:check` 确认当前 `development-live-remote` 动态基线被正式发布门禁阻止。
- `node scripts/verify-brand.cjs` 及 `--hidpi`：24 组通过。视口为 1440×900 CSS px，四档应用缩放为 100/125/150/175%，devicePixelRatio 为 1 与 2。验证实际缩放值、512px 标记加载、无损坏图片、品牌文字不越过右侧操作区、右侧操作区不越过窗口边界；Canvas #F6F8FB、顶部文字白色、Studio #73D6E7。**这些是程序检查，不是人工视觉验收，也不覆盖每个子面板的全部布局。**
- `node scripts/verify-windows-brand.mjs`：独立验证 EXE 与 NSIS 安装器构建成功；两者中均找到与源文件完全一致的 16/24/32/48/64/128/256px PNG 图标帧。NSIS 同时编译了自定义卸载器图标。结果见 [Windows 检查报告](brand-validation/windows-report.json)。
- `git diff --check`：通过。

检查明细：[1× 报告](brand-validation/ui-report-1x.json)、[2× 报告](brand-validation/ui-report-2x.json)。全部 24 张截图和图标验证 EXE / 安装器保存在本地 `.tmp/brand-validation/`；该安装器仅验证图标，不能作为教学发行包使用。

## 用户视觉验收入口与未覆盖项

资产原尺寸预览：[preview.html](../resources/brand/preview.html)。

UI 截图（真实 renderer + 内置演示数据）：

- [教学首页 100%](brand-validation/mcu-foundations-100-1x.png)
- [教学首页 125%](brand-validation/mcu-foundations-125-1x.png)
- [教学首页 150%](brand-validation/mcu-foundations-150-1x.png)
- [教学首页 175%](brand-validation/mcu-foundations-175-1x.png)
- [趣味巡线工作台 100%](brand-validation/fun-line-following-100-1x.png)
- [TI 教学版 100%](brand-validation/ti-mspm0-foundations-100-1x.png)

仍需人工确认小尺寸识别性、透明边缘、实际显示清晰度、窗口标题栏/任务栏，以及正式安装后的 EXE、快捷方式和安装/卸载向导表现。此次未操作系统 DPI 设置，未安装验证包，未回写 `release/` 下的既有发行包；下一次正常打包会应用新图标。Windows 对既有固定任务栏项的图标缓存也未验证。

项目未发现独立 splash / About 页面，因此没有新建页面；未来可复用 BrandLogo 和横向 SVG。品牌工作未改动课程、代码工作台、AI 助教结构。
