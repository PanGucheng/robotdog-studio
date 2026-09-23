# 学生接口功能说明

当前学生接口的定位是：学生编写巡线决策逻辑，不直接操作串口、舵机、定时器或 GPIO。底层固件会把 CCD 识别结果传给学生代码，学生只需要输出“停、站立、前进、左转、右转”这类高层动作。

## 1. 学生可以修改哪些文件

主要开放给学生修改的文件有三个：

- `Core/Src/student_control.c`：主要控制逻辑文件。
- `Core/Inc/student_control.h`：学生接口定义文件，一般不建议频繁修改。
- `student-config/line-following.yaml`：简单参数配置文件。

当前 YAML 配置内容为：

```yaml
turn_strength: 18
line_target: 64
```

参数范围如下：

- `turn_strength`: `1..30`
- `line_target`: `0..127`

如果使用 MounRiver 直接编译，修改 YAML 后需要重新生成 `Core/Inc/student_config.generated.h`，否则固件仍会使用旧的生成配置。CMake 构建路径会自动执行生成步骤。

## 2. 学生代码可以读取什么输入

学生控制函数为：

```c
void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output);
```

输入结构体 `student_control_input_t` 提供以下信息：

- `now_ms`：当前毫秒时间。
- `line_valid`：当前是否识别到线。
- `line_center`：识别到的线中心，范围大致为 CCD 的 `0..127`。
- `line_target`：目标中心，当前默认值为 `64`。
- `line_error`：线中心误差，计算方式为 `line_center - line_target`。
- `threshold`：CCD 阈值。
- `pixels`：128 点 CCD 原始数据指针，只读。

也就是说，学生可以基于“是否丢线、线偏左还是偏右、CCD 原始数组”等信息实现自己的巡线算法。

## 3. 学生代码可以输出什么动作

输出结构体 `student_control_output_t` 包含：

- `action`：学生请求的动作。
- `turn_strength`：动作强度，允许范围为 `1..30`。

当前支持的学生动作有：

- `STUDENT_ACTION_STOP`：停止，舵机回安全中位。
- `STUDENT_ACTION_STAND`：站立。
- `STUDENT_ACTION_WALK`：向前走。
- `STUDENT_ACTION_TURN_LEFT`：左转。
- `STUDENT_ACTION_TURN_RIGHT`：右转。

桥接层会把这些学生动作映射成系统动作，再交给安全状态机和动作执行模块处理。

## 4. 当前默认学生逻辑的效果

当前 `Core/Src/student_control.c` 的默认逻辑比较简单：

- 如果输入为空、没有识别到线，或者 CCD 像素为空：输出 `STOP`。
- 如果 `line_error < -8`：输出 `TURN_LEFT`。
- 如果 `line_error > 8`：输出 `TURN_RIGHT`。
- 如果偏差在 `-8..8` 之间：输出 `WALK`。
- `turn_strength` 使用配置里的 `turn_strength`，当前默认是 `18`。

因此默认效果可以概括为：

> 线偏左就左转，线偏右就右转，基本居中就前进，丢线就停止。

## 5. 如何让学生程序实际运行

学生程序只会在自动巡线模式下生效。外部需要通过 USART3 的 RDS1 协议进入自动巡线模式。

可发送：

```text
@RDS1 REQ 1 MODE auto
```

也可以发送：

```text
@RDS1 REQ 1 MODE line
@RDS1 REQ 1 MODE autonomous_line
```

进入自动巡线模式后，运行时会重新初始化学生逻辑，并在主循环中周期性采集 CCD 数据，再把识别结果送入 `StudentControl_Update()`。

当前主循环每 `50ms` 采样一次 CCD。学生桥接层内部还有 `ROBOTDOG_STUDENT_PERIOD_MS = 20ms` 的调度限制，因此在当前配置下，学生逻辑实际跟随 CCD 采样周期运行，约为每 `50ms` 调用一次。

## 6. 学生接口的安全限制

学生代码不能绕过安全层直接控制舵机。当前安全保护包括：

- 如果学生输出非法枚举值：进入错误安全状态并停机。
- 如果 `WALK`、`TURN_LEFT`、`TURN_RIGHT` 的 `turn_strength` 超出 `1..30`：进入错误安全状态并停机。
- 如果学生输出 `STOP`：立即停止动作。
- 自动巡线模式下持续丢线：触发安全停机。
- 外部协议溢出或异常：触发协议错误停机。

因此学生接口的边界是清楚的：学生只负责编写“根据传感器输入选择动作”的策略，动作是否允许执行、何时停机、如何保护舵机，都由固件安全层统一处理。

## 7. 一个最小示例

下面是当前默认逻辑的核心形式：

```c
void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output)
{
    const int16_t deadband = 8;

    if(output == 0)
    {
        return;
    }

    output->action = STUDENT_ACTION_STOP;
    output->turn_strength = STUDENT_CONFIG_TURN_STRENGTH;

    if(input == 0 || !input->line_valid || input->pixels == 0)
    {
        return;
    }

    if(input->line_error < -deadband)
    {
        output->action = STUDENT_ACTION_TURN_LEFT;
    }
    else if(input->line_error > deadband)
    {
        output->action = STUDENT_ACTION_TURN_RIGHT;
    }
    else
    {
        output->action = STUDENT_ACTION_WALK;
    }
}
```

