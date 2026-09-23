# CH32V203 引脚定义与复用表

本文记录当前工程采用的实际引脚分配。

## 当前分配

| 功能 | 引脚 | 复用/模式 | 说明 |
| --- | --- | --- | --- |
| 舵机 CH0，C / 左前 | PA6 | TIM3_CH1 PWM | 机械足舵机，固件中逻辑方向反转 |
| 舵机 CH1，D / 左后 | PA7 | TIM3_CH2 PWM | 机械足舵机，固件中逻辑方向反转 |
| 舵机 CH2，A / 右前 | PB0 | TIM3_CH3 PWM | 机械足舵机 |
| 舵机 CH3，B / 右后 | PB1 | TIM3_CH4 PWM | 机械足舵机 |
| 无源蜂鸣器 | PA8 | TIM1_CH1 PWM | 按键稳定抬起后鸣叫 0.5 秒 |
| OLED SCL | PB6 | I2C1_SCL 复用开漏 | SSD1306 硬件 I2C 时钟 |
| OLED SDA | PB7 | I2C1_SDA 复用开漏 | SSD1306 硬件 I2C 数据 |
| 状态 LED | PB8 | GPIO 输出 | 低电平点亮，1 Hz 闪烁 |
| 串口烧录 TX | PA9 | USART1_TX | 预留给串口烧录 / IAP |
| 串口烧录 RX | PA10 | USART1_RX | 预留给串口烧录 / IAP |
| 主串口 TX | PB10 | USART3_TX | 命令 / 回传主串口 |
| 主串口 RX | PB11 | USART3_RX | 命令 / 回传主串口 |
| CCD 模拟输出 | PA4 | ADC1_IN4 | 线阵 CCD AO |
| CCD SI | PA2 | GPIO 输出 | CCD 起始积分 |
| CCD CLK | PB3 | GPIO 输出 | CCD 时钟 |
| 按键 | PA1 | GPIO 上拉输入 | 低电平触发停止 |

## 释放 / 预留

| 引脚 | 旧用途 | 当前用途 |
| --- | --- | --- |
| PA8 | 尾巴舵机 / TIM1_CH1 | 无源蜂鸣器 / TIM1_CH1 |
| PB8 | 状态 LED | GPIO 输出 |
| PA0 | 单色状态灯 GPIO | 预留 |
| PB9 | TIM4_CH4 候选 | 预留 |

## 外设归属

| 外设 | 通道 / 引脚 | 归属 |
| --- | --- | --- |
| TIM1 | CH1 / PA8 | 无源蜂鸣器 PWM |
| TIM3 | CH1 PA6, CH2 PA7, CH3 PB0, CH4 PB1 | 四个腿部舵机 |
| I2C1 | SCL PB6, SDA PB7 | SSD1306 硬件 I2C |
| GPIOB | PB8 | 状态 LED |
| USART1 | TX PA9, RX PA10 | 串口烧录 / IAP 预留 |
| USART3 | TX PB10, RX PB11 | 主命令 / 反馈串口 |
| ADC1 | IN4 / PA4 | CCD 采样 |
| GPIO | PA2, PB3 | CCD SI / CLK |
| GPIO | PA1 | 按键 |

## 说明

- 尾巴舵机已从固件模型中删除，PA8 不再作为舵机输出。
- PB6/PB7 现在用于 I2C1 硬件 I2C 的 SSD1306 OLED，状态页每秒刷新一次。
- USART1 当前只完成了引脚和串口外设初始化，真正的串口烧录流程仍需 bootloader/IAP 支持。
- PB3 被 CCD_CLK 占用；如果调试口还在用 JTAG，需要先关闭 JTAG 或确认板上已经把 PB3 安全引出。
