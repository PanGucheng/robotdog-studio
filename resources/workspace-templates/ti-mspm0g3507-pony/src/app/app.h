#ifndef APP_H
#define APP_H
#include <stdbool.h>
#include <stdint.h>
void app_init(uint32_t now,bool hardware_ready);
void app_protocol_tick(uint32_t now);
void app_reset_parser(void);
void app_oled_render(uint32_t now);
#endif
