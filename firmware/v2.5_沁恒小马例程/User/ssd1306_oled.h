#ifndef __SSD1306_OLED_H
#define __SSD1306_OLED_H

#include "app_hal.h"
#include <stdbool.h>
#include <stdint.h>

/*
 * SSD1306 uses 7-bit address 0x3C. The implementation shifts it when calling
 * WCH I2C_Send7bitAddress, producing the familiar write byte 0x78 on the bus.
 */
#define SSD1306_I2C               I2C1
#define SSD1306_I2C_CLK_APB1      RCC_APB1Periph_I2C1
#define SSD1306_I2C_ADDR_7BIT     0x3CU
#define SSD1306_WIDTH             128U
#define SSD1306_HEIGHT            64U
#define SSD1306_PAGE_COUNT        8U

/* Configure PB6/PB7 and I2C1, probe the panel, and clear its display RAM. */
void SSD1306_Init(void);
/* Clear the RAM buffer and send a blank frame to the panel. */
void SSD1306_Clear(void);
/* Fill the local framebuffer only; call Refresh to transmit it. */
void SSD1306_Fill(uint8_t value);
/* Send the complete 128x64 framebuffer over I2C. */
void SSD1306_Refresh(void);
/* Pixel and drawing operations update the local framebuffer only. */
void SSD1306_SetPixel(uint8_t x, uint8_t y, bool on);
void SSD1306_DrawBitmap(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const uint8_t *bmp);
void SSD1306_DrawTestPattern(void);
void SSD1306_DrawChar(uint8_t x, uint8_t page, char ch);
void SSD1306_DrawString(uint8_t x, uint8_t page, const char *text);

#endif /* __SSD1306_OLED_H */
