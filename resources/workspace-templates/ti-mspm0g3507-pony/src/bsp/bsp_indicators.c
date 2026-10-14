#include "ti_msp_dl_config.h"
#include "bsp.h"
static bool s_beep;
static uint32_t s_beep_started;
static void rgb(bool r,bool g,bool b)
{
    DL_Timer_setCaptureCompareValue(PWM_RGB_RB_INST,r?DL_Timer_getLoadValue(PWM_RGB_RB_INST):0,GPIO_PWM_RGB_RB_C0_IDX);
    DL_Timer_setCaptureCompareValue(PWM_RGB_RB_INST,b?DL_Timer_getLoadValue(PWM_RGB_RB_INST):0,GPIO_PWM_RGB_RB_C1_IDX);
    DL_Timer_setCaptureCompareValue(PWM_RGB_G_INST,g?DL_Timer_getLoadValue(PWM_RGB_G_INST):0,GPIO_PWM_RGB_G_C0_IDX);
}
void bsp_indicators_init(void)
{
    DL_Timer_stopCounter(PWM_BUZZER_INST);
    DL_Timer_startCounter(PWM_RGB_RB_INST); DL_Timer_startCounter(PWM_RGB_G_INST); rgb(false,false,true);
}
void bsp_beep(uint32_t now)
{
    uint32_t n=PWM_BUZZER_INST_CLK_FREQ/2000U;
    if(n<2 || n>65536) return;
    DL_Timer_stopCounter(PWM_BUZZER_INST);
    DL_Timer_setLoadValue(PWM_BUZZER_INST,n-1);
    DL_Timer_setCaptureCompareValue(PWM_BUZZER_INST,n/2,GPIO_PWM_BUZZER_C0_IDX);
    DL_Timer_setTimerCount(PWM_BUZZER_INST,n-1);
    DL_Timer_startCounter(PWM_BUZZER_INST); s_beep=true; s_beep_started=now;
}
void bsp_indicators_tick(uint32_t now,robotdog_mode_t mode)
{
    if(s_beep && (uint32_t)(now-s_beep_started)>=500U) {
        DL_Timer_setCaptureCompareValue(PWM_BUZZER_INST,DL_Timer_getLoadValue(PWM_BUZZER_INST)+1U,GPIO_PWM_BUZZER_C0_IDX);
        s_beep=false;
    }
    bool on=mode==ROBOTDOG_MODE_ERROR_SAFE || ((now/500U)&1U)==0;
    bool r=false,g=false,b=false;
    if(on) switch(mode) {
        case ROBOTDOG_MODE_BOOT_SAFE:b=true;break;
        case ROBOTDOG_MODE_IDLE:g=true;break;
        case ROBOTDOG_MODE_MANUAL_REMOTE:g=b=true;break;
        case ROBOTDOG_MODE_UPDATE_SAFE:r=b=true;break;
        default:r=true;break;
    }
    rgb(r,g,b);
}
