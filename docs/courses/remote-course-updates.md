# RoboHorse Studio 统一远程内容更新机制 (Remote Edition Content Update)

更新日期：2026-09-27  
适用发行版：`mcu-foundations`（CH32 单片机入门版）、`ti-mspm0-foundations`（TI MSPM0 教学版）  
核心源码参考：[`src/main/services/edition-content-update-service.ts`](../../src/main/services/edition-content-update-service.ts)、[`src/main/services/edition-content-resolver.ts`](../../src/main/services/edition-content-resolver.ts)、[`src/main/services/course-resolver.ts`](../../src/main/services/course-resolver.ts)、[`src/main/services/firmware-baseline-resolver.ts`](../../src/main/services/firmware-baseline-resolver.ts)

---

## 1. 系统概述

RoboHorse Studio 提供统一的远程发行版内容更新机制（Remote Edition Content Update）。开发者只需在远程 Gitee 内容仓库发布对应发行版的 `content.zip`，学生端即可在不重新安装上位机软件的前提下，同时获取：
1. **课程内容**（讲义、课时步骤、反思题、AI 助教教学上下文）；
2. **课程工程模板**（课次对应的实验初始工程模板）；
3. **自由创建工程模板**（如 MCU Sandbox、Pony 例程、TI 自由练习工程）；
4. **Firmware Baseline**（CH32 RHS 机器马教学固件基线、CH32 Pony v2.5 全功能基线、TI MSPM0 固件基线等）。

更新具有以下核心特性：
- **统一内容包**：一个 Edition 对应一个统一的 `content.zip`，避免课程、模板与固件版本脱节；
- **启动零网络依赖**：应用启动时立即读取本地有效内容进入主界面，后台异步检测 Gitee 更新；
- **整包原子切换**：下载 -> 结构校验 -> 发行版前缀匹配 -> 事务原子替换，遇到异常安全回滚；
- **重启后统一生效**：下载完成后提示“教学内容已更新，重启后生效”，下次启动整体切换至新版本；
- **保护学生工作区**：远程更新仅影响未来新建的工程，绝对不修改或覆盖学生已有的 Workspace、历史源码与实验记录。

---

## 2. 存储与解析分层架构

统一内容解析器（`EditionContentResolver`）统一管理课程、模板和基线查找路径，严格按优先级生效：

```text
               ┌─────────────────────────────────────────────────────────┐
               │         客户端内容解析器 (EditionContentResolver)         │
               └────────────────────────────┬────────────────────────────┘
                                            │
                           1. 检查是否存在有效的远程 content 缓存?
                                       /         \
                                     Yes          No
                                     /              \
                                    ▼                ▼
 ┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
 │             本地用户缓存层                   │  │             安装包内置层                 │
 │  app.getPath('userData')/content/            │  │  resources/                              │
 │    <editionId>/                              │  │  - courses/<editionId>/                  │
 │      current/                                │  │  - workspace-templates/                  │
 │        ├── courses/                          │  │  - firmware-baselines/                   │
 │        ├── workspace-templates/              │  │  (安装包自带，离线可用，基线兜底)       │
 │        └── firmware-baselines/               │  └──────────────────────────────────────────┘
 │      state.json (记录当前缓存版本)           │
 └──────────────────────────────────────────────┘
```

### 目录结构与隔离机制

各发行版的缓存存放在各自的 `userData` 目录中（`app.getPath('userData')/content/<editionId>/`）。因各 Edition 的 `userDataDirectoryName` 不同，天然实现物理隔离：
- CH32 单片机入门版：`%APPDATA%\RobotDogStudio-MCU\content\mcu-foundations`
- TI MSPM0 教学版：`%APPDATA%\RobotDogStudio-TI-MSPM0\content\ti-mspm0-foundations`

单个发行版下的内部目录结构：

```text
app.getPath('userData')/content/<editionId>/
├─ state.json               # 记录当前已应用的远程版本: { "version": 4, "updatedAt": "..." }
├─ current/                 # 当前生效的内容解压目录
│   ├── courses/            # 课程目录 (catalog.json, lessons, lectures...)
│   ├── workspace-templates/# 实验工程模板 (ch32v203-mcu-lessons, pony...)
│   └── firmware-baselines/ # 固件基线 (active.json, *.firmware.json, current/source...)
├─ backup/                  # 更新升级前的备份（替换失败时自动回滚，成功后清除）
└─ temp/                    # 临时下载目录（下载 content.zip 与解压校验）
```

---

## 3. 远程清单与更新协议

### 3.1 更新源地址

默认通过 HTTPS 访问 Gitee 仓库的原始文件：

```text
https://gitee.com/Cidervinegar/robohorse-courses/raw/master/update.json
```

### 3.2 Manifest 规范 (Schema Version 3)

远程 `update.json` 支持多发行版统一配置：

```json
{
  "schemaVersion": 3,
  "editions": {
    "mcu-foundations": {
      "version": 4,
      "minAppVersion": "0.1.0",
      "url": "https://gitee.com/Cidervinegar/robohorse-courses/raw/master/packages/mcu-foundations/content.zip"
    },
    "ti-mspm0-foundations": {
      "version": 2,
      "minAppVersion": "0.1.0",
      "url": "https://gitee.com/Cidervinegar/robohorse-courses/raw/master/packages/ti-mspm0-foundations/content.zip"
    }
  }
}
```

字段约束：
- `schemaVersion`：主版本为 `3`（向后兼容 schema v2 与 v1）；
- `version`：单发行版递增正整数。只有当 `remoteVersion > localVersion` 时才会触发更新；
- `minAppVersion`：（可选）语义化版本号。若上位机版本过低，状态设为 `incompatible`，提示学生升级上位机，不强行下载；
- `url`：该发行版完整 `content.zip` 的下载地址。

---

## 4. 内容发布流程

在 `D:\RobotDog\robohorse-courses` 仓库中进行统一发布：

```powershell
# 1. 一键从 Studio 同步最新资源并打包发布
.\scripts\publish-content.ps1 mcu-foundations -sync
.\scripts\publish-content.ps1 ti-mspm0-foundations -sync

# 2. 检查差异
git status
git diff update.json

# 3. 提交推送至 Gitee
git add .
git commit -m "feat(content): release unified edition content update"
git push
```
