#include "ti_msp_dl_config.h"
#include "bsp.h"
#include "bsp_servo.h"
#include "app.h"
#include "oled.h"
#include "robotdog_runtime.h"
int main(void)
{
    SYSCFG_DL_init(); /* All electrical initialization is generated. */
    uint32_t now=bsp_millis();
    bsp_indicators_init();bsp_key_init(now);
    bool ready=bsp_servo_init();
    app_init(now,ready);oled_init(now);
    bsp_uart_init(); /* Enable NVIC only after queues and runtime are ready. */
    uint32_t faults=bsp_uart_faults();
    for(;;) {
        now=bsp_millis();
        int key=bsp_key_poll(now);
        if(key==1 || bsp_key_pressed()) RobotDogRuntime_Stop(now,ROBOTDOG_STOP_USER);
        if(key==2) bsp_beep(now);
        uint32_t latest=bsp_uart_faults();
        if(latest!=faults) {
            faults=latest;RobotDogRuntime_Stop(now,ROBOTDOG_STOP_PROTOCOL_ERROR);
            bsp_uart_discard_rx();app_reset_parser();
        }
        RobotDogRuntime_Tick1ms(now); /* Safety before processing new actions. */
        app_protocol_tick(now);
        if(!ready) RobotDogRuntime_Error(now,ROBOTDOG_STOP_RUNTIME_ERROR);
        robotdog_runtime_status_t st;RobotDogRuntime_GetStatus(&st);
        bsp_indicators_tick(now,st.mode);
        app_oled_render(now);oled_tick(now); /* At most one bounded transaction. */
    }
}
