# CH32V203 RHS firmware baseline

Clean, independently buildable firmware baseline for the CH32V203C8T6/D6
startup family used by the RHS machine-horse teaching board. The WCH startup,
core and peripheral-library sources retain their original notices. New
interfaces use the `RHS_` prefix.

The Board layer contains the confirmed machine-horse pin map and opt-in entry
points for the button, LED, four TIM3 servo channels, TIM1 passive buzzer,
OLED I2C1, USART1/USART3 and CCD inputs. `User/main.c` does not start any of
these peripherals automatically, so a baseline boot does not move servos,
sound the buzzer or transmit data.

Configure with the existing WCH GCC12 toolchain:

```text
cmake --preset wch-gcc12
cmake --build --preset release
```

Set `RHS_TOOLCHAIN_ROOT` to the toolchain root (or its `bin` directory). From
the repository root, the bundled toolchain can be selected with:

```powershell
$env:RHS_TOOLCHAIN_ROOT = (Resolve-Path 'vendor/wch/Toolchain/RISC-V Embedded GCC12').Path
cmake --preset wch-gcc12 -S firmware/ch32v203-baseline
cmake --build firmware/ch32v203-baseline/build/release
```

The GPIO API link smoke target is built explicitly with:

```text
cmake --build --preset release --target RHSFirmwareGPIOLinkSmoke
```

See `docs/rhs-hal-design.md` for the API and layer boundaries.
See `docs/rhs-board-pinmap.md` for the confirmed machine-horse mapping and
the electrical assumptions that still require hardware verification.

The Board layer also exposes opt-in initialization boundaries for TIM3 servo
PWM, TIM1 buzzer PWM, OLED I2C1, USART1/USART3, and CCD ADC/GPIO. No such
function is called by the baseline application, and PWM outputs require an
explicit start call. Higher-level OLED protocols, UART protocols, servo-angle
mapping, buzzer melodies, CCD algorithms and robot motion remain outside this
baseline.
