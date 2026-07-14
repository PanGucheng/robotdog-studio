# Windows 打包与最终 SDK 切换

## 当前可用状态

当前活动固件基线是 `ch32v203-robotdog-provisional-0858d82`，来源为 `D:\RobotDog\ch32v203-robot-dog`。它已经完成真实 WCH GCC12 全量编译和打包后 EXE 自检，但仍属于“临时功能测试”，不能作为比赛发布固件。

临时离线包命令：

```powershell
npm run package:win:test
```

输出文件固定带有 `PROVISIONAL`：

```text
release/RobotDog-Studio-0.1.0-PROVISIONAL-Windows-x64.zip
```

该 ZIP 内含 Electron 应用、Reasonix v1.17.12、WCH GCC12、WCH OpenOCD、学生模板以及临时 SDK 源码，因此解压后无需另装编译工具。

## 双重发布门禁

正式包命令是：

```powershell
npm run package:win
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
5. 运行 `npm run package:win`。打包脚本会再次核对 SDK 哈希，随后生成不带 `PROVISIONAL` 的正式包。
6. 在干净 Windows 电脑上执行首次启动、创建对话、手动编辑、AI 修改、统一确认、完整编译和硬件下载验收。

活动基线登记与学生工作区相互独立：切换 SDK 不会覆盖已有学生代码；新对话仍从只读模板复制到独立工作区。
