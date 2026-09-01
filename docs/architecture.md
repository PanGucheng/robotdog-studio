# RobotDog Studio 架构

RobotDog Studio 使用 Electron Main、Preload、Renderer 三层结构。Renderer 不持有本机权限；Preload 暴露类型固定的 API；Main 负责串口、工作区、构建、烧录、Reasonix 和所有安全判断。

## 发行版与硬件平台

仓库当前维护 `fun-line-following`、`mcu-foundations` 和 `ti-mspm0-foundations` 三个发行版。发行版在启动或构建时由可信配置确定，Renderer 不能在运行时切换。工作区 schema v4 使用 `learningPath`、`platform`、`target` 和 `toolchainProfile` 绑定项目身份；Main 根据这些字段选择 CH32 或 TI 的构建、烧录及权限策略，并拒绝跨平台调用。

趣味巡线版仍可通过 `MockRobotService` 验证 UI、IPC 和动作安全时限。真实连接服务实现相同领域接口，因此 Renderer 不需要知道当前连接的是模拟设备还是物理设备。TI MSPM0 版本的开发与验证边界见 [TI MSPM0 教学版开发与验证](./ti-mspm0-development-and-validation.md)。

## 信任边界

- Renderer 输入始终视为不可信。
- Main 只接受枚举动作和内部 ID，不接受任意命令、路径或可执行文件。
- 工具链和板卡参数来自 Main 读取的只读发行配置和工作区平台元数据。
- Reasonix 在候选 Git worktree 中运行，不直接写正式学生工作区。
