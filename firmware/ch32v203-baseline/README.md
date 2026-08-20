# CH32V203 firmware baseline

Minimal firmware baseline and RHS HAL foundation for the CH32V203C8T6/D6 startup family.
The source baseline is copied from `D:\RobotDog\EVT\EXAM\SRC` and the empty
GPIO example's WCH `User` system/interrupt files.  No board pin, UART, timer,
CCD, servo, or robot runtime is initialized. RHS GPIO is chip-level only and
contains no board pin mapping.

Configure with the existing WCH GCC12 toolchain:

```text
cmake --preset wch-gcc12
cmake --build --preset release
```

Set `RHS_TOOLCHAIN_ROOT` to the toolchain root (or its `bin` directory).

The GPIO API link smoke target is built explicitly with:

```text
cmake --build --preset release --target RHSFirmwareGPIOLinkSmoke
```

See `docs/rhs-hal-design.md` for the API and layer boundaries.
