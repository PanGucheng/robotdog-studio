#include "student_control.h"
#include "student_config.generated.h"

void StudentControl_Init(void)
{
    /* 初始化阶段暂时没有需要保存的状态。 */
}

void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output)
{
    if (output == 0) {
        return;
    }

    /* 每次先选择停止，传感器无效或代码遗漏时小马不会继续走。 */
    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = STUDENT_TURN_STRENGTH;
    if (input == 0 || !input->line_valid) {
        return;
    }

    if (input->line_error < -4) {
        output->action = STUDENT_ACTION_TURN_LEFT;
    } else if (input->line_error > 4) {
        output->action = STUDENT_ACTION_TURN_RIGHT;
    } else {
        output->action = STUDENT_ACTION_WALK;
    }
}
