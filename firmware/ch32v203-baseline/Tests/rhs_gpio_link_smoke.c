#include "rhs_gpio.h"

int main(void)
{
    RHS_GPIO_InitTypeDef init = {
        .Pin = RHS_GPIO_PIN_0,
        .Mode = RHS_GPIO_MODE_OUTPUT_PP,
        .Pull = RHS_GPIO_NOPULL,
        .Speed = RHS_GPIO_SPEED_LOW,
    };
    RHS_GPIO_PinState state;
    volatile RHS_StatusTypeDef status;

    /* Invalid ports exercise every public symbol without touching hardware. */
    status = RHS_GPIO_Init(NULL, &init);
    status = RHS_GPIO_ReadPin(NULL, RHS_GPIO_PIN_0, &state);
    status = RHS_GPIO_WritePin(NULL, RHS_GPIO_PIN_0, RHS_GPIO_PIN_RESET);
    status = RHS_GPIO_TogglePin(NULL, RHS_GPIO_PIN_0);

    (void)status;
    for(;;)
    {
    }
}
