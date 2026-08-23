#include "experiment.h"
#include "rhs_teaching_platform.h"

/* First experiment: change only this value, then build and flash again. */
static unsigned int blink_period_ms = 500U;

void RHS_Experiment_Init(void)
{
    RHS_Teaching_InitLed();
}

void RHS_Experiment_Loop(void)
{
    RHS_Teaching_DelayMs(blink_period_ms);
    RHS_Teaching_ToggleLed();
}
