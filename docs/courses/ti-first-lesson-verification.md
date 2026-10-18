# TI 第一课制作与软件验收记录

历史软件验收日期：2026-10-14。课程 `ti-mspm0-gpio-foundations`，课次 `gpio-sysconfig-toggle`，当次内容版本 4。用户明确当次没有连接实板，只验收软件，当时课次为 `draft + pending-hardware-check`。

2026-10-17 发布准备更新：维护者批准第一课、基础 SDK 空工程和完整小马例程一起纳入正式发布准备，保留既有截图。当前课程内容 v7 使用 `published + author-approved` 并记录批准来源，不声称新增实板验收结果；软件固件基线门禁仍单独生效。当前准备状态见 [TI 正式发布准备记录](ti-release-preparation.md)，以下保留原验收事实。

## 课程内容与来源

- 复用 [沁恒第一课讲义](../../resources/courses/mcu-foundations/ch32v203-foundations/lectures/first-program-on-chip/lecture.md) 中的单片机介绍、输入输出模型及逐次修改、观察的教学方法，替换为 TI 芯片与机器马板的工程操作。
- [TI 第一课讲义](../../resources/courses/ti-mspm0-foundations/ti-mspm0-gpio-foundations/lectures/gpio-sysconfig-toggle/lecture.md) 包含 7 个学习章节、14 个实验步骤、3 次实物观察和思考题。主要目标是学会 Studio 与 SysConfig 的使用。
- 独立 LED 模板默认控制绿色 PA26，等待间隔 500 ms；学生先改成 1000 ms，再在 SysConfig 中新增 LED_BLUE / PA6，并修改 main.c 的控制目标。红色 PA5 初始为高电平，保持熄灭；不初始化运动控制。
- 当前讲义引用 15 张来自真实 Studio / SysConfig 1.28.1 GUI 的标注图，包括 SysConfig 五区整窗总览、逐步新增蓝色通道、课程入口、讲义、工作台、AI 助教和两次代码修改。采用 MSPM0 SDK 2.11.00.07。蓝色配置的真实保存副本为 [ti-first-lesson-blue.syscfg](./assets/ti-first-lesson-blue.syscfg)，仅供作者软件验收，不进入学生起始模板。
- 保留 Gemini 润色后的叙述，补充 AI 助教提问、选中代码解释和修改确认的使用方法；纠正“Save 直接生成代码”等与真实流程不一致的描述。
- 真实窗口位图经剪贴板无损保存；最大化截图为 2560 × 1528，裁切不缩放，直接编辑 `.drawio` 增加原生标注并保留源文件。工作台及代码图按用户调大的缩放再次采集。可复用流程见 [截图规范](./course-screenshots.md)，源图、可编辑标注与尺寸见 [采集清单](./assets/ti-first-lesson-v3/capture-manifest.json)。
- 最终冻结 [content-v4.json](../../resources/courses/ti-mspm0-foundations/ti-mspm0-gpio-foundations/compatibility/content-v4.json)。制作过程中的 v3 阅读记录出现指纹变化提示，递增版本保留旧记录，不将旧版阅读完成状态冒充新版完成。

## 软件验证

| 检查 | 结果 |
| --- | --- |
| `pnpm courses:validate` | MCU / TI 均通过；TI 加载 15 张图片，版本指纹匹配 |
| `pnpm exec vitest run --maxWorkers=2` | 357 项通过，1 项跳过；图片与讲义更新后第一课及保存流程的 2 个测试文件 / 7 项再次通过 |
| `pnpm build` | 类型检查与生产构建通过 |
| MCU / TI Electron smoke | 两个 Edition 均通过，实验工程、构建产物及修改后失效检查正常 |
| 绿色 500 ms 构建 | 通过，Flash 632 字节、静态 RAM 0 字节 |
| 绿色 1000 ms 构建 | 通过，Flash 632 字节、静态 RAM 0 字节 |
| 蓝色 1000 ms 构建，采用 GUI 保存配置 | 通过，Flash 640 字节、静态 RAM 0 字节 |
| 外部 SysConfig 保存后使用旧 ELF | 被拒绝，要求重新编译；无需 Git HEAD 变化 |
| main.c 使用 LED_BLUE，但未增加蓝色配置 | 构建失败并指出蓝色名称缺失 |
| SysConfig 外部保存后，Studio 保存 main.c | 修复后通过；配置与程序各自保存并创建检查点，保留两项修改 |
| Published Snapshot | 排除未验证 TI 草稿；拒绝将待验收硬件课直接发布 |

三种程序的软件构建与反例检查可重复执行：

```powershell
pnpm exec tsx scripts/verify-ti-first-lesson.ts
```

该命令不探测、不烧录开发板；静态 RAM 数值不包含运行时栈开销，构建成功也不能证明 LED 实物表现。

## GUI 软件流程与保存修复

从课程首页、课程中心和讲义末尾创建独立工程，展开 `src` 打开 `main.c`；默认绿色 500 ms、修改保存后的绿色 1000 ms、真实 SysConfig GUI 新增并保存 PA6 蓝色通道后修改程序并保存、编译均成功。终端分别显示 632 / 632 / 640 字节 Flash、静态 RAM 0 字节。检查真实落盘的 `LED_BLUE / Output / Set / PORTA / 6` 与 `GPIO_LEDS_LED_BLUE_PIN`，两项修改均保留。

实际流程发现外部 SysConfig 修改使 Git 工作区变脏，原保存服务拒绝随后保存 `main.c`。现仅对 TI 工程中已存在、允许编辑、未暂存的根目录 `.syscfg` 外部修改先创建配置检查点，再保存当前程序。无关文件、当前目标文件的外部修改、未跟踪或已暂存文件继续阻止保存；5 个回归用例验证正例和这些保护边界。

工作台知识参考可打开，课程目录可跳转，操作图可点击查看原图。AI 助教的机器人入口与收起、输入、Enter 发送已实测；用户配置 Key 后实际问答解释了 `1000U` 与约 2 秒完整亮灭周期，并返回“没有需要应用的新修改”。本次不测试 AI 自动改写工程，不读取或记录 Key。

最终 v4 再从课程讲义创建第 2 次实验：阅读页没有内容指纹变化提示，新工程的默认程序 GUI 编译通过（Flash 632 B、静态 RAM 0 B），第 3 步自动记录编译完成。知识参考可跳转到新增 AI 助教章节，专注阅读下截图和说明正常显示。后续步骤可以展开查看要求；思考题输入与保存受当前步骤顺序限制，本次未跨过烧录和观察步骤伪造完成记录，因此未实测最终思考题保存，也未将实验标记为全部完成。

## SysConfig 前台窗口修复

Studio 使用独立 NW.js 启动入口加载原始 TI 应用，首次窗口显式设置 focus，重复点击激活现有窗口，最小化时恢复显示。临时置前后立即撤销置顶，不循环抢焦点。每个工作区使用独立 profile，避免 TI 默认单实例复用其他工程。TI 安装目录未修改；通过目录 junction 保持设备数据库资源布局，启动参数过滤在 NW 的主上下文和窗口上下文中均执行。

本机 GUI 验证已确认：第一课工程完整加载且 Problems 无错误；首次打开自动显示到前台；被 Studio 遮住后再次点击能显示到前台，窗口数量保持一个。返回 Studio 时可正常覆盖 SysConfig。2026-10-14 补测最小化恢复通过：再次点击 Studio 的 SysConfig 按钮恢复同一窗口，未新增窗口。独立工作区 profile、参数中的空格、窗口关闭后的激活和恢复行为有自动测试。

用户手动检查：最小化 SysConfig，回到 Studio 点击同一工程的 **SysConfig** 按钮，等待界面响应；应恢复当前工程窗口到前台，不应新增窗口或打开其他工程。

接口依据：[NW.js Window](https://docs.nwjs.io/References/Window/) 的 focus、restore 与 setAlwaysOnTop，以及 [NW.js App](https://docs.nwjs.io/References/App/) 的 open 事件与 filteredArgv。该修复在本机固定版本 SysConfig 上验证；正式安装包中的路径与权限仍随安装包验收检查。

## 实板验收与后续发布

按 [硬件验证清单](./lesson-hardware-validation.md) 完成以下记录后再发布：

1. 确认实际机器马板版本、MSPM0G3507SPMR、SWD 接线及 PA26 / PA6 / PA5 的低电平点亮关系。
2. 实际烧录绿色 500 ms、绿色 1000 ms、蓝色 1000 ms 三种程序，分别记录颜色、亮灭间隔和复位行为。
3. 验证断电恢复、探针断开或占用的错误反馈；正确示例与缺少蓝色配置的反例不能误判为完成。
4. 记录板卡、验证人、日期、测试源码与实际现象；通过后改为 `published + hardware-checked`，递增 contentVersion 并冻结新版指纹，再执行课程分发验证。

本次未运行实板烧录、正式安装包制作或远程发布。
