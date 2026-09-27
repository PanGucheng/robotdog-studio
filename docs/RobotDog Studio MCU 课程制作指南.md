# RoboHorse Studio 课程制作与发布指南

更新日期：2026-09-27  
适用系统：RoboHorse Studio（支持 MCU Foundations 与 TI MSPM0 Foundations 两套硬件体系）  
当前参考课程：
- `ch32v203-foundations`（CH32V203 RISC-V 架构，当前 `contentVersion: 10`）
- `ti-mspm0-gpio-foundations`（MSPM0G3507 ARM Cortex-M0+ 架构，当前 `contentVersion: 1`）

---

## 1. 指南目标

本指南用于在 RoboHorse Studio 中新增、维护与发布 MCU / TI 实验课程、课次、受控讲义和学生实验工程。完成一节合格可发布的课程，必须同时交付并满足：

1. **课程目录登记**（`catalog.json`）；
2. **Course Manifest**（`course.json`，声明课程全局身份、`contentVersion` 与课次顺序）；
3. **Lesson Manifest**（`lessons/<lessonId>.json`，定义权限、任务流、验收条件与 AI 教学约束）；
4. **独立学生工程模板**（`workspace-templates/...`，包含合法可编译的骨架）；
5. **受控 Lecture Markdown**（`lectures/<lessonId>/lecture.md`，使用白名单 Directive 与受限语法）；
6. **必要的离线本地图片**（`lectures/<lessonId>/assets/*`）；
7. **内容版本与指纹冻结**（`compatibility/content-v<N>.json` 与兼容快照）；
8. **自动化测试与门禁验证**（`npm run courses:validate`、`npm test`）；
9. **硬件课真机验证记录**（严格满足硬件验证发布门禁）；
10. **远程更新打包发布**（发布至 Gitee `robohorse-courses` 远程仓库）。

> [!IMPORTANT]
> 课程不是简单的富文本展示。Lesson 中的文件权限、任务步骤、完成条件与 AI 上下文会直接联动 Main 核心服务、学生受控工作区、固件编译工具链、AI Candidate 补丁、Flash 烧录与学习进度状态机。

---

## 2. 权威规则与优先级

遇到文档与代码逻辑不一致时，按以下优先级判断：

1. [`CourseService`](../src/main/services/course-service.ts) 中的 Zod Schema 和关联安全校验；
2. [`CourseLectureParser`](../src/main/services/course-lecture-parser.ts) 的 Lecture 白名单解析规则；
3. [`LessonLearningProgressStore`](../src/main/services/lesson-learning-progress-store.ts) 的阅读进度与版本指纹校验；
4. 校验脚本：[`validate-mcu-courses.ts`](../scripts/validate-mcu-courses.ts) 与 [`validate-ti-mspm0-course.ts`](../scripts/validate-ti-mspm0-course.ts)；
5. 本指南；
6. 其他历史设计文档。

---

## 3. 课程运行与分发架构

RoboHorse Studio 课程采用 **本地内置（Bundled） + 远程热更新（Remote Gitee） + 本地持久缓存（UserData）** 的三层架构：

```text
Gitee 远程仓库 (robohorse-courses)
  ├─ update.json (schemaVersion: 2)
  └─ courses/<editionId>/course.zip
        │ (后台检查更新 / 手动检查更新)
        ▼
客户端本地缓存 (%APPDATA%/robotdog-studio/courses/<editionId>/)
  ├─ current/   <--- 解压后的最新课程
  └─ state.json <--- 当前缓存版本号
        │ (优先使用)
        ├────────────────────────┐
        ▼                        ▼ (无缓存时回退)
CourseResolver          安装包自带内置课程 (resources/courses/<editionId>/)
        │
        ▼
CourseService (Main 进程解析)
  ├─ 课程中心展示 (Course Center)
  ├─ 讲义安全渲染 (Safe Lecture Document)
  ├─ 学生受控工作区权限 (Workspace / Candidate Policy)
  ├─ 实验步骤流与完成证据 (Lab Guide Stepper)
  ├─ 讲义问答可信上下文 (Course AI Context)
  └─ 学习进度与指纹防篡改 (LessonLearningProgressStore)
```

---

## 4. 目录结构与版本隔离

### 4.1 源码开发仓库（`RobotDog_Studio`）

```text
RobotDog_Studio/
├─ resources/
│  ├─ courses/
│  │  ├─ mcu-foundations/             # MCU (CH32V203) 课程内置资源
│  │  │  ├─ catalog.json
│  │  │  └─ ch32v203-foundations/
│  │  │     ├─ course.json            # contentVersion: 10
│  │  │     ├─ lessons/*.json
│  │  │     ├─ lectures/<lessonId>/lecture.md
│  │  │     └─ compatibility/content-v*.json
│  │  │
│  │  └─ ti-mspm0-foundations/         # TI MSPM0 课程内置资源
│  │     ├─ catalog.json
│  │     └─ ti-mspm0-gpio-foundations/
│  │        ├─ course.json            # contentVersion: 1
│  │        ├─ lessons/*.json
│  │        ├─ lectures/<lessonId>/lecture.md
│  │        └─ compatibility/content-v*.json
│  │
│  └─ workspace-templates/
│     ├─ ch32v203-mcu-lessons/        # MCU 课次代码模板
│     └─ ti-mspm0-lessons/            # TI 课次代码模板
```

### 4.2 远程发布仓库（`robohorse-courses`）

两套课程共用同一个 Gitee 仓库（`https://gitee.com/Cidervinegar/robohorse-courses`），通过目录完全隔离：

```text
robohorse-courses/
├── courses/
│   ├── mcu-foundations/
│   │   └── course.zip                # MCU 课程发布压缩包
│   └── ti-mspm0-foundations/
│       └── course.zip                # TI MSPM0 课程发布压缩包
├── source/
│   ├── mcu-foundations/              # MCU 课程源码（与 resources 同步）
│   └── ti-mspm0-foundations/         # TI MSPM0 课程源码（与 resources 同步）
├── scripts/
│   └── publish-course.cjs            # 多版本一键打包脚本
├── update.json                       # 多版本清单 (schemaVersion: 2)
└── course.zip                        # 根目录软兼容老客户端
```

---

## 5. 核心机制：版本一致性与内容指纹（极其重要）

### 5.1 为什么会报“课程资源版本一致性异常”？

在开发或修改课程时，你可能会遇到如下警告：

> ⚠️ **课程资源版本一致性异常**  
> 正文仍可阅读，但完成记录已暂停写入。请让课程维护者检查 contentVersion。

#### 底层原理

1. **讲义摘要（`documentDigest`）**：
   讲义在解析时，系统会对其 Markdown 文本计算 SHA-256 哈希作为 `documentDigest`：
   $$\text{documentDigest} = \text{SHA256}(\text{normalizedLectureMarkdown})$$
2. **学生阅读记录持久化**：
   当学生或开发者在客户端打开某课并阅读章节时，`LessonLearningProgressStore` 会在用户数据目录下写入进度快照：
   `%APPDATA%/RobotDogStudio-MCU/managed-data/lesson-learning-progress/<courseId>--<lessonId>--v<contentVersion>.json`
   快照内容包含：
   ```json
   {
     "schemaVersion": 1,
     "courseId": "ch32v203-foundations",
     "lessonId": "first-program-on-chip",
     "contentVersion": 9,
     "documentDigest": "c9c6bf447b0c8146ca80a2508df0b4862aea072cc1329d220591a00abd9e5735",
     "completedSectionIds": ["introduction", "..."]
   }
   ```
3. **版本一致性拦截**：
   当该课次被重新打开时，系统会核对：
   $$\text{stored.documentDigest} \stackrel{?}{==} \text{document.documentDigest}$$
   **如果课程维护者修改了讲义正文、重构了章节结构，却没有递增 `course.json` 中的 `contentVersion`**：
   - 磁盘上的讲义生成了**新的** `documentDigest`；
   - 本地已记录的进度文件仍然存着**旧的** `documentDigest`；
   - 系统判定：**同版本课程内容被偷偷篡改（指纹不匹配）**！
   - 系统立即置位 `integrityError: true`，并在保存阅读进度时抛出 `LESSON_LEARNING_RESOURCE_INTEGRITY_ERROR`，**拒绝将已读状态写入不一致的资源中**！

### 5.2 黄金法则：修改已发布讲义必须提升 `contentVersion`

> [!CAUTION]
> **绝对禁止在保持 `contentVersion` 不变的情况下直接修改讲义并覆盖同版本的 `content-vN.json`！**  
> 任何对已发布课程正文、章节 ID、任务条件、图片资源的变动，必须通过**递增 `contentVersion`** 进行正式发布。

### 5.3 正式课程内容更新的标准流程（例如 v9 升至 v10）

1. **修改 `course.json`**：
   将 `contentVersion` 由 `9` 改为 `10`。
2. **评估历史兼容性**：
   - **`progressCompatibleFrom`**：如果实验任务、步骤 ID、完成条件没有破坏性变化，学生原有的实验工程进度可继承，则将旧版本加入数组（如 `[9]`）；若任务结构发生剧烈调整，则留空 `[]`。
   - **`learningCompatibleFrom`**：如果旧版的 H2 `sectionId` 在新版中依然完整保留，阅读记录可继承，则将旧版本加入数组；如果章节大幅重构、删改了原有 H2，则留空 `[]`。
3. **保留旧版快照，生成新版指纹**：
   - 保持 `compatibility/content-v9.json` **原样不变**（作为历史版本的冻结指纹）。
   - 运行指纹打印命令：
     ```powershell
     $env:ROBOTDOG_PRINT_COURSE_FINGERPRINT='1'
     npm run courses:validate
     Remove-Item Env:ROBOTDOG_PRINT_COURSE_FINGERPRINT
     ```
   - 将打印出的 JSON 内容保存为新文件：
     `compatibility/content-v10.json`
4. **运行校验**：
   ```powershell
   npm run courses:validate
   ```
   必须输出 `MCU_COURSES_OK` / `TI_MSPM0_COURSE_OK`。
5. **同步单元测试**：
   检查并更新测试断言（如 [`src/main/services/course-service.test.ts`](../src/main/services/course-service.test.ts) 中的 `contentVersion` 与 `templateVersion: 'content-v10'`）。

### 5.4 课程开发调试小窍门（本地草稿重置）

如果你在本地开发**草稿（Draft）课次**或调试讲义时，反复修改文本导致本地旧的进度快照产生了指纹冲突，而你暂时还不想频繁递增正式版本号：
- 直接删除用户数据目录下的对应进度文件即可彻底重置：
  ```powershell
  # MCU 版本
  Remove-Item "$env:APPDATA\RobotDogStudio-MCU\managed-data\lesson-learning-progress\<courseId>--<lessonId>--v*.json"
  
  # TI 版本
  Remove-Item "$env:APPDATA\RobotDogStudio-TI-MSPM0\managed-data\lesson-learning-progress\<courseId>--<lessonId>--v*.json"
  ```
- 重新在客户端中打开该课，系统会自动按当前最新讲义指纹创建全新的进度记录。

---

## 6. Manifest 规范与字段约束

### 6.1 Course Manifest (`course.json`)

```json
{
  "schemaVersion": 1,
  "courseId": "ch32v203-foundations",
  "contentVersion": 10,
  "title": "CH32V203 单片机入门",
  "summary": "从零认识单片机和开发板，逐步学会编译、写入并观察真实硬件现象。",
  "audience": "电子类专业大学低年级学生",
  "objectives": [
    "理解单片机、开发板、程序、编译和写入之间的基本关系",
    "能够在受保护的工程范围内修改并验证 C 代码"
  ],
  "status": "published",
  "boardScope": "CH32V203 RHS 机器马教学开发板",
  "lessonOrder": [
    "first-program-on-chip"
  ],
  "progressCompatibleFrom": [],
  "learningCompatibleFrom": [],
  "sourceAttribution": [
    "Robot Horse Studio（RHS）CH32V203 固件基线与学生工作区模板"
  ]
}
```

- `courseId`：全局唯一 kebab-case ID。MCU 课程以 `ch32` 开头，TI 课程以 `ti-mspm0` 开头。
- `contentVersion`：整门课程的单调递增整数版本。
- `status`：`draft | published`。正式发布前必须通过硬件真机验证门禁。

### 6.2 Lesson Manifest (`lessons/<lessonId>.json`)

```json
{
  "schemaVersion": 1,
  "courseId": "ch32v203-foundations",
  "lessonId": "first-program-on-chip",
  "title": "第一课：认识单片机，让 LED 闪起来",
  "summary": "从零认识单片机、开发板和程序，修改 LED 闪烁时间并烧录验证。",
  "objectives": [
    "理解单片机与程序控制硬件的基本关系",
    "找到并修改 blink_period_ms"
  ],
  "prerequisites": [],
  "estimatedMinutes": 60,
  "hardware": "required",
  "verification": "hardware-checked",
  "expectedObservation": "PB8 LED 按修改后的 100 ms 或 1000 ms 明显闪烁。",
  "templateId": "first-program-on-chip",
  "editableGlobs": [
    "App/Src/experiment.c"
  ],
  "readableFiles": [
    "App/Inc/experiment.h",
    "README.md"
  ],
  "deniedGlobs": [
    "Core/**",
    "Startup/**",
    "Ld/**"
  ],
  "steps": [
    {
      "stepId": "read-intro",
      "type": "read",
      "title": "认识单片机",
      "instruction": "阅读讲义，理解单片机基本概念。",
      "lectureSectionId": "introduction"
    },
    {
      "stepId": "edit-code",
      "type": "edit",
      "title": "修改闪烁时间",
      "instruction": "打开 App/Src/experiment.c 修改参数。",
      "fileTarget": { "path": "App/Src/experiment.c", "line": 5 }
    },
    {
      "stepId": "build-firmware",
      "type": "firmware-build",
      "title": "编译完整程序",
      "instruction": "执行编译，确认产物正常生成。"
    },
    {
      "stepId": "flash-board",
      "type": "flash",
      "title": "写入开发板",
      "instruction": "烧录固件到开发板。"
    },
    {
      "stepId": "observe-led",
      "type": "hardware-observation",
      "title": "观察 LED 现象",
      "instruction": "确认 LED 闪烁周期发生改变。"
    },
    {
      "stepId": "reflect-chain",
      "type": "question",
      "questionId": "validation-chain",
      "title": "思考与反思",
      "instruction": "解释程序写入开发板的过程。"
    }
  ],
  "completionChecks": [
    { "type": "student-change-applied", "target": "App/Src/experiment.c" },
    { "type": "firmware-build-passed" },
    { "type": "flash-succeeded" },
    { "type": "manual-observation-confirmed", "target": "observe-led" },
    { "type": "question-answered", "target": "validation-chain" }
  ],
  "reflectionQuestions": [
    { "questionId": "validation-chain", "prompt": "为什么修改代码后开发板不会立刻改变？" }
  ],
  "aiContext": {
    "teachingFocus": "聚焦于引导零基础学生定位代码参数，不直接提供完整代码答案。",
    "hints": [
      "先在 App/Src/experiment.c 中找到周期变量",
      "一次只修改一个参数"
    ]
  },
  "status": "published"
}
```

#### Step 类型与验收映射

| Step `type` | 含义 | 对应的 CompletionCheck |
| :--- | :--- | :--- |
| `read` | 讲义/代码阅读步骤 | 手动点击下一步推进 |
| `edit` | 学生编辑代码 | `student-change-applied`（自动检测文件保存） |
| `firmware-build` | 编译完整固件 | `firmware-build-passed`（构建产物校验通过） |
| `flash` | 烧录固件到板卡 | `flash-succeeded`（编程器烧录成功） |
| `hardware-observation` | 硬件现象观察 | `manual-observation-confirmed`（学生勾选确认） |
| `serial-observation` | 串口数据观察 | `manual-observation-confirmed`（学生勾选确认） |
| `question` | 问答反思 | `question-answered`（提交非空回答） |
| `summary` | 课次小结 | 手动点击推进 |

---

## 7. Lecture Markdown 受控语法

讲义固定路径为 `lectures/<lessonId>/lecture.md`，限制大小不超过 256 KiB。

### 7.1 必须包含合法的 H2 章节 ID

H2 是阅读进度计算的核心单元，必须以字母开头并具备唯一 ID：
```markdown
## 1. 认识单片机 {#introduction}

正文...

## 2. 编写第一个程序 {#first-program}

正文...
```

### 7.2 白名单 Directive

仅允许使用以下 7 个受控指令（禁止嵌套）：

```markdown
:::concept[核心概念名称]
阐述重要的单片机基础理论概念。
:::

:::note
一般的补充说明。
:::

:::tip
给出实操调试的建议或排错技巧。
:::

:::pitfall[易错警示]
学生经常踩坑的错误模式说明。
:::

:::safety[安全第一]
强调用电安全、引脚短路风险或机械运动防护。
:::

::code-target[打开源码]{path="App/Src/experiment.c" line="1"}

::task-link[开始编译实验]{step="build-firmware"}
```

### 7.3 本地离线图片规范

- 图片必须存放在当前讲义目录下的 `assets/` 目录中；
- 仅支持 `.png`, `.jpg`, `.jpeg`, `.svg`；
- 单张图片不得超过 2 MiB；
- 严禁使用外链 HTTP/HTTPS 图片、Data URL 或绝对路径。

---

## 8. 打包与远程发布工作流

在 `D:\RobotDog\robohorse-courses` 仓库中进行多版本发布：

```bash
# 1. 仅发布 MCU 课程 (递增版本号并打包 courses/mcu-foundations/course.zip)
node scripts/publish-course.cjs mcu-foundations

# 2. 仅发布 TI MSPM0 课程 (递增版本号并打包 courses/ti-mspm0-foundations/course.zip)
node scripts/publish-course.cjs ti-mspm0-foundations

# 3. 全量发布所有版本
node scripts/publish-course.cjs all

# 可选标志：
# --no-bump  重新打包但不递增 update.json 版本号
# --init     首次初始化版本号为 1
```

发布后，提交并推送到 Gitee：
```bash
git add .
git commit -m "feat(course): release updated mcu foundations v10"
git push origin master
```

---

## 9. 门禁验证与检查清单

在提交任何课程修改前，依次运行以下自动化验证：

```powershell
# 1. 校验课程 Schema、模板、指纹与讲义有效性
npm run courses:validate

# 2. 运行离线单元测试
npm test

# 3. 运行在线 Gitee 课程更新拉取测试（需网络）
npm run test:course-update:live

# 4. 运行 MCU 与 TI 平台完整 Electron 冒烟测试
npm run smoke:electron:mcu
npm run smoke:electron:ti

# 5. 全量检查（包含构建）
npm run check
```

### 终审检查清单

- [ ] `course.json` 的 `contentVersion` 已正确递增；
- [ ] `compatibility/content-v<N>.json` 与当前讲义和 Manifest 指纹完全一致；
- [ ] 讲义所有 H2 均携带合法且稳定的 `{#section-id}`；
- [ ] 课次引用的代码模板存在于 `workspace-templates/` 下且能正常构建；
- [ ] 硬件课程满足真机验证门禁，非 Draft 状态课次必须为 `verification: hardware-checked`；
- [ ] `courses:validate` 与全套自动化测试 100% 通过。
