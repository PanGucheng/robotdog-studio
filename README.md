# RobotDog Studio

RobotDog Studio 是面向中小学机器马巡线教学与比赛的 Electron 桌面上位机。项目目前完成阶段 0 工程底座：安全 IPC、模拟机器马、CCD 可视化、动作控制和“比赛维修站”主界面。

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

## 当前能力

- Electron Main、Preload、Renderer 三进程隔离。
- Main 侧动作白名单与 3 秒运动安全时限。
- 浏览器和 Electron 共用的模拟设备体验。
- CCD 128 点曲线、阈值、中心和偏差展示。
- 连接、动作、检测黑线和软件急停交互。
- 固件统一串口协议与命令行构建适配文档。

真实串口、沁恒 GCC/OpenOCD、WCH-Link 和 Reasonix ACP 将按照 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 分阶段接入。

## 重要安全说明

当前版本处于模拟阶段，界面中的急停是软件急停。真实硬件必须同时实现下位机动作看门狗，并保留物理断电手段。
