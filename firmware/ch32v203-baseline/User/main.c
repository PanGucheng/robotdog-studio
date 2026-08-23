/********************************** (C) COPYRIGHT *******************************
 * CH32V203 firmware baseline application.
 *
 * This file intentionally contains no board pin mapping and no peripheral
 * activity.  It is the first-stage reset/system/linker build proof.
 *******************************************************************************/

#include "ch32v20x.h"

void RHS_Experiment_Init(void) __attribute__((weak));
void RHS_Experiment_Loop(void) __attribute__((weak));
void RHS_Experiment_Init(void) {}
void RHS_Experiment_Loop(void) {}

int main(void)
{
    SystemCoreClockUpdate();
    RHS_Experiment_Init();

    for (;;)
    {
        RHS_Experiment_Loop();
    }
}
