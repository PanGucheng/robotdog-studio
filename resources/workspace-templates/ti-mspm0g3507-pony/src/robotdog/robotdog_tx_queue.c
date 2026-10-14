#include "robotdog_tx_queue.h"

#include <string.h>

/*
 * Interrupt-friendly two-priority USART TX queue.
 * High-priority command replies use a ring and may accumulate.  Normal CCD
 * telemetry uses one frame slot; dropping excess telemetry bounds RAM usage
 * and keeps responses responsive under a high requested stream rate.
 */
static uint16_t ring_next(uint16_t value)
{
    value++;
    if(value >= ROBOTDOG_TX_HIGH_CAPACITY)
    {
        value = 0U;
    }
    return value;
}

static uint16_t high_free(const robotdog_tx_queue_t *queue)
{
    const uint16_t head = queue->high_head;
    const uint16_t tail = queue->high_tail;
    uint16_t used = 0U;

    if(head >= tail)
    {
        used = (uint16_t)(head - tail);
    }
    else
    {
        used = (uint16_t)(ROBOTDOG_TX_HIGH_CAPACITY - tail + head);
    }
    /* One byte is deliberately left empty to distinguish full from empty. */
    return (uint16_t)(ROBOTDOG_TX_HIGH_CAPACITY - used - 1U);
}

void RobotDogTxQueue_Init(robotdog_tx_queue_t *queue)
{
    if(queue == 0)
    {
        return;
    }

    queue->high_head = 0U;
    queue->high_tail = 0U;
    queue->normal_length = 0U;
    queue->normal_position = 0U;
    queue->normal_pending = false;
    queue->active = ROBOTDOG_TX_ACTIVE_NONE;
    queue->dropped_high = 0U;
    queue->dropped_normal = 0U;
}

bool RobotDogTxQueue_Enqueue(robotdog_tx_queue_t *queue,
                             const char *text,
                             robotdog_tx_priority_t priority)
{
    size_t length = 0U;
    size_t i = 0U;

    if(queue == 0 || text == 0)
    {
        return false;
    }

    length = strlen(text);
    /* A normal frame is accepted only when the previous whole frame is done. */
    if(priority == ROBOTDOG_TX_NORMAL)
    {
        if(length == 0U || length >= ROBOTDOG_TX_NORMAL_CAPACITY || queue->normal_pending)
        {
            queue->dropped_normal++;
            return false;
        }

        for(i = 0U; i < length; i++)
        {
            queue->normal[i] = (uint8_t)text[i];
        }
        queue->normal_position = 0U;
        queue->normal_length = (uint16_t)length;
        queue->normal_pending = true;
        return true;
    }

    if(length == 0U || length > high_free(queue))
    {
        queue->dropped_high++;
        return false;
    }

    {
        uint16_t head = queue->high_head;
        for(i = 0U; i < length; i++)
        {
            queue->high[head] = (uint8_t)text[i];
            head = ring_next(head);
        }
        queue->high_head = head;
    }
    return true;
}

bool RobotDogTxQueue_PopByte(robotdog_tx_queue_t *queue, uint8_t *byte)
{
    if(queue == 0 || byte == 0)
    {
        return false;
    }

    /* Priority is selected only at a lane boundary, so bytes never interleave. */
    if(queue->active == ROBOTDOG_TX_ACTIVE_NONE)
    {
        if(queue->high_tail != queue->high_head)
        {
            queue->active = ROBOTDOG_TX_ACTIVE_HIGH;
        }
        else if(queue->normal_pending)
        {
            queue->active = ROBOTDOG_TX_ACTIVE_NORMAL;
        }
        else
        {
            return false;
        }
    }

    if(queue->active == ROBOTDOG_TX_ACTIVE_HIGH)
    {
        if(queue->high_tail == queue->high_head)
        {
            queue->active = ROBOTDOG_TX_ACTIVE_NONE;
            return RobotDogTxQueue_PopByte(queue, byte);
        }

        *byte = queue->high[queue->high_tail];
        queue->high_tail = ring_next(queue->high_tail);
        if(queue->high_tail == queue->high_head)
        {
            queue->active = ROBOTDOG_TX_ACTIVE_NONE;
        }
        return true;
    }

    if(queue->normal_position >= queue->normal_length)
    {
        queue->normal_pending = false;
        queue->active = ROBOTDOG_TX_ACTIVE_NONE;
        return RobotDogTxQueue_PopByte(queue, byte);
    }

    *byte = queue->normal[queue->normal_position++];
    if(queue->normal_position >= queue->normal_length)
    {
        queue->normal_pending = false;
        queue->active = ROBOTDOG_TX_ACTIVE_NONE;
    }
    return true;
}

bool RobotDogTxQueue_NormalBusy(const robotdog_tx_queue_t *queue)
{
    return queue != 0 && queue->normal_pending;
}

uint32_t RobotDogTxQueue_Dropped(const robotdog_tx_queue_t *queue)
{
    if(queue == 0)
    {
        return 0U;
    }
    return queue->dropped_high + queue->dropped_normal;
}
