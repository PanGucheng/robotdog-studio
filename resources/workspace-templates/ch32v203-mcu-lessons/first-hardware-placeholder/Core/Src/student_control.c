#include "student_control.h"
#include "experiment.h"

void StudentControl_Init(void)
{
    Experiment_Init();
}

void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output)
{
    Experiment_Update(input, output);
}
