#include "ti_msp_dl_config.h"
#include "bsp_servo.h"
static bool s_ready;
static const DL_TIMER_CC_INDEX s_outputs[4]={GPIO_PWM_SERVO_C0_IDX,GPIO_PWM_SERVO_C1_IDX,GPIO_PWM_SERVO_C2_IDX,GPIO_PWM_SERVO_C3_IDX};
bool bsp_servo_init(void)
{
    uint32_t n=DL_Timer_getLoadValue(PWM_SERVO_INST)+1U;
    s_ready=false;
    if(!servo_map_valid() || DL_Timer_getCounterMode(PWM_SERVO_INST)!=DL_TIMER_COUNT_MODE_DOWN ||
       (uint64_t)n*50U!=PWM_SERVO_INST_CLK_FREQ) return false;
    for(uint8_t i=0;i<4;i++) {
        uint32_t cc;
        if(!servo_pulse_compare(PWM_SERVO_INST_CLK_FREQ,n,bsp_servo_angle_to_us(i,90),&cc)) return false;
        if(DL_Timer_getCaptCompUpdateMethod(PWM_SERVO_INST,s_outputs[i])!=DL_TIMER_CC_UPDATE_METHOD_ZERO_EVT) return false;
        if(DL_Timer_getCaptureCompareOutCtl(PWM_SERVO_INST,s_outputs[i]) !=
           (DL_TIMER_CC_OCTL_INIT_VAL_LOW|DL_TIMER_CC_OCTL_INV_OUT_DISABLED|DL_TIMER_CC_OCTL_SRC_FUNCVAL)) return false;
        if(DL_Timer_getCaptureCompareAction(PWM_SERVO_INST,s_outputs[i]) !=
           (DL_TIMER_CC_LACT_CCP_HIGH|DL_TIMER_CC_CDACT_CCP_LOW)) return false;
    }
    /* Duty updates normally latch at ZERO. Preload the live center while
     * stopped so a changed clock/calibration cannot emit an old first pulse.
     * Restore the SysConfig-selected update method before starting PWM. */
    s_ready=true;
    for(uint8_t i=0;i<4;i++) {
        DL_Timer_setCaptCompUpdateMethod(PWM_SERVO_INST,DL_TIMER_CC_UPDATE_METHOD_IMMEDIATE,s_outputs[i]);
        bsp_servo_write_physical(i,bsp_servo_angle_to_us(i,90));
        DL_Timer_setCaptCompUpdateMethod(PWM_SERVO_INST,DL_TIMER_CC_UPDATE_METHOD_ZERO_EVT,s_outputs[i]);
    }
    DL_Timer_startCounter(PWM_SERVO_INST);
    return true;
}
void bsp_servo_write_physical(uint8_t leg,uint16_t us)
{
    uint32_t cc;
    if(!s_ready || leg>=4) return;
    if(servo_pulse_compare(PWM_SERVO_INST_CLK_FREQ,DL_Timer_getLoadValue(PWM_SERVO_INST)+1U,us,&cc))
        DL_Timer_setCaptureCompareValue(PWM_SERVO_INST,cc,s_outputs[g_servo_map[leg].output]);
}
