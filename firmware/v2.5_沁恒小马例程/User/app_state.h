#ifndef __APP_STATE_H
#define __APP_STATE_H

/* High-level application state used by the legacy status/indicator layer. */
typedef enum
{
    APP_STATE_BOOT_SAFE = 0,
    APP_STATE_IDLE,
    APP_STATE_MANUAL_REMOTE,
    APP_STATE_AUTONOMOUS_LINE,
    APP_STATE_UPDATE_SAFE,
    APP_STATE_ERROR_SAFE
} app_state_t;

/* Logical LED patterns. Hardware mapping is implemented by main.c. */
typedef enum
{
    APP_LED_BOOT = 0,
    APP_LED_IDLE,
    APP_LED_ACTIVE,
    APP_LED_ERROR
} app_led_mode_t;

#endif /* __APP_STATE_H */
