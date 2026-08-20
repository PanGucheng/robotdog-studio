#ifndef RHS_GPIO_H
#define RHS_GPIO_H

#include <stdint.h>

#include "ch32v20x.h"
#include "rhs_hal_def.h"

#ifdef __cplusplus
extern "C" {
#endif

/** CH32V20x GPIO peripheral type exposed through the RHS naming boundary. */
typedef GPIO_TypeDef RHS_GPIO_PortTypeDef;

/** GPIO pin mask. Init, write, and toggle operations may contain multiple pins. */
typedef uint16_t RHS_GPIO_PinTypeDef;

#define RHS_GPIO_PIN_0   ((RHS_GPIO_PinTypeDef)0x0001U)
#define RHS_GPIO_PIN_1   ((RHS_GPIO_PinTypeDef)0x0002U)
#define RHS_GPIO_PIN_2   ((RHS_GPIO_PinTypeDef)0x0004U)
#define RHS_GPIO_PIN_3   ((RHS_GPIO_PinTypeDef)0x0008U)
#define RHS_GPIO_PIN_4   ((RHS_GPIO_PinTypeDef)0x0010U)
#define RHS_GPIO_PIN_5   ((RHS_GPIO_PinTypeDef)0x0020U)
#define RHS_GPIO_PIN_6   ((RHS_GPIO_PinTypeDef)0x0040U)
#define RHS_GPIO_PIN_7   ((RHS_GPIO_PinTypeDef)0x0080U)
#define RHS_GPIO_PIN_8   ((RHS_GPIO_PinTypeDef)0x0100U)
#define RHS_GPIO_PIN_9   ((RHS_GPIO_PinTypeDef)0x0200U)
#define RHS_GPIO_PIN_10  ((RHS_GPIO_PinTypeDef)0x0400U)
#define RHS_GPIO_PIN_11  ((RHS_GPIO_PinTypeDef)0x0800U)
#define RHS_GPIO_PIN_12  ((RHS_GPIO_PinTypeDef)0x1000U)
#define RHS_GPIO_PIN_13  ((RHS_GPIO_PinTypeDef)0x2000U)
#define RHS_GPIO_PIN_14  ((RHS_GPIO_PinTypeDef)0x4000U)
#define RHS_GPIO_PIN_15  ((RHS_GPIO_PinTypeDef)0x8000U)
#define RHS_GPIO_PIN_ALL ((RHS_GPIO_PinTypeDef)0xFFFFU)

typedef enum
{
    RHS_GPIO_PIN_RESET = 0,
    RHS_GPIO_PIN_SET
} RHS_GPIO_PinState;

typedef enum
{
    RHS_GPIO_MODE_INPUT = 0,
    RHS_GPIO_MODE_OUTPUT_PP,
    RHS_GPIO_MODE_OUTPUT_OD,
    RHS_GPIO_MODE_AF_PP,
    RHS_GPIO_MODE_AF_OD,
    RHS_GPIO_MODE_ANALOG
} RHS_GPIO_ModeTypeDef;

typedef enum
{
    RHS_GPIO_NOPULL = 0,
    RHS_GPIO_PULLUP,
    RHS_GPIO_PULLDOWN
} RHS_GPIO_PullTypeDef;

typedef enum
{
    RHS_GPIO_SPEED_LOW = 0,    /**< WCH 2 MHz output setting. */
    RHS_GPIO_SPEED_MEDIUM,     /**< WCH 10 MHz output setting. */
    RHS_GPIO_SPEED_HIGH        /**< WCH 50 MHz output setting. */
} RHS_GPIO_SpeedTypeDef;

typedef struct
{
    RHS_GPIO_PinTypeDef Pin;
    RHS_GPIO_ModeTypeDef Mode;
    RHS_GPIO_PullTypeDef Pull;
    RHS_GPIO_SpeedTypeDef Speed;
} RHS_GPIO_InitTypeDef;

/**
 * Configure one or more pins and enable the selected GPIO port clock.
 *
 * Pull must be NOPULL for output, alternate-function, and analog modes.
 */
RHS_StatusTypeDef RHS_GPIO_Init(RHS_GPIO_PortTypeDef *port,
                               const RHS_GPIO_InitTypeDef *init);

/** Read exactly one pin through the input data register. */
RHS_StatusTypeDef RHS_GPIO_ReadPin(const RHS_GPIO_PortTypeDef *port,
                                  RHS_GPIO_PinTypeDef pin,
                                  RHS_GPIO_PinState *state);

/** Write one or more pins. */
RHS_StatusTypeDef RHS_GPIO_WritePin(RHS_GPIO_PortTypeDef *port,
                                   RHS_GPIO_PinTypeDef pin,
                                   RHS_GPIO_PinState state);

/** Toggle one or more output pins. */
RHS_StatusTypeDef RHS_GPIO_TogglePin(RHS_GPIO_PortTypeDef *port,
                                    RHS_GPIO_PinTypeDef pin);

#ifdef __cplusplus
}
#endif

#endif /* RHS_GPIO_H */
