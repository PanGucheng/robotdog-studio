# TI MSPM0 净 Windows 验收清单

本清单用于在没有安装 TI SDK、SysConfig、Arm GCC、OpenOCD 和 WCH 驱动的 Windows x64 虚拟机或实体机上验收正式安装包。目标板为 MSPM0G3507 LaunchPad，烧录接口为板载 XDS110/CMSIS-DAP（SWD）。

## 准备

- 使用 Windows 10/11 x64 净机，确认 `D:\ti` 不存在，且未设置 `ROBOTDOG_TI_*` 环境变量。
- 准备 MSPM0G3507 LaunchPad 和可传输数据的 USB 线；首次硬件烧录允许 Windows 自动安装板载调试器的系统驱动。
- 将正式安装器和发布方提供的 SHA-256 校验值复制到虚拟机，先校验哈希。

## 安装与启动

1. 运行 `RobotDog-Studio-TI-MSPM0-<version>-Windows-x64.exe`，完成 per-machine 安装。
2. 启动“RobotDog Studio TI MSPM0 教学版”。不应出现 WCH-Link 驱动安装窗口。
3. 在工具链状态中确认以下四项均为可用，并显示托管目录：MSPM0 SDK 2.11.00.07、SysConfig 1.28.1+4785、Arm GCC 9-2019-q4-major、OpenOCD d9b957f。
4. 断开网络后重新启动一次，确认课程、讲义和构建仍可使用。

## 课程与候选构建

1. 打开 TI MSPM0 GPIO 入门课程及 `gpio-sysconfig-toggle` 课时，确认讲义、步骤和工程文件均可见。
2. 新建课时尝试，确认 `src/main.c` 和 `.syscfg` 可编辑；`gcc/device_linker.lds` 及构建后 `generated/` 文件只读。
3. 修改 LED 翻转逻辑，运行“验证候选修改”。预期 SysConfig 在隔离目录重新生成代码，Arm GCC 编译通过，且不会使用工程中旧的 `generated/`。
4. 应用候选修改，再运行完整固件构建。预期生成 ELF、HEX、BIN、MAP 四类产物和可追溯构建证明。
5. 构建完成后再次修改源码。预期既有固件状态变为 stale；在重新构建前发起烧录应被拒绝。

## 硬件烧录

1. 连接 MSPM0G3507 LaunchPad，在烧录界面确认后执行 OpenOCD 烧录。
2. 预期 OpenOCD 使用包内 `cmsis-dap.cfg` 与 `target/ti/mspm0.cfg`，完成 program/verify/reset。
3. 观察板载 LED，确认其按课程程序翻转。完成硬件检查并记录板卡序列号、Windows 版本、安装包 SHA-256 和验收时间。

## 故障取证

- 应用日志和用户数据位于 `%APPDATA%\RobotDog Studio TI MSPM0`。
- 安装目录默认位于 `%ProgramFiles%\RobotDog Studio TI MSPM0`；托管工具链位于其 `resources\toolchains\ti-mspm0`。
- 保留工具链状态截图、构建日志、OpenOCD 完整输出和失败工程副本。
- 若工具链状态指向 `D:\ti` 或其他开发目录，立即判为失败；发行版不得回退到开发机路径。

