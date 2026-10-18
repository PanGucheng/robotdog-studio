# 首阶段验证记录

2026-10-17 更新：项目维护者确认本次三类 TI 固件已经测试，可以发布。当前模板据此标记 `hardwareValidated: true`；这是维护者提供的确认，未附原始实测日志，不表示下列来源工程的历史构建记录被重新执行或改写。Studio 发布资格记录见 `docs/firmware/ti-release-qualification.md`。以下保留 2026-10-02 的首阶段事实。

日期：2026-10-02。目标 MSPM0G3507SPMR，内部 SYSOSC 32 MHz。

## 软件结果

| 项目 | 结果 |
| --- | --- |
| 默认配置清洁生成、Release 编译与链接 | 通过，未出现编译警告 |
| SysConfig 参数修改后完整生成与构建 | 通过；舵机 1 MHz / 20000 ticks，OLED 100 kHz |
| 原工程 C 基线回归 | 通过 |
| TI 移植 C 回归（模拟 I/O） | 通过 |
| Flash 占用 text + data | 14544 B / 128 KiB |
| 静态 RAM 占用 data + bss | 3288 B / 32 KiB |
| 栈空间链接约束 | 至少 4096 B；尚未测量实板运行峰值 |
| 烧录、物理外设和机械动作 | 未执行 |

固定工具版本：MSPM0 SDK 2.11.00.07、SysConfig 1.28.1+4785、Arm GCC 9-2019-q4-major（GCC 9.2.1）。生成器使用官方 SDK 的产品元数据与 GCC 空工程模板。未依赖 WCH 外设库。

测试以同一 Arm GCC 编译实际 C，通过 Unicorn 运行。移植测试覆盖微秒计数换算、正反向映射、步态时间推进、延误后的有限缓动、RDS1 命令、CCD 能力关闭、动作租约与心跳超时、按住停机键拒绝动作、UART 环形缓冲溢出、硬件错误计数、TX FIFO 重启、I2C 有界退出和 OLED 分段刷新。MSPM0 外设接口由模拟函数替代，因此不代表真实硬件验收通过。

SysConfig 修改测试在隔离临时工程中执行，不改变交付配置。它将舵机分频 64 改为 32、周期计数 10000 改为 20000，并将 I2C 400 kHz 改为 100 kHz；重新生成的宏和完整链接均通过。I2C 单次事务有 5 ms 时间限制及循环次数上限，支持上述 100 kHz 配置。

来源工程当时的机器可读记录：`build/build-proof.json`、`build/tests/results.json`、`build/regeneration-results.json`。构建记录包含输入和产物 SHA-256；改变代码、配置或构建脚本后须重新构建。软件记录与实板确认分别保存，2026-10-02 时 manifest 和构建记录的 `hardwareValidated` 均为 false；该历史结论不覆盖上方新增的维护者发布确认。

## 实板验收顺序

1. 断开舵机动力，检查上电、复位、串口 HELLO/CAPS/STATUS；确认默认空闲、蜂鸣器静音。
2. 示波器测四路 PWM 的 50 Hz、中位 1500 μs 和 500/2500 μs 边界，检查持续串口收发和 OLED 刷新时波形。
3. 连接舵机并检查左前、左后、右前、右后方向及机械限位；按实际装配修改 `src/board/servo_map.c`。
4. 检查 stand、walk、turn_left、turn_right、STOP；分别验证 500 ms 心跳超时及动作租约超时。
5. 检查 PA1 按下停止、保持按下拒绝运动、松开提示音，以及 RGB 状态颜色。
6. 检查 OLED 正常显示、断开、重新接入和总线故障；串口突发、错误及 STOP 响应；确认故障可恢复。
7. 使用 SysConfig GUI 修改所需引脚或参数、保存并重新构建；在板上复测对应功能。

CCD 与自动循线按用户决定暂缓。ENTER_IAP 保留原版 update_safe 行为，真实 Bootloader 尚未实现。独立工程尚未接入 Studio 的工程模板入口。
