# 任务：将 v2.5 全功能小马固件接入大学生版“自由练习”

## 一、目标

当前仓库已经存在：

```text
firmware/v2.5_沁恒小马例程
```

该固件已经具备完整的小马运行能力，包括：

- 四路舵机与步态控制；
- CCD 循线；
- OLED；
- USART3 / RDS1；
- 安全状态机；
- `student_control` 学生控制接口；
- `robotdog_student_bridge` 学生代码安全桥；
- `ROBOTDOG_STUDENT_OVERLAY` CMake overlay 机制。

大学生版当前也已经存在：

```text
课程学习
自由练习
```

其中自由练习对应：

```text
workspacePurpose = mcu-sandbox
```

本任务的目标不是增加新的“自由编程”模块，而是：

```text
大学生版
│
├─ 课程学习
│    └─ 继续使用 ch32v203-rhs 教学固件
│
└─ 自由练习
     └─ 使用 v2.5 全功能小马固件
          └─ 学生编写简单应用代码
```

最终学生应能在现有大学生版自由练习工作台内：

```text
创建自由练习
→ 编写小马控制代码
→ Candidate Build
→ 完整 Firmware Build
→ WCH-Link 烧录
→ 小马执行学生程序
```

不得新建独立应用、独立工作台或第二套自由编程 UI。

---

# 二、必须遵守的架构原则

## 1. 不替换 RHS 教学基线

当前：

```text
resources/firmware-baselines/ch32v203-rhs
firmware/ch32v203-baseline
```

继续作为大学生课程学习的教学基线。

GPIO、LED、函数、PWM、UART 等课程仍走现有：

```text
mcu-lesson-attempt
→ ch32v203-rhs
```

不要使用 v2.5 替换这些课程。

---

## 2. v2.5 只负责完整小马编程

新的自由练习使用：

```text
firmware/v2.5_沁恒小马例程
```

形成：

```text
mcu-sandbox
→ v2.5 full pony firmware
```

用途是“使用完整机器人平台进行应用编程”，而不是学习底层外设初始化。

---

## 3. 不再让 Edition 决定唯一 Firmware Baseline

当前 `src/main/index.ts` 中存在类似：

```text
mcu-foundations
→ ch32v203-rhs

fun-line-following
→ ch32v203-robotdog
```

这种 Edition → 单一 Baseline 的绑定。

这正是本次必须解除的限制。

目标架构改为：

```text
Edition
   ↓
Workspace
   ↓
firmwareBaselineId
   ↓
FirmwareBaseline Resolver
   ↓
实际 FirmwareBaseline
```

即：

```text
mcu-lesson-attempt
firmwareBaselineId = ch32v203-rhs-baseline

新的 mcu-sandbox
firmwareBaselineId = v2.5 小马 baseline
```

不要新增功能重复的 `firmwareProfile` 字段。

优先复用 Workspace 目前已经存在的：

```text
firmwareBaselineId
baselineCommit
```

---

# 三、阶段 0：先审查现状，不立即大改

开始修改前先检查：

```text
src/main/index.ts
src/main/services/workspace-service.ts
src/main/services/firmware-baseline-service.ts
src/main/services/firmware-build-service.ts
src/main/services/project-explorer-service.ts
src/main/services/course-service.ts
src/main/ipc/register-ipc.ts

resources/firmware-baselines/ch32v203-rhs
resources/firmware-baselines/ch32v203-robotdog

resources/workspace-templates/ch32v203-mcu-foundations
resources/workspace-templates/ch32v203-mcu-lessons

firmware/v2.5_沁恒小马例程
```

特别确认：

```text
FirmwareBuildService
ProjectExplorerService
烧录服务
Firmware artifact identity 校验
Workspace 创建
旧 Workspace migration
```

哪些地方仍依赖“全局唯一 baseline”。

同时确认 v2.5：

```text
Core/Inc/student_control.h
Core/Src/student_control.c
User/robotdog_student_bridge.*
User/robotdog_runtime.*
User/robotdog_safety.*
CMakeLists.txt
```

现状。

不得因为本计划而顺手重构无关功能。

---

# 四、阶段 1：正式注册 v2.5 Firmware Baseline

不要直接让应用引用：

```text
firmware/v2.5_沁恒小马例程
```

这种开发源码路径。

按照项目现有 `FirmwareBaselineService` 体系，为它建立正式 baseline 描述。

建议新建稳定 baseline family：

```text
resources/firmware-baselines/ch32v203-pony/
```

其中版本信息对应：

```text
firmware version = 0.2.5
chip = CH32V203C8T6
```

不要修改现有：

```text
resources/firmware-baselines/ch32v203-robotdog/active.json
```

以避免本任务顺带改变“趣味巡线版”的固件版本。

推荐：

```text
resources/firmware-baselines/ch32v203-pony/
├─ active.json
└─ ...
```

具体 manifest/schema 必须复用当前项目已经存在的 baseline schema，不另外设计第二套格式。

Baseline 至少必须能够描述：

```text
baseline id
firmware version
source identity
source location / packaged source
build preset
toolchain
artifact names
target chip
```

正式 ID 应稳定，例如：

```text
ch32v203-pony-v25
```

目录名保持稳定：

```text
ch32v203-pony
```

以后升级 0.2.6 时不要重新设计整个体系。

---

# 五、阶段 2：实现 Workspace 级 Firmware Baseline Resolver

这是整个任务最核心的改造。

## 当前问题

现在应用启动时大致：

```text
readBaselineRegistry()
      ↓
new FirmwareBaselineService()
      ↓
整个 Edition 共用
```

这会导致大学生版所有 Workspace 都只能使用：

```text
ch32v203-rhs
```

必须改掉。

## 目标

建立一个很轻的 baseline resolver，例如：

```text
FirmwareBaselineResolver
```

或等价实现。

职责仅为：

```text
workspace.firmwareBaselineId
        ↓
找到对应 baseline registry / manifest
        ↓
返回 FirmwareBaselineService
```

不要建设复杂插件系统。

建议支持至少：

```text
ch32v203-rhs-baseline
ch32v203-pony-v25
```

随后修改所有真正依赖 Firmware Baseline 的服务，让它们根据当前 Workspace 获取 baseline。

重点检查并适配：

```text
FirmwareBuildService
ProjectExplorerService
烧录 / firmware artifact 校验
恢复或更新相关服务
```

不要只改 Build，而导致：

```text
Explorer 看 RHS
Build 却使用 Pony
```

所有和“当前 Workspace 固件身份”相关的服务必须一致。

---

# 六、阶段 3：Workspace 创建规则

## 课程实验

所有：

```text
workspacePurpose = mcu-lesson-attempt
```

继续保持：

```text
firmwareBaselineId = ch32v203-rhs-baseline
```

不得变化。

---

## 新创建的自由练习

大学生版：

```text
workspacePurpose = mcu-sandbox
```

新建时改为：

```text
firmwareBaselineId = ch32v203-pony-v25
```

即：

```text
大学生版 → 自由练习 → 创建工程
```

默认就是“小马自由编程”。

---

## 旧 Workspace

绝对不要批量修改旧 Workspace 的 baseline identity。

旧 `mcu-sandbox` 如果记录的是 RHS baseline：

```text
保持 RHS
```

新创建的：

```text
使用 Pony v2.5
```

这是非破坏性迁移的要求。

如果旧 Workspace 缺少 baseline identity，则继续沿用现有 migration 逻辑，不允许静默把它转成 v2.5。

---

# 七、阶段 4：建立大学生自由练习 Student Template

不要把整个：

```text
firmware/v2.5_沁恒小马例程
```

复制进学生 Workspace。

学生 Workspace 只保存学生需要看到和修改的 overlay。

推荐建立：

```text
resources/workspace-templates/ch32v203-pony/
└─ <version>/
   ├─ App/
   │  ├─ Inc/
   │  │  └─ experiment.h
   │  └─ Src/
   │     └─ experiment.c
   │
   ├─ Core/
   │  ├─ Inc/
   │  │  └─ student_control.h
   │  └─ Src/
   │     └─ student_control.c
   │
   ├─ student-config/
   │  └─ line-following.yaml
   │
   └─ README.md
```

其中：

```text
App/Src/experiment.c
```

作为大学生主要编辑入口。

继续保持大学生课程现有的代码心智模型：

```text
App/Src/experiment.c
```

而不是突然让学生切换到大量 RobotDog 内部文件。

---

# 八、阶段 5：实现 Experiment → StudentControl Bridge

学生层保持：

```text
Experiment_Init()
Experiment_Update()
```

底层继续使用 v2.5 已经设计好的：

```text
StudentControl_Init()
StudentControl_Update()
```

桥接关系：

```text
App/Src/experiment.c
        ↓
Core/Src/student_control.c
        ↓
robotdog_student_bridge
        ↓
robotdog_runtime
        ↓
robotdog_motion
```

例如固定的 bridge：

```c
void StudentControl_Init(void)
{
    Experiment_Init();
}

void StudentControl_Update(
    const student_control_input_t *input,
    student_control_output_t *output)
{
    Experiment_Update(input, output);
}
```

但是必须检查 v2.5 当前 CMake include/source 设置。

当前 v2.5 的：

```text
ROBOTDOG_STUDENT_OVERLAY
```

主要覆盖：

```text
Core/Src/student_control.c
Core/Inc
student-config
```

如果 `student_control.c` 要 include：

```c
#include "experiment.h"
```

则必须正式支持：

```text
App/Inc
App/Src
```

不要依赖偶然 include path。

因此修改 v2.5 CMake overlay 支持：

```text
overlay/Core/Src/student_control.c
overlay/Core/Inc
overlay/App/Inc
overlay/App/Src/*.c
overlay/student-config
```

要求：

```text
没有 App 时仍兼容原 student_control overlay
有 App 时自动加入学生 App 源码
```

不要破坏 v2.5 自身独立构建。

---

# 九、学生 API 边界

大学生写应用时允许使用：

```text
student_control_input_t
student_control_output_t
student_action_t
```

至少提供：

```text
STOP
STAND
WALK
TURN_LEFT
TURN_RIGHT
```

传感器输入至少包括当前已有：

```text
now_ms
line_valid
line_center
line_target
line_error
threshold
pixels
```

不要让学生 App 直接调用：

```text
TIM
PWM register
robotdog_motion 内部函数
robotdog_safety 内部函数
USART ISR
CCD 驱动
```

自由练习的目标是：

```text
编写机器人行为
```

而不是绕过安全层。

必须继续经过：

```text
robotdog_student_bridge
robotdog_safety
```

---

# 十、文件权限

新的 Pony 自由练习 Workspace 建议：

可编辑：

```text
App/Src/**
App/Inc/**
```

根据需要也可开放：

```text
student-config/**
```

但第一版优先只开放 `App`。

只读：

```text
Core/Inc/student_control.h
Core/Src/student_control.c
```

底层 Firmware Source：

```text
User/**
Peripheral/**
Startup/**
Ld/**
Core/core_riscv.*
```

必须只读。

学生不能修改：

```text
安全层
运动层
中断
启动代码
链接脚本
厂商库
烧录配置
```

不要因为是“自由练习”就取消现有 Candidate/Diff 权限模型。

---

# 十一、Candidate Build

检查：

```text
CandidateBuildService
PlatformCandidateBuildService
```

使新的 Pony sandbox 能正确预检：

```text
App/Src/*.c
App/Inc/*.h
```

Candidate Build 只做快速学生代码检查。

它不等价于完整 Firmware Build。

如果学生代码：

```text
语法错误
类型错误
调用不存在的 API
```

应在 Candidate Build 阶段明确报到对应学生文件。

---

# 十二、Firmware Build

Pony sandbox 的完整构建必须使用：

```text
firmware/v2.5_沁恒小马例程
```

作为底层固件：

```text
v2.5 baseline
+
workspace student overlay
```

最终调用 v2.5 已经存在的 CMake：

```text
robotdog-wch-gcc12
```

以及：

```text
ROBOTDOG_STUDENT_OVERLAY=<workspace overlay>
```

最终产物应继续产生：

```text
RobotDog.elf
RobotDog.hex
RobotDog.bin
RobotDog.map
RobotDog.size.txt
RobotDog.sha256.txt
RobotDog.input.json
```

Studio 对外仍只显示目前 UI 已支持的必要产物。

不得为 Pony 再写一套独立 Build 系统。

---

# 十三、烧录链路

检查现有 WCH-Link 烧录服务。

必须保证：

```text
Workspace
→ 当前 workspace baseline
→ 当前 workspace firmware artifact
→ WCH-Link
```

而不是：

```text
Edition baseline
→ artifact
```

需要验证：

```text
RHS workspace 不能烧 Pony 的 artifact
Pony workspace 不能误用 RHS artifact
```

如果源代码在 Firmware Build 后发生变化，应继续沿用现有 stale artifact 机制：

```text
修改代码
→ Firmware Build 失效
→ 必须重新 Build
→ 才允许烧录
```

不要削弱现有安全检查。

---

# 十四、UI 改动

不要增加新的顶级页面。

现有：

```text
McuHome.tsx
free-practice
```

继续保留。

原来的：

```text
自由练习
不跟随课程，直接使用完整 MCU 工程尝试自己的想法。
```

可以调整为更符合真实用途的文案，例如：

```text
自由练习

基于完整小马固件编写自己的控制程序，
尝试传感器、运动和机器人行为。
```

按钮仍然可以叫：

```text
创建自由练习工程
```

不需要增加“自由编程”第三入口。

进入 Workspace 后继续使用现有：

```text
工程代码
编译
AI
Diff
固件构建
烧录
```

等工作台。

---

# 十五、AI 上下文

自由练习不是课程 Workspace，因此：

```text
workspacePurpose = mcu-sandbox
```

仍然：

```text
无课程任务
无课程进度
```

不要给它伪造课程信息。

但是 Agent Prompt 应能知道这是：

```text
Pony v2.5 full firmware sandbox
```

并知道学生主要编辑：

```text
App/Src/experiment.c
```

以及允许使用的：

```text
student_control.h
```

AI 可以帮助学生写：

```text
循线逻辑
动作决策
状态控制
简单行为
```

但不能直接修改：

```text
robotdog_safety
robotdog_motion
启动代码
底层驱动
```

继续经过 Candidate → Diff → Apply。

---

# 十六、兼容性要求

必须同时满足以下四种 Workspace：

```text
1. 已存在的旧 mcu-sandbox
2. 新建 Pony mcu-sandbox
3. mcu-lesson-attempt
4. fun-project
```

要求：

```text
旧 mcu-sandbox
→ 不被强制迁移到 Pony

新 Pony mcu-sandbox
→ v2.5 baseline

mcu-lesson-attempt
→ RHS baseline

fun-project
→ 保持当前行为
```

TI MSPM0 版本不得受到影响。

特别不要把：

```text
readBaselineRegistry()
```

简单改成全项目默认 Pony，否则会破坏其它 Edition。

---

# 十七、测试

至少新增以下自动化测试。

## Workspace

验证：

```text
new mcu-sandbox
→ firmwareBaselineId = Pony

mcu-lesson-attempt
→ firmwareBaselineId = RHS

old sandbox
→ baseline identity 不变
```

## Baseline Resolver

验证：

```text
RHS workspace → RHS baseline
Pony workspace → Pony baseline
unknown baseline → 明确失败
```

不得 fallback 到错误 baseline。

## Project Explorer

验证：

Pony Workspace：

```text
App/Src/experiment.c → editable
student_control.h → read-only
底层 firmware → read-only
```

## Candidate Build

验证一个正确 App 能通过。

再加入一个故意错误的：

```text
App/Src/experiment.c
```

确认错误能映射回学生源码。

## Firmware Build

至少执行：

```text
RHS lesson firmware build
Pony sandbox firmware build
```

两者都成功。

并验证产物 identity 不混淆。

## Stale

```text
Pony build success
→ 修改 experiment.c
→ 原 artifact stale
→ 禁止直接烧录
```

## Edition regression

现有：

```text
fun-line-following
mcu-foundations
ti-mspm0-foundations
```

基础 smoke test 均不能退化。

---

# 十八、人工真机验证

自动测试全部通过后，进行一次真实 CH32V203 小马测试。

测试程序尽量简单，不先测试复杂循线。

第一项：

```text
上电
→ 保持停止
```

第二项：

```text
学生代码请求 STAND
→ 小马保持站立
```

第三项：

```text
学生代码按简单时间或输入请求 WALK
→ 小马行走
```

第四项：

```text
请求 STOP
→ 安全停机
```

第五项：

```text
制造无效 line_valid
→ 不允许盲目前进
```

确认：

```text
robotdog_student_bridge
robotdog_safety
```

仍真正参与运行。

---

# 十九、明确禁止事项

本任务不要：

```text
× 重写课程系统
× 新做一套自由编程页面
× 删除 mcu-sandbox
× 用 Pony 替换 RHS
× 把完整 Pony 源码复制到每个 Workspace
× 让学生直接编辑 robotdog_motion
× 绕过 Candidate/Diff
× 绕过 firmware stale 检查
× 修改 TI MSPM0 架构
× 顺手进行 RobotDog → Pony 全项目重命名
× 顺手替换 AI 后端
```

这些均不属于本任务。

---

# 二十、建议实施顺序

按以下顺序完成，每一步保持仓库可运行：

### Commit 1

```text
feat(firmware): register pony v2.5 firmware baseline
```

只完成 v2.5 baseline 注册和 manifest。

### Commit 2

```text
refactor(firmware): resolve firmware baseline per workspace
```

解除 Edition 单 baseline 限制。

完成 Workspace → Baseline resolver。

### Commit 3

```text
feat(mcu): add pony free-practice student overlay
```

加入：

```text
App
student_control bridge
student template
v2.5 overlay build support
```

### Commit 4

```text
feat(mcu): create free practice on pony firmware
```

让新 `mcu-sandbox` 使用 Pony baseline。

保持课程 RHS。

### Commit 5

```text
test(mcu): cover rhs and pony multi-baseline workflows
```

补全：

```text
workspace
explorer
candidate
firmware build
stale
flash identity
edition regression
```

---

# 二十一、最终验收标准

只有以下全部成立才算完成：

```text
[ ] 大学生版课程学习仍正常
[ ] 课程 Workspace 仍使用 RHS
[ ] 自由练习入口仍存在
[ ] 新自由练习使用 Pony v2.5
[ ] 学生主要编辑 experiment.c
[ ] v2.5 底层源码不复制进学生工作区
[ ] student_control bridge 正常
[ ] Candidate Build 正常
[ ] Firmware Build 正常
[ ] RobotDog.elf / hex / bin / map 正常产生
[ ] 修改代码后旧固件变 stale
[ ] WCH-Link 使用当前 Workspace 对应 artifact
[ ] RHS/Pony artifact 不会串用
[ ] 旧 Sandbox 不被破坏
[ ] 趣味巡线版不被本任务意外升级
[ ] TI MSPM0 不受影响
[ ] 自动测试通过
[ ] 真机完成一次 Pony 自由编程闭环
```

最终架构应明确成为：

```text
RobotDog Studio 单片机入门版
│
├─ 课程学习
│    │
│    ├─ mcu-lesson-attempt
│    │
│    └─ CH32V203 RHS Teaching Firmware
│
└─ 自由练习
     │
     ├─ mcu-sandbox
     │
     ├─ App/Src/experiment.c
     │
     ├─ StudentControl Bridge
     │
     └─ Pony v2.5 Full Firmware
             │
             ├─ student bridge
             ├─ safety
             ├─ runtime
             ├─ motion
             ├─ CCD
             ├─ OLED
             └─ hardware
```

核心原则只有一句：

**课程让大学生学习单片机，自由练习让大学生直接使用完整小马平台进行编程；两者共享 Studio 工作流，但使用不同 Firmware Baseline。**