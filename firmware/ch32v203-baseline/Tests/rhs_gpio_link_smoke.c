#include "rhs_gpio.h"
#include "rhs_board.h"

/* Keep every Board entry point in this cross-link smoke image. None is called. */
static RHS_StatusTypeDef (*const rhs_board_noarg_refs[])(void) __attribute__((used)) = {
    RHS_Board_InitLed,
    RHS_Board_ToggleLed,
    RHS_Board_StartServoPwm,
    RHS_Board_StopServoPwm,
    RHS_Board_StartBuzzer,
    RHS_Board_StopBuzzer,
};

static RHS_StatusTypeDef (*const rhs_board_servo_init_ref)(uint16_t, uint16_t,
                                                           uint16_t) __attribute__((used)) =
    RHS_Board_InitServoPwm;
static RHS_StatusTypeDef (*const rhs_board_servo_set_ref)(RHS_BoardServoChannel,
                                                          uint16_t) __attribute__((used)) =
    RHS_Board_SetServoPulse;
static RHS_StatusTypeDef (*const rhs_board_i2c_ref)(uint32_t) __attribute__((used)) =
    RHS_Board_InitOledI2c;
static RHS_StatusTypeDef (*const rhs_board_uart_ref)(uint32_t) __attribute__((used)) =
    RHS_Board_InitProgramUart;
static RHS_StatusTypeDef (*const rhs_board_debug_uart_ref)(uint32_t) __attribute__((used)) =
    RHS_Board_InitDebugUart;
static RHS_StatusTypeDef (*const rhs_board_ccd_ref)(void) __attribute__((used)) =
    RHS_Board_InitCcd;

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

    (void)rhs_board_noarg_refs;
    (void)rhs_board_servo_init_ref;
    (void)rhs_board_servo_set_ref;
    (void)rhs_board_i2c_ref;
    (void)rhs_board_uart_ref;
    (void)rhs_board_debug_uart_ref;
    (void)rhs_board_ccd_ref;

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
