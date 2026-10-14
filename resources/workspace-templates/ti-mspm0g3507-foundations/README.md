# TI 机器马板第一课：两路 LED

目标芯片 MSPM0G3507SPMR，LQFP-64，内部 SYSOSC 32 MHz。RGB：红 PA5、绿 PA26、蓝 PA6，低电平点亮。

- gpio_toggle_output.syscfg：预配绿色输出和保持熄灭的红色输出；学生在 SysConfig 中添加 LED_BLUE / PA6 / Output / Initial Value=Set。
- src/main.c：修改 blink_interval_ms，再将 GPIO_LEDS_LED_GREEN_PIN 改为 GPIO_LEDS_LED_BLUE_PIN。
- generated/：编译时由 SysConfig 重新生成；不手工修改。
- gcc/：启动和链接配置，保持受保护。

通过 Studio 的“配置芯片 · SysConfig”打开当前工程配置，保存后回到 Studio 编译，再通过 CMSIS-DAP/SWD 烧录。使用 MSPM0 SDK 2.11.00.07、SysConfig 1.28.1、Arm GCC 9-2019-q4-major。

本课只控制灯，不初始化舵机、OLED、蜂鸣器或通信。课程正在作者验证阶段；新的 GPIO 灯实验尚未完成真机验收，不能沿用旧 LaunchPad 工程的硬件验证结论。
