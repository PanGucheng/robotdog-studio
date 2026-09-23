#include "experiment.h"

void Experiment_Init(void)
{
    /* 小马自由练习：在这里编写自己的初始化逻辑。 */
}

void Experiment_Update(const student_control_input_t *input,
                       student_control_output_t *output)
{
    if (output == 0)
    {
        return;
    }

    /* 默认安全停止 */
    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = 18U;

    /* 传感器有效且上电稳定后，可根据输入执行动作 */
    if (input != 0 && input->now_ms > 1000U)
    {
        output->action = STUDENT_ACTION_STAND;
    }
}
