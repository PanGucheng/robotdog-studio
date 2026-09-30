# 单片机课次编写与硬件验证清单

更新日期：2026-09-30

适用范围：RoboHorse Studio 单片机入门版新增或修改课次。该流程面向小范围教学与个人维护，保留必要安全门禁，不建设复杂审批系统。

## 1. 新增普通无硬件课

1. 在课程 `course.json` 的 `lessonOrder` 中登记稳定 `lessonId`。
2. 复制课次 manifest 骨架，填写真实目标、步骤、预计时间、前置课和思考题。
3. 在 `resources/workspace-templates/ch32v203-mcu-lessons/<templateId>` 创建完整独立模板。
4. 只把教学文件放入 `App/Src`、`App/Inc`；安全适配层放入 `Core` 并保持只读。
5. 为课次填写最小的 `editableGlobs`、`readableFiles`、`deniedGlobs`，不能开放启动、链接、Bootloader、Flash 或通信配置。
6. 需要从课程工具定位代码时，为步骤填写 `fileTarget: { "path": "受控工程相对路径", "line": 1 }`。目标必须是本课登记的教学/参考文件，或工程树允许展示的基线文件；隐藏目录和未展示路径会使课程加载失败。
7. 使用固定完成检查：文件存在、指定教学文件已应用修改、候选编译、完整构建、问题回答。问题步骤必须填写对应 `questionId`，人工观察检查必须填写对应观察步骤的 `stepId`；不要加入脚本或标准答案逐字比较。
8. 递增课程唯一的 `contentVersion`，运行 `npm run courses:validate`、相关测试和 MCU 冒烟。
9. 正式课在固定目录 `lectures/<lessonId>/lecture.md` 维护讲义，并遵守 [讲义受控 Markdown 规范](./lecture-markdown.md)；图片只放在本课 `assets/`，不得在 Lesson 中配置自由路径。

课程 manifest 中的两个兼容字段必须独立判断：

- `progressCompatibleFrom`：旧版 Lab 的 `stepId`、`type`、`questionId` 和完成条件仍兼容；
- `learningCompatibleFrom`：旧版 Lecture 的顶层 H2 Section ID 仍可继承学习完成记录。

只改讲义文字不代表实验兼容，实验未改也不代表讲义兼容。修改已发布内容必须提升 `contentVersion` 并更新兼容快照；`courses:validate` 会拒绝同版本内容摘要变化。

Lecture v1 只有 H2 是学习完成单元，H3 只是章节内部结构。不要为了制造更多进度点拆分 H3。Lab 中的 `read` 表示阅读/观察工程代码或配置，不表示正式讲义阅读；已发布步骤不得改成 `inspect`。未来未发布的新课可使用 `inspect` 作为更明确的工程观察类型。

## 2. 课次 manifest 骨架

```json
{
  "schemaVersion": 1,
  "courseId": "ch32v203-foundations",
  "lessonId": "stable-lesson-id",
  "title": "课次名称",
  "summary": "学生将在本课完成什么",
  "objectives": ["可观察的学习目标"],
  "prerequisites": [],
  "estimatedMinutes": 60,
  "hardware": "none",
  "verification": "not-required",
  "expectedObservation": "编译或代码层面可确认的结果",
  "templateId": "stable-lesson-id",
  "editableGlobs": ["App/Src/experiment.c", "App/Inc/experiment.h"],
  "readableFiles": ["Core/Src/student_control.c", "README.md"],
  "deniedGlobs": ["Core/**", "Startup/**", "Ld/**"],
  "steps": [
    { "stepId": "edit-example", "type": "edit", "title": "修改示例", "instruction": "完成一个小修改", "fileTarget": { "path": "App/Src/experiment.c", "line": 1 } },
    { "stepId": "reflect-example", "type": "question", "questionId": "why-example", "title": "总结", "instruction": "说明修改原因" }
  ],
  "completionChecks": [
    { "type": "student-change-applied", "target": "App/Src/experiment.c" },
    { "type": "question-answered", "target": "why-example" }
  ],
  "reflectionQuestions": [{ "questionId": "why-example", "prompt": "为什么这样修改？" }],
  "aiContext": { "teachingFocus": "本课提示边界", "hints": [] },
  "status": "draft"
}
```

## 3. 引用 EVT 示例时的来源记录

每个硬件课必须在课程说明或对应检查记录中写明：

- EVT 根目录与所用示例的精确相对路径；
- 文件可见版本、版权头和许可证提示；
- 使用的官方 API、时钟和初始化顺序；
- 官方参考板引脚与 RobotDog 板目标引脚的差异；
- 哪些内容只用于理解，哪些代码经过改写后进入教学模板。

不得修改 `D:\RobotDog\EVT`，不得把整个 EVT 复制进发行包，也不得把官方参考板现象直接写成 RobotDog 实物现象。当前已审查示例与差异见 [EVT 来源审查](../archive/2026-08/mcu-evt-source-audit.md)。

## 4. 硬件课发布门禁

硬件课在完成真机验证前必须保持：

```text
status: draft
verification: pending-hardware-check
```

系统在 `scripts/validate-mcu-courses.ts` 中设有自动化硬门禁：**凡 `hardware === 'required'` 且 `status === 'published'` 的课次，必须具备 `verification === 'hardware-checked'`**，否则门禁直接报错中断发布。

真机验证检查清单：

- [ ] 目标芯片、板卡版本和原理图对应一致；
- [ ] 引脚复用、时钟、调试口、CCD、运动控制和通信占用已核对；
- [ ] 供电、电平、接线方向和运动风险已评估；
- [ ] 候选预检、完整固件、程序资源阈值和离线包构建通过；
- [ ] WCH-Link 或目标下载方式真实烧录成功；
- [ ] 复位后的实际现象与课程描述一致；
- [ ] 拔线、错误接线、错误目标、取消和急停/断电恢复至少覆盖相关项；
- [ ] 一个正确示例和一个明显错误示例都不会得到误导性完成结果。

完成后建立一份简明真机记录，至少包含硬件型号、接线、测试提交或版本、实际现象、问题、恢复结果、验证人和日期。随后才能将状态改为 `published + hardware-checked`，并递增课程 `contentVersion`。

## 5. 当前课次验证状态（MCU 入门版）

### 第一课：`first-program-on-chip`（在芯片上跑起第一个程序）
- **状态**：`status: "published"`, `verification: "hardware-checked"`
- **验证结果**：已通过 CH32V203 完整固件构建、WCH-Link 烧录以及 100ms / 1000ms LED 闪烁周期实测。
- **发布分发**：正式纳入发布包并同步至 Gitee 远程分发仓库，学生端正常展现。

### 第二课：`gpio-output`（点亮第一盏灯：GPIO 输出与高低电平）
- **状态**：`status: "draft"`, `verification: "pending-hardware-check"`
- **当前阶段**：作者本地开发验证中。
- **隔离机制**：仅在开发机开发模式可见（标有“作者验证”徽标），导出 Published Snapshot 时自动排除，不进入学生端远程更新包。

## 6. 发布前命令

```powershell
# 1. 校验课程规范与硬件发布门禁
npm run courses:validate

# 2. 全工程类型与离线测试
npm run typecheck
npm test

# 3. 运行 MCU 平台 Electron 冒烟测试
npm run smoke:electron:mcu

# 4. 在线拉取远程包与构建烟测（验证发布包不包含未发布草稿）
npm run test:content-update:live
npm run smoke:content:live
```

硬件课还必须追加真机检查；上述命令不能替代实物验证。
