#include "experiment.h"

void Experiment_Init(void)
{
    /* 第一次编译：可以从修改这个初始化函数中的注释开始。 */
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
