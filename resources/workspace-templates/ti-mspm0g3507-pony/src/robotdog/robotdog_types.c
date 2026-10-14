#include "robotdog_types.h"

#include <string.h>

/*
 * Stable string conversion shared by protocol, OLED and tests. Keep returned
 * names lowercase because they are part of the externally visible RDS1 API.
 * Unknown enum values use explicit fallback strings instead of NULL.
 */
const char *RobotDogAction_Name(robotdog_action_t action)
{
    switch(action)
    {
    case ROBOTDOG_ACTION_STAND:
        return "stand";
    case ROBOTDOG_ACTION_WALK:
        return "walk";
    case ROBOTDOG_ACTION_TURN_LEFT:
        return "turn_left";
    case ROBOTDOG_ACTION_TURN_RIGHT:
        return "turn_right";
    case ROBOTDOG_ACTION_STOP:
    default:
        return "stop";
    }
}

const char *RobotDogMode_Name(robotdog_mode_t mode)
{
    switch(mode)
    {
    case ROBOTDOG_MODE_BOOT_SAFE:
        return "boot_safe";
    case ROBOTDOG_MODE_IDLE:
        return "idle";
    case ROBOTDOG_MODE_MANUAL_REMOTE:
        return "manual_remote";
    case ROBOTDOG_MODE_AUTONOMOUS_LINE:
        return "autonomous_line";
    case ROBOTDOG_MODE_UPDATE_SAFE:
        return "update_safe";
    case ROBOTDOG_MODE_ERROR_SAFE:
        return "error_safe";
    default:
        return "unknown";
    }
}

const char *RobotDogStopReason_Name(robotdog_stop_reason_t reason)
{
    switch(reason)
    {
    case ROBOTDOG_STOP_NONE:
        return "none";
    case ROBOTDOG_STOP_POWER_ON:
        return "power_on";
    case ROBOTDOG_STOP_USER:
        return "user";
    case ROBOTDOG_STOP_HEARTBEAT_TIMEOUT:
        return "heartbeat_timeout";
    case ROBOTDOG_STOP_ACTION_LEASE_TIMEOUT:
        return "action_lease_timeout";
    case ROBOTDOG_STOP_LINE_LOST:
        return "line_lost";
    case ROBOTDOG_STOP_STUDENT_INVALID:
        return "student_invalid";
    case ROBOTDOG_STOP_PROTOCOL_ERROR:
        return "protocol_error";
    case ROBOTDOG_STOP_UPDATE_REQUEST:
        return "update_request";
    case ROBOTDOG_STOP_RUNTIME_ERROR:
        return "runtime_error";
    default:
        return "unknown";
    }
}

const char *RobotDogResult_Code(robotdog_result_t result)
{
    switch(result)
    {
    case ROBOTDOG_RESULT_OK:
        return "OK";
    case ROBOTDOG_RESULT_BAD_COMMAND:
        return "BAD_COMMAND";
    case ROBOTDOG_RESULT_BAD_ARGUMENT:
        return "BAD_ARGUMENT";
    case ROBOTDOG_RESULT_BUSY:
        return "BUSY";
    case ROBOTDOG_RESULT_UNSAFE_STATE:
        return "UNSAFE_STATE";
    case ROBOTDOG_RESULT_NOT_SUPPORTED:
        return "NOT_SUPPORTED";
    default:
        return "BAD_COMMAND";
    }
}

bool RobotDogAction_FromName(const char *name, robotdog_action_t *action)
{
    /* Parsing is intentionally exact and case-sensitive for deterministic commands. */
    if(name == 0 || action == 0)
    {
        return false;
    }

    if(strcmp(name, "stop") == 0)
    {
        *action = ROBOTDOG_ACTION_STOP;
        return true;
    }
    if(strcmp(name, "stand") == 0)
    {
        *action = ROBOTDOG_ACTION_STAND;
        return true;
    }
    if(strcmp(name, "walk") == 0)
    {
        *action = ROBOTDOG_ACTION_WALK;
        return true;
    }
    if(strcmp(name, "turn_left") == 0 || strcmp(name, "turnl") == 0)
    {
        *action = ROBOTDOG_ACTION_TURN_LEFT;
        return true;
    }
    if(strcmp(name, "turn_right") == 0 || strcmp(name, "turnr") == 0)
    {
        *action = ROBOTDOG_ACTION_TURN_RIGHT;
        return true;
    }

    return false;
}
