#ifndef STUDENT_CONTROL_H
#define STUDENT_CONTROL_H

#include <stdbool.h>
#include <stdint.h>

#define ROBOTDOG_CCD_PIXEL_COUNT 128U

/*
 * Actions exposed to student code; the bridge validates and maps them to the
 * runtime enum. STOP is also the safe default when input is unusable.
 */
typedef enum {
    STUDENT_ACTION_STOP = 0,
    STUDENT_ACTION_STAND,
    STUDENT_ACTION_WALK,
    STUDENT_ACTION_TURN_LEFT,
    STUDENT_ACTION_TURN_RIGHT
} student_action_t;

/*
 * Read-only sensor snapshot supplied to StudentControl_Update. `pixels` is
 * owned by the CCD driver and remains valid until the next capture.
 */
typedef struct {
    uint32_t now_ms;
    bool line_valid;
    uint8_t line_center;
    uint8_t line_target;
    int16_t line_error;
    uint8_t threshold;
    const uint8_t *pixels;
} student_control_input_t;

/* Student decision returned to the safety-controlled runtime. */
typedef struct {
    student_action_t action;
    uint8_t turn_strength;
} student_control_output_t;

void StudentControl_Init(void);

/*
 * Make one control decision. Timing, watchdogs, PWM writes and emergency
 * stopping are deliberately handled by outer runtime layers.
 */
void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output);

#endif /* STUDENT_CONTROL_H */
