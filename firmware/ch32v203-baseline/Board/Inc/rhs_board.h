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

typedef enum
{
    RHS_BOARD_SERVO_CH0 = 0,
    RHS_BOARD_SERVO_CH1,
    RHS_BOARD_SERVO_CH2,
    RHS_BOARD_SERVO_CH3
} RHS_BoardServoChannel;

/** Configure TIM3 servo outputs without starting the timer. */
RHS_StatusTypeDef RHS_Board_InitServoPwm(uint16_t prescaler,
                                        uint16_t period,
                                        uint16_t initial_pulse);
RHS_StatusTypeDef RHS_Board_SetServoPulse(RHS_BoardServoChannel channel,
                                         uint16_t pulse);
RHS_StatusTypeDef RHS_Board_StartServoPwm(void);
RHS_StatusTypeDef RHS_Board_StopServoPwm(void);

/** Configure TIM1 CH1 for the passive buzzer without starting it. */
RHS_StatusTypeDef RHS_Board_InitBuzzerPwm(uint16_t prescaler,
                                         uint16_t period,
                                         uint16_t pulse);
RHS_StatusTypeDef RHS_Board_StartBuzzer(void);
RHS_StatusTypeDef RHS_Board_StopBuzzer(void);

/** Configure the OLED I2C1 bus on PB6/PB7 without sending a transaction. */
RHS_StatusTypeDef RHS_Board_InitOledI2c(uint32_t clock_hz);

/** Configure one of the reserved UARTs without transmitting data. */
RHS_StatusTypeDef RHS_Board_InitProgramUart(uint32_t baudrate);
RHS_StatusTypeDef RHS_Board_InitDebugUart(uint32_t baudrate);

/** Configure CCD analog and timing pins without starting a scan. */
RHS_StatusTypeDef RHS_Board_InitCcd(void);

#ifdef __cplusplus
}
#endif

#endif /* RHS_BOARD_H */
