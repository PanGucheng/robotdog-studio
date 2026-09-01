## 从硬件配置到应用程序 {#workflow}

TI MSPM0 工程里有两类工作需要分开理解：

1. `gpio_toggle_output.syscfg` 描述芯片、封装、引脚和外设资源，由官方 SysConfig 读取。
2. `src/main.c` 编写应用逻辑，通过 MSPM0 DriverLib 使用这些资源。

保存 `.syscfg` 后，RobotDog Studio 在每次编译前运行 SysConfig CLI，重新生成 `ti_msp_dl_config.c`、`ti_msp_dl_config.h`、`device.opt` 和链接片段。这些文件属于自动生成结果，可以查看，但不应手工长期修改。

```text
.syscfg → SysConfig CLI → generated/ → Arm GCC → ELF → OpenOCD → CMSIS-DAP → MSPM0
```

## 第一个 GPIO 程序 {#gpio-program}

程序首先调用 `SYSCFG_DL_init()` 应用硬件配置，然后用 `DL_GPIO_togglePins()` 翻转 LED 引脚。修改应用代码不会立刻改变开发板；只有重新生成、编译、烧录、校验和复位全部成功后，新程序才会运行。

::code-target[打开应用程序]{path="src/main.c" line="1"}

::task-link[开始生成并编译]{step="firmware-build"}
