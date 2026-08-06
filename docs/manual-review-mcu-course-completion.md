# RobotDog Studio 单片机课程框架完成复核记录

复核日期：2026-08-06
复核方式：开发侧自动化、Electron 桌面冒烟、免安装浏览器实际点击、双发行便携包检查

## 1. 结论

课程软件框架和两个无硬件示例课已经完成。第三个硬件占位课保持 `draft + pending-hardware-check`：开发模式可查看课程结构和警告，但“开始学习”禁用；正式包不显示 draft 课。该状态是预期发布门禁，不代表已经验证接线、烧录或硬件现象。

## 2. 免安装界面点击结果

使用 `start-mcu-dev.cmd` 等价的开发模式访问单片机版界面，实际完成以下操作：

- 课程中心从正式 JSON 资源显示 1 门课程、3 个课次；前两个课次各显示 6 步。
- 创建第一课练习后默认进入“实验任务”，初始状态为 `0% / 0/6`。
- 勾选两个步骤并保存“编译与烧录区别”的回答后，进度即时更新为 `50% / 3/6`。
- 第一课未完成时进入第二课会出现确认提示；确认后可以创建自包含的第二课练习，任务页显示 `0/6`。
- 第三课显示“本课尚未通过真机检查”和“不要据此接线或烧录”，开始按钮禁用。
- 课程练习显示“实验任务”导航；普通 MCU sandbox 的默认代码页行为未改变。

浏览器演示 API 已改为直接读取正式课程和课次资源，避免演示内容与实际 manifest 漂移。该路径适合频繁 UI 修复，不需要每次打包或安装。

## 3. 自动化与桌面验证

本次通过：

```text
typecheck                         通过
courses:validate                 MCU_COURSES_OK courses=1 lessons=3
vitest                           28 files / 123 tests 通过，1 file / 1 test 条件跳过
smoke:electron:fun               通过，courseCount=0
smoke:electron:mcu               通过，courseCount=1、lessonCount=3
第一课无硬件闭环                 completed
第二课无硬件闭环                 completed
完整固件产物                     elf / hex / bin / map
```

MCU Electron 冒烟对两个无硬件课分别执行创建练习、编辑、候选预检、确认应用、完整固件构建、步骤/回答更新和完成状态检查。进度存储测试覆盖初始化、固定完成条件、失败状态以及损坏文件备份重建。

## 4. 双发行便携包

已运行 `package:win:all:test` 并生成：

- `release/RobotDog-Studio-Fun-0.1.0-PROVISIONAL-Windows-x64.zip`
- `release/RobotDog-Studio-MCU-0.1.0-PROVISIONAL-Windows-x64.zip`

检查结果：趣味版 staging 不含 `resources/courses/mcu-foundations`；单片机版包含 1 门课程、3 个课次和所需课次模板。两个包仍为 `PROVISIONAL`，不会绕过现有固件正式发布门禁。

## 5. 仍需实物条件的发布门禁

以下事项不能用开发机、自测点击或模拟烧录得出真实结论，因此未标记为完成：

- 核对最终 RobotDog 板原理图、实际板卡版本、引脚复用、供电和运动风险；
- 选定第三课硬件方向并记录准确接线；
- 使用目标 WCH-Link/下载方式完成真实烧录、复位、现象观察和异常恢复；
- 填写硬件型号、测试版本、实际现象、问题与日期；
- 验证后将课次改为 `published + hardware-checked` 并递增 `contentVersion`。

执行要求见 [单片机课次编写与硬件验证流程](./mcu-lesson-authoring-and-hardware-validation.md)。在这些条件满足前，当前软件会继续阻止第三课创建和正式发布。
