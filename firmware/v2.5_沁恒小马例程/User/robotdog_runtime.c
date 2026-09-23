#include "robotdog_runtime.h"

#include "robotdog_motion.h"

/*
 * Runtime coordinator between policy and hardware.
 *
 * safety -> decides whether movement is permitted
 * student bridge -> converts CCD data into a requested action
 * motion -> owns gait tables, servo interpolation and PWM
 */
static robotdog_safety_t g_safety;
static robotdog_action_t g_last_auto_action = ROBOTDOG_ACTION_STOP;
static uint8_t g_last_auto_strength = ROBOTDOG_DEFAULT_STRENGTH;
static uint32_t g_last_student_ms = 0U;

void RobotDogRuntime_Init(uint32_t now_ms)
{
    RobotDogSafety_Init(&g_safety, now_ms);
    RobotDogMotion_Init();
    RobotDogStudentBridge_Init();
    RobotDogSafety_SetReady(&g_safety);
    RobotDogMotion_Stop(ROBOTDOG_STOP_POWER_ON);
    g_last_auto_action = ROBOTDOG_ACTION_STOP;
    g_last_auto_strength = ROBOTDOG_DEFAULT_STRENGTH;
    g_last_student_ms = now_ms;
}

void RobotDogRuntime_Tick1ms(uint32_t now_ms)
{
    /* Stop decisions are applied before this millisecond's motion update. */
    if(RobotDogSafety_Tick(&g_safety, now_ms))
    {
        RobotDogMotion_Stop(g_safety.stop_reason);
    }

    RobotDogMotion_Tick1ms();
}

robotdog_result_t RobotDogRuntime_RequestManualAction(uint32_t now_ms,
                                                      robotdog_action_t action,
                                                      uint8_t strength,
                                                      uint16_t lease_ms)
{
    robotdog_result_t result = RobotDogSafety_RequestManualAction(&g_safety,
                                                                  now_ms,
                                                                  action,
                                                                  strength,
                                                                  lease_ms);
    if(result != ROBOTDOG_RESULT_OK)
    {
        return result;
    }

    if(action == ROBOTDOG_ACTION_STOP)
    {
        RobotDogMotion_Stop(ROBOTDOG_STOP_USER);
        return ROBOTDOG_RESULT_OK;
    }

    return RobotDogMotion_Request(action, strength, lease_ms) ? ROBOTDOG_RESULT_OK : ROBOTDOG_RESULT_BAD_ARGUMENT;
}

void RobotDogRuntime_Heartbeat(uint32_t now_ms)
{
    RobotDogSafety_Heartbeat(&g_safety, now_ms);
}

void RobotDogRuntime_Stop(uint32_t now_ms, robotdog_stop_reason_t reason)
{
    RobotDogSafety_Stop(&g_safety, reason, now_ms);
    RobotDogMotion_Stop(reason);
    g_last_auto_action = ROBOTDOG_ACTION_STOP;
}

robotdog_result_t RobotDogRuntime_EnterAutonomous(uint32_t now_ms)
{
    robotdog_result_t result = RobotDogSafety_EnterAutonomous(&g_safety, now_ms);
    if(result == ROBOTDOG_RESULT_OK)
    {
        RobotDogMotion_Stop(ROBOTDOG_STOP_USER);
        RobotDogStudentBridge_Init();
        g_last_auto_action = ROBOTDOG_ACTION_STOP;
        g_last_auto_strength = ROBOTDOG_DEFAULT_STRENGTH;
        g_last_student_ms = now_ms;
    }
    return result;
}

robotdog_result_t RobotDogRuntime_EnterIdle(uint32_t now_ms)
{
    RobotDogRuntime_Stop(now_ms, ROBOTDOG_STOP_USER);
    return ROBOTDOG_RESULT_OK;
}

robotdog_result_t RobotDogRuntime_EnterUpdate(uint32_t now_ms)
{
    robotdog_result_t result = RobotDogSafety_EnterUpdate(&g_safety, now_ms);
    if(result == ROBOTDOG_RESULT_OK)
    {
        RobotDogMotion_Stop(ROBOTDOG_STOP_UPDATE_REQUEST);
    }
    return result;
}

void RobotDogRuntime_UpdateCcd(const robotdog_student_bridge_input_t *input)
{
    robotdog_student_bridge_output_t output;

    if(input == 0)
    {
        return;
    }

    /* Safety sees every frame, even when student decisions are rate-limited. */
    RobotDogSafety_ReportLine(&g_safety, input->now_ms, input->line_valid);

    if(g_safety.mode != ROBOTDOG_MODE_AUTONOMOUS_LINE)
    {
        return;
    }

    /* Run policy at 50 Hz maximum; CCD capture may be scheduled independently. */
    if((uint32_t)(input->now_ms - g_last_student_ms) < ROBOTDOG_STUDENT_PERIOD_MS)
    {
        return;
    }
    g_last_student_ms = input->now_ms;

    RobotDogStudentBridge_Update(input, &output);
    /* Invalid enum/strength output is treated as a programming safety fault. */
    if(!output.valid)
    {
        RobotDogSafety_EnterError(&g_safety, output.invalid_reason, input->now_ms);
        RobotDogMotion_Stop(output.invalid_reason);
        g_last_auto_action = ROBOTDOG_ACTION_STOP;
        return;
    }

    /* A missing line produces STOP immediately and never defaults to walking. */
    if(output.action == ROBOTDOG_ACTION_STOP)
    {
        RobotDogMotion_Stop(ROBOTDOG_STOP_LINE_LOST);
        g_safety.action = ROBOTDOG_ACTION_STOP;
        g_safety.action_active = false;
        g_last_auto_action = ROBOTDOG_ACTION_STOP;
        return;
    }

    /* Do not restart the same looping gait on every 20 ms control update. */
    if(output.action != g_last_auto_action || output.strength != g_last_auto_strength)
    {
        (void)RobotDogMotion_Request(output.action, output.strength, 0U);
        g_safety.action = output.action;
        g_safety.action_active = true;
        g_safety.strength = output.strength;
        g_last_auto_action = output.action;
        g_last_auto_strength = output.strength;
    }
}

void RobotDogRuntime_GetStatus(robotdog_runtime_status_t *status)
{
    robotdog_motion_status_t motion_status;

    if(status == 0)
    {
        return;
    }

    RobotDogMotion_GetStatus(&motion_status);
    status->mode = g_safety.mode;
    status->action = g_safety.action;
    status->stop_reason = g_safety.stop_reason;
    status->action_active = g_safety.action_active;
    status->strength = g_safety.strength;
    status->motion_name = motion_status.action_name;
}
