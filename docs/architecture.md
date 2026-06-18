# RobotDog Studio 架构

RobotDog Studio 使用 Electron Main、Preload、Renderer 三层结构。Renderer 不持有本机权限；Preload 暴露类型固定的 API；Main 负责串口、工作区、构建、烧录、Reasonix 和所有安全判断。

## 当前阶段

阶段 0 使用 `MockRobotService` 验证 UI、IPC 和动作安全时限。后续真实串口服务必须实现同一领域接口，因此 Renderer 不需要知道当前连接的是模拟设备还是物理设备。

## 信任边界

- Renderer 输入始终视为不可信。
- Main 只接受枚举动作和内部 ID，不接受任意命令、路径或可执行文件。
- 工具链和板卡参数来自 Main 读取的只读配置。
- Reasonix 在候选 Git worktree 中运行，不直接写正式学生工作区。
