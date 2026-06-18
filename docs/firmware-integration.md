# CH32V203 固件适配要求

下位机仓库保持独立开发。为了接入 RobotDog Studio，需要下位机开发者提供：

1. 将命令、应答、状态和 CCD 数据统一到一个 UART，并实现 `serial-protocol-v1.md`。
2. 固件动作看门狗：运动命令默认最多运行 3 秒，通信断开时停止。
3. 稳定的命令行构建入口，推荐 CMake；不能只依赖 MounRiver/Eclipse `.cproject`。
4. `robotdog.project.json`，声明协议版本、芯片、构建产物和允许学生修改的文件。
5. 固定输出 ELF、HEX、BIN 和 size 信息。
6. 将学生参数和巡线逻辑从 `User/main.c` 拆分到明确的受控文件。

上位机开发期间使用沁恒定制 GCC/OpenOCD。开发者可在设置页选择本机目录；正式离线包使用经过许可核对和哈希校验的固定安装包。
