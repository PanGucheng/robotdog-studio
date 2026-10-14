#include "ti_msp_dl_config.h"
#include "bsp.h"
#include <ti/driverlib/m0p/dl_factoryregion.h>
#define RX_SIZE 256U
#define UART_ERRORS (DL_UART_MAIN_INTERRUPT_OVERRUN_ERROR|DL_UART_MAIN_INTERRUPT_FRAMING_ERROR|DL_UART_MAIN_INTERRUPT_PARITY_ERROR|DL_UART_MAIN_INTERRUPT_BREAK_ERROR)
#define UART_RX (DL_UART_MAIN_INTERRUPT_RX|DL_UART_MAIN_INTERRUPT_RX_TIMEOUT_ERROR)
static volatile uint8_t s_rx[RX_SIZE];
static volatile uint16_t s_head,s_tail;
static volatile uint32_t s_faults;
static volatile uint32_t s_overflows,s_errors;
static robotdog_tx_queue_t s_tx;
static uint32_t irq_lock(void) { uint32_t mask=__get_PRIMASK(); __disable_irq(); __DMB(); return mask; }
static void irq_unlock(uint32_t mask) { __DMB(); __set_PRIMASK(mask); }
static void pump_tx(void)
{
    uint8_t byte;
    for(unsigned i=0;i<32 && !DL_UART_Main_isTXFIFOFull(UART_DEBUG_INST);i++) {
        if(!RobotDogTxQueue_PopByte(&s_tx,&byte)) {
            DL_UART_Main_disableInterrupt(UART_DEBUG_INST,DL_UART_MAIN_INTERRUPT_TX);
            return;
        }
        DL_UART_Main_transmitData(UART_DEBUG_INST,byte);
    }
}
void bsp_uart_init(void)
{
    RobotDogTxQueue_Init(&s_tx);
    s_head=s_tail=0; s_faults=s_overflows=s_errors=0;
    DL_UART_Main_clearInterruptStatus(UART_DEBUG_INST,UART_ERRORS|UART_RX|DL_UART_MAIN_INTERRUPT_TX);
    NVIC_ClearPendingIRQ(UART_DEBUG_INST_INT_IRQN);
    NVIC_EnableIRQ(UART_DEBUG_INST_INT_IRQN);
}
void UART_DEBUG_INST_IRQHandler(void)
{
    uint32_t flags=DL_UART_Main_getEnabledInterruptStatus(UART_DEBUG_INST,UART_ERRORS|UART_RX|DL_UART_MAIN_INTERRUPT_TX);
    if(flags & UART_ERRORS) { s_faults++;s_errors++; }
    DL_UART_Main_clearInterruptStatus(UART_DEBUG_INST,flags);
    for(unsigned i=0;i<32 && !DL_UART_Main_isRXFIFOEmpty(UART_DEBUG_INST);i++) {
        uint8_t b=DL_UART_Main_receiveData(UART_DEBUG_INST);
        uint16_t next=(uint16_t)((s_head+1U)%RX_SIZE);
        if(next==s_tail) { s_faults++;s_overflows++; }
        else { s_rx[s_head]=b; __DMB(); s_head=next; }
    }
    if(flags & DL_UART_MAIN_INTERRUPT_TX) pump_tx();
}
bool bsp_uart_pop(uint8_t *byte)
{
    if(!byte || s_tail==s_head) return false;
    *byte=s_rx[s_tail]; __DMB(); s_tail=(uint16_t)((s_tail+1U)%RX_SIZE); return true;
}
bool bsp_uart_send(const char *line,robotdog_tx_priority_t priority)
{
    uint32_t mask=irq_lock();
    bool ok=RobotDogTxQueue_Enqueue(&s_tx,line,priority);
    if(ok) { DL_UART_Main_enableInterrupt(UART_DEBUG_INST,DL_UART_MAIN_INTERRUPT_TX); pump_tx(); }
    irq_unlock(mask); return ok;
}
uint32_t bsp_uart_faults(void) { return s_faults; }
uint32_t bsp_uart_overflows(void) { return s_overflows; }
uint32_t bsp_uart_errors(void) { return s_errors; }
uint32_t bsp_uart_dropped(void) { return RobotDogTxQueue_Dropped(&s_tx); }
void bsp_uart_discard_rx(void) { uint32_t mask=irq_lock(); s_tail=s_head; irq_unlock(mask); }
uint32_t bsp_device_trace_id(void) { return DL_FactoryRegion_getTraceID(); }
