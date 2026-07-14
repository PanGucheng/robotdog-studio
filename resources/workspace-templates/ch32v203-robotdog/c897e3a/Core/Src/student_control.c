#include "student_control.h"
#include "student_config.generated.h"

void StudentControl_Init(void)
{
}

void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output)
{
    const int16_t deadband = 8;

    if(output == 0)
    {
        return;
    }

    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = STUDENT_CONFIG_TURN_STRENGTH;

    if(input == 0 || !input->line_valid || input->pixels == 0)
    {
        return;
    }

    if(input->line_error < -deadband)
    {
        output->action = STUDENT_ACTION_TURN_LEFT;
    }
    else if(input->line_error > deadband)
    {
        output->action = STUDENT_ACTION_TURN_RIGHT;
    }
    else
    {
        output->action = STUDENT_ACTION_WALK;
    }
}
