# RobotDog Studio 单片机课程讲义系统详细开发计划

状态：Lecture v1 软件切片已实施；前两节无硬件课已接入，第三课继续等待真机验证

## 1. 目标与边界

本计划为 RobotDog Studio 单片机入门版增加正式课程讲义。讲义是课程内部的知识层，不增加第四个主工具；MCU 工作台继续保持：

```text
工程目录 | 代码主区 | 课程 / 构建与运行 / AI 助教
```

“课程”内部增加“任务 / 讲义”。普通阅读时代码仍可见，专注阅读只扩大同一个课程面板，编辑器继续挂载，不丢失当前文件、光标、草稿和工程树状态。

本阶段不建设搜索、视频、互动组件、测验、CMS、LMS、历史课程完整运行时或正式全套教材。只为当前两节无硬件示例课准备足够验证系统的短讲义；第三课继续保持 `draft + pending-hardware-check`。

日常开发只执行类型检查、课程校验、自动化和必要的开发模式回归。除非用户明确要求，不执行 ZIP、NSIS 或其他打包命令。

## 2. 单一解析架构

RobotDog Lecture Markdown 只在 Main 中解析一次：

```text
lecture.md
    ↓
Main Parser + Validation
    ↓
Safe Lecture Model
    ├─ Renderer
    └─ AI Context
```

Renderer 不接收讲义 Markdown 原文，也不使用 `react-markdown` 再次解释讲义。Safe Lecture Model 仅包含白名单节点：标题、段落、列表、引用、代码、数学、表格、分隔线、教学提示、代码定位、任务定位以及受控的行内文本格式。

模型包含课程和课次身份、`contentVersion`、文档摘要、章节、受控 Asset 引用、代码反向索引和任务索引。Markdown 原文只用于 Main 开发诊断；正常 IPC 仅返回安全模型和稳定错误信息。

## 3. 固定资源布局

讲义位置由课程和课次身份唯一推导，不在 Lesson Manifest 中增加 `lecturePath`：

```text
resources/courses/mcu-foundations/ch32v203-foundations/
├─ course.json
├─ lessons/<lessonId>.json
├─ compatibility/progress-v2.json
└─ lectures/<lessonId>/
   ├─ lecture.md
   └─ assets/
      ├─ *.png
      ├─ *.jpg
      ├─ *.jpeg
      └─ *.svg
```

Lesson Step 只增加真正的课程关系字段：

```ts
lectureSectionId?: string
```

课程目录和 Lesson 基本信息加载不能解析 Lecture。只有 `getCourseLecture(courseId, lessonId)` 才独立加载指定讲义。一课讲义损坏只影响该讲义，不能阻止课程中心、其他课次、Workspace、代码、构建或 AI 启动；开发期 `courses:validate` 仍严格解析全部讲义并在错误时失败。

## 4. RobotDog Lecture Markdown v1

格式细则见 [RobotDog Lecture Markdown v1](./robotdog-lecture-markdown-v1.md)。核心规则为：

- CommonMark、必要 GFM、数学公式、显式章节 ID 和七种白名单 Directive；
- H2 必须使用末尾 `{#stable-id}`；H3 被引用时必须有显式 ID；
- 只实现窄化 `{#id}`，不启用任意 Markdown Attribute；
- 只允许 `concept`、`note`、`tip`、`pitfall`、`safety`、`code-target`、`task-link`；
- v1 禁止 Directive 嵌套；
- 禁止 Raw HTML、MDX、JSX、脚本、Front Matter、任意组件和未知属性；
- 图片完全离线并位于本课 `assets` 目录；外部参考链接只允许 HTTPS；
- 数学渲染使用非信任模式，失败时安全降级。

## 5. v2→v3 兼容策略

课程 `contentVersion` 从 2 增至 3。本次升级被定义为纯增量兼容升级：前两节已经发布并可创建 Workspace 的课次，其原有教学语义必须完全不变。兼容快照验证课程和课次的原有字段，包括步骤顺序、标题、说明、问题、文件定位、完成条件、权限边界和 AI 教学上下文；v3 只允许新增 Lecture、Asset、`lectureSectionId` 和不影响原完成语义的关系索引。

课程级 `progressCompatibleFrom: [2]` 表示所有 v2 正式可用课次都通过兼容校验。任意一节不兼容时，整个课程不得声明 v2→v3 compatible；当时仍为 draft、从未开放的课次不参与承诺。

旧 Workspace 显示：

> 此练习基于课程 v2，当前课程已更新至 v3。讲义为最新版参考，不会升级当前练习。

旧 Workspace 可以继续使用原代码、Git、编译、构建、烧录、步骤、问题、AI 教学重点和完成规则。最新版讲义不得改变旧进度。

课程进度文件升级为 schema v2，并保存精简的唯一事实源：

```ts
CourseProgressContract {
  schemaVersion
  contentVersion
  steps: [{ stepId, type, questionId? }]
  completionChecks
}
```

问题 ID 和观察步骤由 `steps` 推导，不重复保存。现有 schema v1 进度依据已经通过兼容校验的 v3 Lesson 迁移，原进度值和学生代码不变。

## 6. Asset 与数学安全

Markdown 图片路径只在 Main 内部存在。Main 校验和解析相对路径后，为当前 Lecture Document 签发不透明 `assetId`；Renderer 只接收 `{ assetId, alt, title }`，并通过 `courseId + lessonId + documentDigest + assetId` 请求资源，不提交课程文件路径。

图片仅允许 PNG、JPEG 和 SVG。必须校验路径、实际 MIME、扩展名、大小和存在性。SVG 拒绝脚本、事件属性、DOCTYPE、`foreignObject`、嵌入对象、外部引用和外部 `url()`，并始终作为 `<img>` 资源显示，不能 inline 注入 DOM。

数学节点由 Main 确认为行内或块级数学。Renderer 使用锁定版本 KaTeX，并强制非信任模式；公式不得生成主动外链、外部资源、任意 HTML 或样式注入。失败时显示转义后的公式源码，不影响其他讲义内容。

## 7. 课程阅读体验

课程工具顶部保留课名和进度，并增加“任务 / 讲义”分段切换。讲义视图显示当前版或“最新版参考”、章节目录、正文、上一节/下一节、专注阅读以及相关任务、代码和 AI 操作。

专注阅读采用视口自适应宽度，可以覆盖或占用部分代码空间，但不固定像素；StudentCodeEditor 和 Monaco 始终保持挂载。视觉继续采用浅色 MCU 工程台，使用具有真实章节顺序的实验手册索引作为唯一显著设计元素，不增加大面积黑色背景、卡片堆叠或默认浏览器按钮。

状态分开保存：

```text
Workspace UI → workspaceId
Lecture UI   → workspaceId + displayedLectureContentVersion
```

Lecture UI 包含当前章节、滚动位置、手动已读章节和专注阅读状态。v2 Workspace 阅读 v3 Lecture 时使用 `workspaceId + 3`，以后不会把 v3 位置错误恢复到 v4。

## 8. 任务、代码和阅读完成

任务中的两个动作严格解耦：

```text
[阅读相关讲义] → 只改变右侧 Lecture
[定位代码]     → 只改变中央 Editor
```

只有学生明确点击任务“定位代码”、讲义 `code-target` 或编译诊断定位时，中央文件才变化。`task-link` 只返回并突出任务，不完成任务。`code-target` 继续通过 Project Explorer 校验并复用父目录自动展开。

Safe Lecture Model 根据 `code-target` 建立反向索引；当前编辑文件存在映射时，课程工具显示“相关讲义”。

绑定 Lecture 的 `read` Step 使用新的受控更新：

```ts
{ kind: 'lecture-read', stepId, sectionId, lectureContentVersion, completed }
```

Main 必须验证 Workspace 版本、Step 类型、`lectureSectionId`、文档版本和章节身份。对当前版本的 lecture-bound read Step，通用 `kind: 'step'` 更新必须拒绝；完成和取消完成都只能从对应讲义章节执行。v2 Workspace 保留原通用勾选方式，最新版讲义不显示能够改变 v2 进度的阅读确认。

## 9. 讲义与 AI

Renderer 不提交可信选文，而提交文档内范围：

```ts
LectureSelectionRange {
  documentDigest
  sectionId
  start: { textNodeId, offset }
  end: { textNodeId, offset }
}
```

`textNodeId` 只需在同一份已解析 Document 内唯一，不保证跨重新解析或跨 `contentVersion` 稳定；跨版本稳定的只有 `sectionId`。Main 重新加载权威文档、验证 digest、节点和 offset，并从 Safe Model 重建选文。旧范围失效时要求重新选择。

“选中讲义 → 问 AI”使用独立只读 Agent，不创建 Candidate、不修改代码、不调用构建、不提出编辑审批，也不让构建面板产生失败候选。普通 `promptAgent` 不做大范围重构，只允许向后兼容的可选章节引用。

讲义和现有课程上下文共享 8,000 字符总预算。优先级依次为课程身份、硬件与安全状态、当前步骤与权限、显式选文、教学重点、章节正文、普通 hints。章节最多提供 4,000 字符候选，显式选文最多 1,000 字符；实际注入量使用基础上下文的剩余空间。

AI 模型继续固定为 `deepseek-v4-flash`。

## 10. 实施阶段

1. 冻结本计划、格式规范、共享类型、IPC、迁移和错误码；
2. 实现 Main Safe Lecture Parser 和序列化模型；
3. 实现固定目录 Lazy Load、Asset ID、SVG/MIME/大小校验；
4. 将课程校验调整为复用同一 TypeScript Parser；
5. 实现 v2 兼容快照、课程级声明和进度 Contract 迁移；
6. 增加 Lecture、Asset、HTTPS、lecture-read 和只读讲义问答 IPC；
7. 实现任务/讲义界面、章节导航、专注阅读和状态恢复；
8. 实现任务/代码动作解耦、code→lecture 和 Main 强制阅读确认；
9. 实现安全选区、只读 AI 和统一上下文预算；
10. 为两节无硬件课补短讲义，保持第三课硬件门禁；
11. 完成自动化、开发模式回归、人工验收要求和发布资源检查。

## 11. 验收

自动化至少覆盖：Safe Model 白名单、Heading ID、七种 Directive、Raw HTML/MDX、数学非信任模式、Asset ID、危险 SVG、Lazy Load、关系校验、v2 兼容快照、进度迁移、Main 拒绝通用 read 勾选、阅读状态版本键、选区失效、只读 AI 和 8,000 字符预算。

开发完成后执行：

```text
corepack pnpm typecheck
corepack pnpm test
corepack pnpm courses:validate
MCU Electron smoke
```

人工复核要求见后续交付清单，重点验证任务/讲义和代码动作解耦、专注阅读状态、旧 Workspace 提示、lecture-read、选中讲义问 AI、离线资源、缩放和第三课硬件门禁。

## 12. 实施记录（2026-08-10）

- [x] Main 单一 Parser、Safe Lecture Model、窄化 Heading ID、Directive 白名单和错误隔离；
- [x] 固定讲义目录、Lazy Load、opaque Asset ID、MIME/大小/危险 SVG 校验；
- [x] `contentVersion` 3、课程级 `progressCompatibleFrom: [2]`、v2 兼容快照和进度 Contract 迁移；
- [x] lecture-bound read 的 Main 强制语义，v2 Workspace 保留旧完成方式；
- [x] 任务/讲义切换、章节导航、专注阅读、版本化阅读位置、代码反向索引和动作解耦；
- [x] Safe Model Renderer、非信任 KaTeX、受控 HTTPS 与图片加载；
- [x] Main 重建选区、只读讲义问答和共享 8,000 字符预算；
- [x] 两节无硬件课短讲义、浏览器演示 Safe Model、发布资源完整性检查；
- [x] TypeScript 课程校验复用运行时 CourseService 与 Parser；
- [ ] 第三课真实硬件复核、讲义编写与发布。该项不属于本轮无硬件软件切片，不得用模拟结果关闭。

本轮不执行 ZIP、NSIS 或安装包构建。自动化结果与人工复核入口记录在[讲义系统人工复核清单](./manual-review-mcu-lecture-system.md)。
