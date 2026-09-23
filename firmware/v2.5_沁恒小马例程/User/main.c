/********************************** (C) COPYRIGHT *******************************
 * RobotDog Studio firmware entrypoint.
 *
 * This file owns board initialization and the cooperative 1 ms application
 * loop. Interrupts only move USART bytes; parsing, control, telemetry, display,
 * CCD processing, LED and buzzer timing run as bounded foreground tasks.
 * Hardware pin definitions live in app_hal.h. Higher-level behavior is split
 * among protocol, runtime/safety, motion, CCD and OLED modules.
 *******************************************************************************/

#include "app_hal.h"
#include "app_state.h"
#include "ccd_line_sensor.h"
#include "ssd1306_oled.h"
#include "robotdog_protocol.h"
#include "robotdog_runtime.h"
#include "robotdog_telemetry.h"
#include "robotdog_text.h"
#include "robotdog_tx_queue.h"

#include <stdbool.h>

/* USART3 RX is a single-producer IRQ / single-consumer foreground ring. */
static button_debounce_t g_button = {Bit_SET, Bit_SET, 0};
static volatile uint8_t g_cmd_rx_buf[APP_CMD_RX_BUF_SIZE];
static volatile uint16_t g_cmd_rx_head = 0U;
static volatile uint16_t g_cmd_rx_tail = 0U;
static volatile uint32_t g_cmd_rx_overflow = 0U;
static robotdog_tx_queue_t g_cmd_tx;
static uint16_t g_buzzer_on_compare = 0U;
static uint16_t g_buzzer_remaining_ms = 0U;

static robotdog_protocol_parser_t g_protocol;
static robotdog_telemetry_t g_telemetry;
static robotdog_telemetry_ccd_t g_latest_ccd;
static bool g_latest_ccd_valid = false;

static uint16_t ring_next(uint16_t value, uint16_t size)
{
    value++;
    if(value >= size)
    {
        value = 0U;
    }
    return value;
}

static uint16_t app_timer_1mhz_prescaler(void)
{
    uint32_t psc = 0U;

    if(SystemCoreClock >= 1000000U)
    {
        psc = SystemCoreClock / 1000000U;
    }

    if(psc == 0U)
    {
        psc = 1U;
    }

    /* Hardware divides the timer source by PSC+1. */
    return (uint16_t)(psc - 1U);
}

static void hal_afio_init(void)
{
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);
    AFIO->PCFR1 &= ~AFIO_PCFR1_SWJ_CFG;
    /* Free PB3 for CCD CLK while retaining two-wire SWD programming/debug. */
    AFIO->PCFR1 |= AFIO_PCFR1_SWJ_CFG_JTAGDISABLE;
}

static bool app_tx_enqueue_bytes(const char *text, robotdog_tx_priority_t priority)
{
    const bool queued = RobotDogTxQueue_Enqueue(&g_cmd_tx, text, priority);

    if(queued)
    {
        /* TXE interrupt drains the queue without blocking the foreground loop. */
        USART_ITConfig(APP_CMD_USART, USART_IT_TXE, ENABLE);
    }
    return queued;
}

static bool app_cmd_rx_pop(uint8_t *byte)
{
    uint16_t tail = g_cmd_rx_tail;

    if(byte == 0 || g_cmd_rx_head == tail)
    {
        return false;
    }

    *byte = g_cmd_rx_buf[tail];
    g_cmd_rx_tail = ring_next(tail, APP_CMD_RX_BUF_SIZE);
    return true;
}

static void hal_board_init(void)
{
    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
    SystemCoreClockUpdate();
    Delay_Init();
    hal_afio_init();
}

static void hal_gpio_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | APP_STATUS_LED_GPIO_CLK_APB2, ENABLE);

    gpio_init.GPIO_Pin = APP_BUTTON_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_IPU;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_BUTTON_PORT, &gpio_init);
}

typedef enum
{
    APP_BUTTON_EVENT_NONE = 0,
    APP_BUTTON_EVENT_PRESSED,
    APP_BUTTON_EVENT_RELEASED
} app_button_event_t;

static void app_status_led_write(bool on)
{
#if APP_STATUS_LED_ACTIVE_LOW
    GPIO_WriteBit(APP_STATUS_LED_PORT, APP_STATUS_LED_PIN, on ? Bit_RESET : Bit_SET);
#else
    GPIO_WriteBit(APP_STATUS_LED_PORT, APP_STATUS_LED_PIN, on ? Bit_SET : Bit_RESET);
#endif
}

static void app_status_led_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};

    gpio_init.GPIO_Pin = APP_STATUS_LED_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_Out_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_STATUS_LED_PORT, &gpio_init);

    app_status_led_write(true);
}

static void app_status_led_task_1ms(void)
{
    static uint16_t elapsed_ms = 0U;
    static bool led_on = true;

    elapsed_ms++;
    if(elapsed_ms < APP_STATUS_LED_TOGGLE_MS)
    {
        return;
    }

    elapsed_ms = 0U;
    led_on = !led_on;
    app_status_led_write(led_on);
}

static void hal_cmd_usart_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};
    USART_InitTypeDef usart_init = {0};
    NVIC_InitTypeDef nvic_init = {0};

    RCC_APB1PeriphClockCmd(APP_CMD_USART_CLK_APB1, ENABLE);
    RCC_APB2PeriphClockCmd(APP_CMD_GPIO_CLK_APB2, ENABLE);

    gpio_init.GPIO_Pin = APP_CMD_TX_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_AF_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_CMD_GPIO_PORT, &gpio_init);

    gpio_init.GPIO_Pin = APP_CMD_RX_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_CMD_GPIO_PORT, &gpio_init);

    usart_init.USART_BaudRate = APP_CMD_BAUDRATE;
    usart_init.USART_WordLength = USART_WordLength_8b;
    usart_init.USART_StopBits = USART_StopBits_1;
    usart_init.USART_Parity = USART_Parity_No;
    usart_init.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    usart_init.USART_Mode = USART_Mode_Tx | USART_Mode_Rx;
    USART_Init(APP_CMD_USART, &usart_init);
    USART_ITConfig(APP_CMD_USART, USART_IT_RXNE, ENABLE);
    USART_ITConfig(APP_CMD_USART, USART_IT_TXE, DISABLE);

    nvic_init.NVIC_IRQChannel = APP_CMD_USART_IRQn;
    nvic_init.NVIC_IRQChannelPreemptionPriority = 1;
    nvic_init.NVIC_IRQChannelSubPriority = 1;
    nvic_init.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&nvic_init);

    USART_Cmd(APP_CMD_USART, ENABLE);
}

static void hal_iap_usart_init(void)
{
    /* USART1 is electrically initialized, but no bootloader protocol exists yet. */
    GPIO_InitTypeDef gpio_init = {0};
    USART_InitTypeDef usart_init = {0};

    RCC_APB2PeriphClockCmd(APP_IAP_USART_CLK_APB2 | APP_IAP_GPIO_CLK_APB2, ENABLE);

    gpio_init.GPIO_Pin = APP_IAP_TX_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_AF_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_IAP_GPIO_PORT, &gpio_init);

    gpio_init.GPIO_Pin = APP_IAP_RX_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_IAP_GPIO_PORT, &gpio_init);

    usart_init.USART_BaudRate = APP_IAP_BAUDRATE;
    usart_init.USART_WordLength = USART_WordLength_8b;
    usart_init.USART_StopBits = USART_StopBits_1;
    usart_init.USART_Parity = USART_Parity_No;
    usart_init.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    usart_init.USART_Mode = USART_Mode_Tx | USART_Mode_Rx;
    USART_Init(APP_IAP_USART, &usart_init);
    USART_Cmd(APP_IAP_USART, ENABLE);
}

static void app_buzzer_pwm_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};
    TIM_TimeBaseInitTypeDef tim_base = {0};
    TIM_OCInitTypeDef tim_oc = {0};
    uint32_t period_ticks = 0U;

    RCC_APB2PeriphClockCmd(APP_BUZZER_GPIO_CLK_APB2 | APP_BUZZER_TIM_CLK_APB2, ENABLE);

    gpio_init.GPIO_Pin = APP_BUZZER_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_AF_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_BUZZER_GPIO_PORT, &gpio_init);

    period_ticks = 1000000U / APP_BUZZER_PWM_FREQ_HZ;
    if(period_ticks == 0U)
    {
        period_ticks = 1U;
    }

    tim_base.TIM_Period = (uint16_t)(period_ticks - 1U);
    tim_base.TIM_Prescaler = app_timer_1mhz_prescaler();
    tim_base.TIM_ClockDivision = TIM_CKD_DIV1;
    tim_base.TIM_CounterMode = TIM_CounterMode_Up;
    TIM_TimeBaseInit(TIM1, &tim_base);

    tim_oc.TIM_OCMode = TIM_OCMode_PWM1;
    tim_oc.TIM_OutputState = TIM_OutputState_Enable;
    tim_oc.TIM_OCPolarity = TIM_OCPolarity_High;
    /* Keep the timer running with compare zero while the buzzer is silent. */
    tim_oc.TIM_Pulse = 0U;
    TIM_OC1Init(TIM1, &tim_oc);
    TIM_OC1PreloadConfig(TIM1, TIM_OCPreload_Enable);
    TIM_ARRPreloadConfig(TIM1, ENABLE);
    TIM_CtrlPWMOutputs(TIM1, ENABLE);
    TIM_Cmd(TIM1, ENABLE);

    g_buzzer_on_compare = (uint16_t)(period_ticks / 2U);
    if(g_buzzer_on_compare == 0U)
    {
        g_buzzer_on_compare = 1U;
    }
}

static void app_buzzer_start(void)
{
    TIM_SetCompare1(TIM1, g_buzzer_on_compare);
    g_buzzer_remaining_ms = APP_BUZZER_BEEP_MS;
}

static void app_buzzer_task_1ms(void)
{
    if(g_buzzer_remaining_ms == 0U)
    {
        return;
    }

    g_buzzer_remaining_ms--;
    if(g_buzzer_remaining_ms == 0U)
    {
        TIM_SetCompare1(TIM1, 0U);
    }
}

void USART3_IRQHandler(void) __attribute__((interrupt("WCH-Interrupt-fast")));

void USART3_IRQHandler(void)
{
    /* RX copies bytes only; parsing in IRQ context would increase latency. */
    if(USART_GetITStatus(APP_CMD_USART, USART_IT_RXNE) != RESET)
    {
        uint8_t byte = (uint8_t)USART_ReceiveData(APP_CMD_USART);
        uint16_t next = ring_next(g_cmd_rx_head, APP_CMD_RX_BUF_SIZE);

        if(next != g_cmd_rx_tail)
        {
            g_cmd_rx_buf[g_cmd_rx_head] = byte;
            g_cmd_rx_head = next;
        }
        else
        {
            g_cmd_rx_overflow++;
        }
    }

    /* TXE transfers exactly one queued byte per interrupt. */
    if(USART_GetITStatus(APP_CMD_USART, USART_IT_TXE) != RESET)
    {
        uint8_t byte = 0U;

        if(!RobotDogTxQueue_PopByte(&g_cmd_tx, &byte))
        {
            USART_ITConfig(APP_CMD_USART, USART_IT_TXE, DISABLE);
        }
        else
        {
            USART_SendData(APP_CMD_USART, byte);
        }
    }
}

static app_button_event_t hal_button_poll_event_1ms(void)
{
    const BitAction sample = GPIO_ReadInputDataBit(APP_BUTTON_PORT, APP_BUTTON_PIN);

    /* Accept a new level after APP_DEBOUNCE_MS identical 1 ms samples. */
    if(sample == g_button.last_sample)
    {
        if(g_button.stable_count_ms < APP_DEBOUNCE_MS)
        {
            g_button.stable_count_ms++;
        }
    }
    else
    {
        g_button.last_sample = sample;
        g_button.stable_count_ms = 0U;
    }

    if((g_button.stable_count_ms >= APP_DEBOUNCE_MS) && (sample != g_button.stable_level))
    {
        g_button.stable_level = sample;
        return sample == APP_BUTTON_PRESSED ? APP_BUTTON_EVENT_PRESSED : APP_BUTTON_EVENT_RELEASED;
    }

    return APP_BUTTON_EVENT_NONE;
}

static void app_oled_render_status(void)
{
    /* Build five short ASCII lines, then send one complete framebuffer. */
    robotdog_runtime_status_t status;
    robotdog_text_builder_t builder;
    char line[48];

    RobotDogRuntime_GetStatus(&status);
    SSD1306_Fill(0U);

    RobotDogText_Init(&builder, line, sizeof(line));
    (void)RobotDogText_Append(&builder, "mode ");
    (void)RobotDogText_Append(&builder, RobotDogMode_Name(status.mode));
    (void)RobotDogText_Finish(&builder);
    SSD1306_DrawString(0U, 0U, line);

    RobotDogText_Init(&builder, line, sizeof(line));
    (void)RobotDogText_Append(&builder, "action ");
    (void)RobotDogText_Append(&builder, RobotDogAction_Name(status.action));
    (void)RobotDogText_Finish(&builder);
    SSD1306_DrawString(0U, 1U, line);

    RobotDogText_Init(&builder, line, sizeof(line));
    (void)RobotDogText_Append(&builder, "motion ");
    (void)RobotDogText_Append(&builder, status.motion_name == 0 ? "none" : status.motion_name);
    (void)RobotDogText_Finish(&builder);
    SSD1306_DrawString(0U, 2U, line);

    RobotDogText_Init(&builder, line, sizeof(line));
    (void)RobotDogText_Append(&builder, "ccd valid=");
    (void)RobotDogText_AppendU32(&builder, g_latest_ccd_valid && g_latest_ccd.line_valid ? 1U : 0U);
    (void)RobotDogText_Append(&builder, " center=");
    (void)RobotDogText_AppendU32(&builder, g_latest_ccd_valid ? g_latest_ccd.center : 0U);
    (void)RobotDogText_Append(&builder, " th=");
    (void)RobotDogText_AppendU32(&builder, g_latest_ccd_valid ? g_latest_ccd.threshold : 0U);
    (void)RobotDogText_Finish(&builder);
    SSD1306_DrawString(0U, 3U, line);

    RobotDogText_Init(&builder, line, sizeof(line));
    (void)RobotDogText_Append(&builder, "stop ");
    (void)RobotDogText_Append(&builder, RobotDogStopReason_Name(status.stop_reason));
    (void)RobotDogText_Append(&builder, " drop=");
    (void)RobotDogText_AppendU32(&builder, RobotDogTxQueue_Dropped(&g_cmd_tx));
    (void)RobotDogText_Append(&builder, " rx=");
    (void)RobotDogText_AppendU32(&builder, g_cmd_rx_overflow);
    (void)RobotDogText_Finish(&builder);
    SSD1306_DrawString(0U, 4U, line);

    SSD1306_Refresh();
}

static void app_oled_init(void)
{
    SSD1306_Init();
}

static void app_oled_task_1ms(void)
{
    static uint16_t oled_tick = 0U;
    static bool oled_ready = false;

    if(!oled_ready)
    {
        app_oled_render_status();
        oled_ready = true;
        oled_tick = 0U;
        return;
    }

    oled_tick++;
    if(oled_tick < APP_OLED_REFRESH_MS)
    {
        return;
    }

    oled_tick = 0U;
    app_oled_render_status();
}

static void app_capture_ccd(uint32_t now_ms)
{
    const ccd_line_result_t *result = 0;
    robotdog_student_bridge_input_t bridge_input;

    /* One physical frame feeds telemetry, OLED data and autonomous control. */
    ccd_line_sensor_capture();
    result = ccd_line_sensor_result();

    g_latest_ccd.line_valid = result->line_valid;
    g_latest_ccd.center = result->center;
    g_latest_ccd.threshold = result->threshold;
    g_latest_ccd.min_value = result->min_value;
    g_latest_ccd.max_value = result->max_value;
    g_latest_ccd.pixels = ccd_line_sensor_pixels();
    g_latest_ccd_valid = true;

    bridge_input.now_ms = now_ms;
    bridge_input.line_valid = result->line_valid;
    bridge_input.line_center = result->center;
    bridge_input.threshold = result->threshold;
    bridge_input.pixels = g_latest_ccd.pixels;
    RobotDogRuntime_UpdateCcd(&bridge_input);
}

static void app_send_status(uint16_t seq)
{
    robotdog_runtime_status_t status;
    robotdog_text_builder_t builder;
    char fields[220];
    char out[280];

    RobotDogRuntime_GetStatus(&status);
    RobotDogText_Init(&builder, fields, sizeof(fields));
    (void)RobotDogText_Append(&builder, "mode=");
    (void)RobotDogText_Append(&builder, RobotDogMode_Name(status.mode));
    (void)RobotDogText_Append(&builder, " action=");
    (void)RobotDogText_Append(&builder, RobotDogAction_Name(status.action));
    (void)RobotDogText_Append(&builder, " motion=");
    (void)RobotDogText_Append(&builder, status.motion_name == 0 ? "none" : status.motion_name);
    (void)RobotDogText_Append(&builder, " stop_reason=");
    (void)RobotDogText_Append(&builder, RobotDogStopReason_Name(status.stop_reason));
    (void)RobotDogText_Append(&builder, " ccd_valid=");
    (void)RobotDogText_AppendU32(&builder, g_latest_ccd_valid && g_latest_ccd.line_valid ? 1U : 0U);
    (void)RobotDogText_Append(&builder, " ccd_center=");
    (void)RobotDogText_AppendU32(&builder, g_latest_ccd_valid ? g_latest_ccd.center : 0U);
    (void)RobotDogText_Append(&builder, " tx_dropped=");
    (void)RobotDogText_AppendU32(&builder, RobotDogTxQueue_Dropped(&g_cmd_tx));
    (void)RobotDogText_Append(&builder, " rx_overflow=");
    (void)RobotDogText_AppendU32(&builder, g_cmd_rx_overflow);

    if(RobotDogText_Finish(&builder) >= 0 &&
       RobotDogProtocol_FormatOk(seq, fields, out, sizeof(out)) >= 0)
    {
        (void)app_tx_enqueue_bytes(out, ROBOTDOG_TX_HIGH);
    }
}

static void app_send_ccd_once(uint16_t seq, uint32_t now_ms)
{
    char out[800];

    /* Never queue a second large CCD frame while one is being transmitted. */
    if(RobotDogTxQueue_NormalBusy(&g_cmd_tx))
    {
        g_telemetry.dropped_frames++;
        return;
    }

    if(!g_latest_ccd_valid)
    {
        app_capture_ccd(now_ms);
    }

    if(RobotDogTelemetry_FormatCcd(seq, &g_latest_ccd, out, sizeof(out)) > 0)
    {
        if(!app_tx_enqueue_bytes(out, ROBOTDOG_TX_NORMAL))
        {
            g_telemetry.dropped_frames++;
        }
    }
    else
    {
        g_telemetry.dropped_frames++;
    }
}

static void app_send_simple_ok(uint16_t seq, const char *fields)
{
    char out[260];

    if(RobotDogProtocol_FormatOk(seq, fields, out, sizeof(out)) >= 0)
    {
        (void)app_tx_enqueue_bytes(out, ROBOTDOG_TX_HIGH);
    }
}

static void app_send_error(uint16_t seq, robotdog_result_t error)
{
    char out[96];

    if(RobotDogProtocol_FormatError(seq, error, out, sizeof(out)) >= 0)
    {
        (void)app_tx_enqueue_bytes(out, ROBOTDOG_TX_HIGH);
    }
}

static void app_handle_protocol_event(const robotdog_protocol_event_t *event, uint32_t now_ms)
{
    char fields[260];
    robotdog_text_builder_t builder;
    robotdog_result_t result = ROBOTDOG_RESULT_OK;
    robotdog_runtime_status_t status;

    if(event == 0)
    {
        return;
    }

    if(event->type == ROBOTDOG_PROTOCOL_EVENT_ERROR)
    {
        app_send_error(event->seq, event->error);
        return;
    }
    if(event->type != ROBOTDOG_PROTOCOL_EVENT_REQUEST)
    {
        return;
    }

    /* Every request receives one high-priority response; CCD DATA is separate. */
    switch(event->command)
    {
    case ROBOTDOG_PROTOCOL_CMD_HELLO:
        RobotDogText_Init(&builder, fields, sizeof(fields));
        (void)RobotDogText_Append(&builder, "device_id=");
        (void)RobotDogText_AppendHex32(&builder, DBGMCU_GetCHIPID(), 8U);
        (void)RobotDogText_Append(&builder, " board=" ROBOTDOG_BOARD_ID);
        (void)RobotDogText_Append(&builder, " chip=" ROBOTDOG_CHIP_ID);
        (void)RobotDogText_Append(&builder, " fw=" ROBOTDOG_FIRMWARE_VERSION " protocol=");
        (void)RobotDogText_AppendU32(&builder, ROBOTDOG_PROTOCOL_VERSION);
        (void)RobotDogText_Finish(&builder);
        app_send_simple_ok(event->seq, fields);
        break;

    case ROBOTDOG_PROTOCOL_CMD_CAPS:
        RobotDogText_Init(&builder, fields, sizeof(fields));
        (void)RobotDogText_Append(&builder, "actions=stop,stand,walk,turn_left,turn_right ccd_pixels=");
        (void)RobotDogText_AppendU32(&builder, ROBOTDOG_CCD_PIXELS);
        (void)RobotDogText_Append(&builder, " ccd_default_rate_hz=");
        (void)RobotDogText_AppendU32(&builder, ROBOTDOG_CCD_DEFAULT_RATE_HZ);
        (void)RobotDogText_Append(&builder, " ccd_max_rate_hz=");
        (void)RobotDogText_AppendU32(&builder, ROBOTDOG_CCD_MAX_RATE_HZ);
        (void)RobotDogText_Append(&builder, " modes=manual_remote,autonomous_line,update_safe iap=placeholder");
        (void)RobotDogText_Finish(&builder);
        app_send_simple_ok(event->seq, fields);
        break;

    case ROBOTDOG_PROTOCOL_CMD_PING:
        app_send_simple_ok(event->seq, "pong=1");
        break;

    case ROBOTDOG_PROTOCOL_CMD_HEARTBEAT:
        RobotDogRuntime_Heartbeat(now_ms);
        RobotDogRuntime_GetStatus(&status);
        RobotDogText_Init(&builder, fields, sizeof(fields));
        (void)RobotDogText_Append(&builder, "mode=");
        (void)RobotDogText_Append(&builder, RobotDogMode_Name(status.mode));
        (void)RobotDogText_Finish(&builder);
        app_send_simple_ok(event->seq, fields);
        break;

    case ROBOTDOG_PROTOCOL_CMD_STOP:
        RobotDogRuntime_Stop(now_ms, ROBOTDOG_STOP_USER);
        app_send_simple_ok(event->seq, "state=idle");
        break;

    case ROBOTDOG_PROTOCOL_CMD_ACTION:
        result = RobotDogRuntime_RequestManualAction(now_ms,
                                                     event->action,
                                                     event->strength,
                                                     event->lease_ms);
        if(result == ROBOTDOG_RESULT_OK)
        {
            RobotDogText_Init(&builder, fields, sizeof(fields));
            (void)RobotDogText_Append(&builder, "action=");
            (void)RobotDogText_Append(&builder, RobotDogAction_Name(event->action));
            (void)RobotDogText_Append(&builder, " strength=");
            (void)RobotDogText_AppendU32(&builder, event->strength);
            (void)RobotDogText_Append(&builder, " lease_ms=");
            (void)RobotDogText_AppendU32(&builder, event->lease_ms);
            (void)RobotDogText_Finish(&builder);
            app_send_simple_ok(event->seq, fields);
        }
        else
        {
            app_send_error(event->seq, result);
        }
        break;

    case ROBOTDOG_PROTOCOL_CMD_MODE:
        if(event->mode_request == ROBOTDOG_PROTOCOL_MODE_AUTO_LINE)
        {
            result = RobotDogRuntime_EnterAutonomous(now_ms);
            if(result == ROBOTDOG_RESULT_OK)
            {
                app_send_simple_ok(event->seq, "mode=autonomous_line");
            }
            else
            {
                app_send_error(event->seq, result);
            }
        }
        else if(event->mode_request == ROBOTDOG_PROTOCOL_MODE_IDLE)
        {
            (void)RobotDogRuntime_EnterIdle(now_ms);
            app_send_simple_ok(event->seq, "mode=idle");
        }
        else
        {
            app_send_error(event->seq, ROBOTDOG_RESULT_BAD_ARGUMENT);
        }
        break;

    case ROBOTDOG_PROTOCOL_CMD_STATUS:
        app_send_status(event->seq);
        break;

    case ROBOTDOG_PROTOCOL_CMD_CCD:
        if(event->ccd_request == ROBOTDOG_PROTOCOL_CCD_ON)
        {
            RobotDogTelemetry_SetCcdStream(&g_telemetry, true, event->ccd_rate_hz, now_ms);
            RobotDogText_Init(&builder, fields, sizeof(fields));
            (void)RobotDogText_Append(&builder, "ccd=on rate_hz=");
            (void)RobotDogText_AppendU32(&builder, event->ccd_rate_hz);
            (void)RobotDogText_Finish(&builder);
            app_send_simple_ok(event->seq, fields);
        }
        else if(event->ccd_request == ROBOTDOG_PROTOCOL_CCD_OFF)
        {
            RobotDogTelemetry_SetCcdStream(&g_telemetry, false, event->ccd_rate_hz, now_ms);
            app_send_simple_ok(event->seq, "ccd=off");
        }
        else if(event->ccd_request == ROBOTDOG_PROTOCOL_CCD_ONCE)
        {
            app_send_simple_ok(event->seq, "ccd=once");
            app_send_ccd_once(RobotDogTelemetry_NextSeq(&g_telemetry), now_ms);
        }
        else
        {
            app_send_error(event->seq, ROBOTDOG_RESULT_BAD_ARGUMENT);
        }
        break;

    case ROBOTDOG_PROTOCOL_CMD_ENTER_IAP:
        (void)RobotDogRuntime_EnterUpdate(now_ms);
        app_send_simple_ok(event->seq, "supported=0 state=update_safe reason=hardware_not_confirmed");
        break;

    case ROBOTDOG_PROTOCOL_CMD_NONE:
    default:
        app_send_error(event->seq, ROBOTDOG_RESULT_BAD_COMMAND);
        break;
    }
}

static void app_protocol_task(uint32_t now_ms)
{
    uint8_t byte = 0U;
    uint8_t processed = 0U;
    robotdog_protocol_event_t event;

    /* Limit bytes per pass so serial bursts cannot monopolize all tasks. */
    while(processed < APP_PROTOCOL_RX_BUDGET && app_cmd_rx_pop(&byte))
    {
        processed++;
        if(RobotDogProtocol_InputByte(&g_protocol, byte, &event))
        {
            app_handle_protocol_event(&event, now_ms);
        }
    }
}

static void app_telemetry_task(uint32_t now_ms)
{
    if(RobotDogTelemetry_CcdDue(&g_telemetry, now_ms))
    {
        if(!g_latest_ccd_valid)
        {
            app_capture_ccd(now_ms);
        }
        app_send_ccd_once(RobotDogTelemetry_NextSeq(&g_telemetry), now_ms);
    }
}

int main(void)
{
    uint32_t now_ms = 0U;
    uint16_t ccd_elapsed_ms = 0U;
    uint32_t observed_rx_overflow = 0U;

    /* Initialize hardware first, then state machines; runtime starts stopped. */
    hal_board_init();
    hal_gpio_init();
    app_status_led_init();
    hal_cmd_usart_init();
    hal_iap_usart_init();
    app_buzzer_pwm_init();
    app_oled_init();
    ccd_line_sensor_init();
    RobotDogTxQueue_Init(&g_cmd_tx);
    RobotDogProtocol_Init(&g_protocol);
    RobotDogTelemetry_Init(&g_telemetry, now_ms);
    RobotDogRuntime_Init(now_ms);

    while(1)
    {
        app_button_event_t button_event;

        /*
         * Cooperative scheduler order:
         *  1. advance LED/buzzer timing;
         *  2. enforce serial-overflow and button stops;
         *  3. acquire periodic CCD data;
         *  4. run safety/motion, protocol, telemetry and OLED tasks.
         */
        Delay_Ms(1);
        now_ms++;
        app_buzzer_task_1ms();
        app_status_led_task_1ms();

        /* A lost RX byte makes a command ambiguous, so fail to a safe stop. */
        if(g_cmd_rx_overflow != observed_rx_overflow)
        {
            observed_rx_overflow = g_cmd_rx_overflow;
            RobotDogRuntime_Stop(now_ms, ROBOTDOG_STOP_PROTOCOL_ERROR);
            app_send_error(0U, ROBOTDOG_RESULT_BAD_ARGUMENT);
        }

        button_event = hal_button_poll_event_1ms();
        if(button_event == APP_BUTTON_EVENT_PRESSED)
        {
            RobotDogRuntime_Stop(now_ms, ROBOTDOG_STOP_USER);
        }
        else if(button_event == APP_BUTTON_EVENT_RELEASED)
        {
            app_buzzer_start();
        }

        ccd_elapsed_ms++;
        if(ccd_elapsed_ms >= APP_CCD_SAMPLE_PERIOD_MS)
        {
            ccd_elapsed_ms = 0U;
            app_capture_ccd(now_ms);
        }

        RobotDogRuntime_Tick1ms(now_ms);
        app_protocol_task(now_ms);
        app_telemetry_task(now_ms);
        app_oled_task_1ms();
    }
}
