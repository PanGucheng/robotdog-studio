# RobotDog Studio Pony v2.5 多基线集成发布与验收说明

本文档记录 RobotDog Studio 大学生单片机版（`mcu-foundations`）完成 Pony v2.5 全功能小马固件基线集成、真实 CMake 构建闭环、Windows 安装包资源打包、CI 换行符跨平台修复与大模型上下文引导的完整技术实施与验收结果。

---

## 一、双基线架构与路由机制

RobotDog Studio 大学生版（`mcu-foundations`）采用严格隔离的双固件基线架构，满足结构化实验课程与开放式自由实践两种不同的教学场景：

```
                      ┌─────────────────────────────────────────┐
                      │    RobotDog Studio (mcu-foundations)   │
                      └────────────────────┬────────────────────┘
                                           │
             ┌─────────────────────────────┴─────────────────────────────┐
             ▼                                                           ▼
   【结构化课程学习】                                            【自由实践沙箱】
   mcu-lesson-attempt                                          mcu-sandbox
             │                                                           │
   templateId: first-program-on-chip                           templateId: ch32v203-pony (v0.2.5)
   firmwareBaselineId: ch32v203-rhs-baseline                   firmwareBaselineId: ch32v203-pony-v25
             │                                                           │
             ▼                                                           ▼
   FirmwareBaselineResolver                                    FirmwareBaselineResolver
             │                                                           │
   resources/firmware-baselines/ch32v203-rhs                   resources/firmware-baselines/ch32v203-pony
   sourceRoot: firmware/ch32v203-baseline                      sourceRoot: firmware/v2.5_沁恒小马例程
```

### 1. 路由分发机制
- **工作区创建策略**：
  - 调用 `workspaces.createLessonAttempt(...)` 时，工作区绑定 `ch32v203-rhs-baseline`，以 RHS 第一课模板（`resources/workspace-templates/ch32v203-mcu-lessons/first-program-on-chip`）为起点，保证现有课程实验的稳定性。
  - 调用 `workspaces.create(...)` 创建自由工作区时，工作区类型为 `mcu-sandbox`，默认路由至 `ch32v203-pony-v25`，模板为小马全功能实验模板（`resources/workspace-templates/ch32v203-pony/0.2.5`）。
- **基线解析器（`FirmwareBaselineResolver`）**：
  - 根据 `workspace.firmwareBaselineId` 动态查找并初始化对应的 `FirmwareBaselineService`。
  - 支持开发态（`developmentSourceOverrides` 或源码默认路径）与打包态（`process.resourcesPath/firmware-baselines/<baselineDir>/current/source`）的透明切换。
- **产物恢复防漂移**：
  - `FirmwareBuildService.initialize()` 在恢复历史产物缓存时，从 `proof.firmwareBaselineId` 动态解析基线并读取 `sourceRoot`，杜绝旧版本对 RHS 基线的硬编码。

---

## 二、CMake Overlay 真实构建流水线

针对 Pony v2.5 全功能固件，构建链路已彻底移除 TypeScript 内部手写 gcc 逐文件编译与硬编码源文件清单（清理了 `PONY_LIVE_BASELINE_SOURCES`、`PONY_LIVE_INCLUDE_DIRECTORIES`），统一调用官方 CMakeLists.txt 与预设完成配置与构建。

### 1. 构建执行细节
`FirmwareBuildService.buildPonyCmakeBaseline()` 执行流程如下：

1. **环境准备与基线复制**：
   - 将基线源码（`firmware/v2.5_沁恒小马例程`）复制到临时构建沙箱 `stagingRoot`。
   - 创建 `outputRoot` 准备接收编译最终产物。
2. **CMake 配置**：
   - 执行预设：`manifest.build.preset`（默认 `robotdog-wch-gcc12`）。
   - 注入核心构建参数：
     ```bash
     cmake --preset robotdog-wch-gcc12 \
       -DROBOTDOG_TOOLCHAIN_ROOT=<toolchainRoot> \
       -DROBOTDOG_STUDENT_OVERLAY=<projectRoot> \
       -DROBOTDOG_OUTPUT_DIR=<outputRoot>
     ```
   - 路径统一转为 POSIX 格式（`replaceAll('\\', '/')`），避免 Windows 反斜杠转义问题。
3. **CMake 编译**：
   - 执行构建命令：`cmake --build --preset robotdog-release`。
   - 自动生成 ELF、HEX、BIN 与 MAP 文件至 `outputRoot`。
4. **内存占用分析与门禁**：
   - 调用 `toolchain.size.path` 读取 Flash 与 RAM 占用。
   - 严格校验不超过基线芯片规格（CH32V203C8T6：Flash 64KB, RAM 20KB）。
5. **产物哈希与发布**：
   - 为 `RobotDog.elf`、`RobotDog.hex`、`RobotDog.bin`、`RobotDog.map` 生成 SHA256。
   - 输出 `build-proof.json`，并将产物原子重命名至管理目录（`.firmware-build/managed/<inputHash>`）。

### 2. 隔离与兼容保证
- RHS 基线构建流程保留现有的受控逐文件编译流程，两套构建管线严格解耦、互不影响。

---

## 三、Windows 安装包打包与解包验证

在 `scripts/package-windows.mjs` 中完善了对小马资源的打包配置与后置强校验。

### 1. 打包资源配置（`extraResources`）
- **学生模板**：
  包含 `resources/workspace-templates/ch32v203-pony` 到安装包目录 `resources/workspace-templates/ch32v203-pony`。
- **固件源码**：
  将 `firmware/v2.5_沁恒小马例程` 打包到 `resources/firmware-baselines/ch32v203-pony/current/source`，并过滤掉 `.git`、`build`、`.vscode`、`__pycache__` 等开发及编译临时文件。

### 2. 打包后置强校验与 Smoke 测试
在 Windows 解包验证阶段（`win-unpacked`）增加以下检查：
- `verifyPackagedPonyResources`：强校验 `CMakeLists.txt`、`CMakePresets.json`、`pony.firmware.json`、`User/main.c`、`Core/Src/student_control.c`、`Core/Inc/student_control.h`、`Startup/startup_ch32v20x_D6.S`、`Ld/Link.ld` 以及模板中的 `App/Src/experiment.c` 必须存在。
- `scripts/smoke-mcu-pony-packaged.ts`：
  - 基于解包目录验证小马基线与模板完整性；
  - 启动候选副本工作流：修改 `App/Src/experiment.c`，执行安全校验、候选构建与应用；
  - 启动完整固件构建：调用真实 CMake 产出 `RobotDog.elf/hex/bin/map`；
  - 检查内存占用与构建证明文件。

---

## 四、CI 换行符跨平台修复与课程防篡改

### 1. 根本原因分析
GitHub Actions 的 `windows-latest` 运行机在执行 `actions/checkout@v4` 时，默认开启 `core.autocrlf = true`，导致课程讲义 `lecture.md` 在检出时被转换为 CRLF（`\r\n`），使得 `parseCourseLecture(source)` 计算出的 `documentDigest` 从 `c9c6bf44...`（LF）漂移为 `c2a6cd5d...`（CRLF），触发了 `content-v9.json` 的同版本防篡改报错。

### 2. 彻底解决措施
1. **源文本规范化**：
   在 `src/main/services/course-lecture-parser.ts` 的 `parseCourseLecture` 方法中，解析前统一执行 `const normalizedSource = source.replace(/\r\n/g, '\n')`，确保计算哈希与 AST 构建完全基于标准 LF 换行符。
2. **仓库属性加固**：
   在 `.gitattributes` 中明确配置：
   ```gitattributes
   *.md text eol=lf
   resources/courses/** text eol=lf
   ```
   防止本地检出与远端环境出现格式偏差。
3. **保持课程指纹锁定**：
   不提升课程版本，保持 `content-v9.json` 强校验逻辑不动，确保已有课程资产的绝对严谨性。

---

## 五、大模型 Prompt 与 Agent 上下文注入

为保障学生在使用 AI 助教时的安全性与领域感知，构建了贯穿 Session、Adapter 与 Prompt 的完整上下文链路：

1. **上下文传递链路**：
   - `CandidateService.getWorkspace(workspaceId)` 提供工作区元数据；
   - `AgentSessionService` 在 `run` 与 `runExplanation` 中提取工作区的 `templateId`、`templateVersion`、`firmwareBaselineId`、`workspacePurpose`；
   - `ReasonixAdapter` 与 `ReasonixAcpAdapter` 将其作为可信字段封装进 `AdapterTurnContext` 并传递给 `buildStudentAgentPrompt(...)`。
2. **小马专属安全规则注入**：
   在 `src/main/services/student-agent-prompt.ts` 中，当识别到小马基线时动态追加 `PONY_MCU_AGENT_SECTION`：
   - **可编辑区域**：明确限定在 `App/` 目录（`App/Src/experiment.c`、`App/Inc/experiment.h` 等）；
   - **只读受控基线**：明确 `Core/Src/student_control.c`、`Core/Inc/student_control.h`、`User/`、驱动、启动文件与链接脚本不可修改；
   - **硬件与运动安全**：底层运动学姿态解算、步态状态机、电机安全限制和定时器中断由基线托管，严禁破坏；
   - **结构化上下文**：在 `<studio_context_json>` 中注入 `templateId`、`templateVersion`、`firmwareBaselineId` 与 `workspacePurpose`，供大模型进行工程结构感知。

---

## 六、回归测试与验证结果

执行本地全量验证套件，各项指标均 100% 通过：

```bash
# 1. 课程强校验
npm run courses:validate
# Output:
# MCU_COURSES_OK courses=1 lessons=1 lectures=1
# TI_MSPM0_COURSE_OK courses=1 lessons=1 lectures=1 status=published-hardware-checked

# 2. TypeScript 类型检查
npm run typecheck
# Output:
# tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json (Exit 0)

# 3. 小马全流程打包态 Smoke 验证
npm run smoke:mcu:pony
# Output:
# Checking Pony baseline directory: D:\RobotDog\RobotDog_Studio\firmware\v2.5_沁恒小马例程
# Checking Pony template directory: D:\RobotDog\RobotDog_Studio\resources\workspace-templates\ch32v203-pony\0.2.5
# Pony candidate workflow (validate, build, apply) passed
# Pony packaged build passed: ...\RobotDog.elf
# Flash: 17704 bytes; RAM: 5196 bytes
# PONY_PACKAGED_SMOKE_OK

# 4. 全量单元与集成测试（包含多基线集成测试与大模型 Prompt 测试）
npm test
# Output:
# Test Files  42 passed | 1 skipped (43)
# Tests       203 passed | 1 skipped (204)
# Duration    49.84s (All green)

# 5. 生产构建打包检查
npm run build
# Output:
# out/main/index.cjs (897.49 kB)
# out/preload/index.cjs (12.59 kB)
# out/renderer/assets (Built in 5.28s)
```

---

## 七、提交记录规范

本次多基线发布闭环重构严格遵循原子提交规范：

1. `49a61e4` - `fix(firmware): build pony baseline through cmake overlay`
2. `87c008d` - `fix(packaging): include pony firmware and template in mcu package`
3. `61cf01d` - `fix(mcu): restore course validation and pony agent context`
4. `(HEAD)` - `docs(test): document pony multi-baseline release validation`
