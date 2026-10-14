#ifndef BSP_SERVO_H
#define BSP_SERVO_H
#include <stdbool.h>
#include <stdint.h>
typedef struct { uint8_t output; bool reversed; int16_t offset_us; uint16_t min_us, max_us; } servo_map_t;
extern const servo_map_t g_servo_map[4];
bool servo_map_valid(void);
uint16_t bsp_servo_angle_to_us(uint8_t leg, uint16_t angle);
bool servo_pulse_compare(uint32_t hz, uint32_t period, uint16_t us, uint32_t *compare);
bool bsp_servo_init(void);
void bsp_servo_write_physical(uint8_t leg, uint16_t pulse_us);
#endif
