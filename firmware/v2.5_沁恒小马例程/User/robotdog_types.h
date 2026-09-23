#ifndef ROBOTDOG_TYPES_H
#define ROBOTDOG_TYPES_H

#include <stdbool.h>
#include <stdint.h>

/* Version strings are reported by HELLO/CAPS/STATUS and the manifest. */
#define ROBOTDOG_FIRMWARE_VERSION "0.2.5"
#define ROBOTDOG_PROTOCOL_VERSION 1U
#define ROBOTDOG_BOARD_ID "robotdog-ch32v203c8t6"
#define ROBOTDOG_CHIP_ID "CH32V203C8T6"
#define ROBOTDOG_CCD_PIXELS 128U
#define ROBOTDOG_STRENGTH_MIN 1U
#define ROBOTDOG_STRENGTH_MAX 30U
#define ROBOTDOG_DEFAULT_STRENGTH 18U
#define ROBOTDOG_DEFAULT_LEASE_MS 500U
#define ROBOTDOG_MAX_LEASE_MS 2000U
#define ROBOTDOG_HEARTBEAT_TIMEOUT_MS 500U
#define ROBOTDOG_LINE_LOST_TIMEOUT_MS 500U
#define ROBOTDOG_STUDENT_PERIOD_MS 20U
#define ROBOTDOG_CCD_DEFAULT_RATE_HZ 5U
#define ROBOTDOG_CCD_MAX_RATE_HZ 20U

/* Motion requests accepted by the runtime and motion layers. */
typedef enum {
    ROBOTDOG_ACTION_STOP = 0,
    ROBOTDOG_ACTION_STAND,
    ROBOTDOG_ACTION_WALK,
    ROBOTDOG_ACTION_TURN_LEFT,
    ROBOTDOG_ACTION_TURN_RIGHT
} robotdog_action_t;

/* Runtime modes. Safety starts in BOOT_SAFE and then transitions to IDLE. */
typedef enum {
    ROBOTDOG_MODE_BOOT_SAFE = 0,
    ROBOTDOG_MODE_IDLE,
    ROBOTDOG_MODE_MANUAL_REMOTE,
    ROBOTDOG_MODE_AUTONOMOUS_LINE,
    ROBOTDOG_MODE_UPDATE_SAFE,
    ROBOTDOG_MODE_ERROR_SAFE
} robotdog_mode_t;

/* Reason retained in status after a stop or safety transition. */
typedef enum {
    ROBOTDOG_STOP_NONE = 0,
    ROBOTDOG_STOP_POWER_ON,
    ROBOTDOG_STOP_USER,
    ROBOTDOG_STOP_HEARTBEAT_TIMEOUT,
    ROBOTDOG_STOP_ACTION_LEASE_TIMEOUT,
    ROBOTDOG_STOP_LINE_LOST,
    ROBOTDOG_STOP_STUDENT_INVALID,
    ROBOTDOG_STOP_PROTOCOL_ERROR,
    ROBOTDOG_STOP_UPDATE_REQUEST,
    ROBOTDOG_STOP_RUNTIME_ERROR
} robotdog_stop_reason_t;

/* Protocol-level result codes returned in RDS1 responses. */
typedef enum {
    ROBOTDOG_RESULT_OK = 0,
    ROBOTDOG_RESULT_BAD_COMMAND,
    ROBOTDOG_RESULT_BAD_ARGUMENT,
    ROBOTDOG_RESULT_BUSY,
    ROBOTDOG_RESULT_UNSAFE_STATE,
    ROBOTDOG_RESULT_NOT_SUPPORTED
} robotdog_result_t;

const char *RobotDogAction_Name(robotdog_action_t action);
const char *RobotDogMode_Name(robotdog_mode_t mode);
const char *RobotDogStopReason_Name(robotdog_stop_reason_t reason);
const char *RobotDogResult_Code(robotdog_result_t result);
bool RobotDogAction_FromName(const char *name, robotdog_action_t *action);

#endif /* ROBOTDOG_TYPES_H */
