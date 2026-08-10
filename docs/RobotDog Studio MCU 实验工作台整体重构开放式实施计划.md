# RobotDog Studio MCU 实验工作台整体重构开放式实施计划

## 一、任务背景

RobotDog Studio 单片机入门版已经完成 MCU 顶层产品逻辑重构，目前产品主路径已经明确为：

```text
MCU 首页
├─ 课程学习
│  └─ Course Center
│     └─ Lesson Learning
│        └─ Lab Workspace
└─ 自由练习
   └─ Sandbox Workspace
```

正式讲义学习与实验 Workspace 已经分离。

本轮继续重构的是 **Lab Workspace / Sandbox Workspace 内部的开发体验**。

当前实验工作台仍然保留较强的“工具切换”逻辑：

```text
实验任务
构建与运行
AI 助教
```

这导致：

- 打开 AI 时实验任务消失；
- 查看构建信息时实验任务消失；
- 学生不断在“我要做什么”和“我要用什么工具”之间切换；
- 编译和诊断离代码区域太远；
- AI 被表现成一个页面，而不是贯穿实验过程的助手；
- Firmware Build 输出缺乏真正 IDE 式的固定信息空间。

本轮目标是彻底收敛这种互斥工具模型，建立一个更接近真正 IDE、同时保留教学引导的稳定工作台。

---

# 二、最终产品心智模型

课程实验 Workspace 应形成五个明确角色：

```text
Project Explorer
=
工程里有什么

Code Surface
=
在哪里编写、检查和验证代码

Lab Guide
=
当前实验要做什么

Bottom Panel
=
代码和程序刚刚发生了什么

Floating AI
=
遇到问题时向谁求助
```

最终布局：

```text
┌─────────────────────────────────────────────────────────────────────┐
│                             Top Bar                                 │
├──────────────┬────────────────────────────────┬─────────────────────┤
│              │                                │                     │
│              │                                │                     │
│   Project    │          Code Editor           │      Lab Guide      │
│   Explorer   │                                │      实验任务        │
│              │                                │                     │
│              │                                │                     │
│              ├────────────────────────────────┤                     │
│              │ Problems | Build | Output      │                     │
│              │                                │                     │
│              │        Bottom Panel            │                     │
└──────────────┴────────────────────────────────┴─────────────────────┘
                                                     ○ AI
```

这是本轮最重要的布局约束。

---

# 三、Bottom Panel 的硬性空间边界

Bottom Panel 属于 **Code Surface**，不是整个 Workspace Shell。

必须满足：

```text
Project Explorer
      │
      │
      │

        Code Editor
        ─────────────────
        Bottom Panel

                              Lab Guide
                              │
                              │
                              │
```

也就是说：

> Bottom Panel 的水平范围只能覆盖中央代码区域。

禁止：

```text
Project Explorer + Code + Lab Guide
──────────────────────────────────
          Bottom Panel
```

这种横跨整个 Workspace 的设计。

因此：

- Bottom Panel 展开时，只压缩 Monaco 的垂直空间；
- 左侧 Project Explorer 始终保持完整高度；
- 右侧 Lab Guide 始终保持完整高度；
- Bottom Panel 高度拖动不能改变左右区域高度；
- Bottom Panel 收起时只在 Code Surface 底部保留状态条。

这是本轮冻结的布局原则。

---

# 四、Workspace 整体结构

## 4.1 课程实验 Workspace

目标：

```text
Workspace
├─ Project Explorer
├─ Code Surface
│  ├─ Code Action Bar
│  ├─ Monaco Editor
│  └─ Bottom Panel
├─ Lab Guide
└─ Floating AI
```

其中 Lab Guide 始终存在。

---

## 4.2 自由练习 Workspace

目标：

```text
Workspace
├─ Project Explorer
├─ Code Surface
│  ├─ Code Action Bar
│  ├─ Monaco Editor
│  └─ Bottom Panel
└─ Floating AI
```

自由练习没有 Lab Guide。

因此课程实验和自由练习必须共享：

- 同一套代码编辑；
- 同一套 Candidate；
- 同一套 Diff；
- 同一套 Build；
- 同一套 Firmware；
- 同一套 Flash；
- 同一套 Bottom Panel；
- 同一套 AI 浮动助手。

区别仅是：

```text
mcu-lesson-attempt
→ 有 Lab Guide

mcu-sandbox
→ 无 Lab Guide
```

不要为两种 Workspace 复制两套开发工作流。

---

# 五、取消当前互斥 Tool Rail 产品模型

当前实验工作台不再应该要求学生在：

```text
实验任务
构建与运行
AI 助教
```

之间选择唯一活动 Tool。

本轮应逐步取消这种产品模型。

新的职责关系：

```text
实验任务
→ 常驻 Lab Guide

AI
→ Floating Assistant

构建与运行
→ Code Surface + Bottom Panel
```

Tool Rail 是否完全删除、是否短期保留迁移壳层，由 Codex 根据最新代码决定。

但最终用户界面不应再依赖：

```text
activeTool = course | run | assistant
```

这种三选一心智模型。

---

# 六、Lab Guide：实验任务成为常驻指导区

课程实验中，右侧 Lab Guide 始终告诉学生：

> 我现在要完成什么？

默认不需要铺开全部实验内容，而应突出当前 Step。

推荐信息层次：

```text
实验 02 / 06                         33%

实现辅助函数

补全 number_tools.c 中辅助函数的限幅逻辑，
并核对函数声明和调用关系。

涉及文件
App/Src/number_tools.c

[定位代码]
[回顾相关知识]
[问 AI 这一步]

查看全部任务
```

应显示：

- 当前步骤编号；
- 当前总进度；
- Step title；
- Step instruction；
- fileTarget；
- lectureSectionId 对应的知识入口；
- 当前 Step 需要的回答/观察；
- 完整任务入口。

---

# 七、完整任务列表是次级状态

“全部任务”不是默认工作态。

点击后可以在 Lab Guide 内进入完整实验总览，例如：

```text
实验任务                         2 / 6

✓ 01 辨认声明与定义
● 02 实现辅助函数
○ 03 解决编译或链接问题
○ 04 检查多文件修改
○ 05 生成完整程序
○ 06 总结头文件作用

完成条件
✓ 文件存在
○ 已保存代码修改
○ Candidate 编译通过
○ Firmware Build 通过
○ 已回答问题
```

要求：

- 不离开 Workspace；
- 不卸载 Monaco；
- 不改变当前文件；
- 不影响 AI；
- 返回后恢复当前 Step；
- CourseProgress 仍然是唯一实验进度真相。

---

# 八、Question / Observation Step

特殊实验步骤应直接在 Lab Guide 内完成。

例如 Question：

```text
总结头文件作用

为什么函数声明通常放在头文件中？

[回答区域]

[保存回答]
```

AI 同时保持可用。

可以提示：

> AI 可以帮助理解，请使用自己的语言完成实验回答。

AI 不得自动提交答案。

---

硬件观察：

```text
观察 LED 状态

请记录开发板上的实际现象。

[实际观察输入]

[保存观察]
```

AI 可以帮助学生分析：

> 为什么 LED 不亮？

但不得：

- 自动填写观察；
- 推断真实现象；
- 自动完成 hardware-observation。

---

# 九、Floating AI：AI 彻底脱离工作台工具

## 9.1 默认形态

Workspace 中 AI 表现为小型圆形悬浮按钮，例如：

```text
○
AI
```

建议约 48–56px 级别，但最终尺寸由实际 UI 测试确定。

默认位于安全的右下区域。

---

## 9.2 点击展开

展开成轻量悬浮聊天窗口：

```text
┌──────────────────────────────┐
│ AI 助教                 — × │
│ 当前：02 · 实现辅助函数      │
├──────────────────────────────┤
│                              │
│ 学生：这里为什么需要限幅？   │
│                              │
│ AI：……                       │
│                              │
├──────────────────────────────┤
│ 输入问题……               ↑  │
└──────────────────────────────┘
                       ○
```

AI 浮窗出现时：

- Code Editor 不消失；
- Lab Guide 不消失；
- Bottom Panel 不消失；
- Project Explorer 不消失。

---

# 十、AI 圆形按钮支持有限拖动

允许拖动 AI 圆形入口，但行为要受到约束。

要求：

- 不允许拖出应用有效区域；
- 松手后吸附最近安全边缘；
- 不允许长期停在代码正中央；
- 不遮挡急停；
- 不遮挡烧录确认；
- 不遮挡关键 Dialog；
- resize 后重新校正；
- 可轻量记住位置；
- 无效位置恢复默认；
- 正确区分 click 和 drag。

第一版不需要：

- 任意自由拖动整个聊天窗口；
- 多 AI Window；
- Dock 系统；
- 通用悬浮组件框架。

---

# 十一、AI 浮窗是统一 Workspace AI

以下行为全部打开同一个 AI 浮窗：

### 普通提问

点击悬浮 AI。

### 当前任务

```text
[问 AI 这一步]
```

AI 获得可信 current Step context。

### 选中代码

```text
[AI 解释]
```

继续复用已有 selection explanation。

### Candidate / Firmware 诊断

```text
[让 AI 解释]
```

继续复用 diagnostic explanation。

### Lecture Reference

实验过程中选择相关知识后询问 AI，也尽量进入同一视觉助手。

内部可以使用不同 request kind，但用户不应看到多个不同 Chat 产品。

---

# 十二、AI 的课程上下文

课程实验 Workspace AI 应自动获得 Main 校验的必要上下文：

- Course；
- Lesson；
- Workspace；
- 当前 Step；
- 当前 CourseProgress；
- 当前文件；
- editable/readable 权限；
- lectureSectionId；
- Teaching Focus；
- 硬件安全状态；
- 当前 Candidate/Diagnostic 中必要的信息。

学生无需重复描述：

> “我现在在第二步……”

AI 已经知道。

继续保持原有边界：

- 不自动完成 Step；
- 不自动提交回答；
- 不自动记录硬件观察；
- 不绕过 Candidate；
- 不自动 Apply；
- 不自动 Flash；
- 不扩大文件权限；
- 不伪造 Build 或硬件结果。

---

# 十三、Code Surface

中央 Code Surface 是整个开发操作核心。

概念上：

```text
Code Surface
├─ Code Action Bar
├─ Monaco Editor
└─ Bottom Panel
```

这是一个完整垂直区域。

Bottom Panel 是 Code Surface 的内部组成，不属于外层 Workspace。

---

# 十四、Code Action Bar

代码顶部只承担：

- 当前文件；
- 草稿保存状态；
- 当前代码状态摘要；
- 当前阶段最重要动作。

不要把大量 Build 日志和诊断堆在顶部。

典型状态：

### 编辑中

```text
number_tools.c

✓ 草稿已保存                    [检查代码]
```

### 正在保存

```text
正在保存草稿…
```

### Candidate 失败

```text
✕ 代码检查失败 · 2 个问题

[查看问题]
[让 AI 解释]
[重新检查]
```

### Candidate 通过

```text
✓ 代码检查通过

[查看修改]
```

### 修改已应用

```text
✓ 修改已保存到项目

[生成完整程序]
```

### Firmware 有效

```text
✓ 程序已生成

[烧录到开发板]
```

按钮数量保持克制。

不要长期显示一排：

```text
保存 | 检查 | 编译 | Build | Diff | Apply | Flash | ...
```

应根据可信状态突出下一步。

---

# 十五、保存 / 检查 / Build / Flash 语义必须保持分离

本轮虽然收敛 UI，但不能合并教学概念。

必须继续明确：

```text
保存草稿
≠
检查代码
≠
保存修改到正式 Workspace
≠
生成完整 Firmware
≠
烧录开发板
```

推荐流程：

```text
编辑
↓
自动保存草稿
↓
检查代码
↓
Candidate Validate / Build
↓
查看 Diff
↓
确认 Apply
↓
生成完整 Firmware
↓
烧录
↓
观察运行结果
```

不要实现：

```text
[保存并运行]
```

然后在后台偷偷完成所有步骤。

这会破坏单片机教学中非常重要的编译、链接、固件、烧录概念。

---

# 十六、Candidate 检查继续靠近代码

现有 Candidate 检查流程应继续复用。

概念：

```text
保存最新 Draft
↓
Validate Candidate
↓
Candidate Build
↓
成功 / Diagnostics
```

Candidate 失败：

- Bottom Panel 自动展开；
- 默认切到 Problems；
- 编辑器定位第一条有效问题；
- 可调用 AI 解释。

Candidate 成功：

- 状态条显示通过；
- 提供 Diff Review；
- 不自动 Apply。

---

# 十七、Diff 属于 Code Surface 工作流

Diff 不恢复成右侧独立 Tool。

继续围绕中央代码开发区域呈现。

可以：

- 替换 Monaco 主内容；
- 局部 overlay；
- 当前已有 Diff Surface；
- 或 Codex 判断更适合的 Code Surface 方案。

但必须保证流程：

```text
代码修改
↓
检查通过
↓
Diff
↓
明确确认
↓
Apply
```

AI 不得跳过。

---

# 十八、Bottom Panel

Bottom Panel 第一版建议只保留三个核心 Tab：

```text
Problems
Build
Output
```

中文 UI 可以使用：

```text
问题
构建
输出
```

不要一开始复制完整 VS Code Terminal 系统。

---

# 十九、Problems

Problems 用于结构化诊断。

可以同时承载：

- Candidate diagnostics；
- Firmware compiler diagnostics；
- linker diagnostics；
- 必要的安全校验错误。

但必须标记来源。

例如：

```text
问题 2

候选检查
● number_tools.c:12
  expected ';' before '}'

完整程序
● linker
  undefined reference to ...
```

点击错误：

```text
→ 打开对应文件
→ 定位行号
→ Monaco focus
```

可以提供：

```text
[让 AI 解释]
```

---

# 二十、Build

Build Tab 显示完整 Firmware Build 的学生友好状态，而不是单纯 raw terminal。

构建中：

```text
生成完整程序

18 / 28

正在编译
Peripheral/src/ch32v20x_gpio.c
```

成功：

```text
✓ 完整程序生成成功

ELF
HEX
BIN
MAP

Flash    23.4 KB
RAM       4.1 KB
```

失败：

```text
✕ 生成程序失败

失败阶段
Linking

主要问题
undefined reference ...

[定位问题]
[让 AI 解释]
[重新生成]
```

---

# 二十一、Output

Output 提供 Studio 管理的只读原始日志。

例如：

```text
[18:04:11] Compiling experiment.c
[18:04:11] Compiling number_tools.c
[18:04:12] Linking firmware.elf
...
```

它用于：

- 高级学生；
- 教师；
- 深度排错。

第一版不要提供：

- PowerShell；
- CMD；
- bash；
- 任意 shell；
- 任意命令执行。

Output 是只读开发输出，不是通用 Terminal。

---

# 二十二、Bottom Panel 自动行为

### Candidate 失败

```text
自动展开
→ Problems
```

### Firmware Build 开始

```text
自动展开
→ Build
```

### Firmware Build 失败

```text
自动展开
→ Problems
```

### 用户主动查看 raw log

```text
→ Output
```

### Build 成功

保持 Build 可见，不强制自动关闭。

用户自己决定收起。

---

# 二十三、Bottom Panel 收起状态

收起后必须保留一条 Code Surface 状态栏。

例如：

```text
✕ 2 个问题 · Candidate 检查失败                  ↑
```

或者：

```text
● 正在生成程序 · 18 / 28                         ↑
```

或者：

```text
✓ 程序生成完成 · Flash 23 KB · RAM 4 KB          ↑
```

点击恢复 Bottom Panel。

---

# 二十四、Bottom Panel 高度调整

Bottom Panel 应允许垂直 resize。

拖动边界：

```text
        Monaco
══════════════════
        Bottom Panel
```

要求：

- 只改变 Code Surface 内 Editor/Panel 比例；
- 不影响 Explorer 高度；
- 不影响 Lab Guide 高度；
- 有合理最小高度；
- 有合理最大高度；
- Monaco 不能被压缩到不可工作；
- 记住用户偏好；
- 高缩放下自动修正；
- 可提供快速收起；
- 可以考虑双击恢复默认高度，但不是硬要求。

---

# 二十五、未来串口扩展空间

本轮无需完成正式串口终端。

但 Bottom Panel 架构应允许未来自然扩展：

```text
问题 | 构建 | 输出 | 串口
```

UART / ADC / Sensor 等真实硬件课程未来可以在这里查看设备输出。

不要为了未来需求现在就实现完整 Serial 系统。

只保证布局和职责不会阻塞后续扩展。

---

# 二十六、Firmware Build 与 CourseProgress

不要建立 Renderer-only Build 状态。

继续使用当前已有可信 Build/Firmware 状态。

当：

```text
Firmware Build passed
```

CourseProgress 按现有规则更新。

代码发生变化后：

```text
Firmware proof → stale
```

Bottom Panel 和 Lab Guide 应同步反映：

> 需要重新生成程序。

不要因为新的 IDE UI 让旧 Firmware 看起来仍然有效。

---

# 二十七、烧录 UI

Flash 不需要独立右侧大工具。

在 Firmware 当前有效时，Code Action Bar 或 Build Tab 提供明确：

```text
[烧录到开发板]
```

烧录开始后 Bottom Panel 可以显示：

```text
正在写入开发板

████████████░░░ 68%

WCH-Link
CH32V203
```

但真实硬件写入仍保留：

- 必要确认；
- 设备检查；
- 可取消状态；
- 错误状态；
- Firmware 有效性验证；
- Workspace 归属验证；
- 导航守卫。

不要因为 UI 简化而取消原有硬件安全门禁。

---

# 二十八、Lecture Reference

Lab Guide：

```text
[回顾相关知识]
```

继续使用 Lecture Reference。

它不是 Tool Rail 项。

要求：

- 根据 `lectureSectionId` 打开对应知识；
- 当前 Step 不丢；
- 当前代码不丢；
- AI 保持可用；
- 返回后恢复实验状态；
- Reference 阅读不写 LessonLearningProgress；
- Reference 阅读不自动完成 Lab Step；
- codeTarget 可以继续定位 Workspace 文件。

具体使用右侧临时层、抽屉还是覆盖 Lab Guide，由 Codex 根据当前实现选择。

---

# 二十九、响应式行为

必须测试：

```text
1920×1080
1366×768
当前最小窗口
100%
125%
150%
175%
```

课程实验中需要保证：

- Explorer 可用；
- Monaco 有实际编程空间；
- Bottom Panel 可操作；
- Lab Guide 可读；
- AI 不遮挡关键操作。

高缩放或窄窗口时可以：

- 压缩 Lab Guide；
- 收起 Explorer；
- Bottom Panel 使用较小默认高度；
- AI Float 退化成贴边 Drawer。

但不能：

> 为了响应式直接恢复互斥 Tool 模式。

---

# 三十、Sandbox 的空间利用

自由练习没有 Lab Guide。

所以 Code Surface 可以自然扩展到右边：

```text
┌──────────────┬─────────────────────────────────────────────┐
│ Explorer     │                 Editor                      │
│              │                                             │
│              ├─────────────────────────────────────────────┤
│              │ Problems | Build | Output                   │
└──────────────┴─────────────────────────────────────────────┘
                                              ○ AI
```

Bottom Panel 仍然只在 Code Surface 下方。

---

# 三十一、UI 状态持久化

可以轻量保存：

- AI 按钮位置；
- AI 展开状态；
- AI 窗口尺寸；
- Bottom Panel 展开状态；
- Bottom Panel active tab；
- Bottom Panel 高度；
- Lab Guide 是否在完整任务模式；
- Lecture Reference Section；
- 当前文件；
- Monaco cursor；
- Monaco scroll/view state；
- Explorer width。

这些属于 UI preference。

不要写入：

- Workspace Git；
- CourseProgress；
- Workspace 核心 Metadata；

除非当前已有对应可靠持久化机制且确实属于业务事实。

---

# 三十二、后台任务

新的界面必须继续遵循已经建立的后台任务规则。

关闭 AI 浮窗：

```text
≠ cancel AI
```

收起 Bottom Panel：

```text
≠ cancel Build
```

切换 Problems / Output：

```text
≠ change Build state
```

如果允许离开 Workspace：

- Candidate；
- Firmware Build；
- AI；

继续按已有 scope 后台运行。

事件必须根据它自己的 workspaceId / scope 处理。

不得因为当前页面变化而写错另一个 Workspace。

真实写入任务：

- Flash；
- Firmware Update；
- Recovery；

继续遵循已有 Navigation Guard。

---

# 三十三、不要扩展任务调度复杂度

“可以后台运行”不表示需要实现：

- 多 Firmware Build 并发；
- 多 Candidate 并发；
- 多 AI Agent 并发；
- 多 Workspace 同时 Flash；
- 通用 Job Scheduler。

如果当前服务只支持单 active operation：

> 保留现有单任务限制。

新的 UI 只需要正确展示：

> 某个后台任务正在运行及其归属。

不要顺带重写 Main 调度架构。

---

# 三十四、当前安全边界必须冻结

本轮 UI 重构不得改变：

- Candidate 权限；
- Workspace 文件范围；
- Diff/Apply 确认；
- CourseProgress Contract；
- Firmware validity；
- Build proof；
- WCH-Link 验证；
- Flash confirmation；
- Hardware observation；
- LessonLearningProgress；
- Lecture Safe Model；
- Lesson AI / Workspace AI 权限区分。

本轮目标：

> 改变学生如何看见和操作现有能力。

不是：

> 重写这些能力本身。

---

# 三十五、明确不做

本轮不要加入：

- 完整 Terminal；
- 任意 Shell；
- 多聊天窗口；
- 多 AI Agent；
- VS Code 完整 Panel System；
- 通用 Dock Manager；
- 自定义 Workspace Layout Designer；
- 可插拔 Tool Plugin；
- 完整 Serial Terminal；
- Debugger；
- Breakpoint；
- Watch；
- Registers；
- 通用 File Search；
- 多窗口编辑器；
- Split Editor；
- Build 并发重构；
- Flash 状态机重构。

未来需要时再单独设计。

---

# 三十六、推荐实施顺序

## Phase 0：检查最新远端

先同步并确认最新 `origin/main`。

重点阅读：

- MCU Workspace Shell；
- Project Explorer；
- StudentCodeEditor；
- 当前 McuCourseTool / Lab Task；
- 当前 AI ChatPanel；
- Candidate；
- Diff；
- Firmware Build；
- WCH-Link；
- CourseProgress；
- Lecture Reference；
- Workspace 导航；
- 当前 CSS；
- 当前 UI persistence。

不要基于旧计划猜测文件结构。

最新代码为事实来源。

---

## Phase 1：建立最终三列 Workspace

优先实现：

```text
Explorer | Code Surface | Lab Guide
```

课程实验：

三列。

Sandbox：

```text
Explorer | Code Surface
```

先保证：

- Monaco 不卸载；
- 文件切换正常；
- Lab Guide 常驻；
- 原开发流程仍能工作。

暂时可以保留旧 Tool 作为迁移路径。

---

## Phase 2：建立 Code Surface

将中央区域明确拆成：

```text
Action Bar
Editor
Bottom Panel
```

先完成布局与 resize。

不立即迁移全部 Build 逻辑。

---

## Phase 3：建立 Bottom Panel

实现：

```text
Problems
Build
Output
```

复用现有：

- diagnostics；
- build logs；
- Firmware state；
- artifacts；
- memory usage。

先保证只读展示正确。

---

## Phase 4：将 Candidate diagnostics 接入 Bottom Panel

Candidate Check：

```text
失败
→ Problems
```

点击问题定位 Monaco。

接入：

```text
让 AI 解释
```

---

## Phase 5：将 Firmware Build 接入 Bottom Panel

迁移：

- Build start；
- progress；
- logs；
- error；
- artifacts；
- Flash/RAM；
- stale/current；

到 Code Surface。

确认完整以后再删除旧 Build Tool UI。

---

## Phase 6：悬浮 AI

将 AI 从互斥 Tool 中脱离。

实现：

- Floating Button；
- drag/snap；
- chat window；
- context actions；
- history；
- background state；
- unread state。

稳定后删除旧 Assistant Tool。

---

## Phase 7：Lab Guide 精简

将实验任务收敛成：

```text
Current Step
+
Full Task Overview
```

Question/Observation 保留。

Lecture Reference 保留。

确认 CourseProgress 无回归。

---

## Phase 8：Flash 收敛

把 Firmware 有效后的 Flash 入口放入自然开发流程。

保留所有 Main 安全逻辑。

删除不再需要的独立“构建与运行”表现层。

---

## Phase 9：清理旧架构

只有新工作流完整稳定后才：

- 删除旧 Tool Rail；
- 删除死状态；
- 删除失效 activeTool；
- 清理旧 localStorage key；
- 清理重复 CSS；
- 清理重复 Build UI；
- 更新文档。

不要提前删除可作为迁移 fallback 的旧路径。

---

# 三十七、自动测试

至少覆盖：

## Workspace

- 课程实验显示 Explorer + Code Surface + Lab Guide；
- Sandbox 不显示 Lab Guide；
- Bottom Panel 只位于 Code Surface；
- Bottom Panel 展开不改变 Explorer/Lab Guide 高度；
- Bottom Panel resize 只影响 Monaco；
- Workspace 切换正确恢复 UI。

## Candidate

- 自动保存；
- check；
- validate；
- build；
- diagnostics；
- Problems；
- file location；
- Diff；
- Apply。

## Firmware

- Build start；
- progress；
- complete；
- failed；
- stale；
- artifacts；
- Flash/RAM；
- Output log；
- Build Tab。

## Bottom Panel

- expand；
- collapse；
- resize；
- tab；
- state summary；
- failure auto-open；
- success behavior；
- persisted height。

## AI

- open；
- close；
- drag；
- snap；
- resize boundary；
- task context；
- selection explain；
- diagnostic explain；
- history；
- background completion；
- no permission expansion。

## Lab Guide

- current Step；
- full list；
- fileTarget；
- lectureSectionId；
- question；
- observation；
- completed；
- needs-attention；
- Build-driven progression。

## Hardware

- invalid Firmware cannot Flash；
- Flash confirmation；
- Flash progress；
- Flash failure；
- navigation guard；
- no AI auto-flash。

## Regression

- MCU Home；
- Course Center；
- Lesson Learning；
- Lesson AI；
- Sandbox；
- existing Workspaces；
- existing Candidate；
- existing CourseProgress；
- fun-line-following edition unaffected。

---

# 三十八、默认回归命令

实施过程中优先运行当前仓库已有：

```text
npm run typecheck
npm test
npm run courses:validate
npm run smoke:electron:mcu
npm run smoke:electron:fun
```

如最新仓库命令已有变化，以当前 `package.json` 为准。

日常实施不要运行 Windows 安装包构建。

只有用户明确要求发布验收时再执行 packaging。

---

# 三十九、人工验收

### 课程实验完整路径

```text
进入 Lab
→ 当前任务始终可见
→ 打开代码
→ 修改
→ 自动保存
→ 检查代码
→ Candidate 失败
→ Bottom Panel 自动显示 Problems
→ 点击错误定位代码
→ 打开 AI
→ AI 浮窗出现，任务仍可见
→ 修复代码
→ Candidate 通过
→ Diff
→ Apply
→ 生成完整 Firmware
→ Bottom Panel 显示 Build
→ Build 成功
→ 查看 Flash/RAM
→ 烧录
→ 观察真实现象
→ 实验 Step 自动推进
```

---

### Bottom Panel

确认：

1. 只位于 Code Surface 下方；
2. Explorer 始终完整高度；
3. Lab Guide 始终完整高度；
4. resize 只改变 Monaco 高度；
5. collapse 后状态条仍可见；
6. Build 失败自动切 Problems；
7. 点击 Diagnostic 能定位代码；
8. Output 能查看原始构建日志。

---

### AI

确认：

1. 默认是圆形按钮；
2. 可以拖动；
3. 自动吸附；
4. 不可拖出窗口；
5. 不遮挡安全操作；
6. 点击展开；
7. 关闭恢复圆形按钮；
8. 从任务打开；
9. 从代码打开；
10. 从 Problems 打开；
11. AI 打开后代码和 Lab Guide 不消失；
12. 后台回答不因关闭窗口丢失。

---

### Sandbox

确认：

```text
Explorer | Code Surface
```

无 Lab Guide。

同时：

- Candidate 正常；
- Bottom Panel 正常；
- Build 正常；
- Flash 正常；
- AI 正常。

---

### Responsive

至少人工测试：

```text
1920×1080
1366×768
100%
125%
150%
175%
```

重点检查：

- Monaco 可编辑面积；
- Bottom Panel；
- Lab Guide；
- AI；
- Explorer；
- Dialog；
- Flash confirmation；
- keyboard focus。

---

# 四十、产品完成标准

重构完成以后，学生进入实验时应该自然形成：

```text
右边告诉我现在要做什么
        ↓
中央写代码
        ↓
代码下方告诉我发生了什么
        ↓
不懂时随时打开 AI
        ↓
修正
        ↓
检查
        ↓
确认修改
        ↓
生成程序
        ↓
烧录
        ↓
观察
```

而不是：

```text
实验任务
↔
AI
↔
构建
↔
实验任务
```

反复切换。

最终产品体验应该像：

> 左边是工程；
> 中间是 IDE；
> 右边是实验指导书；
> 下方是编译器告诉我的结果；
> AI 是随时可以叫来的助教。

---

# 四十一、Codex 开放式实施要求

请不要把这份计划当成组件级实现说明。

开始前必须：

1. 同步最新 `origin/main`；
2. 确认当前 HEAD；
3. 阅读相关实现和测试；
4. 理解当前 Candidate、Build、CourseProgress、AI 和 Workspace 生命周期；
5. 判断最小且长期合理的改造路径。

本计划冻结的是：

- 产品信息架构；
- Bottom Panel 的空间边界；
- Lab Guide 常驻；
- AI 悬浮；
- Code Surface 职责；
- 保存/检查/Build/Flash 语义分离；
- 安全边界；
- Sandbox 与 Lab 的差异。

本计划不冻结：

- 具体 React 组件名称；
- 文件拆分；
- reducer/state hook 形式；
- CSS Grid/Flex 实现；
- Bottom Panel 内部组件树；
- AI Float 内部组件树；
- Diff 最终表现形式；
- Build Tab 具体排版；
- Pixel 尺寸；
- 动画细节；
- 是否需要少量 Main/Preload 扩展。

如果最新实现已经存在更好的可复用抽象，优先使用。

不要为了匹配计划文字重复实现已有功能。

---

# 四十二、完成后汇报

完成实施后请总结：

1. 最终 Workspace 信息架构；
2. 旧 Tool Rail 如何处理；
3. Lab Guide 如何常驻；
4. Code Surface 如何组织；
5. Bottom Panel 如何实现且为何只影响代码区域；
6. Problems / Build / Output 数据分别来自哪里；
7. Candidate 流程如何接入；
8. Firmware Build 如何接入；
9. Flash 如何接入；
10. AI 浮动助手如何实现；
11. AI 如何接入任务/代码/诊断上下文；
12. Sandbox 如何复用；
13. 删除了哪些旧状态与旧 UI；
14. 保留了哪些兼容路径；
15. 自动测试结果；
16. 尚需人工复核项目；
17. 尚需真实硬件复核项目。

如果实现过程中发现某项计划与最新代码存在冲突：

> 优先保持现有可信状态机和安全边界，并选择满足上述产品目标的最小改动方案。

不要为了严格照抄计划而破坏已经稳定的底层行为。