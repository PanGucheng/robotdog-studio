# CH32V203 小马全功能固件 · 自由练习工程

这是基于 v2.5 全功能小马固件的自由练习工程模板。

主要编辑入口：

- `App/Src/experiment.c`：编写小马行为决策与控制逻辑；
- `App/Inc/experiment.h`：自定义函数和模块接口。

小马控制接口：

- `Core/Inc/student_control.h`：传感器输入结构体（`student_control_input_t`）与动作控制结构体（`student_control_output_t`）；
- `Core/Src/student_control.c`：桥接层，已自动将底层运行时的控制回调转发到 `Experiment_Init()` 和 `Experiment_Update()`；
- `student-config/line-following.yaml`：小马巡线及运动参数默认配置。

底层舵机步态、CCD 驱动、OLED 屏幕、串口协议及安全看门狗由固件安全适配层保护，不可直接修改。请通过 `experiment.c` 进行机器人行为设计。
