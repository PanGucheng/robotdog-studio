#include "robotdog_safety.h"

/*
 * Safety state machine.  This module contains no hardware access: it validates
 * transitions and turns elapsed-time conditions into stop events.  Unsigned
 * subtraction is used throughout so millisecond counter rollover is safe.
 */
static bool elapsed_at_least(uint32_t now_ms, uint32_t start_ms, uint32_t period_ms)
{
    return (uint32_t)(now_ms - start_ms) >= period_ms;
}

static bool action_needs_strength(robotdog_action_t action)
{
    return action == ROBOTDOG_ACTION_WALK ||
           action == ROBOTDOG_ACTION_TURN_LEFT ||
           action == ROBOTDOG_ACTION_TURN_RIGHT;
}

void RobotDogSafety_Init(robotdog_safety_t *safety, uint32_t now_ms)
{
    if(safety == 0)
    {
        return;
    }

    safety->mode = ROBOTDOG_MODE_BOOT_SAFE;
    safety->action = ROBOTDOG_ACTION_STOP;
    safety->stop_reason = ROBOTDOG_STOP_POWER_ON;
    safety->action_active = false;
    safety->strength = ROBOTDOG_DEFAULT_STRENGTH;
    safety->action_started_ms = now_ms;
    safety->action_lease_ms = ROBOTDOG_DEFAULT_LEASE_MS;
    safety->last_heartbeat_ms = now_ms;
    safety->last_line_valid_ms = now_ms;
    /* The initial event ensures the motion layer starts from an explicit stop. */
    safety->stop_event_pending = true;
}

void RobotDogSafety_SetReady(robotdog_safety_t *safety)
{
    if(safety == 0)
    {
        return;
    }

    if(safety->mode == ROBOTDOG_MODE_BOOT_SAFE)
    {
        safety->mode = ROBOTDOG_MODE_IDLE;
    }
}

void RobotDogSafety_Stop(robotdog_safety_t *safety, robotdog_stop_reason_t reason, uint32_t now_ms)
{
    if(safety == 0)
    {
        return;
    }

    safety->mode = ROBOTDOG_MODE_IDLE;
    safety->action = ROBOTDOG_ACTION_STOP;
    safety->action_active = false;
    safety->action_started_ms = now_ms;
    safety->action_lease_ms = ROBOTDOG_DEFAULT_LEASE_MS;
    safety->stop_reason = reason;
    safety->stop_event_pending = true;
}

void RobotDogSafety_EnterError(robotdog_safety_t *safety, robotdog_stop_reason_t reason, uint32_t now_ms)
{
    if(safety == 0)
    {
        return;
    }

    safety->mode = ROBOTDOG_MODE_ERROR_SAFE;
    safety->action = ROBOTDOG_ACTION_STOP;
    safety->action_active = false;
    safety->action_started_ms = now_ms;
    safety->stop_reason = reason;
    safety->stop_event_pending = true;
}

robotdog_result_t RobotDogSafety_RequestManualAction(robotdog_safety_t *safety,
                                                     uint32_t now_ms,
                                                     robotdog_action_t action,
                                                     uint8_t strength,
                                                     uint16_t lease_ms)
{
    if(safety == 0)
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }

    if(action == ROBOTDOG_ACTION_STOP)
    {
        RobotDogSafety_Stop(safety, ROBOTDOG_STOP_USER, now_ms);
        return ROBOTDOG_RESULT_OK;
    }

    if(safety->mode == ROBOTDOG_MODE_UPDATE_SAFE || safety->mode == ROBOTDOG_MODE_ERROR_SAFE)
    {
        return ROBOTDOG_RESULT_UNSAFE_STATE;
    }

    if(action < ROBOTDOG_ACTION_STOP || action > ROBOTDOG_ACTION_TURN_RIGHT)
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }

    if(action_needs_strength(action) &&
       (strength < ROBOTDOG_STRENGTH_MIN || strength > ROBOTDOG_STRENGTH_MAX))
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }

    /* Zero selects the documented default; values over the hard limit are rejected. */
    if(lease_ms == 0U)
    {
        lease_ms = ROBOTDOG_DEFAULT_LEASE_MS;
    }
    if(lease_ms > ROBOTDOG_MAX_LEASE_MS)
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }

    safety->mode = ROBOTDOG_MODE_MANUAL_REMOTE;
    safety->action = action;
    safety->action_active = true;
    safety->strength = strength;
    safety->action_started_ms = now_ms;
    safety->action_lease_ms = lease_ms;
    /* Starting an action also starts a fresh heartbeat supervision window. */
    safety->last_heartbeat_ms = now_ms;
    safety->stop_reason = ROBOTDOG_STOP_NONE;
    return ROBOTDOG_RESULT_OK;
}

robotdog_result_t RobotDogSafety_EnterAutonomous(robotdog_safety_t *safety, uint32_t now_ms)
{
    if(safety == 0)
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }
    if(safety->mode == ROBOTDOG_MODE_UPDATE_SAFE || safety->mode == ROBOTDOG_MODE_ERROR_SAFE)
    {
        return ROBOTDOG_RESULT_UNSAFE_STATE;
    }

    safety->mode = ROBOTDOG_MODE_AUTONOMOUS_LINE;
    safety->action = ROBOTDOG_ACTION_STOP;
    safety->action_active = false;
    safety->last_line_valid_ms = now_ms;
    safety->stop_reason = ROBOTDOG_STOP_NONE;
    return ROBOTDOG_RESULT_OK;
}

robotdog_result_t RobotDogSafety_EnterUpdate(robotdog_safety_t *safety, uint32_t now_ms)
{
    if(safety == 0)
    {
        return ROBOTDOG_RESULT_BAD_ARGUMENT;
    }

    safety->mode = ROBOTDOG_MODE_UPDATE_SAFE;
    safety->action = ROBOTDOG_ACTION_STOP;
    safety->action_active = false;
    safety->action_started_ms = now_ms;
    safety->stop_reason = ROBOTDOG_STOP_UPDATE_REQUEST;
    safety->stop_event_pending = true;
    return ROBOTDOG_RESULT_OK;
}

void RobotDogSafety_Heartbeat(robotdog_safety_t *safety, uint32_t now_ms)
{
    if(safety == 0)
    {
        return;
    }

    safety->last_heartbeat_ms = now_ms;
}

void RobotDogSafety_ReportLine(robotdog_safety_t *safety, uint32_t now_ms, bool line_valid)
{
    if(safety == 0)
    {
        return;
    }

    if(line_valid)
    {
        safety->last_line_valid_ms = now_ms;
    }
}

bool RobotDogSafety_Tick(robotdog_safety_t *safety, uint32_t now_ms)
{
    if(safety == 0)
    {
        return false;
    }

    /* Manual motion requires both a live controller and an unexpired lease. */
    if(safety->mode == ROBOTDOG_MODE_MANUAL_REMOTE && safety->action_active)
    {
        if(elapsed_at_least(now_ms, safety->last_heartbeat_ms, ROBOTDOG_HEARTBEAT_TIMEOUT_MS))
        {
            RobotDogSafety_Stop(safety, ROBOTDOG_STOP_HEARTBEAT_TIMEOUT, now_ms);
            return true;
        }
        if(elapsed_at_least(now_ms, safety->action_started_ms, safety->action_lease_ms))
        {
            RobotDogSafety_Stop(safety, ROBOTDOG_STOP_ACTION_LEASE_TIMEOUT, now_ms);
            return true;
        }
    }

    /* Autonomous motion is revoked when no valid line is seen for 500 ms. */
    if(safety->mode == ROBOTDOG_MODE_AUTONOMOUS_LINE)
    {
        if(elapsed_at_least(now_ms, safety->last_line_valid_ms, ROBOTDOG_LINE_LOST_TIMEOUT_MS))
        {
            RobotDogSafety_Stop(safety, ROBOTDOG_STOP_LINE_LOST, now_ms);
            return true;
        }
    }

    return false;
}

bool RobotDogSafety_TakeStopEvent(robotdog_safety_t *safety)
{
    bool pending = false;

    if(safety == 0)
    {
        return false;
    }

    /* Read-and-clear semantics prevent the same stop from being handled twice. */
    pending = safety->stop_event_pending;
    safety->stop_event_pending = false;
    return pending;
}
