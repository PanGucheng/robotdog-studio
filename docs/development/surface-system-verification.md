# 全软件底色统一与视觉验收

日期：2026-10-14。实施依据：[全软件浅色界面与底色职责规划](surface-system-plan.md)。源码基线为 `d6eb34b`，该阶段验收时软件版本为 `1.1.0`；这些修改随后纳入 1.2.0 发版范围。

后续配色与侧栏规则已按用户反馈更新，见[浅色底色微调](pale-surface-verification.md)。本文图片与验收数据保留为该次微调之前的记录。

## 实际修改

统一三种默认表面：页面外围留白 `#F5F8FA`、导航 `#EAF2F6`、内容 `#FFFFFF`。一块导航或内容面板的标题、正文、工具条和底部说明保持连续底色；普通行透明，当前选择单独强调。任务说明与终端属于内容，默认保持白色。代码语法、diff、数据曲线、功能日志和状态色保留各自意义。

| 文件 | 实际修改 |
| --- | --- |
| `src/shared/studio-theme.ts` | 增加表面、hover、selected、focus、状态与强调色 Token；旧名称引用同一基础值 |
| `src/main/index.ts` | 窗口初始背景与原生标题栏按钮区读取共享主题 |
| `src/renderer/src/styles.css` | 统一课程、文件树、编辑工具条、终端、任务、AI、设置、弹窗、关于与 Fun 工具底色；清理相关冲突和多余覆盖；文字与键盘焦点调整 |
| `src/renderer/src/components/StudentCodeEditor.tsx` | Monaco 的默认背景、正文和行号读取共享主题；保留语法、当前行和选区含义 |
| `scripts/studio-visual-smoke.mjs` | 通过真实设置按钮切换缩放；增加底色角色、文字对比度、导航边界、弹窗边界、hover/键盘焦点和状态样式检查；采集前刷新隐藏窗口合成帧 |
| `docs/development/surface-system-plan.md` | 保留审查依据与规划，指向本轮实施结果 |
| `docs/development/light-theme-verification.md`、`docs/README.md` | 明确此前记录的范围，并加入本轮导航 |
| 本文、`assets/surface-system-20261014/` | 逐页面证据、原始 PNG 和计算样式/尺寸记录 |

颜色的唯一手工来源为 `studio-theme.ts`。renderer 既有的 `main.tsx` 注入全部变量；CSS 不再另写一套默认调色板，Electron 和 Monaco 读取同一来源。按组件角色修改真实生效声明，没有进行颜色值的全局替换。

布局修正包括：文件树内部滚动与底部说明分开，避免条目覆盖说明；文件抽屉打开时固定编辑区所在网格列，避免侧栏脱离文档流后编辑区进入窄列；TI 长副标题与面包屑在正常 flex 布局中分配空间；设置/操作示范弹窗按缩放后可用区域限制尺寸；讲义响应式规则按应用容器宽度判断；小尺寸 AI 浮窗使用紧凑间距；目录/任务抽屉为切换按钮预留位置，TI 窄窗口中为 SysConfig 入口预留一行。

没有修改课程数据、教学流程、AI 请求逻辑、硬件交互、固件、版本或依赖。未更新教程内的旧截图或递增课程版本。原生最小化、最大化和关闭按钮实现保留。

## 颜色与规范

| Token / 用途 | 颜色 |
| --- | --- |
| `surface-page` / 页面外围 | `#F5F8FA` |
| `surface-navigation` / 全局及区域导航 | `#EAF2F6` |
| `surface-content` / 默认内容 | `#FFFFFF` |
| `surface-selected` / 当前导航项 | `#DFF3F6` |
| `surface-hover` / 悬停对象 | `#DCEAF0` |
| `navy` / 主文字与品牌 | `#142F46` |
| `muted` / 次级说明 | `#526B7A` |
| `sensor-ink` / 青蓝主操作 | `#07788A` |
| `selected-ink` / 选中项文字 | `#075F70` |
| `line` / 默认分区线 | `#D8E3EA` |
| `accent-hover`、`accent-pressed` | `#066B7B`、`#055968` |
| `surface-info`、`surface-success` | `#EAF7F8`、`#EDF9F3` |
| `surface-warning`、`surface-danger` | `#FFF8E8`、`#FFF0EE` |

保留现有字体、Logo、黄色课次编号、青蓝按钮及绿/黄/红状态。选中与键盘焦点分别表现，普通导航不再使用多组白色卡片。默认分区优先细线与间距，减少嵌套卡片与无意义阴影；浮层保留必要的层级阴影。

## 页面检查结果

| 页面 | 本轮检查 |
| --- | --- |
| MCU / TI 首页与自由练习 | 外围为页面色，入口及项目卡为不透明白色，公共导航连续 |
| MCU / TI 课程中心 | 横幅和详情白色；课次列表为导航色；选中、黄色编号、草稿/发布/硬件标签保留 |
| MCU / TI 讲义与 AI 历史 | 目录为导航色，阅读页头、正文和历史为白色；窄窗口目录使用抽屉，避免压窄正文 |
| MCU / TI 文件、编辑、终端与任务 | 文件树头部/列表/说明连续；工具条、终端各行及任务头部/正文白色；状态保留局部颜色 |
| 知识参考、文件抽屉与任务抽屉 | 使用原有入口检查；导航与内容分别继承对应角色 |
| AI 浮窗 | 初始普通尺寸与窄窗口分别检查；标题、对话和输入区一致，设置提示可见、输入可用；未调用真实 AI |
| 设置五个分类 | 分类导航与白色正文连续；175% 小窗口下弹窗及关闭按钮保持在边界内，长说明换行 |
| 提示框与关于 | 白色标题/正文/操作区；前置课取消、模态焦点与项目重命名沿用既有交互；关于内容可滚动 |
| Fun 工具 | 检查参数、CCD、串口、构建、WCH-Link、代码和修改确认入口；外围页面色、工具内容白色；功能日志主题保留 |
| Fun 操作示范 | 导航色目录与白色教学区；普通及窄窗口检查，较大缩放保留正文滚动和关闭入口 |

Fun 的巡线参数与串口标签目前沿用已有的渲染分支，本轮只检查其现有显示，没有扩大这些功能。

构建运行中、过期、成功和失败的边界颜色通过临时构造状态 class 检查，随后恢复原 class，没有把构造状态截图当作真实编译或硬件结果。真实工程编辑、构建和过期产物拒绝由常规 smoke 检查。AI 回答、权限与修改建议组件经过样式审查，但没有发起真实请求逐项验收。

## 截图方法和尺寸

使用隔离用户数据的隐藏 Electron 测试窗口，不显示、激活或切换桌面窗口。通过 `webContents.capturePage` 保存原始像素无损 PNG；采集前等待字体、页面状态和 CSS 过渡，并用 `invalidate` 刷新合成帧，避免保存上一页或设置切换过程的画面。

应用缩放通过软件“设置 → 常规 → 界面缩放”按钮切换，React 状态、持久化值与 CSS 同步。Windows DPI 与应用缩放分开记录。此环境实测 `devicePixelRatio=1.5`：1440×900 内容窗口得到 2160×1350 PNG，1080×700 得到 1620×1050 PNG。截图没有再缩小或压缩作为原图。

检查矩阵包括 1440×900 的 100%/125%、1707×983 的 150%、1080×700 的 100%/150%/175%（具体场景见 JSON）。1707×983 为最大化对应的内容尺寸检查，未实际操纵用户桌面点击最大化。普通截图以 125% 为主；文件名含 `narrow` 的图是 1080×700 + 175% 边界检查，不代表用户当前最大化状态。

renderer 截图不包含 Windows 原生控制按钮的完整系统绘制；原生按钮点击、拖动、贴靠和安装包实际运行需要单独手动验收。没有测试或发布新安装包。

## 前后对照与原图

“此前”引用上轮真实隐藏窗口渲染记录，“本轮”使用相同普通内容窗口与 125% 缩放。课程、练习次数与临时工作区编号可能不同，比较对象是界面样式与分区。

| 场景 | 此前 | 本轮 |
| --- | --- | --- |
| MCU 首页 | [此前](assets/light-theme-20261014/mcu/after-home.png) | [本轮](assets/surface-system-20261014/mcu/after-home.png) |
| MCU 课程中心 | [此前](assets/light-theme-20261014/mcu/after-course.png) | [本轮](assets/surface-system-20261014/mcu/after-course.png) |
| MCU 讲义 | [此前](assets/light-theme-20261014/mcu/after-reader.png) | [本轮](assets/surface-system-20261014/mcu/after-reader.png) |
| MCU 工作台 | [此前](assets/light-theme-20261014/mcu/after-workbench.png) | [本轮](assets/surface-system-20261014/mcu/after-workbench.png) |
| TI 工作台 | [此前](assets/light-theme-20261014/ti/after-workbench.png) | [本轮](assets/surface-system-20261014/ti/after-workbench.png) |
| Fun 工作台 | [此前](assets/light-theme-20261014/fun/after-fun-workbench.png) | [本轮](assets/surface-system-20261014/fun/after-fun-workbench.png) |

其他重点原图：[AI 浮窗](assets/surface-system-20261014/mcu/after-ai-assistant.png)、[设置](assets/surface-system-20261014/mcu/after-settings.png)、[175% 设置](assets/surface-system-20261014/mcu/after-settings-narrow.png)、[窄窗口讲义](assets/surface-system-20261014/mcu/after-reader-narrow.png)、[窄窗口目录](assets/surface-system-20261014/mcu/after-reader-narrow-directory.png)、[窄窗口任务](assets/surface-system-20261014/mcu/after-workbench-narrow-tasks.png)、[前置课提示](assets/surface-system-20261014/mcu/after-prerequisite-dialog.png)、[导航键盘焦点](assets/surface-system-20261014/mcu/after-navigation-focus.png)。

每个 Edition 的 `verification.json` 保存所有图片名称、原图尺寸、内容窗口尺寸、缩放、区域计算底色、文字对比度和几何检查。

## 测试与边界

- 类型检查与生产构建通过。
- 完整 Vitest：65 个文件通过、1 个跳过；362 项通过、1 项跳过，使用 `--maxWorkers=2`。
- MCU、TI、Fun 常规 Electron smoke 均通过，生成实际 ELF/HEX/BIN/MAP。TI 过期产物请求在校验阶段拒绝，没有烧录。
- 课程校验通过：MCU 1 门课程 / 2 课 / 2 讲义，TI 1 门课程 / 1 课 / 16 个资源，仍为待硬件验证草稿。
- 隐藏窗口检查覆盖区域底色、代表性小字对比度、导航边界、弹窗关闭入口、AI 对话区、hover、键盘焦点与状态样式。最终采集 67 张原始 PNG：MCU 25 张、TI 23 张、Fun 19 张；几何检查分别 24/23/12 组，底色检查场景分别 36/34/19 组。代表性小字的最低实测对比度为 4.89:1；此结果不等于逐字审计了所有历史样式。
- Fun 设置与关于仍出现已有的 `course:update-status:get` 未注册日志，本轮保留原有功能边界。
- 隔离测试未读取或复制用户的 API Key，没有发送真实 AI 请求、连接实板、执行实际烧录、发布课程或安装包。

复现：先 `pnpm build`，设置 `ROBOTDOG_EDITION`、`ROBOTDOG_VISUAL_ONLY=1`、`ROBOTDOG_VISUAL_REVIEW_DIR`，运行 `node scripts/smoke-electron.mjs`。常规功能检查设置 `ROBOTDOG_VISUAL_ONLY=0` 且清空截图输出目录变量。测试脚本只操作自身隐藏 renderer，并在开始/结束检查窗口没有变为可见。
