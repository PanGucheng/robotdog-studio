# RHS HAL GPIO V1 design

RHS HAL uses the familiar STM32 HAL teaching model—an MCU port, a pin mask, an
initialization structure, pin state, and consistently named peripheral
operations—so knowledge transfers naturally to later STM32 work. It is not a
copy of STM32 HAL: the implementation and types are project-owned and map to
the WCH CH32V20x Peripheral Library.

The public design comparison used ST's `stm32f1xx_hal_gpio.h` interface and
the local WCH `ch32v20x_gpio.h/.c` plus GPIO Toggle example. No STM32 HAL
implementation code is copied.

`RHS_GPIO_InitTypeDef` keeps the four visible concepts `Pin`, `Mode`, `Pull`,
and `Speed`. V1 supports floating/up/down input, push-pull and open-drain
output, push-pull and open-drain alternate-function output, and analog mode.
Low, medium, and high speed map to the CH32V203 2, 10, and 50 MHz settings.
Initialization enables the selected GPIO APB2 clock before calling WCH
`GPIO_Init`.

Unlike STM32 HAL GPIO, public RHS GPIO operations return `RHS_StatusTypeDef`.
Read uses an output parameter so an invalid request cannot be confused with a
valid reset state. Init, write, and toggle accept pin masks; read accepts one
pin because a single `RHS_GPIO_PinState` cannot represent several pins.
Output and alternate modes reject pull settings because CH32V203 does not
provide an independent output-pull configuration in the WCH GPIO model.

The layers are intentionally separate:

```text
Application / Lesson
        -> future Board and course permission policy
        -> RHS HAL (chip-level validation and consistent API)
        -> unchanged WCH Peripheral Library
        -> CH32V203 registers
```

RHS GPIO validates known GPIO peripheral addresses, non-empty masks, enum
values, and mode/pull combinations. It does not decide whether a package pin
is bonded on a specific board or whether a machine-horse resource may be used;
those are future Board/Course responsibilities.

V1 deliberately omits EXTI, AFIO remapping, pin locking, port-wide reads and
writes, deinitialization, and concurrency guarantees for toggle. EXTI will
build on input configuration and add trigger/callback policy. TIM/UART will
use the alternate-function modes. ADC will use analog mode. Each future module
will be added only when implemented rather than as an empty API shell.
