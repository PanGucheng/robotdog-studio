# Bundled WCH toolchain

RobotDog Studio ships as a complete desktop application and does not require users to install MounRiver Studio.

This directory contains the redistributed WCH command-line components used by the firmware workflow:

- `Toolchain/RISC-V Embedded GCC12`: WCH RISC-V GCC 12.2 toolchain (`riscv-wch-elf-*`)
- `OpenOCD/OpenOCD`: WCH OpenOCD package and scripts

The app should execute these tools from the unpacked Electron resources directory. They must not be packed into `app.asar`, because `openocd.exe`, GCC executables, DLLs, and OpenOCD scripts need real filesystem paths.

During development the same layout is available directly under `vendor/wch`.
