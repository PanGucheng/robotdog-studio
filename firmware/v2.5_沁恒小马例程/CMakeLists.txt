cmake_minimum_required(VERSION 3.24)

set(CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ROBOTDOG_TOOLCHAIN_ROOT)

project(RobotDogFirmware C ASM)

set(ROBOTDOG_OUTPUT_DIR "${CMAKE_BINARY_DIR}/out" CACHE PATH "Directory for final RobotDog firmware artifacts")
set(ROBOTDOG_STUDENT_OVERLAY "" CACHE PATH "Optional Studio student overlay root")

find_package(Python3 REQUIRED COMPONENTS Interpreter)

set(ROBOTDOG_TARGET_FLAGS -march=rv32imac -mabi=ilp32 -mcmodel=medlow)
set(ROBOTDOG_LINKER_SCRIPT "${CMAKE_SOURCE_DIR}/Ld/Link.ld")
set(ROBOTDOG_GENERATED_INC "${CMAKE_BINARY_DIR}/generated/Core/Inc")
set(ROBOTDOG_GENERATED_CONFIG "${ROBOTDOG_GENERATED_INC}/student_config.generated.h")

file(MAKE_DIRECTORY "${ROBOTDOG_OUTPUT_DIR}")

if(ROBOTDOG_STUDENT_OVERLAY)
    set(ROBOTDOG_STUDENT_SOURCE "${ROBOTDOG_STUDENT_OVERLAY}/Core/Src/student_control.c")
    set(ROBOTDOG_STUDENT_HEADER_DIR "${ROBOTDOG_STUDENT_OVERLAY}/Core/Inc")
    set(ROBOTDOG_STUDENT_CONFIG "${ROBOTDOG_STUDENT_OVERLAY}/student-config/line-following.yaml")
else()
    set(ROBOTDOG_STUDENT_SOURCE "${CMAKE_SOURCE_DIR}/Core/Src/student_control.c")
    set(ROBOTDOG_STUDENT_HEADER_DIR "${CMAKE_SOURCE_DIR}/Core/Inc")
    set(ROBOTDOG_STUDENT_CONFIG "${CMAKE_SOURCE_DIR}/student-config/line-following.yaml")
endif()

foreach(required_file IN ITEMS "${ROBOTDOG_STUDENT_SOURCE}" "${ROBOTDOG_STUDENT_CONFIG}")
    if(NOT EXISTS "${required_file}")
        message(FATAL_ERROR "Missing required student input: ${required_file}")
    endif()
endforeach()

add_custom_command(
    OUTPUT "${ROBOTDOG_GENERATED_CONFIG}"
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tools/generate_student_config.py"
            "${ROBOTDOG_STUDENT_CONFIG}" "${ROBOTDOG_GENERATED_CONFIG}"
    DEPENDS "${ROBOTDOG_STUDENT_CONFIG}" "${CMAKE_SOURCE_DIR}/tools/generate_student_config.py"
    VERBATIM
)

add_custom_target(robotdog_student_config DEPENDS "${ROBOTDOG_GENERATED_CONFIG}")

set(ROBOTDOG_STARTUP_SOURCES
    Startup/startup_ch32v20x_D6.S
)

set(ROBOTDOG_CORE_SOURCES
    Core/core_riscv.c
)

set(ROBOTDOG_DEBUG_SOURCES
    Debug/debug.c
)

set(ROBOTDOG_USER_SOURCES
    User/main.c
    User/system_ch32v20x.c
    User/ch32v20x_it.c
    User/ccd_line_sensor.c
    User/robotdog_types.c
    User/robotdog_safety.c
    User/robotdog_protocol.c
    User/robotdog_text.c
    User/robotdog_tx_queue.c
    User/robotdog_telemetry.c
    User/robotdog_student_bridge.c
    User/robotdog_runtime.c
    User/robotdog_motion.c
    User/ssd1306_oled.c
)

set(ROBOTDOG_PERIPHERAL_SOURCES
    Peripheral/src/ch32v20x_adc.c
    Peripheral/src/ch32v20x_dbgmcu.c
    Peripheral/src/ch32v20x_gpio.c
    Peripheral/src/ch32v20x_i2c.c
    Peripheral/src/ch32v20x_misc.c
    Peripheral/src/ch32v20x_rcc.c
    Peripheral/src/ch32v20x_tim.c
    Peripheral/src/ch32v20x_usart.c
)

add_executable(RobotDogFirmware
    ${ROBOTDOG_STARTUP_SOURCES}
    ${ROBOTDOG_CORE_SOURCES}
    ${ROBOTDOG_DEBUG_SOURCES}
    ${ROBOTDOG_USER_SOURCES}
    ${ROBOTDOG_PERIPHERAL_SOURCES}
    "${ROBOTDOG_STUDENT_SOURCE}"
)

add_dependencies(RobotDogFirmware robotdog_student_config)

target_include_directories(RobotDogFirmware PRIVATE
    "${ROBOTDOG_GENERATED_INC}"
    "${ROBOTDOG_STUDENT_HEADER_DIR}"
    Core/Inc
    Core
    Debug
    User
    Peripheral/inc
    Startup
)

target_compile_definitions(RobotDogFirmware PRIVATE
    ROBOTDOG_ENABLE_LEGACY_TEXT=0
)

target_compile_options(RobotDogFirmware PRIVATE
    ${ROBOTDOG_TARGET_FLAGS}
    -Os
    -ffunction-sections
    -fdata-sections
    -fmessage-length=0
    -fsigned-char
    -fno-common
)

set_source_files_properties("${ROBOTDOG_STUDENT_SOURCE}" PROPERTIES
    COMPILE_OPTIONS "-Wall;-Wextra;-Wconversion;-Werror=implicit-function-declaration;-Werror=return-type"
)

target_link_options(RobotDogFirmware PRIVATE
    ${ROBOTDOG_TARGET_FLAGS}
    -nostartfiles
    --specs=nano.specs
    --specs=nosys.specs
    -T "${ROBOTDOG_LINKER_SCRIPT}"
    -Wl,--gc-sections
    -Wl,-Map=${ROBOTDOG_OUTPUT_DIR}/RobotDog.map
)

set_target_properties(RobotDogFirmware PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${ROBOTDOG_OUTPUT_DIR}"
    OUTPUT_NAME "RobotDog"
    SUFFIX ".elf"
)

add_custom_command(TARGET RobotDogFirmware POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${ROBOTDOG_OUTPUT_DIR}"
    COMMAND "${CMAKE_OBJCOPY}" -O ihex "$<TARGET_FILE:RobotDogFirmware>" "${ROBOTDOG_OUTPUT_DIR}/RobotDog.hex"
    COMMAND "${CMAKE_OBJCOPY}" -O binary "$<TARGET_FILE:RobotDogFirmware>" "${ROBOTDOG_OUTPUT_DIR}/RobotDog.bin"
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tools/run_size.py"
            --tool "${CMAKE_SIZE}"
            --elf "$<TARGET_FILE:RobotDogFirmware>"
            --output "${ROBOTDOG_OUTPUT_DIR}/RobotDog.size.txt"
            --flash-bytes 65536
            --minimum-flash-free 8192
            --ram-bytes 20480
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tools/source_input_hash.py"
            --root "${CMAKE_SOURCE_DIR}" --output "${ROBOTDOG_OUTPUT_DIR}/RobotDog.input.json"
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tools/artifact_hashes.py"
            --output "${ROBOTDOG_OUTPUT_DIR}/RobotDog.sha256.txt"
            "$<TARGET_FILE:RobotDogFirmware>"
            "${ROBOTDOG_OUTPUT_DIR}/RobotDog.hex"
            "${ROBOTDOG_OUTPUT_DIR}/RobotDog.bin"
            "${ROBOTDOG_OUTPUT_DIR}/RobotDog.map"
    VERBATIM
)
