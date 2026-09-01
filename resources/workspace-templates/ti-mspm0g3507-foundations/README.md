# TI MSPM0G3507 GPIO 教学工程

这是 RobotDog Studio TI MSPM0 教学版的最小真实工程。

- `gpio_toggle_output.syscfg`：硬件资源配置，请使用工程文件标题右侧的“SysConfig”按钮打开。
- `src/main.c`：学生应用程序，可以直接编辑。
- `generated/`：构建时由 SysConfig CLI 重新生成，不要手工修改。
- `gcc/device_linker.lds`：MSPM0G3507 GNU 链接脚本，不要手工修改。

构建固定使用 MSPM0 SDK 2.11.00.07、SysConfig 1.28.1 和 GNU Arm Embedded 9-2019-q4-major。
