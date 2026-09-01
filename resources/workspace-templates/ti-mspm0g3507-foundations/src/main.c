#include "ti_msp_dl_config.h"

/* 32 MHz CPU_CLK 下约为 0.5 秒。 */
#define LED_TOGGLE_DELAY_CYCLES (16000000U)

int main(void)
{
    SYSCFG_DL_init();

    DL_GPIO_clearPins(GPIO_LEDS_PORT, GPIO_LEDS_USER_LED_2_PIN);
    DL_GPIO_setPins(GPIO_LEDS_PORT,
        GPIO_LEDS_USER_LED_1_PIN |
        GPIO_LEDS_USER_LED_3_PIN |
        GPIO_LEDS_USER_TEST_PIN);

    while (1) {
        delay_cycles(LED_TOGGLE_DELAY_CYCLES);
        DL_GPIO_togglePins(GPIO_LEDS_PORT,
            GPIO_LEDS_USER_LED_1_PIN |
            GPIO_LEDS_USER_LED_2_PIN |
            GPIO_LEDS_USER_LED_3_PIN |
            GPIO_LEDS_USER_TEST_PIN);
    }
}
