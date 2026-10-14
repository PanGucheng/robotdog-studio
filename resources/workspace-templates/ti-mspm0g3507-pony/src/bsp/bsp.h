#ifndef BSP_H
#define BSP_H
#include <stdbool.h>
#include <stdint.h>
#include "robotdog_types.h"
#include "robotdog_tx_queue.h"
uint32_t bsp_millis(void);
void bsp_uart_init(void);
bool bsp_uart_pop(uint8_t *byte);
bool bsp_uart_send(const char *line, robotdog_tx_priority_t priority);
uint32_t bsp_uart_faults(void);
uint32_t bsp_uart_overflows(void);
uint32_t bsp_uart_errors(void);
uint32_t bsp_uart_dropped(void);
void bsp_uart_discard_rx(void);
void bsp_key_init(uint32_t now);
int bsp_key_poll(uint32_t now); /* 1 pressed, 2 released */
bool bsp_key_pressed(void);
void bsp_indicators_init(void);
void bsp_indicators_tick(uint32_t now,robotdog_mode_t mode);
void bsp_beep(uint32_t now);
bool bsp_i2c_write(uint8_t control,const uint8_t *data,uint16_t count);
uint32_t bsp_device_trace_id(void);
#endif
