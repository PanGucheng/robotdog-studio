# 开发阶段下位机固件动态接入计划

> 目标：RobotDog Studio 在开发阶段可以方便地拉取、审阅、构建和烧录下位机固件远端更新，同时保留可追溯、可回退的稳定基线。  
> 下位机仓库：`https://github.com/PanGucheng/ch32v203-robot-dog`  
> 当前已验证远端：`c897e3a`（含 `baselineCommit` 元数据修复）  
> 上位机仓库：`https://github.com/PanGucheng/robotdog-studio`

## 1. 设计原则

开发阶段不要把下位机固件当成“一次性复制进上位机的静态模板”。更合适的方式是：

1. 下位机仓库保持独立开发和提交。
2. 上位机记录一个“当前已验证基线”。
3. 上位机提供“检查远端更新 / 拉取候选 / 构建验证 / 切换基线”的流程。
4. 学生工作区从当前已验证基线生成，不直接修改下位机仓库。
5. 任何远端更新进入上位机正式使用前，都必须通过构建、manifest、学生 overlay 和烧录前检查。

这样可以兼顾两个需求：

- 下位机开发者可以频繁提交；
- 上位机不会因为未验证固件更新而影响学生使用。

## 2. 推荐仓库关系

不建议现阶段使用 Git submodule 绑定下位机仓库。原因：

- 下位机还在快速变化；
- 上位机需要经常检查远端更新；
- 学生工作区要从模板复制出来，而不是直接在 submodule 上修改；
- submodule 容易让非 Git 用户困惑。

推荐采用“外部固件源 + 本地缓存 + 已验证基线记录”的模式。

```text
RobotDog_Studio/
├─ resources/
│  ├─ firmware-baselines/
│  │  └─ ch32v203-robotdog/
│  │     ├─ active.json          # 当前上位机认可的稳定基线
│  │     └─ snapshots/           # 可选：小型 manifest/模板快照，不放完整仓库
│  └─ workspace-templates/
│     └─ ch32v203-robotdog/
│        └─ <baseline-id>/       # 学生工作区模板
├─ .firmware-sources/            # 本地开发缓存，gitignore
│  └─ ch32v203-robot-dog/         # 下位机 Git clone
└─ .firmware-build/              # 构建输出，gitignore
```

其中：

- `.firmware-sources/` 只存在于开发机本地，不提交；
- `.firmware-build/` 是构建产物目录，不提交；
- `resources/firmware-baselines/.../active.json` 提交，用来锁定当前已验证基线；
- `resources/workspace-templates/...` 提交，用来生成学生工作区。

## 3. Baseline 数据模型

建议上位机维护一个新的 active manifest，例如：

```json
{
  "schemaVersion": 2,
  "name": "ch32v203-robotdog",
  "mode": "development-live-remote",
  "remote": {
    "url": "https://github.com/PanGucheng/ch32v203-robot-dog",
    "branch": "main"
  },
  "activeCommit": "c897e3a...",
  "verifiedFirmwareManifest": "robotdog.firmware.json",
  "studentTemplate": "resources/workspace-templates/ch32v203-robotdog/c897e3a",
  "build": {
    "type": "cmake",
    "preset": "robotdog-wch-gcc12",
    "toolchain": "WCH RISC-V Embedded GCC12",
    "outputDir": ".firmware-build/ch32v203-robotdog"
  },
  "artifacts": {
    "hex": "RobotDog.hex",
    "bin": "RobotDog.bin",
    "elf": "RobotDog.elf",
    "map": "RobotDog.map",
    "size": "RobotDog.size.txt",
    "hashes": "RobotDog.sha256.txt",
    "sourceInput": "RobotDog.input.json"
  },
  "verification": {
    "minimumFlashFreeBytes": 8192,
    "lastVerifiedAt": "2026-07-14T00:00:00+08:00",
    "lastVerifiedBy": "RobotDog Studio"
  }
}
```

注意：

- `activeCommit` 表示上位机当前认可的下位机提交；
- 下位机自己的 `robotdog.firmware.json.baselineCommit` 必须可解析；
- 如果下位机后续提交修文档或元数据，允许上位机记录“固件代码提交”和“仓库交付提交”两个字段。

## 4. 固件更新工作流

### 4.1 检查远端更新

新增开发入口：

```text
固件开发 / 检查下位机更新
```

执行逻辑：

1. 如果 `.firmware-sources/ch32v203-robot-dog` 不存在，则 clone。
2. 如果存在，则 `git fetch --all --prune`。
3. 读取远端 `origin/main` 最新 commit。
4. 与 `active.json.activeCommit` 对比。
5. 展示：
   - 当前已验证 commit；
   - 远端最新 commit；
   - 新增提交列表；
   - 是否需要验证。

### 4.2 拉取候选更新

点击“拉取候选”后：

1. 不直接切换 `active`。
2. 创建临时 worktree：

```text
.firmware-sources/worktrees/<commit>/
```

3. 读取并校验：
   - `robotdog.firmware.json`
   - `CMakePresets.json`
   - `Core/Inc/student_control.h`
   - `Core/Src/student_control.c`
   - `student-config/line-following.yaml`

4. 检查 `robotdog.firmware.json.baselineCommit`：
   - 必须存在；
   - 必须是 40 位 hash；
   - 最好与候选 commit 或其声明字段一致；
   - 不允许为 `null`。

### 4.3 构建验证

对候选固件执行：

```powershell
cmake --preset robotdog-wch-gcc12 `
  -DROBOTDOG_TOOLCHAIN_ROOT="<WCH GCC12 path>" `
  -DROBOTDOG_OUTPUT_DIR="<.firmware-build/.../out>"

cmake --build --preset robotdog-release
```

验证项：

1. CMake configure 成功；
2. build 成功；
3. 产物齐全；
4. `RobotDog.size.txt` 中 `status=PASS`；
5. Flash 剩余不低于 `minimumFlashFreeBytes`；
6. `RobotDog.sha256.txt` 生成；
7. `RobotDog.input.json` 生成。

### 4.4 学生 overlay 验证

候选固件必须再跑一次 overlay 构建。

流程：

1. 从候选固件复制学生模板到临时 overlay；
2. 或使用上位机准备更新后的 `resources/workspace-templates/.../<commit>`；
3. 设置：

```text
ROBOTDOG_STUDENT_OVERLAY=<overlay path>
```

4. 构建完整固件。

这一步是为了确保：

- 上位机学生模板和下位机接口一致；
- AI 修改候选工作区后能生成完整固件；
- 不再出现旧宏名 `STUDENT_TURN_STRENGTH` 与新宏名 `STUDENT_CONFIG_TURN_STRENGTH` 不匹配的问题。

### 4.5 切换 active 基线

只有全部验证通过后，才允许“设为当前基线”。

切换动作：

1. 更新 `resources/firmware-baselines/ch32v203-robotdog/active.json`。
2. 更新 `resources/workspace-templates/ch32v203-robotdog/<commit>/`。
3. 更新 UI 显示的固件版本/commit。
4. 记录验证结果：
   - commit；
   - build output path；
   - size；
   - source input hash；
   - artifact hash；
   - 验证时间。
5. 创建上位机 Git commit。

## 5. 上位机 UI 设计

建议新增或扩展一个“固件开发”页面，与“编写代码”“AI 助教”“WCH-Link 烧录”同级或在烧录页内增加开发模式区域。

页面区域：

### 5.1 当前固件基线

显示：

- 下位机仓库 URL；
- 当前 active commit；
- 固件版本；
- 协议版本；
- Flash/RAM 使用；
- 最近验证时间；
- 学生模板版本。

### 5.2 远端更新

操作：

- 检查更新；
- 拉取候选；
- 查看提交列表；
- 打开 GitHub commit；
- 查看 manifest 差异。

### 5.3 验证候选

操作：

- 运行默认构建；
- 运行学生 overlay 构建；
- 查看 size；
- 查看构建日志；
- 查看产物 hash；
- 标记为 active。

### 5.4 烧录验证

候选或 active 构建成功后：

- 可直接跳转 WCH-Link 页面；
- 默认选择本次构建出的 `RobotDog.hex`；
- 显示 commit 和 size；
- 烧录日志与构建记录关联。

## 6. CLI / 脚本设计

建议先实现脚本，再接 UI。

### 6.1 `scripts/firmware-source.mjs`

职责：

- clone/fetch 下位机仓库；
- 列出远端更新；
- 创建临时 worktree；
- 读取 manifest。

命令示例：

```powershell
node scripts/firmware-source.mjs status
node scripts/firmware-source.mjs fetch
node scripts/firmware-source.mjs prepare --commit origin/main
```

### 6.2 `scripts/firmware-verify.mjs`

职责：

- 调用 CMake 构建；
- 验证产物；
- 解析 size；
- 验证 overlay；
- 输出 JSON 验证报告。

命令示例：

```powershell
node scripts/firmware-verify.mjs --commit c897e3a
```

输出：

```json
{
  "status": "passed",
  "commit": "c897e3a...",
  "flashUsedBytes": 15020,
  "flashFreeBytes": 50516,
  "artifacts": {
    "hex": ".../RobotDog.hex"
  }
}
```

### 6.3 `scripts/firmware-promote.mjs`

职责：

- 将已验证候选提升为 active；
- 更新 `active.json`；
- 更新 workspace template；
- 可选创建 Git commit。

命令示例：

```powershell
node scripts/firmware-promote.mjs --verification .firmware-build/.../verification.json
```

## 7. 学生模板更新策略

当前上位机模板仍引用旧宏：

```c
STUDENT_TURN_STRENGTH
```

新固件使用：

```c
STUDENT_CONFIG_TURN_STRENGTH
```

接入新固件时必须更新：

- `resources/workspace-templates/ch32v203-robotdog/.../Core/Src/student_control.c`
- `resources/workspace-templates/ch32v203-robotdog/.../Core/Inc/student_control.h`
- `resources/workspace-templates/ch32v203-robotdog/.../student-config/line-following.yaml`

推荐做法：

1. 每次 promote 新基线时，从下位机仓库复制学生相关文件生成新模板目录；
2. 模板目录用 commit 短 hash 或日期命名；
3. 保留旧模板一段时间用于回滚；
4. `active.json` 指向当前模板。

示例：

```text
resources/workspace-templates/ch32v203-robotdog/
├─ 2026.06/
└─ c897e3a/
```

## 8. 与 AI 修改闭环的关系

AI 不直接修改下位机仓库。

AI 工作流仍然是：

1. 从 active 学生模板复制到学生工作区；
2. AI 只修改允许范围：
   - `Core/Src/student_control.c`
   - `Core/Inc/student_control.h`
   - `student-config/line-following.yaml`
3. 生成候选 diff；
4. 用 active 下位机固件作为底座执行 overlay 构建；
5. 构建通过后学生/教师确认应用。

这样即使下位机远端频繁变化，也不会直接影响学生已有工作区。

## 9. 回滚策略

需要支持两种回滚：

### 9.1 固件基线回滚

如果新下位机基线有问题：

1. 将 `active.json` 切回上一个 verified commit；
2. 学生模板切回对应目录；
3. WCH-Link 烧录页默认使用旧基线构建产物；
4. 记录回滚原因。

### 9.2 学生工作区不回滚

学生已有工作区不自动跟随固件基线回滚。

如果模板接口发生不兼容变化，应提供迁移提示：

- 当前工作区基于哪个模板；
- 新固件要求哪个接口；
- 是否复制到新工作区；
- 是否由 AI 协助迁移。

## 10. 开发阶段的自动化边界

开发阶段可以自动：

- fetch 下位机远端；
- 比较提交；
- 创建临时 worktree；
- 构建验证；
- 生成验证报告；
- 更新本地候选状态。

不建议自动：

- 未经确认切换 active 基线；
- 未经确认覆盖学生模板；
- 未经确认烧录硬件；
- 未经确认提交上位机仓库。

原因是下位机仍在快速开发，自动切换可能让学生体验突然变化。

## 11. 实施顺序

### 阶段 A：脚本化接入

1. 新增 `.firmware-sources/` 到 `.gitignore`。
2. 新增 `scripts/firmware-source.mjs`。
3. 新增 `scripts/firmware-verify.mjs`。
4. 新增 `scripts/firmware-promote.mjs`。
5. 新增 schema/类型定义。
6. 在 npm scripts 中加入：

```json
{
  "firmware:source:status": "node scripts/firmware-source.mjs status",
  "firmware:source:fetch": "node scripts/firmware-source.mjs fetch",
  "firmware:verify": "node scripts/firmware-verify.mjs",
  "firmware:promote": "node scripts/firmware-promote.mjs"
}
```

### 阶段 B：接入当前新固件

1. fetch 下位机 `origin/main`。
2. 验证 `c897e3a` 或更新提交。
3. 从下位机复制学生模板，生成新模板目录。
4. 修复旧宏名兼容问题。
5. 更新 `active.json`。
6. 验证默认构建和 overlay 构建。
7. 提交上位机基线更新。

### 阶段 C：UI 接入

1. 新增固件开发页面或扩展 WCH-Link 页面。
2. 显示当前 active 基线。
3. 提供检查更新按钮。
4. 提供候选验证按钮。
5. 提供设为 active 按钮。
6. 构建成功后跳转烧录。

### 阶段 D：与 Issue/CI 联动

1. 每次 promote 后更新 GitHub Issue。
2. 可选在 CI 中验证 active manifest 格式。
3. 可选在 CI 中只跑轻量校验，不跑 WCH GCC 构建。
4. 发布测试包时记录 active 固件 commit。

## 12. 验收标准

第一阶段完成后应满足：

1. 上位机能一键 fetch 下位机远端更新；
2. 能看到远端最新 commit 与当前 active commit 的差异；
3. 能对候选 commit 执行默认构建；
4. 能对候选 commit 执行学生 overlay 构建；
5. 能解析并展示 Flash/RAM 使用；
6. 能将验证通过的候选设为 active；
7. active 切换后，新建学生工作区使用新模板；
8. WCH-Link 页面能烧录 active 构建产物；
9. 旧基线可回滚；
10. 下位机频繁更新不会影响已有学生工作区。

## 13. 当前下一步

建议下一步先实施阶段 A 和阶段 B：

1. 建立下位机远端缓存与 fetch 脚本；
2. 将 `c897e3a` 作为第一个 live remote 候选；
3. 复制新学生模板并修复宏名；
4. 更新 active manifest；
5. 跑默认构建 + overlay 构建；
6. 再接 WCH-Link 页面默认烧录新产物。

完成后，RobotDog Studio 就可以在开发阶段比较舒服地跟随下位机仓库滚动更新，同时不会牺牲学生侧的稳定性。
