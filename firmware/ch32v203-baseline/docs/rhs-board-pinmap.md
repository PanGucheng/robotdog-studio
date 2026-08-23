# RHS machine-horse board pin map

Source: the supplied board table dated 2026-08-23. This is the first Board
layer record; it must not leak into `RHS_HAL`.

| Resource | Pin | MCU function | Phase status |
| --- | --- | --- | --- |
| Button | PA1 | GPIO pull-up input | Integrated |
| Servo CH0..CH3 | PA6, PA7, PB0, PB1 | TIM3 CH1..CH4 PWM | Reserved; no PWM |
| Buzzer | PA8 | TIM1 CH1 PWM | Reserved; no PWM |
| RGB R/G/B | PB6, PB7, PB8 | TIM4 CH1..CH3 PWM | Reserved; no PWM |
| USART1 TX/RX | PA9, PA10 | USART1 | Reserved; no UART |
| Debug UART TX/RX | PB10, PB11 | USART3 | Reserved; no UART |
| CCD AO | PA4 | ADC1 IN4 | Reserved; no ADC/CCD |
| CCD SI/CLK | PA2, PB3 | GPIO output | Reserved; no CCD |

Only the button is integrated in this phase because its electrical behavior is
clear and it needs only the existing GPIO HAL. `RHS_Board_InitButton()` and
`RHS_Board_ReadButton()` are opt-in APIs; the baseline `main()` does not call
them. The board wiring is documented as active-low, so the read API reports
`RHS_GPIO_PIN_SET` when the button is pressed.

The RGB electrical polarity is not specified by the supplied table. No
active-high/active-low assumption is encoded, and no RGB output is driven.

No servo, buzzer, RGB, UART, ADC, or CCD initialization occurs. Those mappings
are recorded so later peripheral modules can use one reviewed source of truth.
