#include "rhs_gpio.h"

static int rhs_gpio_is_port_valid(const RHS_GPIO_PortTypeDef *port)
{
    return (port == GPIOA) || (port == GPIOB) || (port == GPIOC) ||
           (port == GPIOD);
}

static int rhs_gpio_is_pin_mask_valid(RHS_GPIO_PinTypeDef pin)
{
    return pin != 0U;
}

static int rhs_gpio_is_single_pin(RHS_GPIO_PinTypeDef pin)
{
    return rhs_gpio_is_pin_mask_valid(pin) && ((pin & (pin - 1U)) == 0U);
}

static int rhs_gpio_is_pull_valid(RHS_GPIO_PullTypeDef pull)
{
    return (pull == RHS_GPIO_NOPULL) || (pull == RHS_GPIO_PULLUP) ||
           (pull == RHS_GPIO_PULLDOWN);
}

static int rhs_gpio_is_speed_valid(RHS_GPIO_SpeedTypeDef speed)
{
    return (speed == RHS_GPIO_SPEED_LOW) ||
           (speed == RHS_GPIO_SPEED_MEDIUM) ||
           (speed == RHS_GPIO_SPEED_HIGH);
}

static RHS_StatusTypeDef rhs_gpio_enable_clock(RHS_GPIO_PortTypeDef *port)
{
    uint32_t peripheral;

    if(port == GPIOA)
    {
        peripheral = RCC_APB2Periph_GPIOA;
    }
    else if(port == GPIOB)
    {
        peripheral = RCC_APB2Periph_GPIOB;
    }
    else if(port == GPIOC)
    {
        peripheral = RCC_APB2Periph_GPIOC;
    }
    else if(port == GPIOD)
    {
        peripheral = RCC_APB2Periph_GPIOD;
    }
    else
    {
        return RHS_INVALID_ARGUMENT;
    }

    RCC_APB2PeriphClockCmd(peripheral, ENABLE);
    return RHS_OK;
}

static RHS_StatusTypeDef rhs_gpio_convert_speed(RHS_GPIO_SpeedTypeDef speed,
                                                GPIOSpeed_TypeDef *wch_speed)
{
    if(wch_speed == NULL)
    {
        return RHS_INVALID_ARGUMENT;
    }

    switch(speed)
    {
        case RHS_GPIO_SPEED_LOW:
            *wch_speed = GPIO_Speed_2MHz;
            break;
        case RHS_GPIO_SPEED_MEDIUM:
            *wch_speed = GPIO_Speed_10MHz;
            break;
        case RHS_GPIO_SPEED_HIGH:
            *wch_speed = GPIO_Speed_50MHz;
            break;
        default:
            return RHS_INVALID_ARGUMENT;
    }

    return RHS_OK;
}

static RHS_StatusTypeDef rhs_gpio_convert_mode(const RHS_GPIO_InitTypeDef *init,
                                               GPIOMode_TypeDef *wch_mode)
{
    if((init == NULL) || (wch_mode == NULL) || !rhs_gpio_is_pull_valid(init->Pull))
    {
        return RHS_INVALID_ARGUMENT;
    }

    switch(init->Mode)
    {
        case RHS_GPIO_MODE_INPUT:
            if(init->Pull == RHS_GPIO_PULLUP)
            {
                *wch_mode = GPIO_Mode_IPU;
            }
            else if(init->Pull == RHS_GPIO_PULLDOWN)
            {
                *wch_mode = GPIO_Mode_IPD;
            }
            else
            {
                *wch_mode = GPIO_Mode_IN_FLOATING;
            }
            break;
        case RHS_GPIO_MODE_OUTPUT_PP:
            if(init->Pull != RHS_GPIO_NOPULL)
            {
                return RHS_INVALID_ARGUMENT;
            }
            *wch_mode = GPIO_Mode_Out_PP;
            break;
        case RHS_GPIO_MODE_OUTPUT_OD:
            if(init->Pull != RHS_GPIO_NOPULL)
            {
                return RHS_INVALID_ARGUMENT;
            }
            *wch_mode = GPIO_Mode_Out_OD;
            break;
        case RHS_GPIO_MODE_AF_PP:
            if(init->Pull != RHS_GPIO_NOPULL)
            {
                return RHS_INVALID_ARGUMENT;
            }
            *wch_mode = GPIO_Mode_AF_PP;
            break;
        case RHS_GPIO_MODE_AF_OD:
            if(init->Pull != RHS_GPIO_NOPULL)
            {
                return RHS_INVALID_ARGUMENT;
            }
            *wch_mode = GPIO_Mode_AF_OD;
            break;
        case RHS_GPIO_MODE_ANALOG:
            if(init->Pull != RHS_GPIO_NOPULL)
            {
                return RHS_INVALID_ARGUMENT;
            }
            *wch_mode = GPIO_Mode_AIN;
            break;
        default:
            return RHS_INVALID_ARGUMENT;
    }

    return RHS_OK;
}

RHS_StatusTypeDef RHS_GPIO_Init(RHS_GPIO_PortTypeDef *port,
                               const RHS_GPIO_InitTypeDef *init)
{
    GPIO_InitTypeDef wch_init;
    RHS_StatusTypeDef status;

    if(!rhs_gpio_is_port_valid(port) || (init == NULL) ||
       !rhs_gpio_is_pin_mask_valid(init->Pin) ||
       !rhs_gpio_is_speed_valid(init->Speed))
    {
        return RHS_INVALID_ARGUMENT;
    }

    status = rhs_gpio_convert_mode(init, &wch_init.GPIO_Mode);
    if(status != RHS_OK)
    {
        return status;
    }

    status = rhs_gpio_convert_speed(init->Speed, &wch_init.GPIO_Speed);
    if(status != RHS_OK)
    {
        return status;
    }

    status = rhs_gpio_enable_clock(port);
    if(status != RHS_OK)
    {
        return status;
    }

    wch_init.GPIO_Pin = init->Pin;
    GPIO_Init(port, &wch_init);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_GPIO_ReadPin(const RHS_GPIO_PortTypeDef *port,
                                  RHS_GPIO_PinTypeDef pin,
                                  RHS_GPIO_PinState *state)
{
    if(!rhs_gpio_is_port_valid(port) || !rhs_gpio_is_single_pin(pin) ||
       (state == NULL))
    {
        return RHS_INVALID_ARGUMENT;
    }

    *state = (GPIO_ReadInputDataBit((GPIO_TypeDef *)port, pin) == Bit_SET)
                 ? RHS_GPIO_PIN_SET
                 : RHS_GPIO_PIN_RESET;
    return RHS_OK;
}

RHS_StatusTypeDef RHS_GPIO_WritePin(RHS_GPIO_PortTypeDef *port,
                                   RHS_GPIO_PinTypeDef pin,
                                   RHS_GPIO_PinState state)
{
    if(!rhs_gpio_is_port_valid(port) || !rhs_gpio_is_pin_mask_valid(pin) ||
       ((state != RHS_GPIO_PIN_RESET) && (state != RHS_GPIO_PIN_SET)))
    {
        return RHS_INVALID_ARGUMENT;
    }

    GPIO_WriteBit(port, pin, (state == RHS_GPIO_PIN_SET) ? Bit_SET : Bit_RESET);
    return RHS_OK;
}

RHS_StatusTypeDef RHS_GPIO_TogglePin(RHS_GPIO_PortTypeDef *port,
                                    RHS_GPIO_PinTypeDef pin)
{
    uint16_t output;

    if(!rhs_gpio_is_port_valid(port) || !rhs_gpio_is_pin_mask_valid(pin))
    {
        return RHS_INVALID_ARGUMENT;
    }

    output = GPIO_ReadOutputData(port);
    GPIO_SetBits(port, (uint16_t)(pin & (uint16_t)~output));
    GPIO_ResetBits(port, (uint16_t)(pin & output));
    return RHS_OK;
}
