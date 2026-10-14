#include "bsp_servo.h"
bool servo_map_valid(void)
{
    uint8_t seen=0;
    for(uint8_t i=0;i<4;i++) {
        const servo_map_t *m=&g_servo_map[i];
        if(m->output>=4 || (seen & (1U<<m->output)) || m->min_us<500 ||
           m->max_us>2500 || m->min_us>=m->max_us || m->offset_us < -500 || m->offset_us > 500) return false;
        seen|=(uint8_t)(1U<<m->output);
    }
    return true;
}
uint16_t bsp_servo_angle_to_us(uint8_t leg,uint16_t angle)
{
    if(leg>=4) return 1500;
    const servo_map_t *m=&g_servo_map[leg];
    if(angle>180) angle=180;
    if(m->reversed) angle=180-angle;
    int32_t us=500+(int32_t)((uint32_t)angle*2000U/180U)+m->offset_us;
    if(us<m->min_us) us=m->min_us;
    if(us>m->max_us) us=m->max_us;
    return (uint16_t)us;
}
bool servo_pulse_compare(uint32_t hz,uint32_t period,uint16_t us,uint32_t *compare)
{
    if(!compare || !hz || !period || us<500 || us>2500) return false;
    uint32_t ticks=(uint32_t)(((uint64_t)us*hz+500000U)/1000000U);
    if(!ticks || ticks>=period) return false;
    *compare=period-ticks; /* edge-aligned down-counting active-high PWM */
    return true;
}
