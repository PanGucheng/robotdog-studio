#ifndef OLED_H
#define OLED_H
#include <stdbool.h>
#include <stdint.h>
void oled_init(uint32_t now);
bool oled_can_render(void);
void oled_clear(void);
void oled_text(uint8_t row,const char *text);
void oled_flush(void);
void oled_tick(uint32_t now);
uint32_t oled_errors(void);
#endif
