# RoboHorse Studio 固件基线目录说明

更新日期：2026-09-27  
适用硬件平台：WCH CH32V203 系列微控制器（RISC-V 架构）  
相关文档：[CH32V203 固件开发指南](../docs/firmware/ch32v203.md) · [下位机固件接口与安全修改要求](../docs/firmware/firmware-developer-requirements.md)

---

## 1. 目录结构概览

本工程 `firmware/` 下维护了两套针对 CH32V203C8T6 芯片的下位机源码基线（Firmware Baseline）：

```text
firmware/
├─ README.md                      # 本说明文档
├─ ch32v203-baseline/             # RHS 单片机教学基线 (CH32V203 RHS HAL)
└─ v2.5_沁恒小马例程/              # v2.5 全功能机器马固件 (Pony Baseline v0.2.5)
```

这两套基线承担不同的教学与实验职责，由主进程的 `FirmwareBaselineResolver` 按工作区类型自动分流与解析。

> [!NOTE]
> 趣味巡线版（`fun-line-following`）使用的是独立的 `ch32v203-robotdog` 固件基线（源自独立远程仓库，由 `resources/firmware-baselines/ch32v203-robotdog/active.json` 管理），不使用本目录下的 `v2.5_沁恒小马例程`。

---

## 2. 基线详细对比

| 维度 | `firmware/ch32v203-baseline` | `firmware/v2.5_沁恒小马例程` |
| --- | --- | --- |
| **定位** | **轻量级单片机教学基线** | **全功能机器马控制固件** |
| **适用发行版** | `mcu-foundations`（单片机入门版） | `mcu-foundations`（单片机入门版） |
| **主要使用场景** | 结构化课次练习（Lesson Attempts） | 自由练习沙盒（MCU Sandbox） |
| **外设策略** | 纯净轻量，外设显式声明（Opt-in），上电静止且不自启舵机或蜂鸣器 | 集成四路舵机步态、CCD 循线、SSD1306 OLED、RDS1 协议、蜂鸣器与按键 |
| **基线 ID** | `ch32v203-rhs-baseline` | `ch32v203-pony-v25` |
| **构建系统** | CMake + WCH GCC12 | 内置 CMake 规则 / WCH GCC12 |
| **可编辑边界** | 学生修改受限于课次模板（如 `App/Src/experiment.c`） | 学生可编辑 `experiment.c`，控制核心受 `student_control.h` 保护 |

---

## 3. 构建与验证入口

上位机内置了免配置的 WCH RISC-V GCC12 工具链（位于 `vendor/wch/Toolchain/RISC-V Embedded GCC12`），无需安装外部 MounRiver Studio 即可在 Windows 下完成编译。

### 3.1 教学基线构建命令 (`ch32v203-baseline`)
可以直接通过系统已配置的环境变量调用 CMake 构建：
```powershell
$env:RHS_TOOLCHAIN_ROOT = (Resolve-Path "vendor/wch/Toolchain/RISC-V Embedded GCC12").Path
cmake --preset wch-gcc12 -S firmware/ch32v203-baseline
cmake --build firmware/ch32v203-baseline/build/release
```

### 3.2 机器马全功能基线 (`v2.5_沁恒小马例程`)
小马例程主要服务于 `mcu-foundations` 发行版中的自由练习沙盒（MCU Sandbox）。上位机在运行时通过内部的 `FirmwareBuildService` 与 `CandidateBuildService` 执行增量 Overlay 编译。

在开发与自动化测试中，可通过专用冒烟测试套件校验其打包与编译链条：
```powershell
corepack pnpm smoke:mcu:pony
```

> [!IMPORTANT]
> 命令 `corepack pnpm firmware:build:ch32v203` 对应的是趣味巡线版所使用的 `ch32v203-robotdog` 固件基线的构建与校验，**并非**小马例程（`v2.5_沁恒小马例程`）的直接构建命令。请勿混淆两套不同的基线体系。

---

## 4. 与 `resources/firmware-baselines/` 的关系

上位机不直接硬编码 `firmware/` 的源码相对路径，而是通过 `resources/firmware-baselines/` 下的元数据清单实现版本管理与解耦：

- **`resources/firmware-baselines/ch32v203-rhs/active.json`**：
  指向 `firmware/ch32v203-baseline`，记录当前教学基线的版本、架构和文件哈希；
- **`resources/firmware-baselines/ch32v203-pony/active.json`**：
  指向 `firmware/v2.5_沁恒小马例程`（基线 ID `ch32v203-pony-v25`），记录机器马全功能基线清单与构建规则；
- **`resources/firmware-baselines/ch32v203-robotdog/active.json`**：
  对应趣味巡线版（`fun-line-following`）使用的基线，记录远端仓库源与构建快照；
- **打包分发机制**：
  在生产打包时，`electron-builder` 会根据上述清单将固件源码作为受控只读资源打包入安装包中，确保学生在离线环境下拥有可编译、可恢复的基线源码。
