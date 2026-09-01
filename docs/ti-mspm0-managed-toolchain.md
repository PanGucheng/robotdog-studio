# TI MSPM0 managed toolchain

RobotDog Studio TI MSPM0 Edition freezes and redistributes these portable runtimes without committing their binaries to Git:

| Component | Frozen version | Default release source | Packaged path | Upstream license retained at |
| --- | --- | --- | --- | --- |
| TI MSPM0 SDK | 2.11.00.07 | `D:\ti\mspm0_sdk_2_11_00_07` | `resources/toolchains/ti-mspm0/sdk` | `license_mspm0_sdk_2_11_00_07.txt` and bundled third-party licenses |
| TI SysConfig | 1.28.1+4785 | `D:\ti\sysconfig_1.28.1` | `resources/toolchains/ti-mspm0/sysconfig` | `dist/license.txt` |
| GNU Arm Embedded | 9-2019-q4-major | `D:\ti\gcc-arm-none-eabi-9-2019-q4-major-win32` | `resources/toolchains/ti-mspm0/gcc` | `share/doc/gcc-arm-none-eabi/license.txt` and bundled component licenses |
| OpenOCD | d9b957f | `D:\ti\openocd-d9b957f-i686-w64-mingw32` | `resources/toolchains/ti-mspm0/openocd` | `COPYING` and `share/doc` |

The release script copies complete upstream directories, including licenses, into package staging. It does not modify upstream binaries. RobotDog adds only `sysconfig/package.json` as a CommonJS package-scope boundary so SysConfig remains portable even when an installation has an ancestor `package.json` declaring ESM. OpenOCD redistribution must retain the GPL license and corresponding-source/source-offer obligations must be reviewed for each public release.

In development, `ROBOTDOG_TI_MSPM0_SDK_ROOT`, `ROBOTDOG_TI_SYSCONFIG_ROOT`, `ROBOTDOG_TI_GCC_ROOT`, and `ROBOTDOG_TI_OPENOCD_ROOT` override the `D:\ti` defaults. In a packaged installation, the presence of `resources/toolchains/ti-mspm0/manifest.json` selects the managed layout and prevents fallback to the development machine.

SysConfig 1.28.1 was copied to an unrelated system temporary directory and verified with `sysconfig_cli.bat --version`, MSPM0 code generation, and a GUI launch. Re-run `scripts/verify-sysconfig-portable.ps1` when preparing a release.
