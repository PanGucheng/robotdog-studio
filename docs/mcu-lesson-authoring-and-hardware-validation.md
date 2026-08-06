# 单片机课次编写与硬件验证清单

更新日期：2026-08-06

适用范围：RobotDog Studio 单片机入门版新增或修改课次。该流程面向小范围教学与个人维护，保留必要安全门禁，不建设复杂审批系统。

## 1. 新增普通无硬件课

1. 在课程 `course.json` 的 `lessonOrder` 中登记稳定 `lessonId`。
2. 复制课次 manifest 骨架，填写真实目标、步骤、预计时间、前置课和思考题。
3. 在 `resources/workspace-templates/ch32v203-mcu-lessons/<templateId>` 创建完整独立模板。
4. 只把教学文件放入 `App/Src`、`App/Inc`；安全适配层放入 `Core` 并保持只读。
5. 为课次填写最小的 `editableGlobs`、`readableFiles`、`deniedGlobs`，不能开放启动、链接、Bootloader、Flash 或通信配置。
6. 使用固定完成检查：文件存在、指定教学文件已应用修改、候选编译、完整构建、问题回答。问题步骤必须填写对应 `questionId`，人工观察检查必须填写对应观察步骤的 `stepId`；不要加入脚本或标准答案逐字比较。
7. 递增课程唯一的 `contentVersion`，运行 `npm run courses:validate`、相关测试和 MCU 冒烟。

新增第四课不应修改课程中心或实验任务页组件；除 `lessonOrder` 注册外，主要变化应限于 manifest、模板、测试夹具和课程文字。

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
    { "stepId": "edit-example", "type": "edit", "title": "修改示例", "instruction": "完成一个小修改" },
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

不得修改 `D:\RobotDog\EVT`，不得把整个 EVT 复制进发行包，也不得把官方参考板现象直接写成 RobotDog 实物现象。当前已审查示例与差异见 [EVT 来源审查](./mcu-evt-source-audit.md)。

## 4. 硬件课发布门禁

硬件课在以下全部完成前必须保持：

```text
status: draft
verification: pending-hardware-check
```

检查清单：

- [ ] 目标芯片、板卡版本和原理图对应一致；
- [ ] 引脚复用、时钟、调试口、CCD、运动控制和通信占用已核对；
- [ ] 供电、电平、接线方向和运动风险已评估；
- [ ] 候选预检、完整固件、程序资源阈值和离线包构建通过；
- [ ] WCH-Link 或目标下载方式真实烧录成功；
- [ ] 复位后的实际现象与课程描述一致；
- [ ] 拔线、错误接线、错误目标、取消和急停/断电恢复至少覆盖相关项；
- [ ] 一个正确示例和一个明显错误示例都不会得到误导性完成结果。

完成后建立一份简明真机记录，至少包含硬件型号、接线、测试提交或版本、实际现象、问题、恢复结果、验证人和日期。照片或视频只在文字无法准确说明时保留。随后才能改为 `published + hardware-checked`，递增 `contentVersion`。

## 5. 当前第三课状态

“第一个硬件实验（待定）”只有资源骨架和安全占位模板。本轮没有可核实的实物接线与真机现象，因此继续保持 `draft + pending-hardware-check`：

- 开发模式可查看结构和警告；
- 不能创建练习、接线或烧录；
- AI 必须说明尚未验证；
- 正式单片机包不显示该课；
- 不以模拟结果替代真机发布门禁。

## 6. 发布前命令

```powershell
npm run courses:validate
npm test
npm run build
npm run smoke:electron:mcu
npm run package:win:mcu:test
```

硬件课还必须追加真机检查；上述命令不能替代实物验证。
