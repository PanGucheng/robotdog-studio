#ifndef ROBOTDOG_STUDENT_BRIDGE_H
#define ROBOTDOG_STUDENT_BRIDGE_H

#include "robotdog_types.h"

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    /* Sensor snapshot; pixels points to the CCD driver's persistent buffer. */
    uint32_t now_ms;
    bool line_valid;
    uint8_t line_center;
    uint8_t threshold;
    const uint8_t *pixels;
} robotdog_student_bridge_input_t;

typedef struct {
    /* Sanitized student decision after enum and strength validation. */
    robotdog_action_t action;
    uint8_t strength;
    bool valid;
    robotdog_stop_reason_t invalid_reason;
} robotdog_student_bridge_output_t;

/* Reset student-control state before autonomous operation. */
void RobotDogStudentBridge_Init(void);

/* Adapt the student API to runtime types and reject unsafe output. */
void RobotDogStudentBridge_Update(const robotdog_student_bridge_input_t *input,
                                  robotdog_student_bridge_output_t *output);

#endif /* ROBOTDOG_STUDENT_BRIDGE_H */
