#include "bsp_servo.h"
/* Logical C,D,A,B = left-front,left-rear,right-front,right-rear.
 * output indexes SysConfig PWM_SERVO C0..C3; each output must occur once. */
const servo_map_t g_servo_map[4] = {
    {0, true,  0, 500, 2500},
    {1, true,  0, 500, 2500},
    {2, false, 0, 500, 2500},
    {3, false, 0, 500, 2500}
};
