# Third-Party Notices And Distribution Policy

## RobotDog-authored files

The application runtime, RDS1 protocol, safety state machine, student bridge, telemetry queue, build scripts, tests, and documentation are licensed under BSD-3-Clause as stated in `LICENSE`.

## WCH vendor files

The following groups originate from Nanjing Qinheng Microelectronics (WCH) or its MCU templates and retain their embedded copyright/attention notices:

- `Core/core_riscv.c` and `Core/core_riscv.h`
- `Debug/`
- `Peripheral/`
- `Startup/`
- `Ld/Link.ld`
- `User/system_ch32v20x.c` and `User/system_ch32v20x.h`
- `User/ch32v20x_it.c`, `User/ch32v20x_it.h`, and `User/ch32v20x_conf.h`

The notice in these files states that modified or unmodified software and binaries are for microcontrollers manufactured by WCH. The files are used here only for `CH32V203C8T6`.

The embedded notice does not provide this project with an unambiguous general redistribution grant. Keep all original notices intact. RobotDog Studio must not bundle these vendor source files in a public distribution until WCH terms have been reviewed and approved by the distributor.

## Toolchain

The WCH RISC-V Embedded GCC12 toolchain is not part of this repository and is not covered by the project BSD license. It must be installed by the user or supplied through a separately reviewed vendor package. The build accepts its location through `ROBOTDOG_TOOLCHAIN_ROOT`.

## Studio packaging decision

- May package after normal project approval: RobotDog-authored BSD-3-Clause source, student templates, CMake files, tools, tests, and documentation.
- Must remain user-installed or separately licensed: WCH GCC toolchain.
- Blocked pending vendor/legal review: WCH peripheral library, core support, startup files, linker script, and firmware binaries containing those components.

This file records the current engineering distribution decision and is not legal advice.
