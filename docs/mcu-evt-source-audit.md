# MCU 课程 EVT 来源与硬件差异审查

更新日期：2026-08-06

状态：阶段零初步审查；硬件课程发布前继续补充

## 1. 审查范围与使用原则

开发机参考目录：`D:\RobotDog\EVT`

该目录包含 WCH CH32V20x 外设库、启动文件、官方示例和 CH32V203C8T6 参考板资料。RobotDog Studio 只把它作为开发期参考源：

- 不修改 EVT 目录；
- 正式应用和课程模板不引用该绝对路径；
- 不把官方参考板的引脚或现象直接当作 RobotDog 板结论；
- 复制或改编 WCH 源码前单独核对文件头许可条件；
- 学生不得通过课程修改启动文件、链接脚本、Bootloader 或受保护固件层。

当前 WCH 示例文件头说明：相关软件及二进制用于南京沁恒微电子生产的微控制器。正式分发课程代码前仍需逐文件保留许可提示并复核再分发范围。

## 2. 已抽查的官方示例

| 示例 | 来源 | 官方示例结论 | 对 RobotDog 的结论 |
| --- | --- | --- | --- |
| GPIO Toggle | `EXAM/GPIO/GPIO_Toggle/User/main.c` | PA0 推挽输出，每 250 ms 翻转 | PA0 已用作 LED，可作为候选方向，但必须先真机确认 LED 电平和运动安全 |
| USART Printf | `EXAM/USART/USART_Printf/User/main.c` | USART1 TX 使用 PA9，115200 | 只能证明 API 和初始化顺序；PA9 是否可用于课程尚未确认 |
| TIM PWM Output | `EXAM/TIM/PWM_Output/User/main.c` | TIM1 CH1 使用 PA8 输出 PWM | PA8 已列入舵机 PWM 计划，不适合作为无风险首课直接使用 |
| EXTI0 | `EXAM/EXTI/EXTI0/User/main.c` | PA0 上拉输入，下降沿触发 EXTI0 | 与当前 PA0 LED 占用冲突，不能直接移植 |

参考板资料已确认存在：

- `PUB/SCHPCB/CH32V203C8T6-R0/CH32V203C8T6-R0.SchDoc`
- `PUB/SCHPCB/CH32V203C8T6-R1/CH32V203C8T6-R1.SchDoc`

这些是 WCH 参考板资料，不是 RobotDog 成品板原理图。

## 3. 当前 RobotDog 固件基线

活动基线来自 `resources/firmware-baselines/ch32v203-robotdog/active.json`：

- 芯片：CH32V203C8T6，已确认；
- 活动提交：`c897e3a1d82b2e4b59348d4ce75762c62a79c293`；
- 固件版本：0.2.1；
- 启动族：CH32V20x_D6；
- Flash：64 KiB；RAM：20 KiB；
- 开发通信：USART3 PB10/PB11，115200 8N1；
- 蓝牙最终绑定：未确认；
- IAP 分区：未确认。

因此，无硬件课程可以基于当前编译链开展；涉及下载协议、蓝牙或 IAP 的正式课程必须等待对应事项确认。

## 4. 当前引脚与外设占用矩阵

来源：固件仓库 `User/app_hal.h` 与 README。引脚名称仅表示当前软件计划，发布硬件课前还要与成品板原理图和实物复核。

| 功能 | 外设/引脚 | 当前判断 |
| --- | --- | --- |
| LED | PA0 | 已占用；GPIO Toggle 方向可候选，需确认有效电平 |
| 按键 | PA1，低电平按下 | 已占用；可候选，需验证上拉、消抖与实物按钮 |
| 命令/语音通信 | USART3，PB10/PB11，115200 | 已占用；不能同时作为无冲突通用串口课 |
| CCD 模拟输出 | ADC1_IN4，PA4 | 已占用；不得用于普通 GPIO 课 |
| CCD 时钟 | PB3 | 已占用；还需注意调试复用关系 |
| CCD SI | PA2 | 已占用 |
| 舵机 PWM 1–4 | TIM3 CH1–CH4：PA6、PA7、PB0、PB1 | 已占用；真机实验必须先解除运动风险 |
| 舵机 PWM 5 | TIM1 CH1：PA8 | 已占用；与 WCH PWM 示例相同引脚，但不能直接教学移植 |
| 调试/烧录 | WCH-Link / SWD 类调试接口 | 必须保留恢复通道；具体引脚随原理图复核 |

PA9、USART1、USART2 及其他候选引脚当前没有足够的 RobotDog 成品板信息，不能标记为空闲。

## 5. 第三个示例课决定

当前保留 `first-hardware-placeholder`：

- 状态：`draft + pending-hardware-check`；
- 开发模式可查看，打包版本隐藏；
- 不提供确定接线或烧录步骤；
- AI 必须说明尚未真机验证；
- 第一候选方向为板载 LED/PA0，但只有以下人工复核完成后才能定稿：
  1. 对照 RobotDog 成品板原理图确认 PA0 连接和有效电平；
  2. 连接实物确认 LED 不与其他功能冲突；
  3. 验证烧录、复位和恢复流程；
  4. 确认实验不会驱动舵机或造成意外运动；
  5. 记录硬件型号、测试版本、现象、问题和日期。

## 6. 仍需项目所有者人工确认

- RobotDog 成品板原理图与当前实物版本是否一致；
- PA0 LED 和 PA1 按键的实际连接及有效电平；
- SWD/WCH-Link 恢复接口、供电方式和安全断电流程；
- 蓝牙与 USART3 的最终关系；
- IAP/Bootloader 分区；
- 第三个示例课最终选择 LED、按键还是其他低风险方向。

