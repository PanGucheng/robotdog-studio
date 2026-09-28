## 1. 从黑盒到白盒：单片机怎样伸出触角？ {#what-is-gpio}

在第一课中，你亲眼见证了一行 C 语言代码如何改变了现实中 LED 的闪烁速度。但当时我们使用的是高层教学封装函数 `RHS_Teaching_InitLed()` 与 `RHS_Teaching_ToggleLed()`。

你可能会好奇：**如果剥开这层封装，单片机底层到底是如何控制每一个真实引脚的？**

今天，我们将正式揭开这个“黑盒”，使用**沁恒官方标准外设库（CH32V20x SDK）**，亲手编写底层的引脚控制代码！

---

### 1. 什么是 GPIO？ {#gpio-concept}

在单片机芯片的四周，伸出了一排排银色的金属管脚。其中绝大多数管脚都可以由软件灵活配置为“输入信号”或“输出信号”，它们被称为 **GPIO（General Purpose Input/Output，通用输入输出端口）**。

- **输入（Input）**：监听外界信号。例如读取按键有没有被按下、传感器有没有检测到障碍物。
- **输出（Output）**：主动发出控制信号。例如给引脚施加高电压（3.3V）或低电压（0V），用来点亮指示灯、启动电机或让蜂鸣器发声。

:::concept[通用输入输出口（GPIO）]
GPIO 是单片机芯片伸向物理世界最基本的“电气触角”。通过软件配置，同一个引脚既可以作为输入感知外界电平，也可以作为输出主动控制外部电子元器件。
:::

---

### 2. 芯片管脚的分组管理：Port 与 Pin {#port-and-pin}

CH32V203 芯片拥有几十个引脚。如果逐个给引脚起乱七八糟的名字，管理起来会极其混乱。芯片设计者采用了**分组管理**的方式：

1. **端口（Port）**：将引脚按英文字母划分为大组，例如 `GPIOA`、`GPIOB`、`GPIOC` 等。每一组端口通常管理 16 个引脚；
2. **引脚编号（Pin）**：组内的每一个具体管脚用数字 $0 \sim 15$ 标记，例如 `Pin 0`、`Pin 1`、`Pin 8`。

二者组合起来，就构成了我们在工程原理图上看到的简写引脚名：
$$\text{Port B} + \text{Pin 8} = \mathbf{PB8}$$

在沁恒官方库中，它们被定义为标准的 C 语言符号：
- 端口对象：`GPIOB`
- 引脚编号：`GPIO_Pin_8`

:::note[开发板上的硬件目标]
打开中央编辑器查看 `App/Src/experiment.c`，我们今天要控制的目标依然是那颗熟悉的绿色板载 LED。在硬件走线上，它正是连接在单片机的 **PB8** 引脚上！
:::

::code-target[查看 experiment.c 代码骨架]{path="App/Src/experiment.c" line="1"}

::task-link[完成任务：认识 PB8 与代码骨架]{step="find-hardware-target"}

---

## 2. 唤醒外设的第一步：开启外设时钟 {#clock-and-rcc}

### 1. 为什么引脚默认不会工作？ {#low-power-philosophy}

很多单片机初学者常常直接上手去配置引脚，结果发现引脚毫无反应，折腾几天才发现原因：**忘记开时钟了**！

单片机是一种极其注重低功耗的芯片。如果芯片一通电，内部所有外设（GPIO、串口、定时器、ADC 等）全部开足马力运转，会造成巨大的电量浪费和发热。

因此，芯片内部采用了一种**门控时钟机制（RCC，Reset and Clock Control）**：
> **默认状态下，几乎所有外设的时钟都是关闭的（处于断电沉睡状态）。**  
> 只有你的程序明确向芯片发出“开启某外设时钟”的指令后，该外设内部的数字逻辑电路才会接通时钟并开始响应配置。

---

### 2. 官方 API：RCC_APB2PeriphClockCmd {#clock-api}

在 CH32V203 中，`GPIOB` 挂载在高速的 APB2 总线上。为了唤醒 GPIOB，我们需要调用沁恒官方库函数：

```c
RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
```

- **参数一**：`RCC_APB2Periph_GPIOB`，指定要开启的时钟目标是 GPIOB；
- **参数二**：`ENABLE`，使能（开启）时钟信号。

:::pitfall[开时钟就像进房间先开灯]
把开启外设时钟想象成“进入房间前先合上总电闸”。如果总闸没合上，你在房间里按任何开关（配置引脚参数），灯具都是绝对不可能有反应的！
:::

::task-link[前往任务：开启 GPIOB 外设时钟]{step="enable-gpiob-clock"}

---

## 3. 引脚配置三步法：结构体与 GPIO_Init {#gpio-init-workflow}

时钟开启后，GPIOB 模块已经唤醒。但芯片依然不知道你想拿 PB8 做什么——是要检测按键输入？还是要输出电流点亮 LED？因此必须对引脚进行**模式配置**。

在官方标准库中，外设配置统一采用经典的**“三步走流程”**：

```
[1. 定义配置结构体] → [2. 填写引脚参数] → [3. 调用 GPIO_Init 盖章生效]
```

---

### 1. 填写参数申请表：GPIO_InitTypeDef {#gpio-struct}

沁恒官方外设库提供了一个专门用来描述 GPIO 配置的结构体类型：`GPIO_InitTypeDef`。

我们在 `RHS_Experiment_Init()` 中定义一个结构体变量，并填写三项核心参数：

```c
GPIO_InitTypeDef GPIO_InitStructure = {0};

/* 1. 指定我们要配置的具体引脚 */
GPIO_InitStructure.GPIO_Pin = GPIO_Pin_8;

/* 2. 指定工作模式：推挽输出 */
GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;

/* 3. 指定输出翻转速度：50MHz */
GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
```

- **`GPIO_Pin_8`**：告诉芯片，这次配置只针对 8 号引脚，不影响同端口的其他引脚；
- **`GPIO_Mode_Out_PP`**：`PP` 代表 **Push-Pull（推挽输出）**。这是最通用、最强劲的数字输出模式，既能强力输出 3.3V 高电平，也能强力拉低到 0V 低电平，非常适合驱动 LED、蜂鸣器等数字设备；
- **`GPIO_Speed_50MHz`**：指定引脚电平跳变的最大速度，在常规应用中填 50MHz 即可。

---

### 2. 盖章生效：GPIO_Init {#gpio-init-call}

填好结构体后，这些参数目前还只是**电脑/内存里的普通变量**，芯片的硬件引脚电路并不知道它们的存在。

必须调用官方初始化函数，把结构体里的参数真正刷入 CH32V203 的底层硬件控制寄存器中：

```c
GPIO_Init(GPIOB, &GPIO_InitStructure);
```

- 第一个参数 `GPIOB`：指定配置的目标端口；
- 第二个参数 `&GPIO_InitStructure`：传入刚才填好的配置结构体地址（注意前面的取地址符 `&`）。

:::tip[填表与办手续的比喻]
填写结构体就像在办事窗口“填写申请表格”；调用 `GPIO_Init()` 才是把表格递给窗口办事员“审核盖章并录入系统”。两步缺一不可！
:::

::task-link[前往任务：配置 PB8 推挽输出参数]{step="configure-gpio-struct"}

::task-link[前往任务：调用 GPIO_Init 写入硬件]{step="call-gpio-init"}

::task-link[前往任务：检查初始化代码语法]{step="candidate-build-init"}

---

## 4. 控制高低电平：高电平、低电平与物理电路 {#logic-levels-and-circuit}

引脚已经成功配置为推挽输出模式。现在，单片机完全具备了向外输出电平的能力！

---

### 1. 认识电平输出 API {#write-pin-api}

沁恒官方库提供了两个最直观、执行效率最高的输出控制函数：

- **`GPIO_ResetBits(GPIOB, GPIO_Pin_8)`**：将 PB8 引脚电平**拉低**（输出 0V 低电平）；
- **`GPIO_SetBits(GPIOB, GPIO_Pin_8)`**：将 PB8 引脚电平**拉高**（输出 3.3V 高电平）。

---

### 2. 【预测与实验】：ResetBits 到底会让灯亮还是灭？ {#polarity-prediction}

现在请先停下来，在心里做一个预测：
> **`ResetBits`（清零/复位，输出 0V）与 `SetBits`（置位，输出 3.3V），你认为哪一个会让开发板上的 LED 点亮？**

很多初学者的第一直觉往往是：“1 代表有，0 代表无；所以高电平 Set 应该亮，低电平 Reset 应该灭”。

事实真的如此吗？让我们动手来验证！在 `RHS_Experiment_Loop()` 中写下一行代码：

```c
void RHS_Experiment_Loop(void)
{
    GPIO_ResetBits(GPIOB, GPIO_Pin_8); // 输出低电平 (0V)
}
```

保存代码，点击任务栏中的 **【编译】** 与 **【写入开发板】**。烧录完成后，观察开发板上的 PB8 LED。

---

### 3. 揭秘硬件原理图：低电平有效电路 {#active-low-explanation}

你会惊讶地发现：**开发板上的绿色 PB8 LED 竟然亮起来了！** 输出低电平（0V）反而让灯点亮了！

这是为什么？让我们看一眼开发板关于 LED 的真实硬件原理图走线：

```
[3.3V 电源供电]
      │
   [限流电阻]
      │
   [LED 阳极 +]  (正极)
   [LED 阴极 -]  (负极)
      │
[CH32V203 PB8 引脚]
```

物理电路规律告诉我们：**只有当 LED 两端存在电压差时，电流才会流动，发光二极管才会发光**。

1. **当单片机输出低电平（0V）时**：  
   LED 阳极是 3.3V，阴极被单片机拉到了 0V。两端形成了约 3.3V 的电压差，电流从电源经 LED 顺畅流入芯片引脚引向地线，**LED 成功点亮**！
2. **当单片机输出高电平（3.3V）时**：  
   LED 阳极是 3.3V，阴极被单片机输出同样为 3.3V。两端等电位（电压差为 0V），没有电流流过，**LED 熄灭**。

这种“输入低电平时器件工作”的电路连接方式，在电子工程中被称为 **低电平有效（Active-Low）**。

:::note[逻辑电平 vs 物理状态]
在单片机开发中，永远不要想当然地认为“高电平就一定等于开”。引脚输出的高低电平到底产生什么物理动作，完全取决于外部电路是怎样搭建的！
:::

::task-link[前往任务：编写输出让 LED 点亮]{step="write-led-level"}

::task-link[前往任务：编译完整点亮程序]{step="firmware-build-on"}

::task-link[前往任务：写入开发板（点亮）]{step="flash-board-on"}

::task-link[前往任务：观察 PB8 LED 常亮]{step="observe-led-polarity"}

---

## 5. 综合实战：编写纯官方 SDK 的闪烁程序 {#full-blink-practice}

既然我们已经验证了：
- `GPIO_ResetBits(GPIOB, GPIO_Pin_8)` $\rightarrow$ **点亮**
- `GPIO_SetBits(GPIOB, GPIO_Pin_8)` $\rightarrow$ **熄灭**

那么把它们组合起来，中间穿插等待延时，不就能实现完整的规律闪烁了吗？

---

### 1. 构建闪烁时序 {#blink-timing}

在 `App/Src/experiment.c` 中，将 `RHS_Experiment_Loop()` 完善为以下时序：

```c
void RHS_Experiment_Loop(void)
{
    /* 1. 点亮 LED (输出低电平) */
    GPIO_ResetBits(GPIOB, GPIO_Pin_8);

    /* 2. 保持点亮状态等待 500 毫秒 (0.5 秒) */
    Delay_Ms(500);

    /* 3. 熄灭 LED (输出高电平) */
    GPIO_SetBits(GPIOB, GPIO_Pin_8);

    /* 4. 保持熄灭状态等待 500 毫秒 (0.5 秒) */
    Delay_Ms(500);
}
```

因为系统底层会永不停歇地循环调用 `RHS_Experiment_Loop()`，所以整个执行过程将是：  
`点亮 0.5s` $\rightarrow$ `熄灭 0.5s` $\rightarrow$ `点亮 0.5s` $\rightarrow$ `熄灭 0.5s`……形成持续优美的交替闪烁！

---

### 2. 编译、烧录与终极验证 {#final-verification}

保存代码后：
1. 点击任务栏步骤 11 的 **【编译】**；
2. 确认编译成功后，点击步骤 12 的 **【写入开发板】**；
3. 烧录完成后，观察桌上的小马开发板——板载 PB8 LED 按照你设定的节奏平稳闪烁！

回想一下第一课：当时你调用的是别人封装好的 `RHS_Teaching_InitLed()` 与 `RHS_Teaching_ToggleLed()`。  
而现在，**从外设时钟开启、推挽输出配置、硬件初始化，到高低电平控制，整套程序 100% 都是由你亲自调用的沁恒官方标准外设库代码！** 你已经真正推开了嵌入式底层开发的大门！

::task-link[前往任务：改写 Loop 实现闪烁]{step="edit-blink-loop"}

::task-link[前往任务：编译完整闪烁程序]{step="firmware-build-blink"}

::task-link[前往任务：写入开发板（闪烁）]{step="flash-board-blink"}

::task-link[前往任务：观察 PB8 LED 闪烁]{step="observe-led-blink"}

---

## 6. 常见问题排查、思考反思与小结 {#troubleshooting-and-summary}

### 1. 新手常见问题排查清单 {#troubleshooting}

- **问题一：烧录成功后，LED 依然不亮也不闪？**
  - **排查时钟**：检查是否漏掉了 `RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);`？
  - **排查端口**：检查 `GPIO_Init` 和 `GPIO_ResetBits` 的第一个参数是否误写成了 `GPIOA`？
  - **排查取地址符**：检查 `GPIO_Init(GPIOB, &GPIO_InitStructure)` 中是否漏掉了 `&`？
- **问题二：编译报错提示未定义符号？**
  - 检查头文件是否完整包含了 `#include "ch32v20x_gpio.h"` 和 `#include "ch32v20x_rcc.h"`；
  - 检查官方宏命名的大小写：C 语言对大小写严格敏感，如 `GPIO_Pin_8` 不能写成 `gpio_pin_8`。

---

### 2. 想一想：核心概念反思 {#reflection}

实验完成后，请在右侧任务栏最后一步提交对以下两道核心思考题的回答：

1. **为什么在配置 GPIOB 引脚之前，必须先调用 `RCC_APB2PeriphClockCmd` 打开外设时钟？**
2. **在我们的机器马开发板上，为什么调用 `GPIO_ResetBits`（输出低电平）反而会让 LED 点亮？**

::task-link[完成课后思考题]{step="reflect-gpio-concepts"}

---

### 3. 本课小结与后续展望 {#summary}

在第二课中，你掌握了单片机开发最重要的核心基本功：
- **GPIO 概念**：通用输入输出口是单片机连接外界的电气通道；
- **时钟门控（RCC）**：外设使用前必须先开时钟接通电源；
- **标准初始化三步走**：定义结构体 $\rightarrow$ 填写参数 $\rightarrow$ 调用 `GPIO_Init` 写入硬件；
- **推挽输出与低电平有效**：理解了逻辑电平与硬件电路走线之间的物理配合关系。

目前我们掌握的都是单片机**向外输出（Output）**。那单片机如何**感知外界的输入（Input）** 呢？比如当我们按下一颗微动开关按键时，单片机怎样获知并立即做出响应？  
在下一课中，我们将继续探索 GPIO 的另一半能力——**GPIO 输入与按键检测**！
