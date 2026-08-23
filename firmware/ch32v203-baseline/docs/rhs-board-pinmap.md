# RHS machine-horse board pin map

Source: the supplied board table dated 2026-08-23. This is the first Board
layer record; it must not leak into `RHS_HAL`.

| Resource | Pin | MCU function | Phase status |
| --- | --- | --- | --- |
| LED | PB8 | GPIO output (polarity unspecified) | Integrated, opt-in |
| Button | PA1 | GPIO pull-up input | Integrated |
| Servo CH0..CH3 | PA6, PA7, PB0, PB1 | TIM3 CH1..CH4 PWM | Reserved; no PWM |
| Buzzer | PA8 | TIM1 CH1 PWM | Reserved; no PWM |
| OLED SCL/SDA | PB6, PB7 | I2C1 | Reserved; no I2C/OLED |
| USART1 TX/RX | PA9, PA10 | USART1 | Reserved; no UART |
| Debug UART TX/RX | PB10, PB11 | USART3 | Reserved; no UART |
| CCD AO | PA4 | ADC1 IN4 | Reserved; no ADC/CCD |
| CCD SI/CLK | PA2, PB3 | GPIO output | Reserved; no CCD |

The button and LED are integrated as opt-in GPIO APIs because their pins and
basic electrical modes are clear. `RHS_Board_InitButton()` and
`RHS_Board_InitLed()` are never called by the baseline `main()`. The button
wiring is documented as active-low, so the read API reports
`RHS_GPIO_PIN_SET` when the button is pressed. LED APIs operate on the raw
electrical level because the table does not specify LED polarity.

No servo, buzzer, OLED/I2C, UART, ADC, or CCD initialization occurs. Those mappings
are recorded so later peripheral modules can use one reviewed source of truth.
