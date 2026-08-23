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

#ifdef __cplusplus
}
#endif

#endif /* RHS_BOARD_H */
