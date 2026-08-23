#include "rhs_teaching_platform.h"

#include "debug.h"
#include "rhs_board.h"

void RHS_Teaching_InitLed(void)
{
    Delay_Init();
    (void)RHS_Board_InitLed();
}

void RHS_Teaching_ToggleLed(void)
{
    (void)RHS_Board_ToggleLed();
}

void RHS_Teaching_DelayMs(uint32_t milliseconds)
{
    Delay_Ms(milliseconds);
}
