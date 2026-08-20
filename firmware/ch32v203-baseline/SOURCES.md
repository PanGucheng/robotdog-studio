# Source provenance and baseline choice

The application template was selected after comparing these WCH EVT examples:

- `EXAM/GPIO/GPIO_Toggle`: smallest conventional bare-metal example and the
  source of the `User` system, interrupt, and configuration files.
- `EXAM/RCC` and `EXAM/SYSTICK`: useful clock/tick references, but add behavior
  that is unnecessary for the baseline.
- `EXAM/USART` and `EXAM/TIM`: retained only as future peripheral references;
  none of their application code is present here.

The official common platform files were copied from `D:\RobotDog\EVT\EXAM\SRC`:

- `Startup/startup_ch32v20x_D6.S`
- `Ld/Link.ld`
- `Core/core_riscv.c` and `Core/core_riscv.h`
- `Debug/debug.c` and `Debug/debug.h` (available for future reference, not built)
- the complete WCH `Peripheral/inc` and `Peripheral/src` library (source files
  are available for later lessons but are not linked into this baseline)

The WCH `system_ch32v20x.*`, `ch32v20x_it.*`, and `ch32v20x_conf.h` files came
from `D:\RobotDog\EVT\EXAM\GPIO\GPIO_Toggle\User`.

Official source contents are unchanged. Project-owned additions are the empty
`User/main.c`, CMake files, and documentation. The build selects the official
D6 startup, explicitly defines `CH32V20x_D6`, and uses the C8 memory selection
already active in the official linker script: 64 KiB Flash and 20 KiB RAM.
