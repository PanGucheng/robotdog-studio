#ifndef ROBOTDOG_MOTION_H
#define ROBOTDOG_MOTION_H

#include "robotdog_types.h"

#include <stdbool.h>
#include <stdint.h>

/* Snapshot used by STATUS/OLED; servo_us is indexed by logical CH0..CH3. */
typedef struct {
    bool active;
    const char *action_name;
    uint16_t servo_us[4];
} robotdog_motion_status_t;

/* Configure TIM3 PWM and initialize all channels at the 90-degree pose. */
void RobotDogMotion_Init(void);
/* Start or replace a repeating high-level action. */
bool RobotDogMotion_Request(robotdog_action_t action, uint8_t strength, uint16_t lease_ms);
/* Cancel motion and move all four servos toward the safe 90 degree pose. */
void RobotDogMotion_Stop(robotdog_stop_reason_t reason);
/* Advance action sequencing and servo slew by one millisecond. */
void RobotDogMotion_Tick1ms(void);
/* Consume the one-shot "a complete repeating cycle ended" notification. */
bool RobotDogMotion_TakeCycleCompleted(void);
/* Copy active gait name and the four physical PWM pulse widths. */
void RobotDogMotion_GetStatus(robotdog_motion_status_t *status);

#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
bool RobotDogMotion_RequestLegacyName(const char *name);
bool RobotDogMotion_SetServoDeg(uint8_t channel, uint16_t deg);
bool RobotDogMotion_SetServoPulse(uint8_t channel, uint16_t us);
#endif

#endif /* ROBOTDOG_MOTION_H */
