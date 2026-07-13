# RobotDog Studio GitHub 私有协作仓库发布计划

> 文档目标：把当前本地 RobotDog Studio 项目推送到 GitHub，作为私有协作仓库使用。  
> 仓库定位：源码对协作者开放，便于上位机、下位机、文档和测试共同开发。  
> 本阶段不处理：公开发行、许可证审查、第三方工具链再分发合规、安装包正式发布合规。

## 1. 发布目标

本次发布不是面向公众的正式开源发布，而是建立一个稳定的远端协作中心：

1. 让上位机项目有可靠远端备份。
2. 让下位机开发者能看到接口文档、复审结论和上位机接入要求。
3. 让后续功能通过 Issue、分支、提交和版本标签持续跟踪。
4. 保留当前内置 WCH GCC/OpenOCD、Reasonix 子模块和固件模板资源，优先保证协作效率。
5. 为后续 Windows 测试包、下位机联调、蓝牙串口和 IAP 功能打基础。

建议仓库可见性：

```text
Private
```

建议仓库名：

```text
robotdog-studio
```

建议仓库描述：

```text
AI-assisted desktop studio for CH32V203 robot dog line-following education and firmware development.
```

## 2. 当前仓库发布判断

当前本地项目适合先推到私有 GitHub 仓库。

已确认的情况：

1. 本地 Git 工作区干净。
2. 仓库当前没有 GitHub remote。
3. `.gitignore` 已排除 `node_modules/`、`out/`、`release/`、`.firmware-build/`、`.env` 等常见生成物和本地敏感文件。
4. 快速扫描未发现真实 API Key；命中的多为测试假密钥、环境变量名和脱敏逻辑。
5. `third_party/reasonix` 是 Git submodule。
6. `vendor/wch` 已被 Git 跟踪，包含 WCH GCC/OpenOCD 工具链文件。
7. 当前 Git pack 约 150MB，第一次推送会偏慢，但作为私有协作仓库可以接受。

本阶段决定：

- 暂不移除 `vendor/wch`；
- 暂不重写 Git 历史；
- 暂不拆分多个仓库；
- 暂不处理许可证；
- 暂不做公开发布；
- 先建立私有协作远端，后续再逐步规范。

## 3. 发布前检查清单

推送前执行以下检查。

### 3.1 Git 状态

```powershell
git status --short --branch
```

要求：

- 没有未提交修改；
- 当前分支为 `main`；
- 如果存在临时文件，先提交、忽略或删除。

### 3.2 依赖与构建检查

```powershell
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

如本机使用 npm 脚本，也可执行：

```powershell
npm run typecheck
npm test
npm run build
```

要求：

- TypeScript 类型检查通过；
- 单元测试通过；
- Electron/Vite 构建通过。

### 3.3 敏感信息检查

执行：

```powershell
git grep -n -I -E "(OPENAI_API_KEY|api[_-]?key|secret|password|Bearer |sk-)" -- . ':!pnpm-lock.yaml' ':!third_party/reasonix' ':!vendor'
```

允许出现：

- 测试用假密钥；
- 文档里的环境变量名；
- 代码里的脱敏逻辑；
- UI placeholder。

不允许出现：

- 真实 API Key；
- 真实 token；
- 真实账号密码；
- 本机私有路径中的敏感凭据。

### 3.4 子模块检查

```powershell
git submodule status
```

要求：

- `third_party/reasonix` 指向可访问提交；
- 新协作者可以通过以下命令初始化：

```powershell
git submodule update --init --recursive
```

## 4. GitHub 仓库创建

在 GitHub 上创建新仓库：

- Owner：个人账号或组织账号；
- Repository name：`robotdog-studio`；
- Visibility：`Private`；
- 不勾选初始化 README；
- 不添加 `.gitignore`；
- 不添加 license。

原因：

当前本地仓库已经有完整历史、README、`.gitignore` 和项目结构。远端仓库应为空仓库，避免首次推送产生无意义冲突。

## 5. 配置 remote 并推送

GitHub 仓库创建完成后，在本地执行：

```powershell
git remote add origin https://github.com/<owner>/robotdog-studio.git
git branch -M main
git push -u origin main
```

如果使用 SSH：

```powershell
git remote add origin git@github.com:<owner>/robotdog-studio.git
git branch -M main
git push -u origin main
```

首次推送注意：

1. 仓库较大，推送时间可能较长。
2. 如果 GitHub 提示单文件超过限制，需要定位具体文件再决定是否改用 Git LFS 或移除。
3. 如果推送中断，通常可直接重新执行 `git push -u origin main`。

推送成功后检查：

```powershell
git remote -v
git status --short --branch
```

预期：

```text
## main...origin/main
```

且没有未提交修改。

## 6. 协作分支策略

采用轻量分支模型。

### 6.1 长期分支

```text
main
```

要求：

- 始终保持可构建；
- 重要节点打 tag；
- 不直接提交大型实验性改动。

### 6.2 功能分支

推荐命名：

```text
codex/<task-name>
ui/<feature-name>
firmware/<feature-name>
docs/<topic>
release/<version>
```

示例：

```text
codex/github-actions-ci
firmware/new-baseline-integration
ui/bluetooth-serial-console
docs/student-operation-guide
release/v0.1.0-alpha
```

### 6.3 提交流程

普通改动流程：

```powershell
git switch -c codex/<task-name>
# 修改代码
npm run typecheck
npm test
git add .
git commit -m "feat: ..."
git push -u origin codex/<task-name>
```

然后在 GitHub 创建 Pull Request 合并到 `main`。

当前早期阶段也可以允许维护者直接提交到 `main`，但建议从建立 GitHub 起逐步转向 PR。

## 7. 协作者权限设置

建议角色：

### 7.1 Owner / Admin

项目负责人。

权限：

- 管理仓库设置；
- 管理协作者；
- 创建 release；
- 合并重要 PR。

### 7.2 上位机开发者

权限建议：

```text
Write
```

负责：

- Electron UI；
- Reasonix 集成；
- WCH-Link 烧录；
- 固件构建服务；
- 安全候选工作区；
- Windows 打包。

### 7.3 下位机开发者

权限建议：

```text
Write
```

负责：

- 阅读 `docs/firmware-required-changes-brief.md`；
- 修复下位机仓库；
- 提供新固件基线；
- 同步协议和 manifest 变化。

### 7.4 测试/教学协作者

权限建议：

```text
Triage 或 Read
```

负责：

- 提 Issue；
- 反馈学生体验；
- 提供 UI 文案建议；
- 记录硬件连接问题。

## 8. 首批 Issue 规划

仓库创建后建议立即建立以下 Issue。

### 8.1 固件与硬件

1. `下位机 efaae6c 整改跟踪`
   - 关联文档：`docs/firmware-required-changes-brief.md`
   - 内容：CMake、baselineCommit、Flash 余量、host tests、实时性、分发说明。

2. `接入修复后的下位机 CMake 构建`
   - 目标：上位机调用下位机 native CMake preset 构建完整固件。

3. `WCH-Link 烧录新固件产物`
   - 目标：烧录页面使用新固件构建出的 `RobotDog.hex`。

4. `蓝牙串口运行态联调`
   - 目标：基于 RDS1 协议连接真实蓝牙串口。

5. `板载有线串口 IAP 方案确认`
   - 目标：等待硬件连接和 Flash 分区确认后实现。

### 8.2 上位机功能

6. `GitHub Actions 基础 CI`
   - 目标：自动运行 typecheck、test、build。

7. `Windows 测试包打包流程`
   - 目标：生成内部测试 zip/nsis 包。

8. `学生操作示范功能`
   - 目标：给小学生提供更明确的操作引导。

9. `AI 内置提示词继续完善`
   - 目标：让模型更懂工程结构、学生水平和安全边界。

10. `高 DPI UI 继续打磨`
    - 目标：2K/4K 屏幕和不同缩放比例下继续优化。

### 8.3 文档与验收

11. `README 协作版整理`
    - 目标：让新协作者快速启动项目。

12. `下位机协议文档同步`
    - 目标：确保 `serial-protocol-v1.md` 与固件实现一致。

13. `学生验收用例整理`
    - 目标：形成可重复的人测脚本。

## 9. Milestone 规划

### 9.1 `v0.1.0-alpha-private`

目标：完成私有协作仓库发布和当前功能远端备份。

范围：

- GitHub 私有仓库建立；
- main 分支推送；
- 子模块可初始化；
- README 可指导协作者启动；
- 基础 Issue 建立；
- 当前 AI 修改闭环、手动编辑、WCH-Link 页面作为已实现能力记录。

不要求：

- 新下位机固件完成集成；
- 蓝牙真实联调；
- IAP 下载；
- 正式安装包。

### 9.2 `v0.2.0-firmware-integration`

目标：接入修复后的下位机固件基线。

范围：

- 下位机修复 CMake；
- `robotdog.firmware.json` 准确；
- Flash 余量达标；
- 上位机能构建完整固件；
- WCH-Link 能烧录构建产物；
- 学生修改后可预检并生成完整固件。

### 9.3 `v0.3.0-hardware-alpha`

目标：进入真实硬件联调。

范围：

- 蓝牙串口连接；
- RDS1 运行态命令；
- CCD/状态遥测；
- STOP/心跳/租约安全验证；
- 板载有线串口方案确认；
- 教师 WCH-Link 恢复流程稳定。

### 9.4 `v0.4.0-teaching-preview`

目标：准备给学生或教师小范围试用。

范围：

- 操作示范；
- 学生友好错误解释；
- 课程/比赛场景引导；
- 稳定 Windows 测试包；
- 常见问题文档。

## 10. GitHub Actions 计划

第一版 CI 只做源码健康检查，不做安装包发布。

建议工作流：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: corepack enable
      - run: corepack prepare pnpm@11.8.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

注意：

- 如果 GitHub Actions 拉取 `vendor/wch` 过慢，后续再优化；
- 如果 `pnpm` cache 配置报错，再按实际日志调整；
- 暂不在 CI 里运行真实 WCH-Link 烧录；
- 暂不在 CI 里打 NSIS 正式安装包。

## 11. README 调整计划

推送后建议整理 README，使新协作者优先看到这些内容：

1. 项目简介；
2. 当前开发状态；
3. 本地启动方式；
4. Reasonix/API Key 配置方式；
5. WCH 工具链说明；
6. 下位机仓库关系；
7. 常用 npm scripts；
8. 协作流程；
9. 当前限制和下一阶段任务。

README 中应明确：

- 当前是私有协作开发版；
- 新下位机固件仍在整改；
- 部分蓝牙/IAP 功能还在计划或模拟阶段；
- WCH-Link 烧录已作为教师/恢复通道接入。

## 12. 版本标签计划

首次推送后可打内部 tag：

```powershell
git tag -a v0.1.0-alpha-private -m "RobotDog Studio private collaboration alpha"
git push origin v0.1.0-alpha-private
```

Release notes 建议包含：

- 当前已验收功能；
- 仍在开发的硬件功能；
- 下位机整改文档链接；
- 运行和构建方式；
- 已知问题。

## 13. 风险与处理方式

### 13.1 仓库较大

原因：

- `vendor/wch` 内置工具链二进制。

当前处理：

- 私有协作阶段保留。

后续可选：

- 改为下载脚本；
- 改为 Git LFS；
- 独立工具链仓库；
- 仅在 release artifact 中携带。

### 13.2 子模块初始化失败

原因：

- GitHub 访问问题；
- 子模块提交不可达；
- 协作者未执行 recursive clone。

处理：

```powershell
git clone --recurse-submodules <repo-url>
```

或：

```powershell
git submodule update --init --recursive
```

### 13.3 API Key 泄漏

当前设计：

- API Key 存在 Electron userData secure 目录；
- `.env` 已被忽略；
- 历史扫描未发现真实密钥。

协作要求：

- 不提交 `.env`；
- 不在 Issue/PR 截图里暴露 key；
- 测试只能使用假 key。

### 13.4 main 分支不可构建

处理：

- 建立 CI；
- 功能分支走 PR；
- 重要改动合并前至少运行 typecheck/test/build。

## 14. 执行顺序

建议按以下顺序推进：

1. 完成本文档提交；
2. 你在 GitHub 创建空的 private 仓库；
3. 本地配置 `origin`；
4. 执行 typecheck/test/build；
5. 推送 `main`；
6. 验证 GitHub 页面和子模块；
7. 建立首批 Issue；
8. 建立 Milestone；
9. 添加基础 GitHub Actions；
10. 整理 README；
11. 打 `v0.1.0-alpha-private` 标签；
12. 邀请下位机开发者和测试协作者；
13. 开始跟踪下位机整改和新固件基线接入。

## 15. 完成标准

本阶段完成后应满足：

1. GitHub 私有仓库存在；
2. `main` 分支已推送；
3. 新协作者能 clone 并初始化子模块；
4. 新协作者能按 README 启动开发环境；
5. Issue 和 Milestone 能承载后续协作；
6. 下位机开发者能看到精简整改文档；
7. 上位机后续改动可以通过 GitHub 远端同步。

达到以上标准后，即可认为 RobotDog Studio 已进入 GitHub 私有协作开发阶段。
