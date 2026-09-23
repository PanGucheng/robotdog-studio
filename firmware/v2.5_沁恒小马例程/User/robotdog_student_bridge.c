#include "robotdog_student_bridge.h"

#include "student_config.generated.h"
#include "student_control.h"

/*
 * Trust boundary around replaceable student code.  The bridge constructs a
 * read-only input snapshot, initializes safe defaults, and validates every
 * returned enum/strength before the runtime can reach the motion layer.
 */
static robotdog_action_t map_student_action(student_action_t action, bool *ok)
{
    *ok = true;

    switch(action)
    {
    case STUDENT_ACTION_STOP:
        return ROBOTDOG_ACTION_STOP;
    case STUDENT_ACTION_STAND:
        return ROBOTDOG_ACTION_STAND;
    case STUDENT_ACTION_WALK:
        return ROBOTDOG_ACTION_WALK;
    case STUDENT_ACTION_TURN_LEFT:
        return ROBOTDOG_ACTION_TURN_LEFT;
    case STUDENT_ACTION_TURN_RIGHT:
        return ROBOTDOG_ACTION_TURN_RIGHT;
    default:
        *ok = false;
        return ROBOTDOG_ACTION_STOP;
    }
}

void RobotDogStudentBridge_Init(void)
{
    StudentControl_Init();
}

void RobotDogStudentBridge_Update(const robotdog_student_bridge_input_t *input,
                                  robotdog_student_bridge_output_t *output)
{
    student_control_input_t student_input;
    student_control_output_t student_output;
    bool action_ok = false;

    if(output == 0)
    {
        return;
    }

    /* Safe defaults remain in force if any pointer or student result is bad. */
    output->action = ROBOTDOG_ACTION_STOP;
    output->strength = STUDENT_CONFIG_TURN_STRENGTH;
    output->valid = false;
    output->invalid_reason = ROBOTDOG_STOP_STUDENT_INVALID;

    if(input == 0 || input->pixels == 0)
    {
        return;
    }

    student_input.now_ms = input->now_ms;
    student_input.line_valid = input->line_valid;
    student_input.line_center = input->line_center;
    student_input.line_target = STUDENT_CONFIG_LINE_TARGET;
    /* Positive error means the measured center lies to the target's right. */
    student_input.line_error = (int16_t)((int16_t)input->line_center - (int16_t)STUDENT_CONFIG_LINE_TARGET);
    student_input.threshold = input->threshold;
    student_input.pixels = input->pixels;

    student_output.action = STUDENT_ACTION_STOP;
    student_output.turn_strength = STUDENT_CONFIG_TURN_STRENGTH;

    StudentControl_Update(&student_input, &student_output);

    output->action = map_student_action(student_output.action, &action_ok);
    output->strength = student_output.turn_strength;

    if(!action_ok)
    {
        output->action = ROBOTDOG_ACTION_STOP;
        return;
    }

    /* Strength is meaningful only for moving gaits and must stay in 1..30. */
    if((output->action == ROBOTDOG_ACTION_WALK ||
        output->action == ROBOTDOG_ACTION_TURN_LEFT ||
        output->action == ROBOTDOG_ACTION_TURN_RIGHT) &&
       (output->strength < ROBOTDOG_STRENGTH_MIN || output->strength > ROBOTDOG_STRENGTH_MAX))
    {
        output->action = ROBOTDOG_ACTION_STOP;
        return;
    }

    output->valid = true;
    output->invalid_reason = ROBOTDOG_STOP_NONE;
}
