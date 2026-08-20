cmake_minimum_required(VERSION 3.24)

set(CMAKE_TRY_COMPILE_PLATFORM_VARIABLES RHS_TOOLCHAIN_ROOT)

project(RHSFirmwareBaseline C ASM)

set(RHS_TOOLCHAIN_ROOT "" CACHE PATH "WCH RISC-V Embedded GCC12 root or bin directory")
set(RHS_OUTPUT_DIR "${CMAKE_BINARY_DIR}/out" CACHE PATH "Firmware artifact directory")
set(RHS_TARGET_FLAGS -march=rv32imac -mabi=ilp32 -mcmodel=medlow)

file(MAKE_DIRECTORY "${RHS_OUTPUT_DIR}")

add_executable(RHSFirmwareBaseline
    Startup/startup_ch32v20x_D6.S
    Core/core_riscv.c
    User/main.c
    User/system_ch32v20x.c
    User/ch32v20x_it.c
)

target_include_directories(RHSFirmwareBaseline PRIVATE
    Core Debug User Peripheral/inc Startup
)

target_compile_options(RHSFirmwareBaseline PRIVATE
    ${RHS_TARGET_FLAGS} -Os -ffunction-sections -fdata-sections
    -fmessage-length=0 -fsigned-char -fno-common
)

target_compile_definitions(RHSFirmwareBaseline PRIVATE CH32V20x_D6)

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
