#ifndef ROBOTDOG_SAFETY_H
#define ROBOTDOG_SAFETY_H

#include "robotdog_types.h"

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    /*
     * Authoritative permission-to-move state.  The motion layer executes
     * actions, but this layer decides when an action must be revoked.
     */
    robotdog_mode_t mode;
    robotdog_action_t action;
    robotdog_stop_reason_t stop_reason;
    bool action_active;
    uint8_t strength;
    uint32_t action_started_ms;
    uint16_t action_lease_ms;
    uint32_t last_heartbeat_ms;
    uint32_t last_line_valid_ms;
    bool stop_event_pending;
} robotdog_safety_t;

/* Start in BOOT_SAFE and initialize all watchdog timestamps. */
void RobotDogSafety_Init(robotdog_safety_t *safety, uint32_t now_ms);

/* Release the power-on latch into IDLE after hardware initialization. */
void RobotDogSafety_SetReady(robotdog_safety_t *safety);

/* Validate and arm a manual action with heartbeat and lease supervision. */
robotdog_result_t RobotDogSafety_RequestManualAction(robotdog_safety_t *safety,
                                                     uint32_t now_ms,
                                                     robotdog_action_t action,
                                                     uint8_t strength,
                                                     uint16_t lease_ms);

/* Enter CCD/student-control mode; valid frames refresh the line watchdog. */
robotdog_result_t RobotDogSafety_EnterAutonomous(robotdog_safety_t *safety, uint32_t now_ms);

/* Enter the safe placeholder state reserved for future IAP support. */
robotdog_result_t RobotDogSafety_EnterUpdate(robotdog_safety_t *safety, uint32_t now_ms);

/* Refresh the heartbeat timestamp for the active manual controller. */
void RobotDogSafety_Heartbeat(robotdog_safety_t *safety, uint32_t now_ms);

/* Record a valid CCD observation for line-loss supervision. */
void RobotDogSafety_ReportLine(robotdog_safety_t *safety, uint32_t now_ms, bool line_valid);

/* Stop and return to IDLE while retaining the reason for diagnostics. */
void RobotDogSafety_Stop(robotdog_safety_t *safety, robotdog_stop_reason_t reason, uint32_t now_ms);

/* Latch ERROR_SAFE and force the requested reason. */
void RobotDogSafety_EnterError(robotdog_safety_t *safety, robotdog_stop_reason_t reason, uint32_t now_ms);

/* Run watchdog checks; true means this call caused a stop transition. */
bool RobotDogSafety_Tick(robotdog_safety_t *safety, uint32_t now_ms);

/* Consume the one-shot stop event used by output/indicator code. */
bool RobotDogSafety_TakeStopEvent(robotdog_safety_t *safety);

#endif /* ROBOTDOG_SAFETY_H */
