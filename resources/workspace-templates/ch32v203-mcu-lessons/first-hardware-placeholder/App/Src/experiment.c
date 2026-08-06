#include "experiment.h"

void Experiment_Init(void)
{
    /* 硬件方向尚未确认。本占位模板不初始化任何外设。 */
}

void Experiment_Update(const student_control_input_t *input,
                       student_control_output_t *output)
{
    (void)input;
    if(output != 0)
    {
        output->action = STUDENT_ACTION_STOP;
        output->turn_strength = 0U;
    }
}
