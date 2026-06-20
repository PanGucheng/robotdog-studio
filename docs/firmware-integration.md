# CH32V203 固件适配要求

可直接交付下位机开发者的完整需求、接口、优先级与验收表见 [RobotDog CH32V203 下位机固件修改要求](./firmware-developer-modification-requirements.md)。本页仅保留上位机侧的摘要。

下位机仓库保持独立开发。为了接入 RobotDog Studio，需要下位机开发者提供：

1. 将命令、应答、状态和 CCD 数据统一到蓝牙运行态 UART，并实现 `serial-protocol-v1.md`。
2. 为板载有线 UART 提供受保护 IAP Bootloader、强制升级按键和明确的 APP Flash 分区；学生下载不能覆盖 Bootloader。
3. 蓝牙 UART 与有线下载 UART 使用独立外设或具有可靠硬件隔离，避免两个发送端并联争用。
4. 固件动作看门狗：持续运动依赖心跳，建议 300–500ms 超时停止；单次运动仍受最长租约限制。
5. 稳定的命令行构建入口，推荐 CMake；不能只依赖 MounRiver/Eclipse `.cproject`。
6. `robotdog.project.json`，声明协议版本、芯片、硬件板型、Flash 分区、构建产物和允许学生修改的文件。
7. 固定输出 ELF、HEX、BIN、MAP 和 size 信息，并为 BIN 生成带板型、版本、长度及校验信息的下载包。
8. 将学生参数和巡线逻辑从 `User/main.c` 拆分到明确的受控文件。

完整的通道职责、下载状态机和验收要求见 `three-channel-connection-plan.md`。

上位机开发期间使用沁恒定制 GCC/OpenOCD。开发者可在设置页选择本机目录；正式离线包使用经过许可核对和哈希校验的固定安装包。
