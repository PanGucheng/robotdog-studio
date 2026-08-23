#ifndef RHS_BOARD_PINS_H
#define RHS_BOARD_PINS_H

/*
 * Machine-horse board mapping supplied on 2026-08-23.
 * These names belong to Board, never to RHS HAL. Reserved mappings are
 * documented for later peripheral work and are not initialized in this phase.
 */
#include "rhs_gpio.h"

#define RHS_BOARD_BUTTON_PORT      GPIOA
#define RHS_BOARD_BUTTON_PIN       RHS_GPIO_PIN_1

/* Reserved PWM / alternate-function mappings. */
#define RHS_BOARD_SERVO_CH0_PORT   GPIOA
#define RHS_BOARD_SERVO_CH0_PIN    RHS_GPIO_PIN_6
#define RHS_BOARD_SERVO_CH1_PORT   GPIOA
#define RHS_BOARD_SERVO_CH1_PIN    RHS_GPIO_PIN_7
#define RHS_BOARD_SERVO_CH2_PORT   GPIOB
#define RHS_BOARD_SERVO_CH2_PIN    RHS_GPIO_PIN_0
#define RHS_BOARD_SERVO_CH3_PORT   GPIOB
#define RHS_BOARD_SERVO_CH3_PIN    RHS_GPIO_PIN_1
#define RHS_BOARD_BUZZER_PORT      GPIOA
#define RHS_BOARD_BUZZER_PIN       RHS_GPIO_PIN_8
#define RHS_BOARD_RGB_R_PORT      GPIOB
#define RHS_BOARD_RGB_R_PIN       RHS_GPIO_PIN_6
#define RHS_BOARD_RGB_G_PORT      GPIOB
#define RHS_BOARD_RGB_G_PIN       RHS_GPIO_PIN_7
#define RHS_BOARD_RGB_B_PORT      GPIOB
#define RHS_BOARD_RGB_B_PIN       RHS_GPIO_PIN_8

/* Reserved communications / sensor mappings. */
#define RHS_BOARD_USART1_TX_PORT   GPIOA
#define RHS_BOARD_USART1_TX_PIN    RHS_GPIO_PIN_9
#define RHS_BOARD_USART1_RX_PORT   GPIOA
#define RHS_BOARD_USART1_RX_PIN    RHS_GPIO_PIN_10
#define RHS_BOARD_DEBUG_TX_PORT    GPIOB
#define RHS_BOARD_DEBUG_TX_PIN     RHS_GPIO_PIN_10
#define RHS_BOARD_DEBUG_RX_PORT    GPIOB
#define RHS_BOARD_DEBUG_RX_PIN     RHS_GPIO_PIN_11
#define RHS_BOARD_CCD_AO_PORT      GPIOA
#define RHS_BOARD_CCD_AO_PIN       RHS_GPIO_PIN_4
#define RHS_BOARD_CCD_SI_PORT      GPIOA
#define RHS_BOARD_CCD_SI_PIN       RHS_GPIO_PIN_2
#define RHS_BOARD_CCD_CLK_PORT     GPIOB
#define RHS_BOARD_CCD_CLK_PIN      RHS_GPIO_PIN_3

#endif /* RHS_BOARD_PINS_H */
