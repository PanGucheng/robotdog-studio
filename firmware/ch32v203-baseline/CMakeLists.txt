cmake_minimum_required(VERSION 3.24)

set(CMAKE_TRY_COMPILE_PLATFORM_VARIABLES RHS_TOOLCHAIN_ROOT)

project(RHSFirmwareBaseline C ASM)

set(RHS_TOOLCHAIN_ROOT "" CACHE PATH "WCH RISC-V Embedded GCC12 root or bin directory")
set(RHS_OUTPUT_DIR "${CMAKE_BINARY_DIR}/out" CACHE PATH "Firmware artifact directory")
set(RHS_TARGET_FLAGS -march=rv32imac -mabi=ilp32 -mcmodel=medlow)
file(GLOB RHS_TEACHING_SOURCES CONFIGURE_DEPENDS App/Src/*.c)

file(MAKE_DIRECTORY "${RHS_OUTPUT_DIR}")

add_executable(RHSFirmwareBaseline
    Startup/startup_ch32v20x_D6.S
    Core/core_riscv.c
    Debug/debug.c
    RHS_HAL/Src/rhs_gpio.c
    Board/Src/rhs_board.c
    Board/Src/rhs_board_peripherals.c
    Teaching/Src/rhs_teaching_platform.c
    Peripheral/src/ch32v20x_gpio.c
    Peripheral/src/ch32v20x_rcc.c
    Peripheral/src/ch32v20x_tim.c
    Peripheral/src/ch32v20x_i2c.c
    Peripheral/src/ch32v20x_usart.c
    Peripheral/src/ch32v20x_adc.c
    User/main.c
    User/system_ch32v20x.c
    User/ch32v20x_it.c
    ${RHS_TEACHING_SOURCES}
)

target_include_directories(RHSFirmwareBaseline PRIVATE
    Core Debug User Peripheral/inc RHS_HAL/Inc Board/Inc Teaching/Inc Startup App/Inc
)

target_compile_options(RHSFirmwareBaseline PRIVATE
    ${RHS_TARGET_FLAGS} -Os -ffunction-sections -fdata-sections
    -fmessage-length=0 -fsigned-char -fno-common
)

target_compile_definitions(RHSFirmwareBaseline PRIVATE CH32V20x_D6)

set_source_files_properties(
    RHS_HAL/Src/rhs_gpio.c
    Board/Src/rhs_board.c
    Board/Src/rhs_board_peripherals.c
    Tests/rhs_gpio_link_smoke.c
    PROPERTIES COMPILE_OPTIONS
    "-Wall;-Wextra;-Wconversion;-Wno-sign-conversion;-Werror=implicit-function-declaration;-Werror=return-type"
)

add_executable(RHSFirmwareGPIOLinkSmoke EXCLUDE_FROM_ALL
    Startup/startup_ch32v20x_D6.S
    Core/core_riscv.c
    RHS_HAL/Src/rhs_gpio.c
    Board/Src/rhs_board.c
    Board/Src/rhs_board_peripherals.c
    Peripheral/src/ch32v20x_gpio.c
    Peripheral/src/ch32v20x_rcc.c
    Peripheral/src/ch32v20x_tim.c
    Peripheral/src/ch32v20x_i2c.c
    Peripheral/src/ch32v20x_usart.c
    Peripheral/src/ch32v20x_adc.c
    Tests/rhs_gpio_link_smoke.c
    User/system_ch32v20x.c
    User/ch32v20x_it.c
)

target_include_directories(RHSFirmwareGPIOLinkSmoke PRIVATE
    Core Debug User Peripheral/inc RHS_HAL/Inc Board/Inc Startup
)

target_compile_options(RHSFirmwareGPIOLinkSmoke PRIVATE
    ${RHS_TARGET_FLAGS} -Os -ffunction-sections -fdata-sections
    -fmessage-length=0 -fsigned-char -fno-common
)

target_compile_definitions(RHSFirmwareGPIOLinkSmoke PRIVATE CH32V20x_D6)

target_link_options(RHSFirmwareGPIOLinkSmoke PRIVATE
    ${RHS_TARGET_FLAGS} -nostartfiles --specs=nano.specs --specs=nosys.specs
    -T "${CMAKE_SOURCE_DIR}/Ld/Link.ld" -Wl,--gc-sections
    -Wl,--undefined=RHS_Board_InitButton
    -Wl,--undefined=RHS_Board_ReadButton
    -Wl,--undefined=RHS_Board_InitLed
    -Wl,--undefined=RHS_Board_WriteLed
    -Wl,--undefined=RHS_Board_ToggleLed
    -Wl,--undefined=RHS_Board_InitServoPwm
    -Wl,--undefined=RHS_Board_SetServoPulse
    -Wl,--undefined=RHS_Board_StartServoPwm
    -Wl,--undefined=RHS_Board_StopServoPwm
    -Wl,--undefined=RHS_Board_InitBuzzerPwm
    -Wl,--undefined=RHS_Board_StartBuzzer
    -Wl,--undefined=RHS_Board_StopBuzzer
    -Wl,--undefined=RHS_Board_InitOledI2c
    -Wl,--undefined=RHS_Board_InitProgramUart
    -Wl,--undefined=RHS_Board_InitDebugUart
    -Wl,--undefined=RHS_Board_InitCcd
)

target_link_options(RHSFirmwareBaseline PRIVATE
    ${RHS_TARGET_FLAGS} -nostartfiles --specs=nano.specs --specs=nosys.specs
    -T "${CMAKE_SOURCE_DIR}/Ld/Link.ld"
    -Wl,--gc-sections -Wl,-Map=${RHS_OUTPUT_DIR}/RHSFirmwareBaseline.map
)

set_target_properties(RHSFirmwareBaseline PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${RHS_OUTPUT_DIR}"
    OUTPUT_NAME RHSFirmwareBaseline
    SUFFIX .elf
)

add_custom_command(TARGET RHSFirmwareBaseline POST_BUILD
    COMMAND "${CMAKE_OBJCOPY}" -O ihex "$<TARGET_FILE:RHSFirmwareBaseline>" "${RHS_OUTPUT_DIR}/RHSFirmwareBaseline.hex"
    COMMAND "${CMAKE_OBJCOPY}" -O binary "$<TARGET_FILE:RHSFirmwareBaseline>" "${RHS_OUTPUT_DIR}/RHSFirmwareBaseline.bin"
    VERBATIM
)
