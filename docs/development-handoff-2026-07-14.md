# RobotDog Studio 开发交接文档

更新日期：2026-07-14  
用途：重开 Codex 对话后，先让模型阅读本文件，再继续开发。

## 1. 当前仓库状态

- 本地工程目录：`D:\RobotDog\RobotDog_Studio`
- GitHub 仓库：`https://github.com/PanGucheng/robotdog-studio`
- 当前主分支：`main`
- 当前最新提交：`cd07fda feat: bundle WCH-Link driver in test package`
- 预期工作区状态：干净，无未提交改动
- 当前定位：公开协作开发仓库，但仍处于功能测试和硬件联调阶段

重开对话后的第一步建议执行：

```powershell
cd D:\RobotDog\RobotDog_Studio
git status --short
git log -3 --oneline
```

如果工作区不干净，先确认改动是否是用户手工测试留下的内容，不要直接覆盖。

## 2. 产品定位与核心约束

RobotDog Studio 是面向中小学机器马 / 机器狗巡线比赛的桌面上位机。

当前产品方向：

- 面向高年级小学生，界面和 AI 回复要尽量解释清楚，避免只给专业报错；
- 学生主要通过 AI 助教、参数调整、手动编辑应用层代码来学习；
- AI 只能在隔离候选工作区中修改允许范围内的文件；
- 修改完成后统一查看 Diff，再由用户一次性确认应用；
- 正式工作区使用 Git 记录检查点，撤销通过新提交完成，不改写历史；
- 固件编译、烧录、诊断都应尽量内置，减少学生安装工具链的负担。

重要安全边界：

- Renderer 不持有本机权限；
- Main 进程统一管理文件、Git、Reasonix、工具链、烧录器；
- Renderer 不能传任意命令、任意路径或任意 OpenOCD 参数；
- AI 对话不能自动触发真实硬件烧录；
- 真实硬件必须保留下位机动作看门狗和物理断电手段。

## 3. 当前主要功能进展

### 3.1 桌面底座

已完成：

- Electron Main / Preload / Renderer 三层结构；
- IPC 通道类型化；
- 工作台 UI；
- 高 DPI / 2K 屏幕适配；
- 100%、125%、150%、175% 缩放；
- 对话命名、日期区分和重命名入口；
- 新对话从模板复制到独立学生工作区。

关键文件：

- `src/main/index.ts`
- `src/main/ipc/register-ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/Workbench.tsx`
- `src/renderer/src/styles.css`

### 3.2 AI 助教与 Reasonix

已完成：

- Reasonix v1.17.12 集成；
- API Key 可配置；
- 对话支持连续上下文；
- 聊天框支持 Markdown；
- 内置面向学生的工程提示词；
- Reasonix profile 自动选择，不暴露给学生界面；
- 允许范围内的修改可自动执行；
- 一轮对话结束后统一查看候选修改；
- AI 回复和候选应用失败已有恢复路径。

Reasonix 当前配置：

```text
config/reasonix-runtime.json
version: v1.17.12
binary: resources/tools/reasonix-v1.17.12/bin/reasonix.exe
sourceCommit: afdcd161fe8ece8adc250bd4bf2448c1983efb9d
```

关键文件：

- `src/main/services/reasonix-process-manager.ts`
- `src/main/services/reasonix-acp-adapter.ts`
- `src/main/services/agent-session-service.ts`
- `src/main/services/student-agent-prompt.ts`
- `src/main/services/reasonix-permission-policy.ts`
- `src/renderer/src/components/ChatPanel.tsx`
- `docs/archive/2026-07-14-completed-plans/reasonix-v1.17.12-update-plan.md`
- `docs/archive/2026-07-14-completed-plans/ai-workspace-reasonix-plan.md`

### 3.3 学生代码编辑与候选修改

已完成：

- 学生可以查看和编辑应用层代码；
- 未点击“开始编写”时，编辑器只读并给出中文引导；
- 可以解释选中代码；
- 编译错误会显示关键报错；
- AI 可解释错误并给出修改建议；
- 学生可接受 AI 建议完成修复；
- AI 修改完成后的确认文案已减少专业噪音。

关键文件：

- `src/renderer/src/components/StudentCodeEditor.tsx`
- `src/renderer/src/components/DiffReview.tsx`
- `src/renderer/src/lib/student-diagnostics.ts`
- `src/renderer/src/lib/student-errors.ts`
- `src/main/services/candidate-service.ts`
- `src/main/services/candidate-build-service.ts`
- `src/main/services/patch-policy-service.ts`

### 3.4 固件基线与完整构建

当前活动固件基线：

```text
resources/firmware-baselines/ch32v203-robotdog/active.json
mode: development-live-remote
remote: https://github.com/PanGucheng/ch32v203-robot-dog
branch: main
activeCommit: c897e3a1d82b2e4b59348d4ce75762c62a79c293
shortCommit: c897e3a
firmwareVersion: 0.2.1
protocolVersion: 1
studentTemplate: resources/workspace-templates/ch32v203-robotdog/c897e3a
```

已完成：

- 上位机可拉取 / 准备下位机远端固件源；
- 使用 WCH GCC12 完整构建固件；
- 生成 `RobotDog.elf`、`RobotDog.hex`、`RobotDog.bin`、`RobotDog.map` 等产物；
- 打包版不依赖用户安装 CMake、Ninja、Python；
- 打包版使用内置 WCH GCC 直接完成固件生成；
- 打包版已通过“启动 + 创建工作区 + 完整固件生成”冒烟测试。

关键命令：

```powershell
npm run firmware:source:status
npm run firmware:source:fetch
npm run firmware:source:prepare
npm run firmware:build:ch32v203
npm run firmware:verify
npm run firmware:promote
```

关键文件：

- `scripts/firmware-source.mjs`
- `scripts/build-ch32v203-firmware.mjs`
- `scripts/firmware-verify.mjs`
- `scripts/firmware-promote.mjs`
- `src/main/services/firmware-baseline-service.ts`
- `src/main/services/firmware-build-service.ts`
- `resources/firmware-baselines/ch32v203-robotdog/active.json`
- `resources/workspace-templates/ch32v203-robotdog/c897e3a/`
- `docs/archive/2026-07-14-completed-plans/live-firmware-baseline-integration-plan.md`
- `docs/archive/2026-07-14-completed-plans/firmware-integration.md`

### 3.5 Windows 离线测试包

当前测试包命令：

```powershell
npm run package:win:test
```

当前输出：

```text
release/RobotDog-Studio-0.1.0-PROVISIONAL-Windows-x64.zip
```

当前测试包包含：

- Electron 应用；
- Reasonix v1.17.12；
- WCH GCC12；
- WCH OpenOCD；
- 精简 Git runtime；
- 活动固件源码；
- 学生工作区模板；
- WCH-Link 驱动文件。

正式包命令：

```powershell
npm run package:win
```

当前正式包仍由 release baseline 门禁保护。最终 SDK 未交付前，正式包应失败，避免误发临时固件。

关键文件：

- `scripts/package-windows.mjs`
- `scripts/check-release-baseline.mjs`
- `docs/windows-packaging-and-baseline-switch.md`

### 3.6 WCH-Link 烧录页

已完成：

- “烧录器烧录”已作为工作台同级页面存在；
- 可调用内置 WCH OpenOCD；
- 支持探测 WCH-Link 和目标芯片；
- 支持选择当前工作区的固件产物；
- 支持通过 OpenOCD 写入当前 HEX、校验、复位；
- OpenOCD 输出有中文错误解释和技术日志；
- OpenOCD 退出码 `3221225477` 曾在虚拟机中出现，最终定位为 WCH-Link 驱动未安装。

关键文件：

- `src/main/services/wch-link-flash-service.ts`
- `src/main/services/wch-link-flash-service.test.ts`
- `src/renderer/src/components/WchLinkFlasherPanel.tsx`
- `src/shared/channels.ts`
- `src/shared/types.ts`
- `docs/wch-link-flasher-page-plan.md`

## 4. WCH-Link 驱动当前状态

这是当前最重要的后续开发点。

### 4.1 已验证事实

在 Win10 虚拟机中，如果没有驱动，设备管理器显示：

```text
该设备的驱动程序未被安装。 (代码 28)
这个设备没有兼容驱动程序。
```

OpenOCD 可能输出：

```text
Ready for Remote Connections
OpenOCD 退出码 3221225477
```

将 WCH-Link 驱动打入测试包，并以管理员权限启动后，用户已验证该方式可行。

### 4.2 当前实现

最新提交 `cd07fda` 做了临时可验证实现：

- 打包脚本默认从本机路径读取驱动：

  ```text
  C:\WCH.CN\WCHLinkDrv
  ```

- 可通过环境变量覆盖：

  ```powershell
  $env:ROBOTDOG_WCHLINK_DRIVER_ROOT='D:\path\to\WCHLinkDrv'
  ```

- 打包后复制到：

  ```text
  resources/toolchains/wch/drivers/WCHLinkDrv
  ```

- 打包版启动时调用：

  ```powershell
  pnputil.exe /add-driver WCHLinkWDM.INF /install
  ```

- 安装结果进入运行时诊断：

  ```text
  WCH-Link 驱动安装状态
  ```

相关代码目前在：

- `scripts/package-windows.mjs`
- `src/main/index.ts`
- `src/main/services/diagnostic-service.ts`
- `src/shared/types.ts`

### 4.3 当前不足

这些还没有做：

1. 驱动文件尚未正式纳入仓库；
2. 还没有 `vendor/wch/drivers/WCHLinkDrv/driver-manifest.json`；
3. 驱动安装逻辑还写在 `src/main/index.ts`，没有抽成服务；
4. EXE 还没有声明 `requireAdministrator`；
5. 学生仍可能需要手动右键“以管理员身份运行”；
6. 烧录页还没有单独的“安装 / 修复 WCH-Link 驱动”按钮；
7. 正式安装器方案还没有实现。

### 4.4 用户最新决策

用户不希望学生手动选择管理员启动。短期测试方案改为：

```text
整个程序启动时请求管理员权限
```

也就是 Windows 双击 EXE 后自动弹 UAC。授权后程序启动，并在启动阶段安装 / 修复 WCH-Link 驱动。

下一轮开发应优先实现这个决策。

## 5. 下一轮建议开发顺序

### H1：将 WCH-Link 驱动正式纳入工程

目标：

- 不再依赖本机 `C:\WCH.CN\WCHLinkDrv`；
- 测试包在任意开发机上都能可复现构建；
- 保留环境变量覆盖路径，方便将来测试新驱动。

建议新增：

```text
vendor/wch/drivers/WCHLinkDrv/
  WCHLinkWDM.INF
  WCHLinkWDM.CAT
  WCHLinkW64.sys
  WCHLinkM64.sys
  WCHLinkWDM.sys
  WCHLinkDll.dll
  SETUP.EXE
  DRVSETUP64/DRVSETUP64.exe
  driver-manifest.json
```

修改：

- `scripts/package-windows.mjs`

验收：

```powershell
npm run package:win:test
Test-Path release\win-unpacked\resources\toolchains\wch\drivers\WCHLinkDrv\WCHLinkWDM.INF
```

### H2：让测试版 EXE 自动请求管理员权限

目标：

- 学生不需要右键管理员启动；
- 双击后 Windows 自动弹出 UAC；
- 授权后主程序启动并自动安装驱动。

修改点：

- `scripts/package-windows.mjs` 中 electron-builder Windows 配置；
- 需要设置类似：

  ```js
  win: {
    executableName: formal ? 'RobotDogStudio' : 'RobotDogStudio-Test',
    requestedExecutionLevel: 'requireAdministrator'
  }
  ```

注意：需要确认 electron-builder 当前版本接受该字段的位置。如果字段无效，要检查生成的 EXE manifest 或改用自定义 manifest。

验收：

- Win10 虚拟机中双击 `RobotDogStudio-Test.exe` 自动弹 UAC；
- 不再需要右键；
- 驱动安装后设备管理器不再显示 Code 28；
- WCH-Link 检测成功；
- `npm test` 和打包版冒烟测试仍通过。

### H3：抽出 WCH-Link 驱动安装服务

目标：

- 不把驱动安装逻辑堆在 `src/main/index.ts`；
- 后续烧录页、诊断页、启动流程共用同一服务。

建议新增：

```text
src/main/services/wch-link-driver-service.ts
src/main/services/wch-link-driver-service.test.ts
```

服务职责：

- 查找包内驱动路径；
- 校验 INF 是否存在；
- 调用 `pnputil`；
- 捕获 stdout / stderr / exit code；
- 识别权限不足；
- 提供最近一次安装状态；
- 供诊断服务读取。

### H4：烧录页集成驱动状态

目标：

- 用户看到的不只是“烧录失败”；
- 能判断是驱动、连接线、烧录器、目标板供电还是 OpenOCD 问题。

建议 UI 增加：

```text
WCH-Link 驱动：已安装 / 未确认 / 安装失败
最近一次安装：时间、结果
[重新检测烧录器]
[安装 / 修复驱动]
[导出诊断]
```

如果 EXE 已强制管理员运行，按钮可以直接调用服务；如果未来主程序恢复普通权限，按钮再做单独提权。

### H5：虚拟机验收

至少测试：

| 场景 | 预期 |
|---|---|
| Win10 干净虚拟机，未装驱动 | 双击 EXE 弹 UAC，授权后驱动安装成功 |
| Win10 已装驱动 | 启动不反复打扰，烧录器检测成功 |
| 未连接 WCH-Link | 驱动可安装，页面提示未连接 |
| 连接 WCH-Link 但目标板未供电 | 能识别烧录器，但提示芯片未识别 |
| 连接 WCH-Link 和目标板 | 探测成功 |
| 当前工作区有 HEX | 可烧录、verify、reset |

### H6：正式安装器方案

短期可以让整个 EXE 要管理员权限。正式发布更建议：

- 安装器请求管理员权限；
- 安装器安装 WCH-Link 驱动；
- 主程序后续普通权限运行；
- 烧录页提供“修复驱动”按钮，必要时单独提权。

这个阶段暂时不阻塞当前硬件测试。

## 6. 常用命令

### 本地开发

```powershell
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm reasonix:prepare
corepack pnpm dev
```

项目当前也直接使用 `npm` 脚本，现有 CI/本地验证命令如下：

```powershell
npm run typecheck
npm test
npm run build
npm run package:win:test
```

### 打包前避免目录占用

```powershell
Get-Process | Where-Object { $_.ProcessName -like 'RobotDogStudio*' -or $_.ProcessName -like 'electron*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'D:\RobotDog\RobotDog_Studio\release\win-unpacked' -Recurse -Force -ErrorAction SilentlyContinue
npm run package:win:test
```

### 打包版冒烟测试

```powershell
$env:ROBOTDOG_SMOKE_TEST='1'
$env:ROBOTDOG_WORKSPACE_ROOT='packaged-smoke-driver'
$p = Start-Process -FilePath 'D:\RobotDog\RobotDog_Studio\release\win-unpacked\RobotDogStudio-Test.exe' -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  throw '打包版冒烟测试超时'
}
"Packaged smoke exit code: $($p.ExitCode)"
```

### WCH-Link 命令行探测

```powershell
.\vendor\wch\OpenOCD\OpenOCD\bin\openocd.exe `
  -f .\vendor\wch\OpenOCD\OpenOCD\bin\wch-riscv.cfg `
  -c init `
  -c halt `
  -c "flash banks" `
  -c exit
```

### Git 提交流程

用户此前已授权“必要时自行提交”。常规做法：

```powershell
git status --short
git add <changed-files>
git commit -m "<type>: <summary>"
git push origin main
```

提交前至少运行：

```powershell
npm run typecheck
npm test
```

涉及打包或驱动时还要运行：

```powershell
npm run package:win:test
```

## 7. 重要文档索引

- 总体计划：`IMPLEMENTATION_PLAN.md`
- 当前架构边界：`docs/architecture.md`
- 当前 Windows 打包：`docs/windows-packaging-and-baseline-switch.md`
- 当前 WCH-Link 烧录页：`docs/wch-link-flasher-page-plan.md`
- 当前下位机开发交付简版：`docs/firmware-required-changes-brief.md`
- 当前下位机详细修改要求：`docs/firmware-developer-modification-requirements.md`
- 归档文档索引：`docs/archive/README.md`
- 历史 AI 修改闭环计划：`docs/archive/2026-07-14-completed-plans/ai-workspace-reasonix-plan.md`
- 历史固件集成计划：`docs/archive/2026-07-14-completed-plans/firmware-integration.md`
- 历史活动固件基线计划：`docs/archive/2026-07-14-completed-plans/live-firmware-baseline-integration-plan.md`
- 历史三通道连接方案：`docs/archive/2026-07-14-completed-plans/three-channel-connection-plan.md`
- 历史 Reasonix 更新计划：`docs/archive/2026-07-14-completed-plans/reasonix-v1.17.12-update-plan.md`

## 8. 重开对话建议提示词

可以直接复制下面这段给新的 Codex 对话：

```text
请先阅读 D:\RobotDog\RobotDog_Studio\docs\development-handoff-2026-07-14.md、README.md 和 docs\windows-packaging-and-baseline-switch.md，确认当前 RobotDog Studio 的工程状态。然后继续实现下一步：将 WCH-Link 驱动正式纳入工程资源，并让测试版 EXE 双击时自动请求管理员权限，以便启动时静默安装驱动。请保持 main 可构建，修改后运行 typecheck、test 和 package:win:test，必要时提交并推送。
```

## 9. 当前最需要避免的误区

1. 不要把当前临时固件测试包误当正式比赛发布包；
2. 不要让打包继续隐式依赖某台电脑的 `C:\WCH.CN\WCHLinkDrv`；
3. 不要让 Renderer 传入任意 OpenOCD 命令或任意固件路径；
4. 不要在未确认下位机最终 SDK 前移除 `PROVISIONAL` 门禁；
5. 不要为了静默安装驱动而吞掉诊断信息；
6. 不要让 AI 自动触发真实烧录。
