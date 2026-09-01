# Windows 打包与最终 SDK 切换

## 当前可用状态

本文只描述趣味巡线版和 CH32 单片机入门版的 WCH 工具链及 Windows 包。TI MSPM0 教学版目前只支持开发模式，尚未提供可分发安装包；详情见 [TI MSPM0 教学版开发与验证](./ti-mspm0-development-and-validation.md)。

当前活动固件基线来自远端仓库 `PanGucheng/ch32v203-robot-dog` 的提交 `c897e3a`，固件版本为 `0.2.1`，使用 CMake 与内置 WCH GCC12 构建。它已经完成全量编译和打包后 EXE 自检，但活动注册表仍是 `development-live-remote` 模式，因此只能用于临时功能测试，不能作为比赛正式发布固件。

临时离线包命令（便携 ZIP，用户解压即用）：

```powershell
npm run package:win:fun:test
npm run package:win:mcu:test
```

输出文件固定带有 `PROVISIONAL`：

```text
release/RobotDog-Studio-Fun-0.1.0-PROVISIONAL-Windows-x64.zip
release/RobotDog-Studio-MCU-0.1.0-PROVISIONAL-Windows-x64.zip
```

该 ZIP 内含 Electron 应用、Reasonix v1.17.12、WCH GCC12、WCH OpenOCD、学生模板以及临时 SDK 源码，因此解压后无需另装编译工具。

临时 NSIS 安装器命令（安装器提权管理员安装，应用普通权限运行）：

```powershell
npm run package:win:fun:nsis:test
npm run package:win:mcu:nsis:test
```

输出文件：

```text
release/RobotDog-Studio-Fun-0.1.0-PROVISIONAL-Windows-x64.exe
release/RobotDog-Studio-MCU-0.1.0-PROVISIONAL-Windows-x64.exe
```

NSIS 安装器为 per-machine 管理员安装。安装过程中自动调用 `pnputil.exe /add-driver` 安装包内 WCH-Link 驱动；安装成功后应用以 `asInvoker` 普通权限运行，不再自行安装驱动。ZIP 便携包仍保留，用于快速测试。

## 双重发布门禁

两个正式包命令是：

```powershell
npm run package:win:fun
npm run package:win:mcu
```

在最终 SDK 未交付时，此命令必须失败。门禁至少要求：

- 活动清单 `status` 为 `release`；
- `releaseEligible` 为 `true`；
- 芯片 Flash/RAM、启动文件与链接布局已确认；
- SDK 完整性哈希非空；
- 实际打包的 SDK 文件与清单哈希完全一致。

这能避免把当前临时工程误打成正式安装包。

## 最终 SDK 到位后的切换步骤

1. 将下位机开发者交付的清单放进 `resources/firmware-baselines/ch32v203-robotdog/<正式版本>/robotdog.firmware.json`。
2. 更新 `resources/firmware-baselines/ch32v203-robotdog/active.json` 中的 `manifest`，指向正式清单。
3. 设置本次打包所使用的 SDK 根目录：

   ```powershell
   $env:ROBOTDOG_PACKAGED_FIRMWARE_ROOT='D:\最终SDK目录'
   ```

4. 先运行 `npm run baseline:release:check`，再运行 `npm run firmware:build:ch32v203`。
5. 从同一提交依次运行 `npm run package:win:fun` 和 `npm run package:win:mcu`。打包脚本会再次核对 SDK 哈希，随后分别生成不带 `PROVISIONAL` 的正式包。
6. 在干净 Windows 电脑上执行首次启动、创建对话、手动编辑、AI 修改、统一确认、完整编译和硬件下载验收。

活动基线登记与学生工作区相互独立：切换 SDK 不会覆盖已有学生代码；新对话仍从只读模板复制到独立工作区。
