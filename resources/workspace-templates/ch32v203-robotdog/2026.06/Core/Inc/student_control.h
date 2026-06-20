#ifndef STUDENT_CONTROL_H
#define STUDENT_CONTROL_H

#include <stdbool.h>
#include <stdint.h>

#define ROBOTDOG_CCD_PIXEL_COUNT 128U

typedef enum {
    STUDENT_ACTION_STOP = 0,
    STUDENT_ACTION_STAND,
    STUDENT_ACTION_WALK,
    STUDENT_ACTION_TURN_LEFT,
    STUDENT_ACTION_TURN_RIGHT
} student_action_t;

typedef struct {
    uint32_t now_ms;
    bool line_valid;
    uint8_t line_center;
    uint8_t line_target;
    int16_t line_error;
    uint8_t threshold;
    const uint8_t *pixels;
} student_control_input_t;

typedef struct {
    student_action_t action;
    uint8_t turn_strength;
} student_control_output_t;

void StudentControl_Init(void);
void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output);

#endif
