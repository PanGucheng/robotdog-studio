# CH32V203 单片机入门工程

这是 RobotDog Studio 单片机入门版的工程结构基础模板。

教学编辑区：

- `App/Src/experiment.c`：实验逻辑；
- `App/Inc/experiment.h`：实验模块接口。

`Core` 与 `student-config` 中的文件用于把实验安全接入当前 CH32V203 机器狗固件，默认只读。第一阶段先学习源文件、头文件、函数和编译过程；GPIO、UART 等外设实验将在真实硬件验证后逐步加入。
