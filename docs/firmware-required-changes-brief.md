# 下位机固件必需改动清单（精简版）

> 交付对象：下位机固件开发者  
> 参考仓库：`D:\RobotDog\ch32v203-robot-dog`  
> 当前复审提交：`efaae6c 新增学生功能`  
> 目标：让固件可以被 RobotDog Studio 稳定构建、烧录、测试，并作为学生编程模板使用。

## 1. 必须修复：CMake 工具链变量传递

当前问题：直接使用 CMake preset 构建时，`ROBOTDOG_TOOLCHAIN_ROOT` 没有传入 `try_compile` 子工程，导致配置失败。

请修复固件仓库的 CMake 配置，使上位机只需要传入工具链路径即可构建：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="D:/RobotDog/RobotDog_Studio/vendor/wch/Toolchain/RISC-V Embedded GCC12" `
  -DROBOTDOG_OUTPUT_DIR="D:/RobotDog/RobotDog_Studio/.tmp/firmware-out"

cmake --build --preset robotdog-release
```

建议在顶层 CMake 或 toolchain 文件中处理：

```cmake
set(CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ROBOTDOG_TOOLCHAIN_ROOT)
```

验收要求：上述命令不额外添加 `-DCMAKE_TRY_COMPILE_PLATFORM_VARIABLES=...` 也必须成功。

## 2. 必须修复：更新固件 manifest 的提交信息

当前 `robotdog.firmware.json` 中：

```json
"baselineCommit": "0858d821d56daaea6e45740f5b496714fea20aca"
```

但当前交付提交是 `efaae6c`。

请将 `baselineCommit` 改为本次正式交付提交的完整 40 位 commit hash。

如果需要同时记录“原始派生提交”和“当前集成提交”，请拆成两个字段，例如：

```json
"sourceBaseCommit": "...",
"baselineCommit": "..."
```

不要让一个字段同时表达两种含义。

## 3. 必须优化：降低 Flash 占用

当前构建结果：

```text
text = 62420
data = 2688
Flash 占用约 = 65108 bytes
CH32V203C8T6 Flash = 65536 bytes
剩余约 = 428 bytes
```

这个余量太小，不适合作为学生可修改模板。

请优化固件体积。

最低目标：

- 至少预留 4KB Flash。

推荐目标：

- 预留 8KB 或更多 Flash。

优先检查：

1. 是否编入了未使用的外设源码。
2. OLED、字体、旧调试输出是否仍进入发布构建。
3. `robotdog_motion.c` 是否可以压缩或条件编译。
4. 发布构建是否使用 `-Os`。
5. 是否启用 `-ffunction-sections -fdata-sections` 和链接器 `--gc-sections`。
6. 是否关闭了非必要 `printf`、日志、测试代码。

验收要求：

- 提供新的 `RobotDog.size.txt`。
- 说明 Flash/RAM 变化。
- 默认学生代码仍能正常构建。

## 4. 必须补齐：host C tests 或测试说明

当前 `tests/run_host_tests.py` 在没有桌面 C 编译器时会跳过 C 测试：

```text
C compiler not found; skipping host C tests
```

请至少完成一种方案：

1. 提供 Windows 下运行 host C tests 的依赖说明；
2. 在 CI 中运行 host C tests；
3. 在文档中说明跳过条件和人工验证方式。

验收要求：

- 协议、安全状态机、学生桥接层的测试可以被复现。
- 测试失败时返回非 0 退出码。

## 5. 需要确认：遥测与实时性

当前已有队列式发送和遥测限流，但仍需确认：

1. 连续请求 `CCD` 时，128 点格式化不会明显阻塞主循环。
2. 串口繁忙时，`STOP`、心跳超时、动作租约超时优先级高于普通遥测。
3. `Delay_Ms(1)` 主循环在当前阶段是否可接受。

验收要求：

- 给出一次连续请求 `CCD` 的稳定性测试结果。
- 说明急停/心跳超时在遥测压力下是否及时生效。
- 若继续保留 `Delay_Ms(1)`，请说明原因和后续替换计划。

## 6. 必须补齐：许可证与分发说明

当前 `robotdog.firmware.json` 中：

```json
"projectLicense": "missing"
```

请补齐：

1. 项目自身许可证；
2. 沁恒外设库、启动文件、链接脚本的再分发说明；
3. 第三方文件清单；
4. 哪些内容允许随 RobotDog Studio 打包，哪些必须由用户本机安装。

验收要求：

- `robotdog.firmware.json` 不再出现 `projectLicense: missing`。
- 仓库中有明确授权/分发说明。

## 7. 请保持不变的接口

请继续保持学生可修改范围清晰：

- `Core/Src/student_control.c`
- `Core/Inc/student_control.h`
- `student-config/line-following.yaml`

除非双方重新确认，不要让学生直接修改：

- 启动文件；
- 链接脚本；
- 外设初始化；
- 舵机底层 PWM；
- 协议解析；
- 安全状态机；
- 烧录/IAP 相关代码。

## 8. 修复完成后请交付

请提供：

1. 最新完整 commit hash；
2. 更新后的 `robotdog.firmware.json`；
3. 新的 `RobotDog.size.txt`；
4. 完整构建命令和构建结果；
5. host tests 运行结果；
6. Flash 体积优化说明；
7. 如协议有变化，同步提供协议变更说明。

完成上述内容后，RobotDog Studio 上位机即可开始切换到该固件基线进行集成测试。
