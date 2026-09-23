#include "robotdog_motion.h"

#include "app_hal.h"
#include <string.h>

/*
 * TIM3 servo PWM and table-driven gait executor.
 *
 * A gait step contains four logical angles and a hold time. The 1 ms action
 * scheduler changes targets, while the slew task approaches those targets by
 * at most three degrees every 10 ms. This separates gait phase timing from the
 * electrical 20 ms PWM frame and limits abrupt mechanical angle changes.
 */
static const uint16_t g_servo_max_deg = 180U;
static const uint16_t g_servo_stand_deg = 90U;
static const uint16_t g_servo_slew_period_ms = 10U;
static const uint16_t g_servo_slew_step_deg = 3U;
/* 1 means this channel's physical direction is reversed relative to logical forward. */
static const uint8_t g_servo_dir_reversed[APP_SERVO_COUNT] = {1U, 1U, 0U, 0U};
static uint16_t g_servo_us[APP_SERVO_COUNT] = {
    APP_SERVO_NEUTRAL_US,
    APP_SERVO_NEUTRAL_US,
    APP_SERVO_NEUTRAL_US,
    APP_SERVO_NEUTRAL_US
};
static uint16_t g_servo_current_deg[APP_SERVO_COUNT] = {90, 90, 90, 90};
static uint16_t g_servo_target_deg[APP_SERVO_COUNT] = {90, 90, 90, 90};

enum
{
    /* Current tuned gait geometry and timing; these values affect all cycles. */
    GAIT_CENTER_DEG = 90,
    GAIT_FORWARD_AMP_DEG = 20,
    GAIT_FORWARD_HALF_AMP_DEG = GAIT_FORWARD_AMP_DEG / 2,
    GAIT_TURN_LARGE_AMP_DEG = 24,
    GAIT_TURN_AMP_DEG = 16,
    GAIT_TURN_HALF_AMP_DEG = GAIT_TURN_AMP_DEG / 2,
    GAIT_STEP_MS = 75
};

#define GAIT_ANGLE(state, amp) ((uint16_t)(GAIT_CENTER_DEG + ((state) * (amp))))
/* Gait drawings use A=right-front, B=right-rear, C=left-front, D=left-rear.
 * Servo channels are CH0=C, CH1=D, CH2=A, CH3=B.
 */
#define GAIT_STEP_ABCD(a, b, c, d, hold) {{(c), (d), (a), (b)}, (hold)}

typedef struct
{
    /* Logical angles use firmware channel order CH0, CH1, CH2, CH3. */
    uint16_t deg[APP_SERVO_COUNT];
    uint16_t hold_ms;
} servo_action_step_t;

static bool g_action_active = false;
static bool g_action_loop = false;
static bool g_action_direct_apply = false;
static uint16_t g_action_elapsed_ms = 0;
static uint8_t g_action_step_index = 0;
static uint8_t g_action_step_count = 0;
static bool g_action_cycle_completed = false;
static const servo_action_step_t *g_action_steps = NULL;
static const char *g_action_name = "none";

static const servo_action_step_t g_action_stand[] = {
    {{90, 90, 90, 90}, 1200}
};

#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
static const servo_action_step_t g_action_wag[] = {
    {{90, 90, 90, 90}, 80},
    {{90, 90, 90, 90}, 220},
    {{90, 90, 90, 90}, 220},
    {{90, 90, 90, 90}, 220},
    {{90, 90, 90, 90}, 220},
    {{90, 90, 90, 90}, 220},
    {{90, 90, 90, 90}, 80}
};
#endif

/* One forward cycle has 16 phases, each held for GAIT_STEP_MS. */
static const servo_action_step_t g_action_walk[] = {
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(+1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(+1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(+1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(+1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS)
};

#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
static const servo_action_step_t g_action_back[] = {
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_FORWARD_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_FORWARD_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS)
};
#endif

/* Turn cycles have eight phases and asymmetric left/right leg targets. */
static const servo_action_step_t g_action_turn_left[] = {
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS),
};

static const servo_action_step_t g_action_turn_right[] = {
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_AMP_DEG),
                   GAIT_ANGLE(0, GAIT_TURN_AMP_DEG),
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_CENTER_DEG, GAIT_STEP_MS),
    GAIT_STEP_ABCD(GAIT_ANGLE(-1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_CENTER_DEG,
                   GAIT_CENTER_DEG,
                   GAIT_ANGLE(1, GAIT_TURN_HALF_AMP_DEG),
                   GAIT_STEP_MS),
};


#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
static const servo_action_step_t g_action_relax[] = {
    {{160, 20, 160, 20}, 500}
};

static const servo_action_step_t g_action_sit[] = {
    {{90, 135, 90, 135}, 500}
};

static const servo_action_step_t g_action_down[] = {
    {{150, 150, 150, 150}, 500}
};


static const servo_action_step_t g_action_hello[] = {
    {{90, 110, 180, 125}, 220},
    {{90, 110, 135, 125}, 150},
    {{90, 110, 180, 125}, 150},
    {{90, 110, 135, 125}, 150},
    {{90, 110, 180, 125}, 150},
    {{90, 105, 90, 110}, 150},
    {{90, 95, 90, 100}, 150},
    {{90, 90, 90, 90}, 220}
};

static const servo_action_step_t g_action_stretch[] = {
    {{90, 90, 90, 90}, 120},
    {{70, 30, 70, 30}, 400},
    {{90, 90, 90, 90}, 120},
    {{150, 120, 150, 120}, 550},
    {{90, 90, 90, 90}, 120}
};

static const servo_action_step_t g_action_side_left[] = {
    {{80, 80, 110, 110}, 180},
    {{100, 100, 70, 70}, 180}
};

static const servo_action_step_t g_action_side_right[] = {
    {{110, 110, 80, 80}, 180},
    {{70, 70, 100, 100}, 180}
};

static const servo_action_step_t g_action_trot[] = {
    {{70, 110, 70, 110}, 120},
    {{110, 70, 110, 70}, 120}
};

static const servo_action_step_t g_action_leg_fwd_test[] = {
    {{90, 90, 90, 90}, 260},
    {{120, 120, 120, 120}, 520},
    {{90, 90, 90, 90}, 120}
};
#endif


static uint16_t app_clamp_servo_us(uint16_t us)
{
    if(us < APP_SERVO_MIN_US)
    {
        return APP_SERVO_MIN_US;
    }
    if(us > APP_SERVO_MAX_US)
    {
        return APP_SERVO_MAX_US;
    }
    return us;
}

static void app_servo_pwm_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};
    TIM_TimeBaseInitTypeDef tim_base = {0};
    TIM_OCInitTypeDef tim_oc = {0};
    uint16_t psc = 0;

    /* TIM3 CH1/2 use PA6/PA7 and CH3/4 use PB0/PB1 without remap. */
    RCC_APB2PeriphClockCmd(APP_SERVO_GPIOA_CLK_APB2 | APP_SERVO_GPIOB_CLK_APB2, ENABLE);
    RCC_APB1PeriphClockCmd(APP_SERVO_TIM3_CLK_APB1, ENABLE);

    gpio_init.GPIO_Mode = GPIO_Mode_AF_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;

    gpio_init.GPIO_Pin = APP_SERVO_TIM3_CH1_PIN | APP_SERVO_TIM3_CH2_PIN;
    GPIO_Init(GPIOA, &gpio_init);

    gpio_init.GPIO_Pin = APP_SERVO_TIM3_CH3_PIN | APP_SERVO_TIM3_CH4_PIN;
    GPIO_Init(GPIOB, &gpio_init);

    psc = (uint16_t)(SystemCoreClock / 1000000U);
    if(psc == 0)
    {
        psc = 1;
    }
    psc -= 1;

    /* A 1 MHz counter makes compare values equal PWM high time in microseconds. */
    tim_base.TIM_Period = APP_SERVO_PERIOD_US - 1U;
    tim_base.TIM_Prescaler = psc;
    tim_base.TIM_ClockDivision = TIM_CKD_DIV1;
    tim_base.TIM_CounterMode = TIM_CounterMode_Up;

    TIM_TimeBaseInit(TIM3, &tim_base);

    tim_oc.TIM_OCMode = TIM_OCMode_PWM1;
    tim_oc.TIM_OutputState = TIM_OutputState_Enable;
    tim_oc.TIM_OCPolarity = TIM_OCPolarity_High;
    tim_oc.TIM_Pulse = APP_SERVO_NEUTRAL_US;

    TIM_OC1Init(TIM3, &tim_oc);
    TIM_OC2Init(TIM3, &tim_oc);
    TIM_OC3Init(TIM3, &tim_oc);
    TIM_OC4Init(TIM3, &tim_oc);

    TIM_OC1PreloadConfig(TIM3, TIM_OCPreload_Enable);
    TIM_OC2PreloadConfig(TIM3, TIM_OCPreload_Enable);
    TIM_OC3PreloadConfig(TIM3, TIM_OCPreload_Enable);
    TIM_OC4PreloadConfig(TIM3, TIM_OCPreload_Enable);

    TIM_ARRPreloadConfig(TIM3, ENABLE);

    TIM_Cmd(TIM3, ENABLE);
}

static void app_servo_write_us(uint8_t channel, uint16_t us)
{
    const uint16_t pulse = app_clamp_servo_us(us);

    if(channel >= APP_SERVO_COUNT)
    {
        return;
    }

    g_servo_us[channel] = pulse;

    switch(channel)
    {
    case 0:
        TIM_SetCompare1(TIM3, pulse);
        break;
    case 1:
        TIM_SetCompare2(TIM3, pulse);
        break;
    case 2:
        TIM_SetCompare3(TIM3, pulse);
        break;
    case 3:
        TIM_SetCompare4(TIM3, pulse);
        break;
    default:
        break;
    }
}

static uint16_t app_servo_deg_to_us(uint16_t deg)
{
    uint32_t pulse = 0;
    uint32_t range = (uint32_t)(APP_SERVO_MAX_US - APP_SERVO_MIN_US);

    if(deg > g_servo_max_deg)
    {
        deg = g_servo_max_deg;
    }

    pulse = (uint32_t)APP_SERVO_MIN_US + ((uint32_t)deg * range) / g_servo_max_deg;
    return (uint16_t)pulse;
}

static uint16_t app_servo_logical_deg_to_us(uint8_t channel, uint16_t logical_deg)
{
    uint16_t physical_deg = logical_deg;

    if(channel >= APP_SERVO_COUNT)
    {
        return app_servo_deg_to_us(logical_deg);
    }

    /* Mirrored left servos reverse logical angles before pulse conversion. */
    if(g_servo_dir_reversed[channel] != 0U)
    {
        if(logical_deg > g_servo_max_deg)
        {
            logical_deg = g_servo_max_deg;
        }
        physical_deg = (uint16_t)(g_servo_max_deg - logical_deg);
    }

    return app_servo_deg_to_us(physical_deg);
}

#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
static uint16_t app_servo_us_to_deg(uint16_t us)
{
    uint32_t range = (uint32_t)(APP_SERVO_MAX_US - APP_SERVO_MIN_US);
    uint32_t deg = 0;

    us = app_clamp_servo_us(us);
    deg = ((uint32_t)(us - APP_SERVO_MIN_US) * g_servo_max_deg) / range;
    if(deg > g_servo_max_deg)
    {
        deg = g_servo_max_deg;
    }
    return (uint16_t)deg;
}
#endif

static void app_servo_set_target_deg(uint8_t channel, uint16_t deg)
{
    if(channel >= APP_SERVO_COUNT)
    {
        return;
    }

    if(deg > g_servo_max_deg)
    {
        deg = g_servo_max_deg;
    }

    g_servo_target_deg[channel] = deg;
}

static void app_servo_set_target_all_deg(uint16_t deg)
{
    uint8_t i = 0;
    /* Every channel advances independently toward the latest target. */
    for(i = 0; i < APP_SERVO_COUNT; i++)
    {
        app_servo_set_target_deg(i, deg);
    }
}

static void app_servo_slew_task_1ms(void)
{
    static uint16_t tick_ms = 0;
    uint8_t i = 0;

    tick_ms++;
    if(tick_ms < g_servo_slew_period_ms)
    {
        return;
    }
    tick_ms = 0;

    for(i = 0; i < APP_SERVO_COUNT; i++)
    {
        uint16_t cur = g_servo_current_deg[i];
        uint16_t target = g_servo_target_deg[i];
        uint16_t next = cur;

        if(cur == target)
        {
            continue;
        }

        if(cur < target)
        {
            uint16_t d = (uint16_t)(target - cur);
            next = (d > g_servo_slew_step_deg) ? (uint16_t)(cur + g_servo_slew_step_deg) : target;
        }
        else
        {
            uint16_t d = (uint16_t)(cur - target);
            next = (d > g_servo_slew_step_deg) ? (uint16_t)(cur - g_servo_slew_step_deg) : target;
        }

        g_servo_current_deg[i] = next;
        app_servo_write_us(i, app_servo_logical_deg_to_us(i, next));
    }
}

static void app_servo_apply_step(const servo_action_step_t *step)
{
    uint8_t i = 0;

    if(g_action_direct_apply)
    {
        for(i = 0; i < APP_SERVO_COUNT; i++)
        {
            uint16_t deg = step->deg[i];
            if(deg > g_servo_max_deg)
            {
                deg = g_servo_max_deg;
            }
            g_servo_target_deg[i] = deg;
            g_servo_current_deg[i] = deg;
            app_servo_write_us(i, app_servo_logical_deg_to_us(i, deg));
        }
        return;
    }

    for(i = 0; i < APP_SERVO_COUNT; i++)
    {
        app_servo_set_target_deg(i, step->deg[i]);
    }
}

static void app_action_start(const servo_action_step_t *steps, uint8_t count, bool loop, const char *name)
{
    if(steps == NULL || count == 0)
    {
        return;
    }

    /* A changed action starts its selected gait again at phase zero. */
    g_action_steps = steps;
    g_action_step_count = count;
    g_action_step_index = 0;
    g_action_elapsed_ms = 0;
    g_action_cycle_completed = false;
    g_action_loop = loop;
#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
    g_action_direct_apply = ((steps == g_action_wag) || (steps == g_action_side_left) ||
                             (steps == g_action_side_right) || (steps == g_action_trot));
#else
    g_action_direct_apply = false;
#endif
    g_action_active = true;
    g_action_name = name;

    app_servo_apply_step(&g_action_steps[0]);
}

static void app_action_stop(void)
{
    g_action_active = false;
    g_action_loop = false;
    g_action_steps = NULL;
    g_action_step_count = 0;
    g_action_step_index = 0;
    g_action_elapsed_ms = 0;
    g_action_cycle_completed = false;
    g_action_direct_apply = false;
    g_action_name = "none";
}

static void app_action_task_1ms(void)
{
    uint16_t hold_ms = 0;

    if(!g_action_active || g_action_steps == NULL)
    {
        return;
    }

    hold_ms = g_action_steps[g_action_step_index].hold_ms;
    if(hold_ms == 0)
    {
        hold_ms = 1;
    }

    g_action_elapsed_ms++;
    if(g_action_elapsed_ms < hold_ms)
    {
        return;
    }

    g_action_elapsed_ms = 0;
    g_action_step_index++;

    /* Loop wrap raises a one-shot cycle-completed flag for higher layers. */
    if(g_action_step_index >= g_action_step_count)
    {
        if(g_action_loop)
        {
            g_action_step_index = 0;
            g_action_cycle_completed = true;
        }
        else
        {
            app_action_stop();
            return;
        }
    }

    app_servo_apply_step(&g_action_steps[g_action_step_index]);
}

static void app_servo_write_all_us(uint16_t us)
{
    uint8_t i = 0;
    for(i = 0; i < APP_SERVO_COUNT; i++)
    {
        app_servo_write_us(i, us);
    }
}

static void app_servo_runtime_task_1ms(void)
{
    app_action_task_1ms();
    app_servo_slew_task_1ms();
}

void RobotDogMotion_Init(void)
{
    uint8_t i = 0U;

    app_servo_pwm_init();
    app_servo_write_all_us(APP_SERVO_NEUTRAL_US);
    for(i = 0U; i < APP_SERVO_COUNT; i++)
    {
        g_servo_current_deg[i] = g_servo_stand_deg;
        g_servo_target_deg[i] = g_servo_stand_deg;
    }
    app_action_stop();
}

bool RobotDogMotion_Request(robotdog_action_t action, uint8_t strength, uint16_t lease_ms)
{
    /* Safety validates these fields; current gait amplitudes are fixed tables. */
    (void)strength;
    (void)lease_ms;

    switch(action)
    {
    case ROBOTDOG_ACTION_STOP:
        RobotDogMotion_Stop(ROBOTDOG_STOP_USER);
        return true;
    case ROBOTDOG_ACTION_STAND:
        app_action_start(g_action_stand, (uint8_t)(sizeof(g_action_stand) / sizeof(g_action_stand[0])), true, "stand");
        return true;
    case ROBOTDOG_ACTION_WALK:
        app_action_start(g_action_walk, (uint8_t)(sizeof(g_action_walk) / sizeof(g_action_walk[0])), true, "walk");
        return true;
    case ROBOTDOG_ACTION_TURN_LEFT:
        app_action_start(g_action_turn_left, (uint8_t)(sizeof(g_action_turn_left) / sizeof(g_action_turn_left[0])), true, "turn_left");
        return true;
    case ROBOTDOG_ACTION_TURN_RIGHT:
        app_action_start(g_action_turn_right, (uint8_t)(sizeof(g_action_turn_right) / sizeof(g_action_turn_right[0])), true, "turn_right");
        return true;
    default:
        return false;
    }
}

void RobotDogMotion_Stop(robotdog_stop_reason_t reason)
{
    /* Cancel phase timing and slew every leg back to logical 90 degrees. */
    (void)reason;
    app_action_stop();
    app_servo_set_target_all_deg(g_servo_stand_deg);
}

void RobotDogMotion_Tick1ms(void)
{
    app_servo_runtime_task_1ms();
}

bool RobotDogMotion_TakeCycleCompleted(void)
{
    bool completed = g_action_cycle_completed;
    g_action_cycle_completed = false;
    return completed;
}

void RobotDogMotion_GetStatus(robotdog_motion_status_t *status)
{
    uint8_t i = 0U;

    if(status == 0)
    {
        return;
    }

    status->active = g_action_active;
    status->action_name = g_action_name;
    for(i = 0U; i < APP_SERVO_COUNT && i < (uint8_t)(sizeof(status->servo_us) / sizeof(status->servo_us[0])); i++)
    {
        status->servo_us[i] = g_servo_us[i];
    }
}

#if defined(ROBOTDOG_ENABLE_LEGACY_TEXT) && (ROBOTDOG_ENABLE_LEGACY_TEXT != 0)
bool RobotDogMotion_RequestLegacyName(const char *name)
{
    if(name == 0) { return false; }
    if(strcmp(name, "sit") == 0) { app_action_start(g_action_sit, (uint8_t)(sizeof(g_action_sit) / sizeof(g_action_sit[0])), false, "sit"); return true; }
    if(strcmp(name, "down") == 0) { app_action_start(g_action_down, (uint8_t)(sizeof(g_action_down) / sizeof(g_action_down[0])), false, "down"); return true; }
    if(strcmp(name, "relax") == 0) { app_action_start(g_action_relax, (uint8_t)(sizeof(g_action_relax) / sizeof(g_action_relax[0])), false, "relax"); return true; }
    if(strcmp(name, "wag") == 0) { app_action_start(g_action_wag, (uint8_t)(sizeof(g_action_wag) / sizeof(g_action_wag[0])), false, "wag"); return true; }
    if(strcmp(name, "hello") == 0) { app_action_start(g_action_hello, (uint8_t)(sizeof(g_action_hello) / sizeof(g_action_hello[0])), false, "hello"); return true; }
    if(strcmp(name, "stretch") == 0) { app_action_start(g_action_stretch, (uint8_t)(sizeof(g_action_stretch) / sizeof(g_action_stretch[0])), false, "stretch"); return true; }
    if(strcmp(name, "back") == 0) { app_action_start(g_action_back, (uint8_t)(sizeof(g_action_back) / sizeof(g_action_back[0])), true, "back"); return true; }
    if(strcmp(name, "sidel") == 0) { app_action_start(g_action_side_left, (uint8_t)(sizeof(g_action_side_left) / sizeof(g_action_side_left[0])), true, "sidel"); return true; }
    if(strcmp(name, "sider") == 0) { app_action_start(g_action_side_right, (uint8_t)(sizeof(g_action_side_right) / sizeof(g_action_side_right[0])), true, "sider"); return true; }
    if(strcmp(name, "trot") == 0) { app_action_start(g_action_trot, (uint8_t)(sizeof(g_action_trot) / sizeof(g_action_trot[0])), true, "trot"); return true; }
    if(strcmp(name, "legfwdtest") == 0) { app_action_start(g_action_leg_fwd_test, (uint8_t)(sizeof(g_action_leg_fwd_test) / sizeof(g_action_leg_fwd_test[0])), true, "legfwdtest"); return true; }
    return false;
}

bool RobotDogMotion_SetServoDeg(uint8_t channel, uint16_t deg)
{
    if(channel >= APP_SERVO_COUNT) { return false; }
    app_action_stop();
    app_servo_set_target_deg(channel, deg);
    return true;
}

bool RobotDogMotion_SetServoPulse(uint8_t channel, uint16_t us)
{
    if(channel >= APP_SERVO_COUNT) { return false; }
    app_action_stop();
    app_servo_set_target_deg(channel, app_servo_us_to_deg(us));
    return true;
}
#endif
