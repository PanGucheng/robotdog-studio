# RoboHorse 品牌资产

直接复用用户提供的透明 PNG，不重新生成小马或文字。应用内部文字标志使用 HTML/CSS，README 横向组合使用 SVG `<text>`。

| 文件 | 用途 |
| --- | --- |
| `sources/robohorse-app.png` | 用户提供的 1254×1254 应用图标母图，原样保留 |
| `sources/robohorse-horizontal.png` | 用户提供的 2172×724 透明横向 Logo，原样保留；用于裁出小马 |
| `robohorse-mark.png` | 512×512 透明小马，顶部 32px 标记、Welcome 组合及操作示范；无方形背景 |
| `robohorse-16/24/32/48/64/128/256/512.png` | 应用图标的各尺寸 PNG；32px 同时用于网页 favicon |
| `robohorse.ico` | 16/24/32/48/64/128/256px 七帧、32 位 RGBA Windows 图标；窗口、EXE、安装器、卸载器共用 |
| `robohorse-logo.svg` | 小马 + 可编辑 SVG 文字的完整横向 Logo，用于 README、宣传材料或未来 About；不用于顶部栏 |
| `robohorse-motif.svg` | 原生 SVG 马鬃流线与节点，用于教学首页；界面以 40% 不透明度展示 |
| `preview.html` | 本地资产检查页，含原尺寸图标、浅/深背景透明标记与四档缩放对照 |

## 颜色与使用

复用 `styles.css` 的 `--navy` (#10243A)、`--navy-soft` (#203A53)、`--sensor` (#00A8C6)、`--amber` (#F3A712)、`--canvas` (#F6F8FB)、`--panel` (#FFFFFF)、`--line` (#DCE4EB)。补充 `--pale-cyan` (#73D6E7)；`--sensor-ink` (#087F91) 归并已有深青色，用于小字、链接和白字主按钮，避免纯 Sensor Cyan 上的白色小字对比不足。

顶部：透明小马 + HTML 白色 RoboHorse / 浅青 Studio。Welcome：透明小马 + HTML 深蓝 RoboHorse / 深青 Studio。主体继续使用浅色背景、白色卡片及现有布局。橙色用于图标中的单一节点和状态提示，首页自由练习入口改用青蓝色。错误红、成功绿和课程状态语义保留。

## 再生成和自动验证

```sh
npm run brand:generate
npm run brand:check
npm run brand:check:windows
```

生成脚本使用项目自带 Electron 编解码器，无新增依赖。裁切边界忽略 alpha ≤ 8 的极低透明度杂点，母图不变；小马裁切限定在原横向 Logo 左侧 560px 内。图标保留母图原有深蓝圆角背景、白色头像、青色鬃毛及唯一橙色节点。

`brand:check` 使用隐藏的 Electron 窗口和现有 browser demo 数据加载构建后的真实 renderer，逐档检查缩放、图片加载和顶部边界，同时生成截图。临时用户数据和 `.tmp/brand-validation/` 输出不接触学生数据。它不是人工视觉验收，也不证明实际 Windows DPI/任务栏表现。

`brand:check:windows` 构建独立的图标验证 EXE / NSIS 安装器，并逐帧检查其中是否包含 ICO 的 PNG 数据；不安装软件，不生成可分发的教学版本。正式三种发行版由 `scripts/package-windows.mjs` 配置同一图标，并将窗口 ICO 复制到 `resources/brand/`。

## 扫描与兼容性边界

- 已替换：顶部 CSS 四节点菱形；操作示范的通用图形；教学首页品牌组合、装饰和橙色入口；README 可见旧名称；默认 Electron / 安装器图标配置；浏览器 favicon。
- 未发现独立 splash / About 页面，因此没有新增页面或改动教学工作流。未来可复用上述组合。
- 仓库一方 UI 原先没有 RobotDog / RoboHorse 图片资产。课程实物图、`third_party/reasonix` 图标与历史开发资源保留。
- `robotdog-studio` 包名、`RobotDogStudio-*` EXE 文件名、appId、数据目录、localStorage、IPC、固件名称和归档文件仍保留，避免破坏既有安装及学习数据兼容性。可见产品名统一为 RoboHorse Studio。
- `release/` 内已有发行包不会被回写。新图标随下一次正常打包生效；Windows 任务栏、标题栏、安装/卸载向导及小尺寸识别性由用户人工验收。

详细结果见 [品牌升级交付记录](../../docs/brand-upgrade.md)。
