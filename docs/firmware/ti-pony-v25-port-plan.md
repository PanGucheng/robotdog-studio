# 沁恒小马 v0.2.5 → TI MSPM0G3507 移植方案

日期：2026-10-02。状态：项目阅读与方案阶段，尚未实施完整固件移植。

## 1. 已确认要求

- 源工程以 `D:\RobotDog\v2.5_沁恒小马例程` 为准，版本为 0.2.5。
- TI 硬件资源参考 `D:\RobotDog\mspm0g3507_example`，目标为 MSPM0G3507SPMR、LQFP-64(PM)。
- 使用内部 SYSOSC；初版采用 32 MHz MCLK/BUSCLK，不依赖外部晶振。
- 时钟、引脚复用、GPIO、PWM、UART、I2C、SysTick 初始化由 SysConfig 管理；BSP 运行时使用 TI DriverLib。
- 四路舵机暂按接口 1～4 对应左前、左后、右前、右后；后续允许修正映射。
- PA1 按键有外部上拉，按下接地。
- RGB 显示运行状态。
- 首阶段交付独立 TI 例程，使用 Studio 同款工具链；Studio 工程集成另行开展。
- CCD 暂不接入。保留后续采集、遥测与循线接口，首阶段不验收 CCD 和自动循线。

`D:\ti\sysconfig_1.28.1` 是配置工具目录，芯片 SDK 实际使用 `D:\ti\mspm0_sdk_2_11_00_07`。

## 2. 阅读结论与功能边界

沁恒例程采用无 RTOS 的协作式主循环，业务代码已经分为协议、安全、运动、遥测、学生控制和显示模块。主要硬件耦合集中在 `User/main.c`、`app_hal.h`、`robotdog_motion.c`、`ccd_line_sensor.c` 和 `ssd1306_oled.c`。

TI 参考例程具备 SysConfig 配置及舵机、RGB、蜂鸣器、OLED、UART 驱动，但应用是循环演示，不能直接作为小马运动控制主程序。其 UART 采用阻塞发送/轮询接收，按键和 SysTick 初始化手写在 BSP 中，舵机及蜂鸣器转换还使用固定时钟常数。移植时需要调整这些部分。

| 原版能力 | 首阶段 TI 处理 |
| --- | --- |
| 上电安全、四腿逻辑 90°、不自动行走 | 完整保留 |
| stop、stand、walk、turn_left、turn_right | 完整保留步态表和动作行为 |
| 50 Hz 舵机 PWM、500～2500 μs | 通过 TIMA0 四通道实现 |
| 每 10 ms 最大 3° 缓动、相位 75 ms | 保留，以实际硬件时间调度 |
| RDS1 请求、响应、动作、心跳、状态 | 完整保留协议版本 1 |
| 500 ms 心跳、默认 500 ms 租约、最大 2000 ms | 完整保留 |
| 串口 RX 溢出停机、TX 队列及统计 | 完整保留，并适配 UART FIFO/错误状态 |
| 按键 20 ms 消抖、按下停机 | 完整保留 |
| 按键抬起蜂鸣器 2 kHz、500 ms | 完整保留 |
| 状态 LED 每 500 ms 翻转 | 改由 RGB 表达状态，保留常规闪烁节奏 |
| OLED mode/action/motion/stop 等状态 | 保留，CCD 行显示 disabled |
| CCD 128 点采集、判线、遥测和循线 | 延后，保留模块边界与扩展位置 |
| ENTER_IAP | 保留进入 update_safe 并返回 supported=0 的行为 |

原工程当前没有真正的 IAP/串口升级、尾巴舵机或公开的单舵机 RDS1 控制命令。发布构建关闭旧文本命令；`back`、`wag` 等条件编译代码也不属于发布接口。第一阶段按原版发布能力移植，不把这些未启用或未实现部分列为已完成能力。

原版 `strength` 会被协议和安全层校验，但不缩放固定步态振幅；动作切换立即从新动作第 0 相位开始。这两项行为先保持，避免同时改变机械控制策略。

## 3. 工程基础与目录

建议新建 `D:\RobotDog\mspm0g3507_pony`，以本机 SDK 的以下官方工程作为基础：

`examples/nortos/CUSTOM_BOARD/driverlib/empty_mspm0g3507`

使用 CUSTOM_BOARD 模板匹配用户板，而不是沿用 LaunchPad 的板载 LED/按键定义。保留官方 GNU 工程构建约定，将其 SysConfig 输入扩展为小马的 `board.syscfg`。SysConfig 负责生成外设配置、设备选项与链接文件；RDS1、步态和安全逻辑由应用源文件提供。

建议布局：

```text
mspm0g3507_pony/
  board.syscfg                 # 唯一硬件配置输入，可由 GUI 修改
  README.md                    # 环境、接线、配置、构建与验收
  robotdog.firmware.json       # 芯片/板型/功能/版本/工具链记录
  src/
    main.c                     # 入口、初始化顺序与任务调度
    app/                       # 协议命令处理、状态页、指示任务
    robotdog/                  # 协议、安全、步态、运行时等业务逻辑
    bsp/                       # time/uart/servo/key/buzzer/rgb/i2c
    board/                     # 生成宏到业务接口的适配、机械映射
    middleware/                # SSD1306 绘图与字库
  generated/                   # SysConfig 输出，可删除重建
  scripts/                     # 配置生成、构建、GUI 启动、烧录
  tests/                       # 业务逻辑与硬件适配测试
  openocd/                     # CMSIS-DAP/MSPM0 配置
  build/                       # 对象、固件与构建记录
```

原则：

1. 不手工修改 `generated/`，不通过覆盖生成函数来隐藏硬件初始化。
2. 应用层不引用沁恒头文件，也不直接访问 TI 外设寄存器；硬件操作集中于 BSP。
3. BSP 使用生成的实例、引脚、通道与时钟宏，避免重新写 PA/PB、TIMA0 等硬件定义。
4. `.syscfg` 实例名称构成 BSP 的配置接口；修改引脚和外设时保留名称，删除必需实例时明确报错。
5. 腿位、方向反转、机械偏置和限位属于机械配置，独立于 SysConfig 的电气引脚配置。
6. 沁恒启动文件、RISC-V 内核代码和 WCH 外设库由 TI SDK 对应文件替代；保留复用自有代码及 TI 文件的许可声明。

## 4. 引脚与外设安排

| 功能 | TI 引脚/资源 | 备注 |
| --- | --- | --- |
| 左前 C / 逻辑 CH0 | PB8 / TIMA0 CCP0 | 初始反向 |
| 左后 D / 逻辑 CH1 | PA22 / TIMA0 CCP1 | 初始反向 |
| 右前 A / 逻辑 CH2 | PA10 / TIMA0 CCP2 | 初始正向 |
| 右后 B / 逻辑 CH3 | PA12 / TIMA0 CCP3 | 初始正向 |
| RDS1 TX/RX | PA8/PA9 / UART1 | 115200、8N1，替代原命令 USART3 |
| OLED SCL/SDA | PA31/PA28 / I2C0 | SSD1306 128×64，7 位地址 0x3C |
| RGB R/B | PA5/PA6 / TIMG0 CCP0/1 | 低电平点亮 |
| RGB G | PA26 / TIMG7 CCP0 | 低电平点亮，按参考代码实际颜色顺序 |
| 无源蜂鸣器 | PA7 / TIMG8 CCP0 | 启动静音，运行时 2 kHz 提示 |
| 停机按键 | PA1 / GPIO 输入 | 无内部上拉，使用板上外部上拉 |
| 1 ms 时基 | SysTick | 由 SysConfig 配置 |
| 调试接口 | PA19/PA20 / SWD | 保留 |
| BOOT | PA18 | 保留现有板级接法，首阶段不改 BCR/BSL 配置 |
| CCD | 暂不分配 | 后续确认接线后增加 GPIO/ADC 实例 |

PA1 在 SysConfig 设备数据中属于 OD 类型，内部上拉配置会排除该引脚。已验证无内部上拉的 GPIO 输入可以正常生成。无需手写初始化，也无需更改 SDK。

原版预留 USART1 只做电气初始化，没有升级业务。TI 首阶段不额外分配第二串口；UART1 专用于 RDS1，不混入普通 printf 日志。

## 5. 时钟、PWM 与调度

### 时钟

- SysConfig SYSCTL 使用内部 SYSOSC 32 MHz，关闭外部 HFXT 路径。
- SysTick 配置为 1 ms；中断只累加毫秒计数，不处理协议或显示。
- UART 使用 BUSCLK 32 MHz、115200、16 倍过采样，替代参考配置的 3 倍过采样。
- 舵机采用 500 kHz 计数时钟，20 ms 周期，初始四通道为 1500 μs 中位。
- 蜂鸣器/RGB 沿用参考外设资源；时钟信息从生成宏取得。

PWM 驱动通过生成时钟及实际 LOAD 换算微秒，不能继续依赖 `SERVO_PERIOD=10000`、`SERVO_TICK_US=2` 等与配置脱节的常数。沿用参考的向下计数输出模式，并检查计数方向、极性和比较值范围。后续更改 SysConfig 时钟后，应重新生成并验证 50 Hz/脉宽；不符合舵机要求的配置应明确失败。

机械映射保存逻辑腿位→PWM 通道、反向标志、中位偏置和限位；初始反向标志为 `{1,1,0,0}`。用户更正腿位后调整此映射，不改步态表。

### 调度

原版 `Delay_Ms(1); now_ms++` 忽略任务耗时。TI 版以 SysTick 单调时间作为心跳、租约、消抖、蜂鸣器和显示的共同基准，保留无 RTOS 结构。

执行顺序为：按键及 UART 故障检查→安全超时检查→有限预算协议处理→运动更新→蜂鸣器/RGB→分段 OLED 刷新。心跳和租约按实际经过时间判断；任务延误后先检查安全，不通过无界补执行积压的步态。

步态更新改为接收实际时间/经过时间，保持 75 ms 相位和 10 ms 缓动约束。OLED 每 1 s 更新一次状态内容，但 I2C 发送分段推进，段间返回主循环。

## 6. 模块移植方式

| 模块 | 具体处理 |
| --- | --- |
| robotdog_protocol/text/types | 复用解析、格式化及类型；更新 TI 板型、芯片和固件身份 |
| robotdog_safety | 复用状态机及超时数值；使用实际 SysTick 时间 |
| robotdog_tx_queue | 复用帧队列；在 TI 中断环境验证发布顺序和共享状态访问 |
| robotdog_runtime | 保留手动动作/停止/更新状态；增加功能能力检查 |
| robotdog_motion | 保留步态、目标角和缓动；将 TIM3 初始化/写比较值替换为 BSP |
| ssd1306_oled | 复用沁恒例程的精简绘图与字库；抽离为不依赖 WCH 的传输接口 |
| main/app_hal | 重写为 TI 入口与接口，移除 WCH 初始化、IRQ 属性和引脚定义 |
| CCD/student/telemetry | 保留可复用逻辑及接口，首阶段不启用采集和自动控制 |

UART 采用 RX FIFO 中断搬运至环形缓冲区，主循环逐字节解析；TX 中断按 FIFO 空间排出队列，队列空时关闭 TX 中断。初始化软件队列和状态后再打开应用中断，避免启动窗口访问未初始化状态。处理溢出、overrun、帧错误和奇偶校验错误，遇到数据丢失按协议故障停止。

高优先级响应在完整帧边界获得优先处理，不在一条 DATA 帧中间插入其他帧。禁止将 TI 演示的阻塞日志发送和上电舵机扫动复制到控制主程序。

OLED 使用 I2C0，初始 400 kHz；命令/数据控制字节及地址保留 SSD1306 约定。每次等待有超时，错误时释放/恢复总线；显示异常不能阻塞安全检查。TI 参考 OLED 驱动的最终 FIFO 等待存在无超时路径，因此不能原样作为控制固件传输层。

RGB 默认配色：上电初始化蓝色、空闲绿色、手动运动青色、update_safe 紫色、error_safe 红色；普通状态按 500 ms 翻转，故障红色常亮。具体颜色可在应用配置中修改。

CCD 未接入时：

- 能力响应不宣称支持自动循线或 CCD 流；保留协议语法和动作命令。
- `MODE auto`、CCD ON/ONCE 返回 `NOT_SUPPORTED`；CCD OFF 可幂等关闭。
- STATUS 的既有 CCD 字段保持无效/零值，OLED 显示 disabled。
- 不生成模拟数据，不使用上一次中心启动动作。
- 后续接入时增加采集后端与 SysConfig ADC/GPIO 配置，恢复能力声明并执行完整循线验收。

`ENTER_IAP` 保持先停机并进入 update_safe、响应 supported=0。TI 固件身份独立于 CH32；device_id 从适当的 TI 工厂识别信息构造，并在实现时核对其唯一性，不能把型号编号当作唯一设备 ID。

## 7. 构建与配置流程

工具链与 Studio 的 `TiMspm0ToolchainService` 保持一致：

| 组件 | 版本 / 本机目录 |
| --- | --- |
| MSPM0 SDK | 2.11.00.07 / `D:\ti\mspm0_sdk_2_11_00_07` |
| SysConfig | 1.28.1 / `D:\ti\sysconfig_1.28.1` |
| Arm GCC | 9-2019-q4-major / `D:\ti\gcc-arm-none-eabi-9-2019-q4-major-win32` |
| OpenOCD | d9b957f / `D:\ti\openocd-d9b957f-i686-w64-mingw32` |

构建脚本支持 Studio 相同的 `ROBOTDOG_TI_MSPM0_SDK_ROOT`、`ROBOTDOG_TI_SYSCONFIG_ROOT`、`ROBOTDOG_TI_GCC_ROOT` 和 `ROBOTDOG_TI_OPENOCD_ROOT` 路径变量。

每次完整构建的顺序：

1. 校验工具版本与配置输入。
2. 调用 SysConfig CLI，指定 SDK `.metadata/product.json` 和 `--compiler gcc`。
3. 重新生成 `ti_msp_dl_config.c/.h`、`device.opt`、`device.lds.genlibs` 和 `device_linker.lds`；失败即停止，禁止使用旧配置继续编译。
4. 编译应用/BSP、生成 C 文件与 SDK 的 MSPM0G350x GCC 启动文件。
5. 使用生成的选项及链接文件链接；业务源文件采用显式清单，避免遗漏或重复。
6. 生成 ELF/HEX/BIN/MAP、size、SHA-256 和构建输入记录。

使用 Cortex-M0+、ARMv6-M、Thumb、soft-float、C99 和 SDK GNU 库约定；移除所有 RISC-V/WCH 编译参数。目标内存按生成链接文件为 Flash 128 KiB、SRAM 32 KiB，最终报告栈及静态内存使用。

提供 `open-sysconfig.ps1` 打开 GUI。用户保存 `board.syscfg` 后再次构建，直接应用新配置。`generated/` 和对象文件作为派生产物，不作为人工维护的配置来源。

## 8. 实施顺序与验收

| 阶段 | 工作 | 完成标准 |
| --- | --- | --- |
| A：工程骨架 | 官方模板、内部时钟、全部首阶段外设、CLI/GUI/构建 | 删除 generated 后可重建；GUI 保存的引脚/参数改变会反映在新生成代码中 |
| B：板级驱动 | 中位 PWM、按键、UART FIFO、蜂鸣器、RGB、I2C | 四通道 50 Hz；500/1500/2500 μs 波形正确；上电无步态、蜂鸣器静音 |
| C：业务逻辑 | 协议、安全、运动、状态与能力报告 | 全部首阶段 RDS1 命令通过；步态与方向映射符合原版 |
| D：并发与故障 | 时基、OLED 分段刷新、UART 故障/拥塞 | 显示断开/总线异常/串口突发不使主循环无界阻塞；STOP 和超时可及时执行 |
| E：交付 | 文档、manifest、产物与验证记录 | 接线表、配置方法、命令示例、构建和烧录步骤齐全 |
| 后续 CCD | ADC/GPIO 采集、遥测、学生策略、自动循线 | 接线确认后单独完成，恢复全部原版循线能力 |

复用原工程的主机测试覆盖协议、安全、文本、发送队列等业务行为；迁移后补充有实际意义的硬件边界测试：微秒→计数值换算、四腿映射、真实时间超时、UART FIFO 排空与重启、CCD 禁用能力、I2C 超时退出。首阶段不依赖 CCD YAML/Python 生成流程完成基本构建；后续循线接入时再启用学生配置生成。

硬件验收包括：上电/复位不自动走；按键消抖与松开提示；各动作方向；心跳和租约分别超时；RX 溢出及错误；OLED 正常/拔除/总线卡住；RGB 状态；持续发送协议请求时四路 PWM 波形；SysConfig 重新配置后的清洁构建。先测 PWM 再接舵机，最后装机验证机械方向。

## 9. 本次已经完成的可行性验证

本次仅在系统临时目录执行配置与最小工程验证，没有修改原沁恒/TI 示例源代码，也没有烧录设备。

- 原 TI `board.syscfg` 使用 SysConfig 1.28.1、SDK 2.11.00.07 重新生成成功，原 UART 3 倍过采样出现建议提高的警告。
- PA1 GPIO 输入配置内部上拉时，CLI 验证失败；改为无内部上拉后成功生成。
- 增加 SysConfig SYSTICK 模块成功，生成代码明确配置 32000 周期计数、1.00 ms 中断。
- 配置内部 SYSOSC 32 MHz、默认时钟和 UART 16 倍过采样后成功生成，未出现原 UART 警告；生成代码关闭 HFXT。
- 生成代码、TI SDK 启动文件与最小 main 通过 GCC 9.2.1 编译链接。最小验证产物 text=2488 B、data=0 B、bss=352 B；这不是完整移植固件的资源占用。

剩余验证属于实施阶段：完整源文件构建、机械方向、波形、串口通信以及所有硬件故障场景。

## 10. Studio 后续集成边界

本阶段独立例程使用 Studio 相同工具链，不改 Studio 产品代码。若后续接入 Studio，需要另外完成：

- 将 `TiMspm0BuildService` 固定的 `gpio_toggle_output.syscfg`/`src/main.c` 改为项目配置和多文件构建。
- 统一正式构建与候选编译的源文件、包含目录及链接检查。
- 更新工程树对 `.syscfg` 文件名的限制，支持新例程模板和固件板型。
- 保持源码/配置变化后必须重新构建再烧录的校验，并明确输入指纹与派生文件的边界。

这些修改不属于当前独立例程交付的必备项。

## 11. 参考依据

- 源例程 `README.md`、`User/*.c/.h`、`Core/Src/student_control.c`、`tests/`、CMake 与 firmware manifest。
- TI 示例 `src/device/board.syscfg`、生成文件、BSP、OLED 传输层及构建脚本。
- Studio `src/main/services/ti-mspm0-toolchain-service.ts`、`ti-mspm0-build-service.ts`、`ti-mspm0-candidate-build-service.ts` 与项目浏览/工作区相关代码。
- 本机 SDK `CUSTOM_BOARD/driverlib/empty_mspm0g3507`、GPIO/SYSTICK/UART SysConfig 元数据与设备引脚数据。
- [TI MSPM0 SDK Examples Guide](https://software-dl.ti.com/msp430/esd/MSPM0-SDK/latest/docs/english/sdk_users_guide/doc_guide/doc_guide-srcs/examples_guide.html)：官方空工程与 SysConfig 示例路径说明。
- [TI Starting Development with SysConfig for MSPM0](https://www.ti.com/video/series/development-with-sysconfig-mspm0.html)：生成配置代码并用于 SDK 应用工程的官方工作流。

## 12. 实施记录（2026-10-02）

首阶段独立工程已建立在 `D:\RobotDog\mspm0g3507_pony`，使用官方空工程模板、内部 SYSOSC 32 MHz、可编辑的 `board.syscfg` 和生成配置宏驱动的 BSP。已移植四路运动、安全与 RDS1、按键、RGB、蜂鸣器和 OLED；CCD/自动循线按约定暂缓，真实 IAP 保持不支持。

默认 Release 清洁生成、编译链接与两组 Arm C 回归通过；隔离工程修改舵机分频/计数及 OLED 总线速率后重新生成、完整构建通过。最终 Flash 为 14544 B、静态 RAM 为 3288 B，链接约束保留至少 4 KiB 栈空间。尚未烧录或完成实板波形及机械方向验收。

工程操作见 `D:\RobotDog\mspm0g3507_pony\README.md`，测试结果和实板验收清单见同目录 `VALIDATION.md`。阶段 A/C/E 的软件交付完成；阶段 B/D 已完成驱动与模拟故障测试，实板验收待执行。
