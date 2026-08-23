#include "rhs_board.h"

#include <stddef.h>

static void rhs_board_config_output(GPIO_TypeDef *port, uint16_t pin,
                                    GPIOMode_TypeDef mode)
{
    GPIO_InitTypeDef init = {0};
    init.GPIO_Pin = pin;
    init.GPIO_Mode = mode;
    init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(port, &init);
}

static void rhs_board_config_timer_output(GPIO_TypeDef *port, uint16_t pin)
{
    rhs_board_config_output(port, pin, GPIO_Mode_AF_PP);
}

static void rhs_board_init_oc(TIM_TypeDef *timer, uint8_t channel,
                              uint16_t pulse)
{
    TIM_OCInitTypeDef oc = {0};
    oc.TIM_OCMode = TIM_OCMode_PWM1;
    oc.TIM_OutputState = TIM_OutputState_Enable;
    oc.TIM_Pulse = pulse;
    oc.TIM_OCPolarity = TIM_OCPolarity_High;

    switch(channel)
    {
        case 1: TIM_OC1Init(timer, &oc); break;
        case 2: TIM_OC2Init(timer, &oc); break;
        case 3: TIM_OC3Init(timer, &oc); break;
        case 4: TIM_OC4Init(timer, &oc); break;
        default: break;
    }
}

RHS_StatusTypeDef RHS_Board_InitServoPwm(uint16_t prescaler,
                                        uint16_t period,
                                        uint16_t initial_pulse)
{
    TIM_TimeBaseInitTypeDef base = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_GPIOB,
                           ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM3, ENABLE);

    rhs_board_config_timer_output(RHS_BOARD_SERVO_CH0_PORT,
                                  RHS_BOARD_SERVO_CH0_PIN);
    rhs_board_config_timer_output(RHS_BOARD_SERVO_CH1_PORT,
                                  RHS_BOARD_SERVO_CH1_PIN);
    rhs_board_config_timer_output(RHS_BOARD_SERVO_CH2_PORT,
                                  RHS_BOARD_SERVO_CH2_PIN);
    rhs_board_config_timer_output(RHS_BOARD_SERVO_CH3_PORT,
                                  RHS_BOARD_SERVO_CH3_PIN);

    base.TIM_Prescaler = prescaler;
    base.TIM_CounterMode = TIM_CounterMode_Up;
    base.TIM_Period = period;
    base.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseInit(TIM3, &base);
    rhs_board_init_oc(TIM3, 1, initial_pulse);
    rhs_board_init_oc(TIM3, 2, initial_pulse);
    rhs_board_init_oc(TIM3, 3, initial_pulse);
    rhs_board_init_oc(TIM3, 4, initial_pulse);
    TIM_Cmd(TIM3, DISABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_SetServoPulse(RHS_BoardServoChannel channel,
                                         uint16_t pulse)
{
    switch(channel)
    {
        case RHS_BOARD_SERVO_CH0: TIM_SetCompare1(TIM3, pulse); break;
        case RHS_BOARD_SERVO_CH1: TIM_SetCompare2(TIM3, pulse); break;
        case RHS_BOARD_SERVO_CH2: TIM_SetCompare3(TIM3, pulse); break;
        case RHS_BOARD_SERVO_CH3: TIM_SetCompare4(TIM3, pulse); break;
        default: return RHS_INVALID_ARGUMENT;
    }
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_StartServoPwm(void)
{
    TIM_Cmd(TIM3, ENABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_StopServoPwm(void)
{
    TIM_Cmd(TIM3, DISABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_InitBuzzerPwm(uint16_t prescaler,
                                         uint16_t period,
                                         uint16_t pulse)
{
    TIM_TimeBaseInitTypeDef base = {0};
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO | RCC_APB2Periph_GPIOA |
                           RCC_APB2Periph_TIM1,
                           ENABLE);
    rhs_board_config_timer_output(RHS_BOARD_BUZZER_PORT,
                                  RHS_BOARD_BUZZER_PIN);
    base.TIM_Prescaler = prescaler;
    base.TIM_CounterMode = TIM_CounterMode_Up;
    base.TIM_Period = period;
    base.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseInit(TIM1, &base);
    rhs_board_init_oc(TIM1, 1, pulse);
    TIM_CtrlPWMOutputs(TIM1, DISABLE);
    TIM_Cmd(TIM1, DISABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_StartBuzzer(void)
{
    TIM_CtrlPWMOutputs(TIM1, ENABLE);
    TIM_Cmd(TIM1, ENABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_StopBuzzer(void)
{
    TIM_Cmd(TIM1, DISABLE);
    TIM_CtrlPWMOutputs(TIM1, DISABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_InitOledI2c(uint32_t clock_hz)
{
    I2C_InitTypeDef init = {0};
    if((clock_hz == 0U) || (clock_hz > 400000U))
    {
        return RHS_INVALID_ARGUMENT;
    }
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO | RCC_APB2Periph_GPIOB,
                           ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_I2C1, ENABLE);
    rhs_board_config_output(RHS_BOARD_OLED_SCL_PORT, RHS_BOARD_OLED_SCL_PIN,
                            GPIO_Mode_AF_OD);
    rhs_board_config_output(RHS_BOARD_OLED_SDA_PORT, RHS_BOARD_OLED_SDA_PIN,
                            GPIO_Mode_AF_OD);
    init.I2C_ClockSpeed = clock_hz;
    init.I2C_Mode = I2C_Mode_I2C;
    init.I2C_DutyCycle = I2C_DutyCycle_2;
    init.I2C_OwnAddress1 = 0;
    init.I2C_Ack = I2C_Ack_Disable;
    init.I2C_AcknowledgedAddress = I2C_AcknowledgedAddress_7bit;
    I2C_Init(I2C1, &init);
    I2C_Cmd(I2C1, ENABLE);
    return RHS_OK;
}

static RHS_StatusTypeDef rhs_board_init_uart(USART_TypeDef *uart,
                                             uint32_t baudrate,
                                             uint32_t usart_clock,
                                             GPIO_TypeDef *tx_port,
                                             uint16_t tx_pin,
                                             GPIO_TypeDef *rx_port,
                                             uint16_t rx_pin)
{
    USART_InitTypeDef init = {0};
    if(baudrate == 0U)
    {
        return RHS_INVALID_ARGUMENT;
    }
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO |
                           ((tx_port == GPIOA) || (rx_port == GPIOA)
                                ? RCC_APB2Periph_GPIOA : 0U) |
                           ((tx_port == GPIOB) || (rx_port == GPIOB)
                                ? RCC_APB2Periph_GPIOB : 0U) |
                           ((usart_clock == RCC_APB2Periph_USART1)
                                ? usart_clock : 0U),
                           ENABLE);
    if(usart_clock == RCC_APB1Periph_USART3)
    {
        RCC_APB1PeriphClockCmd(usart_clock, ENABLE);
    }
    rhs_board_config_output(tx_port, tx_pin, GPIO_Mode_AF_PP);
    rhs_board_config_output(rx_port, rx_pin, GPIO_Mode_IN_FLOATING);
    init.USART_BaudRate = baudrate;
    init.USART_WordLength = USART_WordLength_8b;
    init.USART_StopBits = USART_StopBits_1;
    init.USART_Parity = USART_Parity_No;
    init.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
    init.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_Init(uart, &init);
    USART_Cmd(uart, ENABLE);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_Board_InitProgramUart(uint32_t baudrate)
{
    return rhs_board_init_uart(USART1, baudrate, RCC_APB2Periph_USART1,
                               RHS_BOARD_USART1_TX_PORT,
                               RHS_BOARD_USART1_TX_PIN,
                               RHS_BOARD_USART1_RX_PORT,
                               RHS_BOARD_USART1_RX_PIN);
}

RHS_StatusTypeDef RHS_Board_InitDebugUart(uint32_t baudrate)
{
    return rhs_board_init_uart(USART3, baudrate, RCC_APB1Periph_USART3,
                               RHS_BOARD_DEBUG_TX_PORT,
                               RHS_BOARD_DEBUG_TX_PIN,
                               RHS_BOARD_DEBUG_RX_PORT,
                               RHS_BOARD_DEBUG_RX_PIN);
}

RHS_StatusTypeDef RHS_Board_InitCcd(void)
{
    ADC_InitTypeDef adc = {0};
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_GPIOB |
                           RCC_APB2Periph_ADC1,
                           ENABLE);
    rhs_board_config_output(RHS_BOARD_CCD_AO_PORT, RHS_BOARD_CCD_AO_PIN,
                            GPIO_Mode_AIN);
    rhs_board_config_output(RHS_BOARD_CCD_SI_PORT, RHS_BOARD_CCD_SI_PIN,
                            GPIO_Mode_Out_PP);
    rhs_board_config_output(RHS_BOARD_CCD_CLK_PORT, RHS_BOARD_CCD_CLK_PIN,
                            GPIO_Mode_Out_PP);
    adc.ADC_Mode = ADC_Mode_Independent;
    adc.ADC_ScanConvMode = DISABLE;
    adc.ADC_ContinuousConvMode = DISABLE;
    adc.ADC_ExternalTrigConv = ADC_ExternalTrigConv_None;
    adc.ADC_DataAlign = ADC_DataAlign_Right;
    adc.ADC_NbrOfChannel = 1;
    adc.ADC_OutputBuffer = ADC_OutputBuffer_Disable;
    adc.ADC_Pga = ADC_Pga_1;
    ADC_Init(ADC1, &adc);
    ADC_RegularChannelConfig(ADC1, ADC_Channel_4, 1, ADC_SampleTime_239Cycles5);
    ADC_Cmd(ADC1, ENABLE);
    return RHS_OK;
}
