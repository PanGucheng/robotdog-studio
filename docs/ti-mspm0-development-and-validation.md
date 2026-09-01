# TI MSPM0 教学版开发与验证

更新日期：2026-09-01  
适用发行版：`ti-mspm0-foundations`  
目标硬件：TI LP-MSPM0G3507、DAPLink / CMSIS-DAP、SWD

## 当前状态

TI MSPM0 教学版已经形成独立的开发闭环：创建课程工作区、用 SysConfig 配置芯片、编辑 `src/main.c`、重新生成配置代码、使用 Arm GCC 编译链接、生成 ELF/HEX/BIN/MAP，并通过 OpenOCD 完成烧录、校验和复位。

当前实现属于开发验证阶段，不是可分发的正式安装版：

- 固件基线是 `provisional`，构建证明不可用于正式发布；
- 工具链从开发电脑的固定路径读取，尚未随安装包分发；
- 第一课仍是 `draft + pending-hardware-check`，在正式课程验收前不得改成已发布课次；
- 已完成一次真实 MSPM0G3507 构建、CMSIS-DAP 烧录、校验和复位验证，结果不能替代完整课程验收。

## 与其他发行版的关系

三个发行版共用 Electron Main、Preload、Renderer、工作区、Git 存档、课程框架和安全边界，但发行身份、数据目录、项目类型和硬件工具链彼此隔离。

| 发行版 | `learningPath` | 平台 / 目标 | 主要工具链 |
| --- | --- | --- | --- |
| 趣味巡线版 | `fun-line-following` | CH32V203C8T6 | 内置 WCH GCC / OpenOCD |
| CH32 单片机入门版 | `mcu-foundations` | CH32V203C8T6 | 内置 WCH GCC / OpenOCD |
| TI MSPM0 教学版 | `ti-mspm0-foundations` | MSPM0G3507 | MSPM0 SDK、SysConfig、Arm GCC、MSPM0 OpenOCD |

TI 工作区使用 schema v4，并固定记录 `platform`、`target` 和 `toolchainProfile`。Main 进程会拒绝用 TI 构建或烧录服务处理其他平台的工程。

## 开发环境

默认读取以下已验证版本和路径：

```text
D:\ti\mspm0_sdk_2_11_00_07
D:\ti\sysconfig_1.28.1
D:\ti\gcc-arm-none-eabi-9-2019-q4-major-win32
D:\ti\openocd-d9b957f-i686-w64-mingw32
```

需要改用其他安装位置时，可在启动应用前设置：

```powershell
$env:ROBOTDOG_TI_MSPM0_SDK_ROOT = 'D:\path\to\mspm0_sdk_2_11_00_07'
$env:ROBOTDOG_TI_SYSCONFIG_ROOT = 'D:\path\to\sysconfig_1.28.1'
$env:ROBOTDOG_TI_GCC_ROOT = 'D:\path\to\gcc-arm-none-eabi-9-2019-q4-major-win32'
$env:ROBOTDOG_TI_OPENOCD_ROOT = 'D:\path\to\openocd'
```

替换版本不能只改目录名；SDK、SysConfig、编译参数和生成文件必须重新做兼容性验证。

## 启动和操作

在仓库根目录双击：

```text
start-ti-mspm0-dev.cmd
```

或在 PowerShell 中运行：

```powershell
corepack pnpm dev:ti
```

推荐的完整操作顺序：

1. 进入“TI MSPM0 教学版”，创建第一课工作区。
2. 在左侧“工程文件”中确认能看到 `src/main.c`、`gpio_toggle_output.syscfg`、`README.md` 和 `robotdog.project.json`。
3. 点击工程文件标题右侧的“SysConfig”，修改 GPIO 后在 SysConfig 中保存 `.syscfg` 文件。
4. 回到 RobotDog Studio，打开 `src/main.c`，编辑并保存学生代码。
5. 点击“编译”。构建会先清理并重新生成 `generated/`，因此不要手工维护其中的文件。
6. 确认生成 ELF、HEX、BIN、MAP，并检查 Flash/RAM 占用。
7. 连接 DAPLink / CMSIS-DAP、目标板供电及 SWD 线，再点击“烧录”。
8. 等待界面显示烧录完成、校验通过、芯片复位运行，再观察板上 LED。

SysConfig 是独立桌面程序。打开它不会把配置界面嵌入 RobotDog Studio；RobotDog Studio 中仍显示工程树和 C 代码，这是正常行为。保存 `.syscfg` 后，下一次编译才会通过 SysConfig CLI 重新生成配置代码。

## 构建与烧录链路

构建过程固定为：

1. 使用 SysConfig CLI 和 `gpio_toggle_output.syscfg` 生成配置源文件、设备选项及链接文件；
2. 编译 MSPM0 SDK 启动文件、`src/main.c` 和生成的 C 源码；
3. 链接 `gpio_toggle_output.out`；
4. 生成 `.hex`、`.bin` 和 `.map`；
5. 计算产物 SHA-256，并将证明绑定到工作区提交和源码指纹。

烧录过程使用 MSPM0 OpenOCD，固定选择 CMSIS-DAP、SWD 和 `target/ti/mspm0.cfg`。应用只允许烧录当前工作区最新一次已验证的 ELF；代码变化后必须重新编译。

## 自动化验证

不连接硬件时运行：

```powershell
corepack pnpm courses:validate
corepack pnpm test
corepack pnpm typecheck
corepack pnpm smoke:electron:ti
corepack pnpm smoke:ti-mspm0
```

连接 MSPM0G3507 和 CMSIS-DAP 后运行真实烧录验证：

```powershell
corepack pnpm smoke:ti-mspm0:flash
```

最近一次开发验证结果：

- 自动化测试：192 passed，1 skipped；
- TI golden project 构建通过；
- 生成的固件 Flash 占用 672 B，RAM 占用 0 B；
- CMSIS-DAP 烧录、Flash 校验和复位通过。

硬件冒烟会真实改写连接中的目标板，只应在确认板型、供电和连线后执行。

## 常见问题

- 左侧工程文件为空：先确认用 `start-ti-mspm0-dev.cmd` 启动的是开发版，并新建或重新进入 TI 课程工作区；旧的临时安装包不会自动获得当前源码改动。
- SysConfig 能打开但应用仍显示 C 代码：这是两个独立窗口的预期行为；在 SysConfig 保存后回到应用编译。
- 提示工具链不完整：检查四个默认目录，或核对四个 `ROBOTDOG_TI_*` 环境变量。
- 提示学生代码已变化：保存后重新编译，再烧录。
- 找不到 CMSIS-DAP：检查 USB 驱动、目标板供电和下载器连接。
- CMSIS-DAP 被占用：关闭 CCS、其他 OpenOCD 或正在占用探针的调试会话。
- SWD 无法识别芯片：检查 GND、SWDIO、SWCLK、NRST 和供电，确认目标确为 MSPM0G3507。

## 后续工作

第一阶段之后按真实硬件验收逐课扩展 GPIO 输入、中断、定时器、PWM、UART 和 ADC。TI Windows 安装包、工具链再分发许可、驱动安装和离线环境需要单独设计与验收，不能沿用 CH32 安装包的结论。
