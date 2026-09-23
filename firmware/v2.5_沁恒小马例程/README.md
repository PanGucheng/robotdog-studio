# CH32V203 小马四足机器人固件

本工程是基于沁恒 `CH32V203C8T6` 的四足机器人控制固件，当前固件版本为 **0.2.5**。工程集成四路舵机步态、线阵 CCD 循线、RDS1 串口调试协议、SSD1306 OLED 状态显示、状态 LED、按键停机和无源蜂鸣器提示。

固件上电后首先进入安全状态，四只腿回到逻辑 `90°` 姿态，不会自动行走。运动只能由 USART3 命令或循线模式触发。

## 1. 硬件概况

- MCU：`CH32V203C8T6`
- 指令集：RISC-V `rv32imac / ilp32`
- Flash：64 KB；RAM：20 KB
- 启动文件：`Startup/startup_ch32v20x_D6.S`
- 链接脚本：`Ld/Link.ld`
- 调试接口：关闭完整 JTAG、保留 SWD，以便 PB3 用作 CCD 时钟

## 2. 当前引脚分配

| 功能 | 引脚 | 外设/模式 | 说明 |
| --- | --- | --- | --- |
| 左前腿 C / CH0 | PA6 | TIM3_CH1 PWM | 软件方向反转 |
| 左后腿 D / CH1 | PA7 | TIM3_CH2 PWM | 软件方向反转 |
| 右前腿 A / CH2 | PB0 | TIM3_CH3 PWM | 正常方向 |
| 右后腿 B / CH3 | PB1 | TIM3_CH4 PWM | 正常方向 |
| 无源蜂鸣器 | PA8 | TIM1_CH1 PWM | 2 kHz，按键抬起后响 0.5 s |
| 按键 | PA1 | 上拉输入 | 低电平按下，20 ms 消抖，按下停机 |
| CCD SI | PA2 | 推挽输出 | CCD 起始脉冲 |
| CCD AO | PA4 | ADC1_IN4 | CCD 模拟输出 |
| CCD CLK | PB3 | 推挽输出 | CCD 移位时钟 |
| OLED SCL | PB6 | I2C1_SCL 复用开漏 | SSD1306 硬件 I2C |
| OLED SDA | PB7 | I2C1_SDA 复用开漏 | SSD1306 硬件 I2C |
| 状态 LED | PB8 | 推挽输出 | 低电平点亮，亮灭各 0.5 s |
| 预留烧录 TX | PA9 | USART1_TX | 115200 8N1，仅初始化，未实现 IAP |
| 预留烧录 RX | PA10 | USART1_RX | 115200 8N1，仅初始化，未实现 IAP |
| 命令串口 TX | PB10 | USART3_TX | RDS1 命令/回传，115200 8N1 |
| 命令串口 RX | PB11 | USART3_RX | RDS1 命令/回传，115200 8N1 |

完整复用说明见 [`docs/pin-assignment.md`](docs/pin-assignment.md)。原尾巴舵机已删除，PA8 现用于蜂鸣器。

## 3. 上电行为与 OLED

1. TIM3 四路 PWM 初始化为中位脉宽，运动状态保持停止。
2. PB8 LED 立即点亮，之后每 500 ms 翻转一次，完整周期为 1 s。
3. OLED 初始化后显示状态页，每 1 s 重绘一次。
4. CCD 每 50 ms 采集一次，物理采样率约 20 Hz。
5. 按键稳定按下时停机；稳定抬起时蜂鸣器鸣叫 500 ms。

OLED 当前显示五行信息：

- `mode`：`idle`、`manual_remote`、`autonomous_line` 等运行模式
- `action`：安全层记录的动作请求
- `motion`：运动层实际执行的步态名
- `ccd`：是否找到线、中心和阈值
- `stop`：最近停机原因、TX 丢帧数和 RX 溢出数

OLED 使用硬件 `I2C1`，100 kHz，7 位地址为 `0x3C`，总线写地址字节为 `0x78`。PB6/PB7 应有上拉电阻。

## 4. 软件结构

| 模块 | 职责 |
| --- | --- |
| `User/main.c` | 硬件初始化、USART3 中断、1 ms 主循环、OLED/LED/蜂鸣器任务 |
| `User/app_hal.h` | 应用引脚、外设和时序常量的统一定义 |
| `User/robotdog_protocol.*` | RDS1 逐字节解析、参数校验和响应格式化 |
| `User/robotdog_tx_queue.*` | USART3 高/普通优先级发送，防止 CCD 阻塞命令 |
| `User/robotdog_safety.*` | 上电安全、动作租约、心跳和丢线超时 |
| `User/robotdog_runtime.*` | 协调安全层、学生控制层与运动层 |
| `User/robotdog_motion.*` | TIM3 PWM、步态表、动作循环和舵机缓动 |
| `User/ccd_line_sensor.*` | 128 点 CCD 采集、阈值、边缘和中心提取 |
| `Core/Src/student_control.c` | 可调整的循线决策逻辑 |
| `User/robotdog_student_bridge.*` | 校验学生算法动作和强度 |
| `User/robotdog_telemetry.*` | CCD 数据流调度和 RDS1 DATA 帧 |
| `User/ssd1306_oled.*` | I2C1 OLED 初始化、显存绘制和刷新 |
| `User/robotdog_text.*` | 无动态内存、带边界检查的文本构造器 |

工程未使用 RTOS。主循环以 `Delay_Ms(1)` 为时间基准，依次处理 LED/蜂鸣器、串口错误和按键、CCD、安全/运动、协议、遥测和 OLED。USART3 中断只搬运字节，不解析字符串。

## 5. 舵机和步态

四路舵机共用 TIM3，PWM 周期 20 ms，脉宽范围 `500~2500 us`，逻辑 `90°` 对应 `1500 us`。由于机械镜像，CH0、CH1 在角度转脉宽前反转方向。

标准动作包括：

- `stop`：取消动作并将四路目标角设为 `90°`
- `stand`：四路保持 `90°`
- `walk`：16 个相位，每相位 75 ms
- `turn_left`：8 个相位，每相位 75 ms
- `turn_right`：8 个相位，每相位 75 ms

动作相位只设置目标角。缓动任务每 10 ms 最多移动 3°，所以机械到位时间可能晚于相位切换时间。收到不同动作时，当前实现立即从新动作第 0 相位开始。`strength` 已被安全层校验，但固定步态表暂未用它缩放振幅。

## 6. CCD 判线与循线

每帧包含 128 个 8 位像素。处理流程如下：

1. 产生 SI/CLK 起始时序。
2. 逐点读取 PA4 的 12 位 ADC，右移 4 位保存为 8 位值。
3. 忽略两侧各 5 个易受干扰的像素。
4. 计算有效区 `min`、`max`，阈值取 `(min + max) / 2`。
5. 只有对比度 `max - min >= 8` 时继续找线。
6. 连续 3 亮到连续 3 暗确定左边缘，反向寻找右边缘。
7. 两边缘有效时，中心取其平均值。
8. 与上一有效中心相差超过 70 的单帧突变会被拒绝。

未找到线时 `line_valid=false`。此时 `center` 可能保留上次有效值，仅供诊断；控制必须以 `line_valid` 为准。

默认参数位于 `student-config/line-following.yaml`：

```yaml
turn_strength: 18
line_target: 64
```

默认算法死区为 8：

- `line_error < -8`：左转
- `line_error > 8`：右转
- 误差在死区内：前进
- 无有效线：停止，绝不盲目前进

策略更新上限为每 20 ms 一次；CCD 每 50 ms 才产生一帧，因此实际新决策频率约 20 Hz。连续 500 ms 无有效线时，安全层退出自动模式并以 `line_lost` 停机。

## 7. USART3 和 RDS1 协议

串口为 `115200 8N1`、无流控。USB-TTL 的 TX 接 PB11、RX 接 PB10，并确保共地。命令必须带 CR、LF 或 CRLF 行尾。

格式：

```text
@RDS1 REQ <序号> <命令> [参数]
```

常用命令：

```text
@RDS1 REQ 1 HELLO
@RDS1 REQ 2 CAPS
@RDS1 REQ 3 PING
@RDS1 REQ 4 STATUS
@RDS1 REQ 5 ACTION stand strength=18 lease_ms=500
@RDS1 REQ 6 ACTION walk strength=18 lease_ms=500
@RDS1 REQ 7 ACTION turn_left strength=18 lease_ms=500
@RDS1 REQ 8 ACTION turn_right strength=18 lease_ms=500
@RDS1 REQ 9 HEARTBEAT
@RDS1 REQ 10 STOP
@RDS1 REQ 11 MODE auto
@RDS1 REQ 12 MODE idle
@RDS1 REQ 13 CCD ON rate_hz=5
@RDS1 REQ 14 CCD ONCE
@RDS1 REQ 15 CCD OFF
```

协议规则：

- 命令关键字区分大小写，动作名使用小写。
- `strength` 范围为 `1~30`。
- `lease_ms` 最大 2000 ms，省略时默认 500 ms。
- 手动动作会循环执行，并非只走一个周期，但租约到期会停止。
- 手动模式要求心跳间隔小于 500 ms。心跳不延长动作租约；持续遥控应周期性重发 ACTION，并发送 HEARTBEAT。
- CCD 遥测支持 `1~20 Hz`，大帧为普通优先级，命令响应为高优先级。
- RX 环形缓冲区溢出会触发 `protocol_error` 停机。

响应示例：

```text
@RDS1 RES 1 OK device_id=... board=robotdog-ch32v203c8t6 chip=CH32V203C8T6 fw=0.2.5 protocol=1
@RDS1 RES 2 ERR code=BAD_ARGUMENT
```

发布构建关闭旧版 `test/status/action/servo/ccd` 文本命令，也没有直接设置单个舵机角度的 RDS1 命令。

## 8. 安全机制

- 上电从 `boot_safe` 进入 `idle`，运动保持停止。
- 按键按下直接产生用户停机。
- 手动动作同时受 500 ms 心跳和动作租约约束。
- 自动循线连续 500 ms 无有效线会停机。
- 学生算法输出未知动作或越界强度时进入 `error_safe`。
- 串口 RX 溢出会停止动作。
- `STOP` 或 `MODE idle` 取消步态并回到 `90°`。

## 9. USART1 串口烧录现状

PA9/PA10 已按 USART1 115200 8N1 初始化，作为未来 Bootloader/IAP 的硬件预留，但当前没有 Flash 擦写、固件校验、分区跳转和掉电保护逻辑。

因此当前版本不能仅靠 USART1 烧录。`ENTER_IAP` 只停止运动、进入 `update_safe` 并返回 `supported=0`。请使用 WCH-Link/SWD 或 MounRiver Studio 支持的下载方式。

## 10. 构建

### CMake + Ninja

需要 CMake 3.24+、Ninja、Python 3 和 WCH RISC-V Embedded GCC12：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/WCH/Toolchain/RISC-V Embedded GCC12"
cmake --build --preset robotdog-release
```

默认产物位于 `out/robotdog-release`：

- `RobotDog.elf`、`RobotDog.hex`、`RobotDog.bin`
- `RobotDog.map`、`RobotDog.size.txt`
- `RobotDog.sha256.txt`、`RobotDog.input.json`

构建会把 YAML 转换成生成头文件，并检查 Flash 至少保留 8 KB。

### MounRiver Studio

可打开 `GPIO_Toggle.wvproj` 或 `GPIO_Toggle.code-workspace`，选择 CH32V203 工具链后 Build；IDE 产物位于 `obj`。

## 11. 主机测试

```powershell
python tests/run_host_tests.py --require-c-compiler
```

测试覆盖配置生成、RDS1 解析/格式化、安全边界、学生桥接、连续 2000 帧 CCD 格式化，以及 TX 拥塞/优先级。无 `gcc` 或 `clang` 时可用 `--cc` 指定编译器。

## 12. 常见排查

- 舵机乱动：先断舵机动力，核对 PA6/PA7/PB0/PB1、共地和 5 V 电源容量。
- OLED 不亮：确认地址 `0x3C`、PB6/PB7 上拉、供电和 I2C1 波形；`0x78` 是写地址字节。
- 串口无响应：确认使用 USART3 而非预留 USART1，检查交叉接线、共地、115200 8N1 和行尾。
- ACTION 很快停止：检查 `lease_ms` 和心跳，用 STATUS 查看 `stop_reason`。
- 自动循线不走：先发 `CCD ON rate_hz=5`，观察 `valid/min/max/threshold/center`；`valid=0` 时按设计停止。
- PB3 无波形：确认完整 JTAG 已关闭；当前固件保留 SWD。

烧录联调步骤另见 [`调试说明.md`](调试说明.md)。

## 13. 已知限制

- USART1 IAP/串口烧录尚未实现。
- 蓝牙与 USART3 的最终硬件绑定尚未确认，当前按普通 TTL 串口使用。
- 当前 `strength` 不改变固定步态振幅。
- 自动动作改变时会立即从新动作第 0 相位开始；运动层虽有周期完成标志，运行时尚未用它延迟切换。
- OLED 初始化失败后本次上电不会自动重新探测，排除硬件问题后需复位。

## 14. 许可证

RobotDog 自有代码采用 BSD-3-Clause。沁恒启动文件、外设库和其他第三方文件保留各自声明；打包或再分发前请阅读 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
