# 下位机远端改动复审与整改要求（2026-07-13）

> - 交付对象：CH32V203 机器马/机器狗下位机开发者
> - 需求方：RobotDog Studio 上位机项目
> - 下位机仓库：`D:\RobotDog\ch32v203-robot-dog`
> - 本次复审远端提交：`efaae6c 新增学生功能`
> - 复审方式：不合并本地工作区，仅临时检出 `origin/main`，进行代码审阅、host 测试和 WCH GCC12 交叉编译验证

## 1. 复审结论

`efaae6c` 已经完成了大量面向 RobotDog Studio 的结构性改造，方向正确，可以作为下一轮上位机集成测试的候选基线。

但它还不建议直接作为最终 SDK/固件模板发布。当前主要风险是：

1. CMake 工具链变量在 `try_compile` 阶段不会自动继承，上位机直接调用 preset 时会失败。
2. `robotdog.firmware.json` 中的 `baselineCommit` 仍是旧提交，不对应本次远端提交。
3. 固件 Flash 占用已经接近 CH32V203C8T6 的 64KB 上限，剩余空间过小。
4. 授权与分发状态仍未闭环。

请优先修复本文第 4 节的 P0/P1 项，再通知上位机侧切换集成基线。

## 2. 已完成且符合预期的内容

### 2.1 学生代码接口

已新增并基本符合上位机要求：

- `Core/Inc/student_control.h`
- `Core/Src/student_control.c`
- `student-config/line-following.yaml`
- `Core/Inc/student_config.generated.h`

当前学生接口包含：

- CCD 像素数量：`ROBOTDOG_CCD_PIXEL_COUNT 128U`
- 输入：时间、巡线是否有效、当前线中心、目标线位置、误差、阈值、CCD 像素指针
- 输出：动作枚举、转弯强度
- 默认学生逻辑：无有效输入时停止，有偏差时左右转，死区内前进

这已经可以支撑 RobotDog Studio 的“学生只改应用层代码/参数”模式。

### 2.2 学生参数生成

`student-config/line-following.yaml` 当前包含：

```yaml
turn_strength: 18
line_target: 64
```

`tools/generate_student_config.py` 能生成 `student_config.generated.h`，并包含范围检查。该方向符合上位机要求。

### 2.3 固件分层

远端提交已将原本集中在 `main.c` 的职责拆出：

- `User/robotdog_motion.*`
- `User/robotdog_protocol.*`
- `User/robotdog_runtime.*`
- `User/robotdog_safety.*`
- `User/robotdog_student_bridge.*`
- `User/robotdog_telemetry.*`
- `User/robotdog_types.*`

这是一个明显进步。后续上位机接入时，可以围绕这些模块做协议、遥测和学生代码集成。

### 2.4 安全与运行态

已看到以下安全设计：

- 启动后进入安全/空闲状态，不直接行走。
- 手动动作依赖心跳和动作租约。
- 自动巡线经过学生桥接层。
- 学生输出非法、巡线丢失等情况会进入安全处理。
- 保留 `UPDATE_SAFE` 作为未来 IAP/升级状态占位。

整体符合第一阶段安全模型。

### 2.5 RDS1 协议核心

已实现 `@RDS1` 风格协议解析和响应能力，包含：

- `HELLO`
- `CAPS`
- `PING`
- `HEARTBEAT`
- `STOP`
- `ACTION`
- `MODE`
- `STATUS`
- `CCD`
- `ENTER_IAP`

其中 `ENTER_IAP` 当前作为未支持占位返回，这在硬件/IAP 分区未确认前是可以接受的。

### 2.6 构建产物

使用 WCH RISC-V Embedded GCC12 真实交叉编译通过后，产出：

- `RobotDog.elf`
- `RobotDog.hex`
- `RobotDog.bin`
- `RobotDog.map`
- `RobotDog.size.txt`
- `RobotDog.sha256.txt`
- `RobotDog.input.json`

`robotdog.firmware.json` 中声明的产物名与实际产物一致。

## 3. 本次验证记录

### 3.1 Host 测试

执行：

```powershell
python tests\run_host_tests.py
```

结果：

```text
config generator tests passed
C compiler not found; skipping host C tests
```

说明：

- YAML 配置生成器测试通过。
- 当前复审机器未安装普通桌面 C 编译器，所以 C 侧 host tests 被跳过。
- 这不是固件代码失败，但建议下位机 CI 或开发环境补齐 C 编译器，确保协议/安全/桥接层 host tests 能自动执行。

### 3.2 WCH GCC12 交叉编译

第一次直接执行 preset：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/RobotDog/RobotDog_Studio/vendor/wch/Toolchain/RISC-V Embedded GCC12" `
  -DROBOTDOG_OUTPUT_DIR="D:/RobotDog/RobotDog_Studio/.tmp/firmware-review-efaae6c-out"
```

结果失败。关键错误：

```text
ROBOTDOG_TOOLCHAIN_ROOT must point to the WCH RISC-V Embedded GCC12 toolchain root or bin directory
CMAKE_C_COMPILER not set, after EnableLanguage
```

加入 `CMAKE_TRY_COMPILE_PLATFORM_VARIABLES` 后配置通过：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/RobotDog/RobotDog_Studio/vendor/wch/Toolchain/RISC-V Embedded GCC12" `
  -DCMAKE_TRY_COMPILE_PLATFORM_VARIABLES=ROBOTDOG_TOOLCHAIN_ROOT `
  -DROBOTDOG_OUTPUT_DIR="D:/RobotDog/RobotDog_Studio/.tmp/firmware-review-efaae6c-out"
```

随后执行：

```powershell
cmake --build --preset robotdog-release
```

结果：构建通过。

### 3.3 固件大小

`RobotDog.size.txt`：

```text
   text	   data	    bss	    dec	    hex	filename
  62420	   2688	   3844	  68952	  10d58	RobotDog.elf
```

对 CH32V203C8T6 的 64KB Flash 来说，Flash 占用约：

```text
text + data = 62420 + 2688 = 65108 bytes
```

64KB Flash 总量：

```text
65536 bytes
```

剩余约：

```text
65536 - 65108 = 428 bytes
```

这非常危险。即使当前能编译，后续只要学生代码稍微复杂、协议扩展、日志增加或 IAP 信息加入，就可能超限。

## 4. 必须整改项

### P0-1：修复 CMake 工具链变量继承

当前 `cmake/robotdog-wch-gcc12.cmake` 依赖 `ROBOTDOG_TOOLCHAIN_ROOT`，但该变量不会自动传入 CMake 的 `try_compile` 子工程。

请在固件仓库内修复，使上位机只需要传入：

```powershell
-DROBOTDOG_TOOLCHAIN_ROOT="..."
```

就能完成 configure/build，而不需要额外知道 CMake 内部细节。

建议方案之一是在顶层 CMake 或 toolchain 文件中设置：

```cmake
set(CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ROBOTDOG_TOOLCHAIN_ROOT)
```

验收标准：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/RobotDog/RobotDog_Studio/vendor/wch/Toolchain/RISC-V Embedded GCC12" `
  -DROBOTDOG_OUTPUT_DIR="D:/RobotDog/RobotDog_Studio/.tmp/firmware-out"

cmake --build --preset robotdog-release
```

必须直接通过。

### P0-2：更新 `robotdog.firmware.json` 的 `baselineCommit`

当前 manifest 中：

```json
"baselineCommit": "0858d821d56daaea6e45740f5b496714fea20aca"
```

但本次复审的远端提交是：

```text
efaae6c
```

请将 `baselineCommit` 更新为实际用于交付的完整 40 位 commit hash。

要求：

- 每次作为上位机集成候选基线提交时，`baselineCommit` 必须对应当前交付提交。
- 如果该字段表达的不是当前提交，而是更早的“原始派生基线”，请另增字段区分，例如：
  - `baselineCommit`
  - `sourceBaseCommit`
  - `integrationCommit`

不要让一个字段同时承担两种含义。

### P0-3：降低 Flash 占用，预留学生代码空间

当前 Flash 只剩约 428 bytes，不足以作为学生可修改 SDK。

请优先做体积优化，建议目标：

- 最低要求：至少预留 4KB Flash 空间。
- 推荐目标：预留 8KB 以上 Flash 空间。

建议检查：

1. 是否把未使用的外设源码全部编进了固件。
2. OLED、字体、旧调试输出是否仍进入发布构建。
3. `robotdog_motion.c` 中是否有可表驱动压缩或条件编译的内容。
4. 是否启用了合适的优化参数，例如 `-Os`。
5. 是否启用了 `--gc-sections`，且源文件使用了 `-ffunction-sections -fdata-sections`。
6. 发布构建是否关闭了非必要 `printf`、调试文本和测试代码。

验收标准：

- 提供新的 `RobotDog.size.txt`。
- 明确说明 Flash/RAM 占用变化。
- 学生默认代码和 YAML 默认参数仍能正常构建。

### P1-1：补齐 host C tests 可运行环境或 CI 说明

当前 `tests/run_host_tests.py` 在没有普通 C 编译器时会跳过 C 测试。

这对本地开发可以接受，但作为交付基线，应至少满足其中一种：

1. 提供 Windows 下可执行 host C tests 的推荐工具链说明；
2. 在 CI 中自动运行 host C tests；
3. 在文档中明确 host tests 的依赖、跳过条件和人工验证方式。

验收标准：

- 开发者能复现协议、安全、学生桥接相关测试；
- 测试失败时返回非 0 退出码；
- 上位机侧可以在集成前快速判断固件基线是否健康。

### P1-2：确认遥测与主循环实时性

当前代码已经改为队列式发送和遥测限流，这是正确方向。

但仍需针对以下点做实测或说明：

- CCD 128 点格式化是否会影响 1ms 主循环；
- 高频 CCD 输出时普通遥测丢弃策略是否符合预期；
- `STOP`、心跳超时、动作租约超时是否能优先于普通遥测；
- `Delay_Ms(1)` 主循环是否满足当前控制实时性，还是后续要改为定时器调度。

验收标准：

- 给出至少一组串口持续请求 `CCD` 时的运行稳定性结果；
- 急停/心跳超时在遥测压力下仍能及时生效；
- 若仍保留 `Delay_Ms(1)`，请在文档中说明当前阶段接受它的原因和后续替换计划。

### P1-3：补齐许可证与分发说明

当前 manifest 中仍有：

```json
"projectLicense": "missing"
```

如果固件库、模板或二进制会随 RobotDog Studio 分发，必须补齐：

- 项目自身许可证；
- 沁恒外设库/启动文件/链接脚本的再分发说明；
- 第三方文件清单；
- 哪些内容允许随上位机离线包打包，哪些只能要求用户本机安装。

验收标准：

- `robotdog.firmware.json` 不再写 `missing`；
- 仓库根目录或 `docs/` 中有明确授权/分发说明；
- 上位机打包前不会留下法律风险 TODO。

## 5. 建议保留的接口与约束

### 5.1 学生文件边界

请继续保持学生可修改范围清晰：

- `Core/Src/student_control.c`
- `Core/Inc/student_control.h`
- `student-config/line-following.yaml`

除非双方重新确认，不建议让学生直接修改：

- 启动文件；
- 链接脚本；
- 外设初始化；
- 舵机底层 PWM；
- 协议解析；
- 安全状态机；
- 烧录/IAP 相关代码。

### 5.2 协议兼容性

`RDS1` 协议已经开始成型。后续修改协议时请注意：

- 保持命令名、响应格式和错误码稳定；
- 新增字段优先使用向后兼容方式；
- `STOP` 必须始终是高优先级、幂等、安全的；
- 自动巡线与手动控制必须有清晰模式边界；
- `ENTER_IAP` 在未实现前继续明确返回不支持，不要半实现。

### 5.3 构建输出

上位机期望能通过固定命令得到固定产物。建议继续保持：

- ELF：调试与 size 分析；
- HEX：WCH-Link/OpenOCD 烧录；
- BIN：后续 IAP 下载包；
- MAP：体积分析；
- SIZE：上位机展示编译结果；
- SHA256：产物完整性；
- INPUT JSON：源码输入哈希与可追溯性。

## 6. 修复后请提供的信息

完成整改后，请给 RobotDog Studio 上位机侧提供：

1. 最新提交完整 hash；
2. `robotdog.firmware.json`；
3. `RobotDog.size.txt`；
4. 一次完整构建命令和输出摘要；
5. host tests 运行结果；
6. 如果 Flash 体积下降，请说明主要优化点；
7. 如果协议字段有变化，请同步更新协议说明。

## 7. 上位机侧接入建议

在下位机完成 P0 修复后，上位机可以进行下一步：

1. 将固件基线切换到新的 `baselineCommit`；
2. 使用固件仓库提供的 CMake preset 构建，而不是继续沿用上位机临时构建逻辑；
3. 将 `RobotDog.hex` 接入当前 WCH-Link 烧录页面；
4. 将编译错误、size 信息和学生文件修改结果展示给学生；
5. 保持 WCH-Link 作为救砖和教师恢复手段，后续再接入板载串口/IAP。

在 P0 修复完成前，不建议把 `efaae6c` 直接作为正式模板分发。
