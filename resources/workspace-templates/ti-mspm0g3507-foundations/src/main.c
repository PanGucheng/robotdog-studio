#include "ti_msp_dl_config.h"

/* 每次改变亮灭状态前的等待时间，单位为毫秒。 */
static unsigned int blink_interval_ms = 500U;

int main(void)
{
    /* 应用 SysConfig 保存的时钟、引脚和输出初始状态。 */
    SYSCFG_DL_init();

    while (1) {
        delay_cycles((CPUCLK_FREQ / 1000U) * blink_interval_ms);
        /* 配置 LED_BLUE 后，把下面的 LED_GREEN 改为 LED_BLUE。 */
        DL_GPIO_togglePins(GPIO_LEDS_PORT, GPIO_LEDS_LED_GREEN_PIN);
    }
}
