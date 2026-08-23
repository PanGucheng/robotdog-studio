#ifndef RHS_BOARD_H
#define RHS_BOARD_H

#include "rhs_board_pins.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize the confirmed low-risk button input. */
RHS_StatusTypeDef RHS_Board_InitButton(void);

/** Read the confirmed button input. The board wiring is active-low. */
RHS_StatusTypeDef RHS_Board_ReadButton(RHS_GPIO_PinState *state);

/** Initialize the confirmed LED as a push-pull output. */
RHS_StatusTypeDef RHS_Board_InitLed(void);

/** Write the LED electrical level without assuming active-high/active-low wiring. */
RHS_StatusTypeDef RHS_Board_WriteLed(RHS_GPIO_PinState electrical_state);

/** Toggle the LED electrical output. */
RHS_StatusTypeDef RHS_Board_ToggleLed(void);

#ifdef __cplusplus
}
#endif

#endif /* RHS_BOARD_H */
