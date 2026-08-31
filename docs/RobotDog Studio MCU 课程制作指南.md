# RobotDog Studio MCU 课程制作指南

更新日期：2026-08-31

适用项目：RobotDog Studio MCU Foundations  
当前参考课程：`ch32v203-foundations`，`contentVersion: 9`

## 1. 指南目标

本指南用于在 RobotDog Studio 中新增或维护 MCU 课程、课次、讲义和学生实验工程。完成一节可发布课程，至少需要同时交付：

1. 课程目录登记；
2. Course Manifest；
3. Lesson Manifest；
4. 独立学生工程模板；
5. 受控 Lecture Markdown；
6. 必要的本地图片资源；
7. 内容版本、兼容快照和内容指纹；
8. 自动测试；
9. 硬件课的真机验证记录。

课程不是一组展示页面。Lesson 中的文件权限、任务、完成条件和 AI 上下文会直接驱动 Main 服务、学生 Workspace、Firmware Build、AI Candidate、Flash 和课程进度状态。

## 2. 权威规则与优先级

遇到文档和代码不一致时，按以下优先级判断：

1. [`CourseService`](../src/main/services/course-service.ts) 中的 Zod Schema 和关联校验；
2. [`CourseLectureParser`](../src/main/services/course-lecture-parser.ts) 的 Lecture 白名单解析规则；
3. [`validate-mcu-courses.ts`](../scripts/validate-mcu-courses.ts) 的发布与兼容校验；
4. 本指南；
5. 其他设计文档和历史实施计划。

相关专项说明：

- [RobotDog Lecture Markdown v1](./robotdog-lecture-markdown-v1.md)
- [单片机课次编写与硬件验证清单](./mcu-lesson-authoring-and-hardware-validation.md)
- [EVT 来源审查](./mcu-evt-source-audit.md)

## 3. 课程运行链路

```text
catalog.json
  → course.json
    → lessons/<lessonId>.json
      ├─ workspace-templates/<templateId>/
      └─ lectures/<lessonId>/lecture.md + assets/
        → Main 校验与解析
          ├─ 课程中心 / Lesson 页面
          ├─ Lab Guide
          ├─ 学生 Workspace 权限
          ├─ Workspace / Build / Flash 完成证据
          └─ Course AI 可信上下文
```

Renderer 不读取原始 Markdown 路径，也不能任意读取课程文件。Main 将讲义解析为 Safe Lecture Model，图片转换成不透明 `assetId` 后再通过受控 IPC 提供。

## 4. 目录结构

```text
resources/
├─ courses/mcu-foundations/
│  ├─ catalog.json
│  └─ <courseId>/
│     ├─ course.json
│     ├─ lessons/
│     │  └─ <lessonId>.json
│     ├─ lectures/
│     │  └─ <lessonId>/
│     │     ├─ lecture.md
│     │     └─ assets/
│     │        ├─ *.png
│     │        ├─ *.jpg
│     │        ├─ *.jpeg
│     │        └─ *.svg
│     └─ compatibility/
│        ├─ progress-v<旧版本>.json
│        ├─ learning-v<旧版本>.json
│        └─ content-v<当前版本>.json
└─ workspace-templates/ch32v203-mcu-lessons/
   └─ <templateId>/
      ├─ App/Inc/
      ├─ App/Src/
      ├─ Core/Inc/
      ├─ Core/Src/
      ├─ student-config/
      └─ README.md
```

新增课次通常不需要修改课程中心、工作台或 Renderer 组件。主要改动应限制在课程数据、讲义、模板、兼容快照和必要测试中。

## 5. 推荐制作流程

### 5.1 先写教学合同

在创建文件前先明确：

- 学生是谁，具备哪些前置知识；
- 本课结束时能做什么；
- 学生实际修改哪些文件；
- 哪些文件只读；
- 哪些结果能由编译、构建、烧录或人工观察证明；
- 是否需要真实硬件；
- AI 可以解释什么，不能代做什么。

目标应可观察，例如“能够区分编译错误和链接错误”，不要只写“了解 C 语言”。

### 5.2 建立稳定 ID

以下 ID 一经发布应视为稳定接口：

- `courseId`
- `lessonId`
- `stepId`
- `questionId`
- Lecture H2/H3 的 `sectionId`

ID 使用小写 kebab-case，匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

Lecture Section ID 更严格，必须以字母开头。不要因为标题润色而修改已发布 ID。

### 5.3 注册课程和课次

新课程先加入：

```text
resources/courses/mcu-foundations/catalog.json
```

新课次加入 Course Manifest 的 `lessonOrder`。`lessonOrder` 同时决定显示顺序和 `order`；`prerequisites` 只能引用排在当前课之前的课次。

### 5.4 创建 Lesson、模板和讲义

Lesson、模板和讲义的身份必须一致：

```text
lessonId == lessons/<lessonId>.json
lesson.templateId == workspace-templates/.../<templateId>
lecture == lectures/<lessonId>/lecture.md
```

### 5.5 从 draft 开始

普通无硬件课可使用：

```json
{
  "hardware": "none",
  "verification": "not-required",
  "status": "draft"
}
```

硬件课在完成真机验证前必须保持：

```json
{
  "hardware": "required",
  "verification": "pending-hardware-check",
  "status": "draft"
}
```

不得发布 `verification: pending-hardware-check` 的课次。

## 6. Course Manifest

位置：

```text
resources/courses/mcu-foundations/<courseId>/course.json
```

示例：

```json
{
  "schemaVersion": 1,
  "courseId": "ch32v203-foundations",
  "contentVersion": 9,
  "title": "CH32V203 单片机入门",
  "summary": "课程对学生的整体价值",
  "audience": "电子类专业大学低年级学生",
  "objectives": [
    "完成课程后能够观察或验证的能力"
  ],
  "status": "draft",
  "boardScope": "CH32V203 RHS 机器马教学开发板",
  "lessonOrder": [
    "studio-first-build",
    "new-lesson-id"
  ],
  "progressCompatibleFrom": [5],
  "learningCompatibleFrom": [5],
  "sourceAttribution": [
    "Robot Horse Studio（RHS）当前固件基线与学生工作区模板"
  ]
}
```

关键限制：

- `contentVersion` 是整门课程唯一版本，不是单课版本；
- `lessonOrder` 至少包含一个唯一课次；
- `progressCompatibleFrom` 与 `learningCompatibleFrom` 必须分别判断；
- `sourceAttribution` 应记录课程依赖的代码、数据、文档和官方示例来源；
- 已发布内容发生实质变化时必须递增 `contentVersion`。

## 7. Lesson Manifest

位置：

```text
resources/courses/mcu-foundations/<courseId>/lessons/<lessonId>.json
```

### 7.1 完整骨架

```json
{
  "schemaVersion": 1,
  "courseId": "ch32v203-foundations",
  "lessonId": "stable-lesson-id",
  "title": "课次名称",
  "summary": "学生将在本课完成什么",
  "objectives": [
    "可观察的学习目标"
  ],
  "prerequisites": [],
  "estimatedMinutes": 60,
  "hardware": "none",
  "verification": "not-required",
  "expectedObservation": "完成后可以观察或验证的结果",
  "templateId": "stable-lesson-id",
  "editableGlobs": [
    "App/Src/experiment.c",
    "App/Inc/experiment.h"
  ],
  "readableFiles": [
    "Core/Src/student_control.c",
    "Core/Inc/student_control.h",
    "README.md"
  ],
  "deniedGlobs": [
    "Core/**",
    "Startup/**",
    "Ld/**"
  ],
  "steps": [
    {
      "stepId": "inspect-entry",
      "type": "read",
      "title": "找到实验入口",
      "instruction": "阅读实验入口和只读适配层。",
      "lectureSectionId": "experiment-entry",
      "fileTarget": {
        "path": "App/Src/experiment.c",
        "line": 1
      }
    },
    {
      "stepId": "edit-example",
      "type": "edit",
      "title": "完成小修改",
      "instruction": "只修改本课允许的教学文件。",
      "fileTarget": {
        "path": "App/Src/experiment.c"
      }
    },
    {
      "stepId": "build-firmware",
      "type": "firmware-build",
      "title": "生成完整程序",
      "instruction": "生成完整固件并查看程序资源。"
    },
    {
      "stepId": "reflect-example",
      "type": "question",
      "questionId": "why-example",
      "title": "总结本课",
      "instruction": "用自己的话解释本课关键概念。"
    }
  ],
  "completionChecks": [
    {
      "type": "student-change-applied",
      "target": "App/Src/experiment.c"
    },
    {
      "type": "firmware-build-passed"
    },
    {
      "type": "question-answered",
      "target": "why-example"
    }
  ],
  "reflectionQuestions": [
    {
      "questionId": "why-example",
      "prompt": "为什么要这样修改？"
    }
  ],
  "aiContext": {
    "teachingFocus": "先提示和定位，不直接替学生完成整课。",
    "hints": [
      "先检查第一条有效错误",
      "让学生说明自己的判断"
    ]
  },
  "status": "draft"
}
```

### 7.2 字段约束

- `estimatedMinutes`：5–480 分钟；
- `hardware`：`none | optional | required`；
- `verification`：`not-required | pending-hardware-check | hardware-checked`；
- `status`：`draft | published`；
- `stepId` 和 `questionId` 在当前课内不得重复；
- `question` 步骤必须且只能绑定一个已登记的 `questionId`；
- 每个问题只能映射到一个 Question Step；
- `student-change-applied.target` 必须精确出现在 `editableGlobs`；
- `manual-observation-confirmed.target` 必须指向 `serial-observation` 或 `hardware-observation` 步骤；
- AI 上下文序列化后总长度不能超过 8,000 字符；
- `aiContext.hints` 最多 8 条。

### 7.3 Step 类型

| 类型 | 用途 | 通常由谁确认 |
| --- | --- | --- |
| `read` | 阅读或观察工程代码、配置 | 学生手动推进 |
| `edit` | 修改教学文件并自动保存到 Workspace | Workspace 写入证据 |
| `candidate-build` | 旧课程兼容类型；新课不要用于手工编辑主路径 | Firmware proof 兼容桥接 |
| `review-apply` | 旧课程兼容或 AI 修改的 Diff / Apply | Workspace 写入或 Apply proof |
| `firmware-build` | 生成完整固件 | Firmware proof |
| `flash` | 写入真实开发板 | Flash proof |
| `serial-observation` | 记录串口现象 | 学生人工确认 |
| `hardware-observation` | 记录硬件现象 | 学生人工确认 |
| `question` | 回答反思问题 | 问题答案存在 |
| `summary` | 总结或收束 | 学生手动推进 |

已发布旧课中的 `read` 不要改名以追求术语统一。未来未发布的新课可在产品支持时再采用更明确的观察类型。

Lab Guide 只维护一套线性 Stepper，并严格按 `stepId` 与 CourseProgress 对齐。新课的默认主线应是 `read → edit → firmware-build → flash / observation → summary`。`edit` 由真实 Workspace 写入完成；`firmware-build`、`flash` 分别由 Firmware、Flash proof 自动确认；`question` 和两种 observation 在保存有效内容后自动确认。`candidate-build` 与 `review-apply` 仅为旧课兼容或明确的 AI Review 教学保留，不应再作为学生手工编辑的默认步骤。

Completion Check 是实验验收证据，不是第二套学生任务。能够可靠映射时应显示在对应 Step 内；无法唯一映射的条件只在其阻止最终验收时独立提示。所有 Step 完成不等于实验完成，只有 CourseProgress 的最终状态为 `completed` 才能显示“实验完成”。

### 7.4 Completion Check 类型

| 类型 | `target` | 含义 |
| --- | --- | --- |
| `file-exists` | 文件路径 | 指定文件存在 |
| `student-change-applied` | 可编辑文件路径 | 手工修改已保存到 Workspace，或 AI 修改已 Apply |
| `candidate-build-passed` | 无 | 旧课兼容证据；新课优先使用 `firmware-build-passed` |
| `firmware-build-passed` | 无 | 当前 Workspace 完整构建通过 |
| `flash-succeeded` | 无 | 当前产物成功写入开发板 |
| `manual-observation-confirmed` | 观察步骤 ID | 学生确认真实观察结果 |
| `question-answered` | Question ID | 已提交非空回答 |

不要使用脚本执行结果、隐藏答案或逐字标准答案比较作为完成条件。

## 8. 文件权限与工程模板

### 8.1 权限字段的职责

- `editableGlobs`：学生 Workspace 直写与 AI Candidate 允许修改的最小范围；
- `readableFiles`：课程明确允许阅读和定位的参考文件；
- `deniedGlobs`：显式保护的文件或目录；
- 实际权限仍由 Main、Project Explorer 和 Workspace 策略共同执行，Lesson 不能扩大底层权限。

默认不得开放：

- `Startup/**`
- `Ld/**`
- Bootloader、Flash 布局和升级协议；
- 底层通信、安全限制和教师恢复实现；
- 与本课无关的主固件文件。

### 8.2 `fileTarget` 和 `code-target`

目标路径必须：

- 使用 `/` 分隔的工程相对路径；
- 不包含盘符、绝对路径、`.`、`..` 或隐藏目录；
- 位于 `editableGlobs`、`readableFiles`，或 Project Explorer 允许展示的基线根目录；
- 不与精确 `deniedGlobs` 冲突。

`line` 只是定位提示，文件路径才是身份。

### 8.3 模板要求

每个课次应拥有独立模板，避免依赖另一节课运行时复制文件。推荐：

```text
App/Src、App/Inc       学生教学代码
Core/Src、Core/Inc     安全适配层，只读
student-config         允许公开的参数配置
README.md              当前课工程说明
```

模板必须能被当前 Firmware Baseline 合并和构建。不要把讲义、答案、教师文件或兼容快照复制进学生 Workspace。

## 9. Lecture Markdown

### 9.1 基本规则

讲义固定位置：

```text
lectures/<lessonId>/lecture.md
```

文件不得超过 256 KiB。允许：

- CommonMark 段落和列表；
- 必要的 GFM 表格、删除线；
- fenced code；
- 行内和块级数学；
- 内部章节链接；
- 受控 HTTPS 外部链接；
- 本课 `assets` 中的本地图片；
- RobotDog 白名单 Directive。

禁止：

- Front Matter；
- Raw HTML；
- MDX、JSX、JavaScript、ESM；
- 任意组件和任意属性；
- HTTP 链接和远程图片；
- Data URL、`file:`、绝对路径和父目录跳转。

### 9.2 章节

H2 是正式学习单元，必须带稳定 ID：

```markdown
## 函数声明 {#function-declaration}
```

只有 H2 计入“完成本节阅读”。H3 是单元内部结构；被链接时也必须声明稳定 ID。不要为了增加进度点而滥拆 H2。

### 9.3 教学 Directive

允许的块：

```markdown
:::concept[函数声明]
函数声明告诉编译器函数名称、参数和返回类型。
:::
```

```markdown
:::note
补充事实。
:::
```

```markdown
:::tip
给出下一步检查方法。
:::
```

```markdown
:::pitfall[声明与定义不一致]
解释常见错误。
:::
```

```markdown
:::safety[接线前断电]
写明硬件风险和操作边界。
:::
```

允许的交互定位：

```markdown
::code-target[打开实验代码]{path="App/Src/experiment.c" line="1"}

::task-link[开始实现辅助函数]{step="implement-helper"}
```

唯一合法 Directive：

```text
concept note tip pitfall safety code-target task-link
```

Directive 不允许嵌套。`code-target` 只允许 `path` 和可选 `line`，`task-link` 只允许 `step`。

### 9.4 图片

图片只能放在当前讲义的 `assets`：

```markdown
![GPIO 输出结构](./assets/gpio-output.svg)
```

要求：

- 格式仅限 PNG、JPEG、SVG；
- 单个图片不超过 2 MiB；
- 文件扩展名和真实 MIME 签名必须一致；
- 路径必须以 `./assets/` 开头；
- Alt Text 必须准确描述教学信息；
- 外观示意图不能冒充课程目标硬件；
- 涉及引脚、接线和电压的图片必须经过硬件验证；
- SVG 禁止脚本、事件属性、DOCTYPE、`foreignObject`、嵌入对象和外部引用。

图片应服务于概念、结构、步骤或现象判断，不要只作装饰。

## 10. AI 教学上下文

`aiContext` 会进入受保护的课程上下文，但不会扩大文件权限。

推荐写法：

```json
{
  "aiContext": {
    "teachingFocus": "围绕声明、定义和多文件编译给出分层提示，不直接提供整课答案。",
    "hints": [
      "先检查声明和定义的函数签名是否一致",
      "先解释第一条有效错误",
      "让学生自己说明头文件的作用"
    ]
  }
}
```

要求：

- 写清教学边界，而不是堆积知识正文；
- 提示应帮助学生检查和推理；
- 不放标准答案、秘密路径、教师文件或绕过权限的方法；
- Lecture AI 只解释课程内容，不创建 Candidate；
- Workspace AI 可以进入 Candidate 流程，但仍受 Workspace 权限控制。

## 11. 版本与兼容

### 11.1 何时提升 `contentVersion`

已发布课程发生以下变化时必须提升版本：

- 修改 Course 或 Lesson 教学语义；
- 新增、删除或修改讲义正文；
- 新增、删除或替换图片；
- 修改 H2 Section ID；
- 修改任务、问题、权限或完成条件；
- 修改已发布课程的硬件说明。

不要在同一 `contentVersion` 下改动已签名内容；`courses:validate` 会报“同版本内容摘要变化”。

### 11.2 三类文件不能混用

#### `progress-vN.json`

回答：新版是否可以继续使用 vN 的 Lab 进度？

只有以下语义仍兼容时才声明：

- 课程身份和已发布课次集合；
- Step ID、类型和 Question 映射；
- 完成条件；
- 文件权限和教学目标等实验合同。

`lectureSectionId` 不参与 Lab 进度语义哈希。不要用 `content-vN` 的哈希代替 Progress 哈希。

#### `learning-vN.json`

回答：新版是否可以继承 vN 的讲义阅读完成记录？

文件记录旧版各课次的 H2 Section ID。只有旧 ID 在新版仍存在时才能声明兼容。

#### `content-vN.json`

回答：当前版本所有 Course、Lesson 和 Lecture 内容是否与已冻结指纹一致？

它是当前版本指纹，不表示旧版进度兼容。

### 11.3 推荐升级顺序

假设从 v5 升到 v6：

1. 在修改前确认 v5 的实验语义和 H2 ID；
2. 修改 `course.json` 为 `contentVersion: 6`；
3. 独立决定是否把 5 加入 `progressCompatibleFrom`；
4. 独立决定是否把 5 加入 `learningCompatibleFrom`；
5. 若兼容，新增 `progress-v5.json` 和/或 `learning-v5.json`；
6. 完成 Course、Lesson、Lecture、Asset 和模板修改；
7. 打印 v6 内容指纹；
8. 新增 `content-v6.json`；
9. 正常运行课程校验。

打印内容指纹：

```powershell
$env:ROBOTDOG_PRINT_COURSE_FINGERPRINT='1'
npm run courses:validate
Remove-Item Env:ROBOTDOG_PRINT_COURSE_FINGERPRINT
```

把输出 JSON 原样保存为：

```text
compatibility/content-v6.json
```

随后运行不带环境变量的 `npm run courses:validate`。

如果实验语义或 H2 身份不兼容，不要伪造快照；从对应兼容数组中省略旧版本。

## 12. 硬件课程发布门禁

硬件课程不能用模拟结果代替真机验证。发布前至少完成：

- [ ] 目标芯片、RHS 机器马开发板版本和原理图一致；
- [ ] 引脚复用、时钟、调试口、CCD、运动控制和通信占用已核对；
- [ ] 电源、电平、接线方向和运动风险已评估；
- [ ] 当前 Workspace 的完整 Firmware Build 通过；
- [ ] Flash/RAM 未超过课程允许范围；
- [ ] WCH-Link 或指定下载方式真实烧录成功；
- [ ] 复位后的实际现象与课程描述一致；
- [ ] 拔线、错误接线、错误目标、取消和断电恢复覆盖相关项；
- [ ] 正确示例和明显错误示例都不会得到误导性完成结果；
- [ ] 建立真机验证记录。

真机记录至少包含：

- 硬件型号和板卡版本；
- 接线和供电；
- 测试提交或课程版本；
- 实际现象；
- 发现的问题；
- 恢复结果；
- 验证人和日期。

引用 WCH EVT 时还要记录精确相对路径、版权和许可证提示、使用的 API 与初始化顺序、官方参考板与 RHS 机器马开发板差异。不得修改外部 EVT 原目录，也不得将整个 EVT 复制进发行包。

## 13. 自动验证

### 13.1 日常快速检查

```powershell
npm run courses:validate
npm run typecheck
npm test
```

### 13.2 发布前检查

```powershell
npm run courses:validate
npm run typecheck
npm test
npm run build
npm run smoke:electron:mcu
npm run package:win:mcu:test
```

说明：

- `courses:validate` 校验目录、Schema、课次顺序、模板存在性、讲义、图片、Directive、兼容快照和内容指纹；
- `typecheck` 校验共享类型和接口；
- `npm test` 运行 Main、Renderer 和课程服务测试；
- MCU Smoke 验证 Electron 内的课程、Workspace、Candidate 和 Firmware 主路径；
- 安装包测试确认课程资源被正确打包；
- 自动命令不能替代人工界面检查和真机验证。

## 14. 常见失败

### 14.1 `同版本课程资源被修改`

原因：修改了已冻结版本的 Course、Lesson、Lecture 或 Asset。  
处理：提升 `contentVersion`，重新判断兼容并生成新的 `content-vN.json`。

### 14.2 `COURSE_FILE_TARGET_INVALID`

原因：`fileTarget` 不在可编辑、可读或可见基线路径中，或命中保护范围。  
处理：核对模板路径、权限字段和 Project Explorer 可见性，不要为通过校验而扩大权限。

### 14.3 `LECTURE_CODE_TARGET_NOT_VISIBLE`

原因：讲义 `code-target` 指向学生不可见文件。  
处理：改为真实可见文件，或在确有教学需要时将精确路径加入 `readableFiles`。

### 14.4 `LECTURE_STEP_SECTION_NOT_FOUND`

原因：Lesson 的 `lectureSectionId` 在讲义中不存在。  
处理：核对 H2/H3 的稳定 ID，避免用标题文字代替 ID。

### 14.5 `LECTURE_TASK_LINK_NOT_FOUND`

原因：讲义 `task-link` 引用了不存在的 `stepId`。  
处理：修复链接；不要创建仅用于链接的虚假任务。

### 14.6 图片无效

常见原因：

- 图片不在 `./assets/`；
- 超过 2 MiB；
- 扩展名与真实格式不一致；
- 使用远程 URL、Data URL 或父目录；
- SVG 含脚本或外部资源。

### 14.7 Progress 兼容失败

原因：新版实验合同与旧版已不同，却仍声明兼容。  
处理：删除对应 `progressCompatibleFrom` 项；不要修改哈希掩盖变化。

### 14.8 Learning 兼容失败

原因：旧版 H2 Section ID 在新版被删除或改名。  
处理：恢复稳定 ID，或删除对应 `learningCompatibleFrom` 项。

## 15. 发布检查表

### 教学

- [ ] 受众、目标、前置知识和预计时间明确；
- [ ] 每个目标都能由操作、构建、问题或观察验证；
- [ ] 任务按学习顺序排列；
- [ ] 不依赖隐藏标准答案；
- [ ] AI 提示促进学生判断而不是代做。

### 工程与安全

- [ ] 独立模板存在且可构建；
- [ ] `editableGlobs` 最小化；
- [ ] 只读适配层和底层固件受保护；
- [ ] `fileTarget`、`code-target` 指向真实可见路径；
- [ ] Workspace 写入、AI Candidate、Firmware 和 Flash 证据均与当前 Workspace 绑定；
- [ ] 硬件课已完成真机门禁。

### 讲义

- [ ] 每个 H2 有稳定 Section ID；
- [ ] `lectureSectionId` 和 `task-link` 均可解析；
- [ ] 图片离线、安全、有准确 Alt Text；
- [ ] 没有 HTML、MDX、脚本或远程必需资源；
- [ ] Safety 块准确描述供电、接线和运动风险。

### 版本与交付

- [ ] 已发布内容变更提升了 `contentVersion`；
- [ ] Progress 和 Learning 兼容分别判断；
- [ ] 当前 `content-vN.json` 与资源一致；
- [ ] 课程版本固定断言已同步；
- [ ] `git diff --check` 通过；
- [ ] `npm run courses:validate` 通过；
- [ ] `npm run typecheck` 通过；
- [ ] `npm test` 通过；
- [ ] 自动 Smoke、人工 UI 和真机检查按风险完成。

## 16. 最小交付原则

一节高质量课程应把复杂度放在课程数据和真实教学设计中，而不是增加新的页面分支。优先复用现有 Course Center、Lesson、Lab Guide、StudentCodeEditor、Candidate、Bottom Panel、Floating AI 和 Main 服务。

只有当新课程需要当前数据模型无法表达的可信教学行为时，才修改共享类型、IPC 或界面组件；此时必须先说明为什么现有 Step、Completion Check、Lecture Directive 和权限模型不足。
