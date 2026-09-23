# Firmware Baseline Delivery Report

Review date: 2026-07-13

## Build

Toolchain: WCH RISC-V Embedded GCC 12.2.0

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/MounRiverStudio/MounRiver_Studio2/resources/app/resources/win32/components/WCH/Toolchain/RISC-V Embedded GCC12" `
  -DROBOTDOG_OUTPUT_DIR="R:/out/robotdog-release"
cmake --build --preset robotdog-release
```

Configuration and build passed. The toolchain path contains spaces, and `ROBOTDOG_TOOLCHAIN_ROOT` reached CMake's compiler-check subproject without an extra `CMAKE_TRY_COMPILE_PLATFORM_VARIABLES` command-line option.

A second clean build with `ROBOTDOG_STUDENT_OVERLAY` pointing to an isolated test overlay also passed. Its generated configuration stayed under the build directory and did not modify the source student files.

The two available IDE-bundled CMake executables crashed before compiler detection when given the source tree's Chinese absolute path. The successful validation used an ASCII `subst` alias (`R:`) for the same workspace. This is a limitation of the tested CMake distributions, not a firmware compile error; RobotDog Studio should ship or validate a Unicode-safe CMake build.

## Size

```text
text=14916
data=104
bss=4068
flash_used=15020
flash_free=50516
ram_used=4172
```

The reviewed build in the change brief used about 65,108 bytes of Flash. The new build saves about 50,088 bytes and leaves about 49.3KB free. The build fails if less than 8KB Flash remains.

The reduction comes from removing embedded `printf`/`snprintf`/`strtoul`, using bounded integer/text formatting, compiling only used peripheral modules, retaining `-Os` and section garbage collection, and linking nano libc.

## Host Tests

```powershell
python tests/run_host_tests.py --cc "C:/Users/Rykii/scoop/apps/gcc/current/bin/gcc.exe" --require-c-compiler
```

Result: passed.

- YAML valid and invalid cases passed.
- RDS1 fragmentation, sticky frames, noise, overflow, invalid parameters, sequence values, and response formatting passed.
- Heartbeat 499/500ms, lease expiry, line loss, repeated STOP, and STOP from every mode passed.
- Student bridge normal, line-loss, and null-input behavior passed.
- 2000 consecutive worst-case CCD frames formatted successfully at 586 bytes per frame.
- TX tests passed for high-priority ordering, frame atomicity, and CCD drop-on-congestion.

## Remaining Hardware Checks

- Confirm power-on motion stays at the safe 90-degree pose.
- Measure STOP acknowledgement latency while streaming CCD at 20Hz.
- Measure the real heartbeat timeout under CCD capture and UART load.
- Confirm reconnect does not resume an expired action.
- Replace the cooperative `Delay_Ms(1)` scheduler with an interrupt-driven monotonic tick after timing validation.

## Commit Metadata Blocker

The reviewed integration is identified only as short commit `efaae6c`. This exported workspace is not a Git repository, and no local or public source resolved it to a unique 40-character hash. `robotdog.firmware.json` therefore separates the known source base from the unresolved integration commit and leaves `baselineCommit` null. The authoritative repository owner must fill this field before final Studio release.
