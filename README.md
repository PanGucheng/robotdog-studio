# RobotDog Studio

RobotDog Studio 是面向中小学机器马巡线教学与比赛的 Electron 桌面上位机。项目目前完成工程底座与三通道阶段 A：安全 IPC、模拟机器马、CCD 可视化、动作控制、蓝牙/USB 双链路模拟、IAP 下载状态机和“比赛维修站”主界面。

## 本地开发

需要 Node.js 24 与 Corepack。仓库固定使用 pnpm 11.8.0：

```powershell
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm dev
```

验证命令：

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 内置 WCH 固件工具链

RobotDog Studio 按完整版设计交付，用户无需安装 MounRiver Studio 即可编译 CH32V203 固件。

当前内置的 Windows 命令行工具链位于：

```text
vendor/wch/
├─ Toolchain/RISC-V Embedded GCC12
└─ OpenOCD/OpenOCD
```

使用内置 GCC12 验证 `D:\RobotDog\ch32v203-robot-dog` 固件工程：

```powershell
npm run firmware:build:ch32v203
```

默认读取 `D:\RobotDog\ch32v203-robot-dog`，构建产物输出到 `.firmware-build/ch32v203-robot-dog/<timestamp>/`，包括：

- `GPIO_Toggle.elf`
- `GPIO_Toggle.hex`
- `GPIO_Toggle.bin`
- `GPIO_Toggle.map`

可以通过环境变量覆盖路径：

```powershell
$env:ROBOTDOG_FIRMWARE_ROOT='D:\path\to\firmware'
$env:ROBOTDOG_FIRMWARE_OUT='D:\path\to\output'
npm run firmware:build:ch32v203
```

## 当前能力

- Electron Main、Preload、Renderer 三进程隔离。
- Main 侧动作白名单与 3 秒运动安全时限。
- 浏览器和 Electron 共用的模拟设备体验。
- CCD 128 点曲线、阈值、中心和偏差展示。
- 连接、动作、检测黑线和软件急停交互。
- 无线运行态与有线下载口的独立状态、USB 插拔模拟和完整升级向导。
- 固件升级预检、停机、IAP 握手、擦写、校验、重启、无线重连及失败可重试模型。
- IAP 二进制帧、CRC32 流解析、固件 SHA-256/板型/Flash 区域校验和稳定设备身份注册。
- 教师模式完整恢复模拟；学生下载与教师恢复互斥，关键写入阶段禁止强制取消。
- 蓝牙运行态协议、板载有线 IAP 与 WCH-Link 教师恢复的三通道方案，以及内置 WCH GCC12/OpenOCD 和命令行构建适配。

真实蓝牙串口、有线 IAP、WCH-Link 恢复和 Reasonix ACP 将按照 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 分阶段接入。三通道设计详见 [连接与固件下载计划](./docs/three-channel-connection-plan.md)，IAP 帧定义见 [IAP 二进制协议](./docs/iap-protocol-v1.md)。

## 重要安全说明

当前版本处于模拟阶段，界面中的急停是软件急停。真实硬件必须同时实现下位机动作看门狗，并保留物理断电手段。
