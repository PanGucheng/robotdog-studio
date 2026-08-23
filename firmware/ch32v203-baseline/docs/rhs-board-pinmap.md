# RHS machine-horse board pin map

Source: the supplied board table dated 2026-08-23. This is the first Board
layer record; it must not leak into `RHS_HAL`.

| Resource | Pin | MCU function | Phase status |
| --- | --- | --- | --- |
| LED | PB8 | GPIO output (polarity unspecified) | Integrated, opt-in |
| Button | PA1 | GPIO pull-up input | Integrated |
| Servo CH0..CH3 | PA6, PA7, PB0, PB1 | TIM3 CH1..CH4 PWM | API ready; explicit start |
| Buzzer | PA8 | TIM1 CH1 PWM | API ready; explicit start |
| OLED SCL/SDA | PB6, PB7 | I2C1 | Bus init API; no OLED protocol |
| USART1 TX/RX | PA9, PA10 | USART1 | Init API; no transmit |
| Debug UART TX/RX | PB10, PB11 | USART3 | Init API; no transmit |
| CCD AO | PA4 | ADC1 IN4 | ADC init API; no scan |
| CCD SI/CLK | PA2, PB3 | GPIO output | GPIO init only; no timing |

The button and LED are integrated as opt-in GPIO APIs because their pins and
basic electrical modes are clear. `RHS_Board_InitButton()` and
`RHS_Board_InitLed()` are never called by the baseline `main()`. The button
wiring is documented as active-low, so the read API reports
`RHS_GPIO_PIN_SET` when the button is pressed. LED APIs operate on the raw
electrical level because the table does not specify LED polarity.

The following opt-in APIs now cover peripheral initialization without starting
activity: `RHS_Board_InitServoPwm`, `RHS_Board_SetServoPulse`,
`RHS_Board_StartServoPwm`, `RHS_Board_StopServoPwm`,
`RHS_Board_InitBuzzerPwm`, `RHS_Board_StartBuzzer`,
`RHS_Board_StopBuzzer`, `RHS_Board_InitOledI2c`,
`RHS_Board_InitProgramUart`, `RHS_Board_InitDebugUart`, and
`RHS_Board_InitCcd`. The baseline `main()` calls none of them.

There is deliberately no OLED protocol, UART protocol, servo angle policy,
buzzer tone policy, or CCD scan loop yet; these belong above the board hardware
initialization boundary.
