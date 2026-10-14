#include "ti_msp_dl_config.h"
#include "bsp.h"
static volatile uint32_t s_ms;
void SysTick_Handler(void) { s_ms++; }
uint32_t bsp_millis(void) { return s_ms; }
