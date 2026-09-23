#ifndef ROBOTDOG_RUNTIME_H
#define ROBOTDOG_RUNTIME_H

#include "robotdog_safety.h"
#include "robotdog_student_bridge.h"

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    /* Combined view of safety permission and the current PWM action. */
    robotdog_mode_t mode;
    robotdog_action_t action;
    robotdog_stop_reason_t stop_reason;
    bool action_active;
    uint8_t strength;
    const char *motion_name;
} robotdog_runtime_status_t;

/* Initialize safety, motion and student-control layers. */
void RobotDogRuntime_Init(uint32_t now_ms);

/* 1 ms tick: watchdog decisions run before motion timing. */
void RobotDogRuntime_Tick1ms(uint32_t now_ms);

/* Validate and start a manual action. */
robotdog_result_t RobotDogRuntime_RequestManualAction(uint32_t now_ms,
                                                      robotdog_action_t action,
                                                      uint8_t strength,
                                                      uint16_t lease_ms);

/* Refresh the current manual controller heartbeat. */
void RobotDogRuntime_Heartbeat(uint32_t now_ms);

/* Stop safety and motion layers and retain the diagnostic reason. */
void RobotDogRuntime_Stop(uint32_t now_ms, robotdog_stop_reason_t reason);

/* Select autonomous line following; motion waits for a valid CCD decision. */
robotdog_result_t RobotDogRuntime_EnterAutonomous(uint32_t now_ms);

/* Return to the safe idle state. */
robotdog_result_t RobotDogRuntime_EnterIdle(uint32_t now_ms);

/* Select the reserved update-safe state and stop motion. */
robotdog_result_t RobotDogRuntime_EnterUpdate(uint32_t now_ms);

/* Pass the latest CCD snapshot through the student bridge. */
void RobotDogRuntime_UpdateCcd(const robotdog_student_bridge_input_t *input);

/* Copy a status snapshot for RDS1 STATUS and OLED rendering. */
void RobotDogRuntime_GetStatus(robotdog_runtime_status_t *status);

#endif /* ROBOTDOG_RUNTIME_H */
