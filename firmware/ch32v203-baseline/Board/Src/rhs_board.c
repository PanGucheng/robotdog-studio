#include "rhs_board.h"

#include <stddef.h>

RHS_StatusTypeDef RHS_Board_InitButton(void)
{
    const RHS_GPIO_InitTypeDef init = {
        .Pin = RHS_BOARD_BUTTON_PIN,
        .Mode = RHS_GPIO_MODE_INPUT,
        .Pull = RHS_GPIO_PULLUP,
        .Speed = RHS_GPIO_SPEED_LOW,
    };

    return RHS_GPIO_Init(RHS_BOARD_BUTTON_PORT, &init);
}

RHS_StatusTypeDef RHS_Board_ReadButton(RHS_GPIO_PinState *state)
{
    RHS_GPIO_PinState pin_state;
    RHS_StatusTypeDef status;

    if(state == NULL)
    {
        return RHS_INVALID_ARGUMENT;
    }

    status = RHS_GPIO_ReadPin(RHS_BOARD_BUTTON_PORT,
                              RHS_BOARD_BUTTON_PIN,
                              &pin_state);
    if(status != RHS_OK)
    {
        return status;
    }

    /* Board wiring is active-low: pressed means a low electrical level. */
    *state = (pin_state == RHS_GPIO_PIN_RESET) ? RHS_GPIO_PIN_SET
                                               : RHS_GPIO_PIN_RESET;
    return RHS_OK;
}
