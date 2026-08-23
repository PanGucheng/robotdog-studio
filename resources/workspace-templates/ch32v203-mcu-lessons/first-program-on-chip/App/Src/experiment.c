#include "experiment.h"

extern void RHS_Board_InitLed(void);
extern void RHS_Board_ToggleLed(void);
extern unsigned int SystemCoreClock;

/* First experiment: change only this value, then build and flash again. */
static unsigned int blink_period_ms = 500U;
static unsigned int elapsed_ms;

void RHS_Experiment_Init(void)
{
    RHS_Board_InitLed();
    elapsed_ms = 0U;
}

void RHS_Experiment_Loop(void)
{
    volatile unsigned int ticks = SystemCoreClock / 8000U;
    for (unsigned int i = 0U; i < ticks; ++i) { }
    ++elapsed_ms;
    if (elapsed_ms >= blink_period_ms) {
        elapsed_ms = 0U;
        RHS_Board_ToggleLed();
    }
}
