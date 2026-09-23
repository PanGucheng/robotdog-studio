#ifndef ROBOTDOG_TX_QUEUE_H
#define ROBOTDOG_TX_QUEUE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define ROBOTDOG_TX_HIGH_CAPACITY 512U
#define ROBOTDOG_TX_NORMAL_CAPACITY 800U

typedef enum {
    ROBOTDOG_TX_NORMAL = 0,
    ROBOTDOG_TX_HIGH
} robotdog_tx_priority_t;

typedef enum {
    ROBOTDOG_TX_ACTIVE_NONE = 0,
    ROBOTDOG_TX_ACTIVE_HIGH,
    ROBOTDOG_TX_ACTIVE_NORMAL
} robotdog_tx_active_t;

typedef struct {
    /*
     * HIGH is a byte ring for command responses and safety events. NORMAL
     * holds one replaceable telemetry frame, preventing CCD traffic from
     * starving commands. Shared fields are volatile because USART3 IRQ reads
     * and updates them while the main loop enqueues data.
     */
    uint8_t high[ROBOTDOG_TX_HIGH_CAPACITY];
    volatile uint16_t high_head;
    volatile uint16_t high_tail;
    uint8_t normal[ROBOTDOG_TX_NORMAL_CAPACITY];
    volatile uint16_t normal_length;
    volatile uint16_t normal_position;
    volatile bool normal_pending;
    volatile robotdog_tx_active_t active;
    volatile uint32_t dropped_high;
    volatile uint32_t dropped_normal;
} robotdog_tx_queue_t;

/* Clear both priority lanes and drop counters. */
void RobotDogTxQueue_Init(robotdog_tx_queue_t *queue);

/* Queue a complete NUL-terminated line. */
bool RobotDogTxQueue_Enqueue(robotdog_tx_queue_t *queue,
                             const char *text,
                             robotdog_tx_priority_t priority);

/* Pop the next byte, always preferring HIGH data. */
bool RobotDogTxQueue_PopByte(robotdog_tx_queue_t *queue, uint8_t *byte);

/* Report whether a normal frame is currently in progress. */
bool RobotDogTxQueue_NormalBusy(const robotdog_tx_queue_t *queue);

/* Return total dropped-frame count. */
uint32_t RobotDogTxQueue_Dropped(const robotdog_tx_queue_t *queue);

#endif /* ROBOTDOG_TX_QUEUE_H */
