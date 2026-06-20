# RobotDog CH32V203 下位机固件修改要求

> - 交付对象：下位机/固件开发者
> - 需求方：RobotDog Studio 上位机项目
> - 参考工程：`D:\RobotDog\ch32v203-robot-dog`
> - 参考提交：`0858d821d56daaea6e45740f5b496714fea20aca`
> - 文档版本：1.0（2026-06-20）

## 1. 目标与范围

本次修改的目标不是重写现有动作算法，而是把现有 CH32V203 机器马工程整理成一个可被 RobotDog Studio 稳定构建、安全控制、允许学生有限修改的固件库。

第一阶段只要求完成不依赖真实蓝牙、板载 USB 转串口和 IAP 分区的内容：工程整理、学生接口、运行安全、协议核心、可复现构建与测试。真实蓝牙串口绑定、板载有线 IAP 和 WCH-Link 救砖在原理图、实际芯片和 Flash 分区确认后实施，不得在本阶段猜测引脚或地址。

修改必须尽量保留现有功能：五路舵机映射、动作表、CCD 采集、OLED、按键、LED 和调试串口均可复用。允许为模块化和安全性调整内部实现，但不得无说明地改变舵机方向、脉宽范围、动作含义或硬件引脚。

## 2. 现有工程审查结论

开发开始前应确认以下现状，而不是把它们当成最终接口：

1. `User/main.c` 目前同时包含板级初始化、串口解析、CCD、OLED、动作表、舵机调度、状态机和主循环，文件约 1700 行，职责过重。
2. 固件上电后会直接循环执行 `walk`，不符合学生产品的安全要求；最终版本必须安全静止启动。
3. USART3（PB10/PB11，115200 8N1）当前同时承担文本命令与 CCD 输出，可暂作运行态开发串口，但不能据此决定最终 PCB 的蓝牙/IAP 通道。
4. CCD 128 点 CSV 当前采用阻塞式逐字符发送，可能阻塞 1ms 舵机调度；正式协议输出必须排队并限流。
5. 当前 `app_state.h` 只有 `BOOT/IDLE/ERROR`，不足以表达手动控制、自动巡线、升级和安全停机状态。
6. 当前构建依赖 IDE 生成的 `build/obj/compile_commands.json` 及开发机路径，删除 `build/` 后不能作为稳定构建入口。
7. 工程说明指向 CH32V203RBT，但 `Ld/Link.ld` 当前实际启用 D6 的 64KB Flash / 20KB RAM 配置，启动文件为 `startup_ch32v20x_D6.S`。必须核对实物 MCU 完整型号、启动文件、链接脚本及存储容量；未经核对不得发布。
8. 当前仓库未看到明确的项目许可证和第三方清单。在固件随 Windows 安装包分发前，必须补齐授权说明。

## 3. 交付优先级

| 优先级 | 内容 | 本轮是否实施 |
|---|---|---|
| P0 | 芯片/链接配置核对、安全静止启动、急停与失控保护 | 是 |
| P0 | 固定学生接口与受限适配层 | 是 |
| P0 | 不依赖 IDE 缓存的命令行完整构建 | 是 |
| P1 | 模块化拆分、传输无关的 RDS1 协议核心、非阻塞遥测 | 是 |
| P1 | 主机侧单元测试、目标编译测试、构建清单与产物 | 是 |
| P2 | 真实蓝牙 UART 绑定与现场稳定性验证 | 硬件确认后 |
| P2 | 板载有线 UART IAP、Bootloader、APP 分区 | 硬件确认后 |
| P3 | WCH-Link 教师救砖流程 | 硬件确认后 |

## 4. 必须先完成的基线核对

开发者应在首个提交或独立报告中给出以下结论：

- 实物 MCU 的完整丝印和封装；
- 对应的沁恒启动文件型号（D6、D8 或其他）；
- Flash/RAM 实际容量和最终 `MEMORY` 配置；
- 当前 PCB 上 USART1/2/3、蓝牙模块、USB 转串口、升级按键、WCH-Link 的实际连线；
- 五路舵机的通道、方向、允许脉宽和安全中位；
- 当前固件中使用的沁恒 GCC 版本、目标参数和链接参数；
- 固件及所含沁恒示例/库文件是否允许随 RobotDog Studio 安装包分发。

如果实物确为 CH32V203RB，不得继续沿用未经解释的 D6 启动文件和 64KB/20KB 链接配置。若当前配置是有意限制容量，也必须在清单中说明原因，并用真实硬件验证中断向量、堆栈和下载地址。

## 5. 固件分层要求

目录名允许在评审后微调，但职责边界不可省略。建议结构如下：

```text
Core/
├─ Inc/student_control.h          # 学生可查看/修改的唯一公共接口
├─ Inc/student_config.generated.h # 由 Studio 生成，只读
└─ Src/student_control.c          # 学生控制逻辑
User/
├─ main.c                         # 只做初始化和周期调度
├─ robotdog_runtime.c/.h          # 模式和总状态机
├─ robotdog_motion.c/.h           # 动作表、舵机调度和动作请求
├─ robotdog_safety.c/.h           # 急停、租约、传感器失效保护
├─ robotdog_protocol.c/.h         # 与 UART 无关的 RDS1 解析/编码
├─ robotdog_telemetry.c/.h        # 状态、CCD 订阅和限流
├─ robotdog_student_bridge.c/.h   # 学生输入快照与输出校验
└─ drivers/...                    # CCD、OLED、UART 等硬件适配
Startup/                          # 与实际芯片匹配的启动文件
Ld/                               # 与实际芯片/分区匹配的链接脚本
robotdog.firmware.json            # 固件基线与构建清单
```

具体要求：

1. `main.c` 只负责初始化、读取单调时钟和调用任务，不再包含长动作表、协议细节或阻塞输出；建议控制在 300 行以内。
2. 硬件寄存器、沁恒外设库和中断只能出现在驱动/HAL 层，不能出现在学生代码中。
3. 协议解析不得直接操作舵机；它只能向运行时提交经过校验的语义动作请求。
4. CCD 驱动只产生传感器快照；巡线决策由学生控制层或受控默认策略完成。
5. 模块间使用头文件公开最小接口，不通过跨文件 `extern` 访问内部变量。
6. 不要求一次性改变所有动作算法。可先将现有动作表原样迁入 `robotdog_motion`，用回归测试证明动作含义未改变。

## 6. 学生代码契约（必须保持稳定）

RobotDog Studio 对学生只暴露以下三个输入文件：

```text
Core/Src/student_control.c
Core/Inc/student_control.h
student-config/line-following.yaml
```

YAML 不直接参与 C 编译。Studio 在隔离构建目录中把 YAML 校验并生成为 `Core/Inc/student_config.generated.h`。首版参数为：

```yaml
turn_strength: 18  # 允许范围 1..30
line_target: 64    # 允许范围 0..127
```

建议固定以下 C 接口；如需变更字段或命名，必须先与上位机同步评审，不能由下位机单方面修改：

```c
#ifndef STUDENT_CONTROL_H
#define STUDENT_CONTROL_H

#include <stdbool.h>
#include <stdint.h>

#define ROBOTDOG_CCD_PIXEL_COUNT 128U

typedef enum {
    STUDENT_ACTION_STOP = 0,
    STUDENT_ACTION_STAND,
    STUDENT_ACTION_WALK,
    STUDENT_ACTION_TURN_LEFT,
    STUDENT_ACTION_TURN_RIGHT
} student_action_t;

typedef struct {
    uint32_t now_ms;
    bool line_valid;
    uint8_t line_center;
    uint8_t line_target;
    int16_t line_error;       /* line_center - line_target */
    uint8_t threshold;
    const uint8_t *pixels;    /* 只读 128 点，只在本次调用期间有效 */
} student_control_input_t;

typedef struct {
    student_action_t action;
    uint8_t turn_strength;    /* 1..30，STOP/STAND 时忽略 */
} student_control_output_t;

void StudentControl_Init(void);
void StudentControl_Update(const student_control_input_t *input,
                           student_control_output_t *output);

#endif
```

适配层必须满足：

1. 每次调用前把输出初始化为 `STOP` 和安全的默认强度，学生忘记赋值时不能沿用上一次动作。
2. `pixels` 为只读快照，学生代码不得持有指针供下一周期使用。
3. 建议每 20ms 调用一次，使用最近一次完整 CCD 帧；单次调用目标小于 1ms，硬上限 2ms。
4. 对 `action`、`turn_strength`、空指针和越界值做二次校验；任何非法输出一律转为 `STOP` 并记录可诊断原因。
5. 学生输出只表达语义动作和强度，不能直接设置舵机通道、角度、PWM 或 GPIO。
6. `turn_strength` 应由动作层映射为有上限的转向幅度，不允许绕过现有舵机安全脉宽。
7. `line_target` 和 `turn_strength` 的生成头文件必须含编译期范围检查，非法配置应构建失败并给出清楚的英文诊断，便于上位机翻译解释。

学生文件必须禁止：

- 包含 CH32 外设头文件或直接访问寄存器；
- 配置 GPIO、时钟、Flash、中断、UART、ADC、定时器或看门狗；
- 使用阻塞延时、无限循环、动态内存、文件/Flash 写入或调试串口；
- 直接调用舵机驱动或修改动作表；
- 覆盖通信、安全、升级或启动逻辑。

建议为学生源文件启用更严格的警告：至少包括隐式函数声明、类型转换、未初始化变量和不可达/无返回值检查。厂商库可使用独立警告策略，不要求因历史厂商警告全部改写。

## 7. 运行模式与安全要求

固件至少定义以下运行模式：

```text
BOOT_SAFE        上电初始化，舵机不运动或进入经确认的安全站立姿态
IDLE             已就绪但没有运动命令
MANUAL_REMOTE    上位机手动动作，依赖心跳和动作租约
AUTONOMOUS_LINE  本地学生巡线逻辑
UPDATE_SAFE      固件升级准备/执行，禁止动作
ERROR_SAFE       传感器、配置或运行错误，禁止动作
```

必须实现以下规则：

1. 上电绝不自动行走；初始化完成后保持 `IDLE`。
2. `STOP` 具有最高优先级，可抢占动作、遥测和普通命令；重复发送必须幂等。
3. `MANUAL_REMOTE` 中持续运动必须依赖有效心跳，建议上位机每 200–250ms 发送一次；500ms 未收到有效心跳时固件自行停止。
4. 每个动作请求还应具有最长租约，租约到期未续约即停止，不能无限保持运动。
5. 蓝牙/串口重连后不得自动恢复断线前动作。
6. `AUTONOMOUS_LINE` 不依赖电脑心跳，但连续丢线达到 500ms（最终值可配置并记录）必须停止，不允许用最后一次中心点持续转向。
7. 进入 `UPDATE_SAFE` 前停止动作并关闭 PWM，或进入经过硬件验证不会造成伤害的安全姿态；升级期间不能接受动作命令。
8. 协议溢出、输入队列异常、学生输出非法、关键传感器异常或运行时断言失败时进入安全停机，而不是继续最后动作。
9. 软件急停不能替代物理断电。固件不得假设上位机进程始终存活。

建议动作层提供等价于以下语义的接口：

```c
bool RobotDogMotion_Request(robotdog_action_t action,
                            uint8_t strength,
                            uint16_t lease_ms);
void RobotDogMotion_Stop(robotdog_stop_reason_t reason);
void RobotDogMotion_Tick1ms(void);
```

具体命名可调整，但必须保证“请求、校验、执行、停止原因”分离，且任何上层都不能绕过安全层直接写 PWM。

## 8. 运行态串口协议

协议以 [serial-protocol-v1.md](./serial-protocol-v1.md) 为上位机草案。本阶段先实现与 UART 无关的解析器、编码器和测试，USART3 只作为开发适配，不代表最终硬件分工。

首版行协议统一使用 CRLF 结束并以 `@RDS1` 开头：

```text
@RDS1 REQ 42 HELLO
@RDS1 RES 42 OK device_id=... board=... fw=... protocol=1
@RDS1 REQ 43 ACTION walk strength=18 lease_ms=500
@RDS1 RES 43 OK action=walk
@RDS1 REQ 44 STOP
@RDS1 RES 44 OK state=idle
@RDS1 DATA 7 CCD valid=1 center=70 threshold=120 pixels=...
```

至少支持：

- `HELLO`：设备 ID、板型、固件版本、协议版本；
- `CAPS`：动作列表、CCD 点数、最大遥测速率、可用模式；
- `PING` 与 `HEARTBEAT`；
- `STOP`；
- `ACTION`：动作、强度和租约；
- `MODE`：进入/退出自动巡线；
- `STATUS`：当前模式、动作、停止原因、CCD 状态；
- `CCD ON rate_hz=n`、`CCD OFF`、`CCD ONCE`；
- `ENTER_IAP` 只保留能力位和占位响应，本阶段不得在地址/引脚未确定时实现擦写。

协议核心要求：

1. 解析器接收任意分片，正确处理半包、粘包、CRLF、噪声、超长行、非法 UTF-8/字节和 RX 环形缓冲溢出。
2. 每个请求用序号关联唯一应答；错误返回稳定错误码，如 `BAD_COMMAND`、`BAD_ARGUMENT`、`BUSY`、`UNSAFE_STATE`、`NOT_SUPPORTED`。
3. 协议层不得调用阻塞式 `printf` 或逐字符等待 TXE；发送使用有界队列加中断/DMA/分段发送。
4. 命令应答和 `STOP` 相关消息优先于遥测。队列拥塞时先丢弃过期 CCD 帧，不能拖延动作调度。
5. CCD 默认建议 5Hz，最大建议 20Hz；最终上限由压力测试确定并在 `CAPS` 返回。
6. USART1 调试文本与 RDS1 协议分离，协议串口不能混入启动日志、逐字节 RX 日志或裸 CSV。
7. 旧的 `test/action/servo/ccd` 文本命令若需保留，必须放在 `ROBOTDOG_ENABLE_LEGACY_TEXT` 编译开关下，发布版默认关闭；`servo` 直控不得提供给学生模式。
8. 设备 ID 必须稳定且不使用 COM 号。生成和存储方式需说明；没有可靠唯一来源时可在首刷时写入受控配置区，但不能随 APP 更新变化。

## 9. 实时性与非阻塞要求

1. 舵机调度的 1ms 周期不能被 CCD 格式化或串口发送长时间占用。
2. 主循环和协议路径不得使用面向业务逻辑的长 `Delay_Ms`；必须使用基于单调毫秒时钟的非阻塞状态机。
3. CCD 128 点帧应先生成到有界缓冲区或增量编码，再交给 TX 队列。不得在采样/动作关键路径中逐字符阻塞发送。
4. 为 RX、TX、事件和遥测队列定义容量、满队列策略和统计计数；通过 `STATUS` 或诊断接口可读取丢帧/溢出计数。
5. 在最高允许 CCD 速率和连续命令压力下，动作周期抖动不得触发可见异常。开发者需提供测量方法和结果；建议关键 1ms 调度延迟不超过 2ms，最终阈值由实机验证确认。

## 10. 可复现命令行构建

必须提供不依赖 MounRiver/Eclipse 图形界面、不依赖已有 `build/`、不包含开发机绝对路径的构建入口。推荐 CMake + Ninja，也可提供功能等价且可审计的脚本。

最低要求：

1. 从干净克隆开始，只指定沁恒 GCC12 工具链根目录和输出目录即可完成构建。
2. 固定并记录目标参数：当前参考值为 `-march=rv32imac -mabi=ilp32 -mcmodel=medlow`，最终以核对后的芯片和官方工具链为准。
3. 显式列出启动文件、链接脚本、源文件和包含目录，不读取 IDE 最近生成的 `compile_commands.json` 作为事实来源。
4. 构建输出到调用方指定的目录，不修改固件源码树，不在仓库内生成临时对象。
5. 工程路径、工具链路径和输出路径包含空格或中文时仍能构建。
6. 固定输出：`RobotDog.elf`、`RobotDog.hex`、`RobotDog.bin`、`RobotDog.map` 和机器可读的 size/构建信息。
7. 编译日志必须保留真实源文件、行号、警告和错误，供 RobotDog Studio 的 AI 用中文解释。
8. 支持把 Studio 的三个学生输入叠加到临时固件基线中；构建不得反向修改学生工作区或外部固件仓库。
9. 同一固件基线、工具链、生成参数和学生文件应产生相同的“源码输入哈希”。二进制是否完全可复现需报告时间戳等已知差异。

建议命令形式：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:\path with spaces\WCH GCC12" `
  -DROBOTDOG_STUDENT_OVERLAY="D:\staging\student" `
  -DROBOTDOG_OUTPUT_DIR="D:\output"
cmake --build --preset robotdog-release
```

## 11. 固件基线清单

仓库根目录新增 `robotdog.firmware.json`。字段可扩展，但至少应表达：

```json
{
  "schemaVersion": 1,
  "firmwareVersion": "0.1.0",
  "protocolVersion": 1,
  "board": "待硬件确认后的稳定板型标识",
  "chip": "待核对的完整 MCU 型号",
  "baselineCommit": "0858d821d56daaea6e45740f5b496714fea20aca",
  "memory": {
    "flashBytes": "必须由开发者核对后填写",
    "ramBytes": "必须由开发者核对后填写"
  },
  "build": {
    "startup": "与实际芯片匹配的文件",
    "linkerScript": "Ld/Link.ld",
    "targetFlags": ["-march=rv32imac", "-mabi=ilp32", "-mcmodel=medlow"]
  },
  "studentOverlay": {
    "source": "Core/Src/student_control.c",
    "header": "Core/Inc/student_control.h",
    "configInput": "student-config/line-following.yaml",
    "generatedHeader": "Core/Inc/student_config.generated.h"
  },
  "artifacts": {
    "elf": "RobotDog.elf",
    "hex": "RobotDog.hex",
    "bin": "RobotDog.bin",
    "map": "RobotDog.map"
  }
}
```

示例中的“待核对”不能出现在最终发布清单中。清单还应包含工具链版本/哈希、构建配置版本、许可证文件和允许分发的第三方组件列表。

`robotdog.firmware.json` 是固件基线清单；RobotDog Studio 学生工作区中的 `robotdog.project.json` 是编辑权限策略，两者用途不同，不得混用。

## 12. 测试要求

### 12.1 无硬件即可完成的测试

- 协议解析：分片、粘包、空行、噪声、超长行、非法参数、序号关联、缓冲溢出；
- 安全租约：心跳正常、499ms、500ms 及超时边界，超时只触发一次安全停止；
- 急停：在所有模式、动作和遥测压力下均可抢占；
- 学生桥接：空输出、非法枚举、强度越界、空指针、丢线和正常巡线；
- YAML 生成：边界值、缺字段、重复字段、非整数和越界；
- CCD 快照：128 点长度、有效/无效线、中心误差符号；
- 构建：删除 `build/` 后从干净基线完整编译并链接；
- 隔离性：构建前后外部固件仓库和学生工作区哈希不变；
- 路径：工具链、工程和输出路径包含空格及中文；
- 压力：最高遥测速率下命令应答和动作调度不被饿死。

建议将协议、安全层和学生桥接层写成可在 PC 上运行的纯 C 测试，硬件驱动通过假时钟、假 UART 和假 CCD 注入。

### 12.2 后续实机测试

- 上电保持静止，未收到命令绝不行走；
- 拔掉蓝牙/关闭串口后 500ms 内停止；
- 重新连接后仍保持停止；
- 连续 30 分钟无线控制与 CCD 遥测无异常动作；
- 丢线超时、CCD 饱和、低对比度均安全停止；
- 最高 CCD 速率下舵机动作无肉眼可见卡顿；
- IAP 失败、断电和重复下载仍能重新进入升级；
- WCH-Link 可恢复 Bootloader 与 APP 完整镜像。

IAP 和 WCH-Link 项目只有在硬件与分区确定后才进入验收，不得用模拟结果标记为实机通过。

## 13. 验收标准

以下条件全部满足，才可作为 RobotDog Studio 的首个固定固件基线：

1. 芯片、启动文件、链接脚本和 Flash/RAM 数据一致，有书面核对结果。
2. 从干净克隆删除 `build/` 后，使用固定沁恒 GCC12 命令可生成完整 ELF/HEX/BIN/MAP。
3. 构建不读取开发机 MounRiver 绝对路径，不修改参考固件仓库。
4. Studio 的三个学生文件能按唯一映射参与完整编译和链接。
5. 学生代码无法直接调用硬件、通信、Flash、启动和舵机底层接口。
6. 上电安全静止；非法输出、通信超时、动作租约超时和关键错误均停止。
7. RDS1 解析器通过半包、粘包、噪声、溢出和错误码测试。
8. CCD 遥测采用非阻塞队列并限流，命令/急停优先级高于遥测。
9. 调试输出不会污染协议串口。
10. 提供固定版本号、基线提交、输入哈希、工具链版本和产物哈希。
11. 固件分发许可证与第三方清单明确，可合法进入 Windows 离线安装包。
12. 开发者提交测试报告、迁移说明和已知限制，不以“在 IDE 中能编译”代替交付验证。

## 14. 本阶段明确不做或不得猜测的事项

- 未看原理图前，不指定蓝牙 UART 和 IAP UART 的最终外设/引脚。
- 未核对实际芯片和 Bootloader 大小前，不指定 APP 起始地址和 Flash 分区。
- 不让 APP 直接实现未经保护的整片擦除或任意地址写入。
- 不把 WCH-Link/OpenOCD 暴露给学生或 AI 自动执行；它属于教师维护路径。
- 不允许蓝牙与 USB 转串口两个发送端未经硬件隔离直接并联争用。
- 不要求本阶段证明真实无线/IAP 可用，但必须把协议核心和状态机设计成以后可绑定真实传输。
- 不改动上位机学生接口契约而不通知 RobotDog Studio 开发者。

## 15. 交付物

下位机开发者应提交：

1. 基于明确基线提交创建的代码分支或 PR；
2. 模块化后的固件源码和稳定学生接口；
3. `robotdog.firmware.json`；
4. 命令行构建文件、工具链说明和一条可复制执行的构建命令；
5. 默认学生示例、生成配置头文件示例和接口说明；
6. 主机单元测试、目标编译测试和压力测试结果；
7. ELF/HEX/BIN/MAP、size 报告及 SHA-256；
8. 芯片/启动/链接核对记录，硬件待确认项列表；
9. 从原 `main.c` 迁移的模块与行为变化说明；
10. LICENSE、第三方许可证及可分发性说明；
11. 已知限制、后续蓝牙/IAP/WCH-Link 接入点和风险。

## 16. 建议开发顺序与提交粒度

1. `chore: verify target memory map and add firmware manifest`
2. `refactor: split runtime motion ccd and transport modules`
3. `fix: boot idle and add motion fail-safe`
4. `feat: add stable student control bridge and generated config`
5. `feat: add transport-independent rds1 protocol core`
6. `fix: queue and rate-limit ccd telemetry`
7. `build: add clean wch gcc12 command-line build`
8. `test: cover protocol student bridge and safety lease`
9. `docs: add firmware integration and licensing notes`

每个提交应能编译，重构提交和行为改变提交尽量分开。特别是动作表迁移时先保持原行为，再单独提交安全启动和租约修改，便于定位实机回归。

## 17. 开发者回执

开始编码前请书面回复：

- 实际 MCU 型号、启动文件、Flash/RAM 结论；
- 是否接受第 6 节学生接口，如需调整请给出兼容方案；
- 命令行构建方案和预计输出格式；
- USART/蓝牙/USB/IAP 哪些信息已确认，哪些仍需原理图；
- 现有动作表和舵机安全范围是否已实机验证；
- 固件库能否随 RobotDog Studio 分发；
- P0/P1 的预计拆分和测试计划。

收到回执后，上位机侧将据此完成固定基线清单、学生文件叠加、完整构建、编译错误解释和后续真实设备接入。
