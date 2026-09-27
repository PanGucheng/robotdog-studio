# 测试与质量门禁指南

更新日期：2026-09-27  
适用系统：Windows 11 x64  
测试框架：Vitest、TypeScript、Playwright / Electron 冒烟测试

---

## 1. 质量门禁概览

RoboHorse Studio 建立了严格的自动化校验体系，确保软件逻辑、静态资源、硬件课程与品牌一致性在变更后均处于安全受控状态：

```text
代码与资源修改
     │
     ├── 1. 课程与讲义校验 (courses:validate) ──> 结构、讲义 Markdown、指纹
     ├── 2. 静态类型检查   (typecheck)        ──> Node 进程与 Web 渲染层
     ├── 3. 单元与服务测试 (test)             ──> 46+ 测试文件，240+ 自动化用例
     └── 4. 生产构建打包   (build)            ──> Vite 生产打包与资源映射
```

---

## 2. 核心综合验证 (`pnpm check`)

在发起 Pull Request、提交重要代码或交付任务前，必须在根目录执行核心综合验证：

```powershell
corepack pnpm check
```

该命令顺序执行以下三步：
1. `npm run courses:validate`：全量校验 CH32 与 TI 课程清单、步骤、模板及讲义；
2. `npm test`：运行全部单元与服务集成测试；
3. `npm run build`：执行 TypeScript 严格类型检查并打包生产构建。

全部通过时代表工程基本逻辑与构建闭环健康。

---

## 3. 分项测试与验证命令

### 3.1 课程与讲义校验 (`courses:validate`)
```powershell
corepack pnpm courses:validate
```
运行脚本：
- `scripts/validate-mcu-courses.ts`：校验 CH32V203 体系课程（Manifest Zod Schema、Lecture Markdown 白名单、图片资源与版本兼容指纹）；
- `scripts/validate-ti-mspm0-course.ts`：校验 TI MSPM0 体系课程与硬件验证状态。

### 3.2 类型检查 (`typecheck`)
```powershell
corepack pnpm typecheck
```
分别针对主进程环境（`tsconfig.node.json`）与前端环境（`tsconfig.web.json`）执行严格无 emit 检查。

### 3.3 自动化测试套件 (`test`)
```powershell
corepack pnpm test
```
使用 Vitest 运行涵盖以下关键服务的集成测试：
- `agent-session-service.test.ts`：AI 对话流、代码审查与权限提示；
- `candidate-service.test.ts`：隔离工作区 Git 检查点、补丁 Diff 与安全回滚；
- `course-update-service.test.ts`：远程课程下载、版本比对、损坏包防护与原子恢复；
- `workspace-service.test.ts`：三发行版工作区迁移、多课次独立尝试与元数据持久化；
- `ti-mspm0-toolchain-service.test.ts`：TI 工具链路径检测与 SysConfig 联动；
- `firmware-baseline-resolver.test.ts`：固件基线多版本分流与完整性校验。

### 3.4 Electron 界面冒烟测试
在完成生产构建后，可对各发行版进行真实的无头 Electron 启动冒烟测试：
```powershell
# 趣味巡线版
corepack pnpm smoke:electron:fun

# CH32 单片机入门版
corepack pnpm smoke:electron:mcu

# TI MSPM0 教学版
corepack pnpm smoke:electron:ti
```

### 3.5 固件与打包门禁
- **小马全功能基线打包校验**：
  ```powershell
  corepack pnpm smoke:mcu:pony
  ```
- **TI MSPM0 构建校验**：
  ```powershell
  corepack pnpm smoke:ti-mspm0
  ```
- **发布固件基线状态检查**（正式打包前的强制门禁）：
  ```powershell
  corepack pnpm baseline:release:check
  corepack pnpm baseline:release:check:ti
  ```
- **品牌资产自动化检验**：
  ```powershell
  corepack pnpm brand:check
  corepack pnpm brand:check:windows
  ```
