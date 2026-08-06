#include "experiment.h"
#include "number_tools.h"

void Experiment_Init(void)
{
}

void Experiment_Update(const student_control_input_t *input,
                       student_control_output_t *output)
{
    if(output == 0)
    {
        return;
    }

    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = NumberTools_ClampU8(12U, 30U);

    if(input != 0 && input->line_valid)
    {
        output->action = STUDENT_ACTION_STAND;
    }
}
