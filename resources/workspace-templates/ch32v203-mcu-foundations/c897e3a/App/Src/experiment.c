#include "experiment.h"

void Experiment_Init(void)
{
    /* 第一阶段：在这里观察一个 C 模块的初始化入口。 */
}

void Experiment_Update(const student_control_input_t *input,
                       student_control_output_t *output)
{
    if(output == 0)
    {
        return;
    }

    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = 10U;

    if(input != 0 && input->now_ms > 1000U)
    {
        output->action = STUDENT_ACTION_STAND;
    }
}
