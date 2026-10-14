# TI MSPM0G3507 完整小马例程

Studio 自由练习模板，移植版本 **0.2.5-ti.1**。入口 `src/main.c`，硬件配置 `board.syscfg`。通过 Studio 的 SysConfig 按钮重新配置并保存，然后使用“编译”生成 ELF/HEX/BIN。源码、启动、链接配置及生成文件均在独立学生工程中；工程内可以右键新建文件或文件夹。

包含 UART 调试协议、舵机、OLED、按键、RGB、蜂鸣器、运动控制及安全逻辑。使用 SYSOSC 32 MHz 与 1 ms SysTick。SDK DriverLib/CMSIS 从固定的 MSPM0 SDK 2.11.00.07 引用，使用 SysConfig 1.28.1、Arm GCC 9.2.1。

此模板来自独立工程 `mspm0g3507_pony`，Studio 提供构建入口，未附带其外部构建缓存或独立测试环境。`VALIDATION.md` 是来源工程的软件验收记录，不是 Studio 实板验收结果。

尚未烧录或验证物理外设、机械动作。CCD 巡线与 IAP 暂不支持。改动时钟、SysTick、引脚或舵机参数后须复验；学生自行调整运行逻辑。

SDK 生成文件与启动文件保留原版权声明，其他依赖见 `THIRD_PARTY_NOTICES.md` 和 `LICENSE`。
