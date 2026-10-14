# 来源与许可

- RobotDog 业务代码、步态表、精简 OLED 字库与基线测试来自用户提供的 CH32 小马 0.2.5，继承 BSD-3-Clause，见 LICENSE。
- 工程模板来自 Texas Instruments MSPM0 SDK 2.11.00.07 的 CUSTOM_BOARD/driverlib/empty_mspm0g3507；模板和 SysConfig 输出保留 TI 文件中的 BSD-3-Clause 声明。
- TI 启动文件、DriverLib、CMSIS 在构建时从用户本机 SDK 引用，未复制其库二进制。其各自版权和许可证由 SDK 原文件保存。
- 沁恒外设库、RISC-V 启动/内核文件未用于 TI 固件。
- Unicorn 2.1.4、pyelftools 0.33 仅用于本地测试，安装在 build/test-tools，保留安装包自身许可；它们不链接到固件。
