# 软件更新与发布

App Update 更新软件安装本体。Content Update 继续独立更新课程、模板与 Firmware Baseline，两者不共享服务、版本号、缓存或清单。

新会话 Agent 从根 `AGENTS.md` 自动发现本说明；人类可从项目 README 或 `docs/README.md` 进入。本文和仓库脚本是后续发版依据，不需要上一轮聊天记录或 `release/` 中的临时文件。

## 下一版操作清单

逐条执行下列步骤，任何检查或命令失败时停止后续发布步骤。若用户只要求构建或检查，执行到 dry-run 即可。

### 1. 核对源码、发布范围和凭据

在源码仓库根目录检查：

```powershell
git status --short
git branch --show-current
git remote -v
git fetch origin main
git log -1 --oneline origin/main
# 只显示是否配置，不输出 Token 内容。
[bool]($env:GITCODE_TOKEN -or [Environment]::GetEnvironmentVariable('GITCODE_TOKEN', 'User'))
```

根据当前分支与最新 main 差异，确认本次拟发布的源码和 Edition，不丢弃已有改动。`git fetch` 不会自动切换或合并分支。尚未归属本次发版的改动/未跟踪文件应保留并解决归属，不能删除、加忽略规则或混入无关提交来绕过干净工作区检查。

确认目标版本高于已发布的软件版本。例：修复版本可能是 `1.1.1`，新增功能可能是 `1.2.0`，应按实际改动及用户要求确定，不能把例子直接当作指定版本。读取当前公开清单即可确认各 Edition 已发布版本：

```powershell
Invoke-RestMethod -Uri 'https://api.gitcode.com/api/v5/repos/Cider_Vinegar/robohorse-studio-releases/raw/update.json?ref=main'
```

Token 缺失时先完成本地工作，报告缺少发布凭据。不要要求客户端登录，也不要把 Token 写进命令行参数、源码、发布说明或清单。脚本支持进程环境变量及 Windows 用户级环境变量；用户配置后不用重开终端也能读取用户级值。发布所需权限为目标仓库的 Release 和文件读写。

### 2. 更新版本和更新说明，完成测试

只手工修改根 `package.json.version`，添加 `docs/releases/<新版本>.md`。更新说明是面向使用者的 UTF-8 纯文本，非空且不超过 20,000 个字符。安装包版本、文件名、Main 和界面版本自动派生，不分别修改暂存包或编译产物。

```powershell
pnpm check
pnpm smoke:electron:fun
pnpm smoke:electron:mcu
pnpm smoke:electron:ti
```

`check` 包含课程校验、普通测试、类型检查与生产构建；三个 smoke 命令检查三个 Edition 的 Electron 运行路径。普通测试及 smoke 不访问线上 App Update，不运行 NSIS 安装器。按变更补充必要的人工验收，记录未完成项。

### 3. 提交本次变更，从同一提交顺序构建

审核并只提交本次发版相关文件，包括版本、更新说明和文档；不要使用无选择的 `git add .` 混入其他工作。记录提交并确认工作区干净，然后依次构建：

```powershell
git status --short
git rev-parse HEAD
pnpm package:win:mcu
pnpm package:win:ti
# 仅在 Fun 本次需要发布且正式固件门禁通过时执行：
# pnpm package:win:fun
```

不能并行打包：打包脚本使用共享暂存目录。不能使用 `:test`、PROVISIONAL 包或便携 ZIP 替代正式 NSIS 包。Fun 门禁未通过时暂不发布 Fun，不自行修改基线标志；是否继续发布通过门禁的其他 Edition 按用户要求处理。

所有拟提交修改都要在构建前完成。打包后新增提交（包括仅文档提交）会改变 HEAD，此时应重新构建本批产物；发布脚本会拒绝旧提交、脏工作区、混合来源或被改动的安装包。

产物位于 `release/`，其中 `<version>` 为根包版本：

| Edition | 正式安装包 |
| --- | --- |
| `mcu-foundations` | `RoboHorse-Studio-MCU-<version>-Windows-x64.exe` |
| `ti-mspm0-foundations` | `RoboHorse-Studio-TI-MSPM0-<version>-Windows-x64.exe` |
| `fun-line-following` | `RoboHorse-Studio-Fun-<version>-Windows-x64.exe` |

每个安装包旁必须有 `<安装包文件名>.release.json`，保存真实 Edition、版本、大小、SHA-256 和源码提交。不要手写或修改记录来使检查通过。构建包含资源和固件构建自检；最终打包应用及隔离 Windows 安装验收应按本次范围另行验证。

### 4. Dry-run，再实际发布

默认范围为 MCU/TI。单版或包含 Fun 时显式列出本批 Edition，两次命令使用相同范围：

```powershell
pnpm release:app --editions=mcu-foundations,ti-mspm0-foundations
pnpm release:app --publish --editions=mcu-foundations,ti-mspm0-foundations
```

dry-run 核对本地产物记录、真实大小和摘要、当前 HEAD 和干净工作区，不上传。实际发布由 `scripts/publish-app-release.ts` 和 `scripts/gitcode-app-release.ts` 执行：

1. 检查公开发布仓库 main，准备 README，读取现有清单。
2. 创建/复用 `v<version>` Release，使用 `docs/releases/<version>.md` 作为更新说明；可显式传 `--notes-file=<路径>`。
3. 获取临时签名上传地址，流式 PUT 上传，确认附件已登记。
4. 不带 Token/Cookie 完整下载本批每个附件，核对大小及 SHA-256。
5. 全部验证成功后检查 main 提交与清单 Blob SHA 未被并发修改，最后通过文件 API 提交 `update.json`。
6. 匿名读取公开 raw 清单，核对实际内容。

未参与本批的 Edition 清单项会保留。客户端只选择自己的 Edition；不存在对应条目时显示尚未发布。签名上传 URL 不用于客户端，也不保存到清单。EXE 只放 Release 附件，不能提交源码仓库或发布仓库的 Git 历史。

### 5. Live Test 和交接

```powershell
pnpm test:app-update:live
```

此命令匿名读取真实清单并完整下载所有已发布 Edition，检查进度及可安装状态；下载到临时目录，不实际安装软件。最后报告新版本、源码提交、发布 Edition、Release/清单地址、安装包大小和 SHA-256、普通测试/打包/Live Test 结果及未完成人工验收。

若需长期保存发布验收记录，应在项目受版本控制的文档中记录事实；`release/` 是忽略的本地构建输出，不能作为跨机器或新会话唯一依据。发布后新增验收文档提交会改变 HEAD，之后重复执行自动发布须重新构建以符合来源校验；查看或下载既有公开 Release 不需要重新构建。

## 常见发布失败

| 情况 | 处理 |
| --- | --- |
| `GITCODE_TOKEN_MISSING` 或 HTTP 401/403 | 检查 Token 是否配置、是否有目标仓库 Release/文件权限；不打印凭据。 |
| `BUILD_PROVENANCE_INVALID` | 检查脏工作区、当前 HEAD、产物和记录；保留其他工作，从同一干净提交重新构建，不能改记录或绕过检查。 |
| 正式固件门禁失败 | 停止对应 Edition 发布并报告实际失败；不使用测试包或手改 `releaseEligible` 替代。 |
| HTTP 容量限制、上传/匿名下载失败或摘要不一致 | 停止本批清单提交，保留原清单，报告平台或网络错误；不自行拆包、换平台或覆盖同名附件。 |
| 同名附件存在 | 脚本复用并完整匿名校验；相同内容可继续，不同内容失败。已有版本应保持不变，修正后使用更高版本，不能覆盖已发布包。 |
| `RELEASE_METADATA_CHANGED_RETRY` | 检查发布仓库并发修改，确认新状态后重新执行；不要覆盖其他 Edition 的清单项。 |
| 已提交清单但 raw 验证失败 | 报告发布和验证的实际状态，检查公开 raw 与附件；不要宣称全部验收通过。只有确认是暂时网络/缓存问题后才重试验证。 |

发布失败后的重试仍须从符合构建记录的干净源码提交执行。脚本会复用已创建 Release 和同名附件，并重新校验，只有全部附件验证通过才继续发布清单。

## 首次上线记录与状态判断

2026-10-01：MCU/TI 1.1.0 已发布到 GitCode，329 项普通测试、两版正式构建/打包应用 smoke、公开清单和独立 Live Test 验证通过；源码提交 `928ac9d7470560840bb3481ac58fadda04726d4e`，发布仓库清单提交 `1abd598dac07c3a3557cf51e9a4066f7414c313e`。真实 NSIS 升级、UAC 取消及升级后数据保留仍需隔离 Windows 测试机人工验收。

这是一次已完成发布的事实，不代表之后的最新状态；后续 Agent 应读取当前代码、公开清单和实际门禁。旧版 1.0.0 没有 App Update；此前内置 Gitee 地址的本地 1.1.0 也需首次手动安装 GitCode 版本，相同版本不会触发远程升级。

## 客户端

唯一软件版本来源是根 `package.json.version`。打包脚本读取它，Main 通过 `app.getVersion()` 提供当前版本。三个 Edition 的应用标识、安装目录识别及 userData 目录继续保持独立。

正式 Windows 包显示主界面后后台检查一次。检查失败不影响使用，不自动下载或安装。开发、PROVISIONAL 包和普通 smoke test 不自动访问软件更新地址。显式测试可设置：

```powershell
$env:ROBOTDOG_APP_UPDATE_ENABLE='1'
# 可选：仍要求 HTTPS 的测试清单地址
$env:ROBOTDOG_APP_UPDATE_URL='https://example.test/update.json'
pnpm dev:mcu
```

安装包只下载到当前 Edition 的 `userData/updates/`。`.part` 不可安装；完整包通过大小和 SHA-256 校验后原子改名，并写入 `completed.json`。缓存恢复和安装前都会重新验证。没有断点续传，失败后重新下载。

立即安装先检查执行中的任务，再锁定交互并等待各窗口保存编辑器内容。保存失败、包校验失败、安装器启动失败或 UAC 取消时软件继续运行。`shell.openPath()` 成功代表 Windows 接受安装器启动请求，之后退出应用；不代表安装已完成。升级沿用 NSIS per-machine、交互安装及驱动逻辑，不覆盖 userData。

## 清单

发布仓库：`https://gitcode.com/Cider_Vinegar/robohorse-studio-releases`。

公开地址：`https://api.gitcode.com/api/v5/repos/Cider_Vinegar/robohorse-studio-releases/raw/update.json?ref=main`。公开 raw 和附件下载均不携带 Token。清单使用稳定的附件下载 API 地址，由平台重定向至 HTTPS CDN；不保存临时签名链接。

```json
{
  "schemaVersion": 1,
  "editions": {
    "mcu-foundations": {
      "version": "1.1.0",
      "url": "https://api.gitcode.com/api/v5/repos/Cider_Vinegar/robohorse-studio-releases/releases/v1.1.0/attach_files/RoboHorse-Studio-MCU-1.1.0-Windows-x64.exe/download",
      "notes": "更新说明",
      "size": 123456789,
      "sha256": "由实际安装包计算的64位十六进制摘要"
    }
  }
}
```

上例大小与摘要仅用于说明，不可直接发布。TI 和 Fun 使用各自 Edition key 和严格匹配的文件名。缺失 Edition 表示尚未发布，不回退其他版本。稳定 SemVer 只升级、不降级；不提供预发布渠道。

## Agent 自动发布

发布端配置 `GITCODE_TOKEN`，允许操作目标仓库的 Release 和文件。Windows 支持进程环境变量或用户级环境变量。Token 仅用于发布 API；README 和最后的 update.json 使用文件 API 提交到 main，安装包通过平台提供的临时签名地址流式 PUT 上传。无需配置 GitCode SSH 或安装 CLI。客户端及匿名验证不携带凭据，签名地址和上传请求头不写入日志或清单。

1. 修改根包版本，更新对应 `docs/releases/<version>.md`。
2. 运行 `pnpm test`、`pnpm build` 和三个 Edition 的 Electron smoke test。
3. 提交源码，保证工作区干净。由同一提交顺序执行 `pnpm package:win:mcu`、`pnpm package:win:ti`。正式门禁不能跳过。Fun 基线正式就绪后才构建 `pnpm package:win:fun`。
4. 正式 NSIS 打包完成并通过资源自检后，生成安装包旁的 `.release.json`，记录 Edition、版本、大小、摘要及源码提交。没有该记录、工作区不干净或记录不匹配均不能发布。
5. `pnpm release:app` 默认 dry-run，只核对本地正式包和发布信息。
6. `pnpm release:app --publish` 创建/复用 `v<version>` Release，上传 MCU/TI 附件。完整匿名下载验证所有附件后，最后通过 API 提交 `update.json`，验证公开 raw 清单。

```powershell
pnpm release:app --publish --editions=mcu-foundations,ti-mspm0-foundations
# Fun 可随后从同一版本重新构建并单独加入清单，已有 Edition 项会保留。
pnpm release:app --publish --editions=fun-line-following
```

脚本固定目标仓库，不修改源码仓库 origin。重复发布复用已有附件并再次校验；同名内容不同直接失败，不覆盖附件。提交清单前检查 main 提交和清单 Blob SHA，并发元数据变化时失败，重新执行即可。大包附件容量限制、匿名下载失败、Token 权限失败都会阻止新清单发布；不提交 exe 到 Git，不拆包或更换服务。

手动备用流程：网页创建 `v<version>` Release，上传通过正式门禁的安装包，使用本地产物记录填写对应清单项，完整匿名下载核对大小和 SHA-256，最后才通过网页或 Git 提交清单。首次启用更新功能的 1.1.0 需要用户安装一次，旧版 1.0.0 没有远程软件更新能力。

2026-10-01 实测：原 Gitee 账户单附件限制 100 MB，拒绝 MCU 安装包上传。经用户授权迁移至 GitCode；1,340,137,304 字节测试附件上传、匿名完整下载及 SHA-256 校验通过，随后删除测试附件。正式发布仍须逐包验证。

## 验证

普通自动化测试使用本地 HTTP fixture 和 mock 发布 API，不访问 GitCode、不开安装器。独立 Live Test：

```powershell
pnpm test:app-update:live
```

Live Test 完整下载每个已发布安装包到临时目录并核对大小、摘要和进度；结束清理，不安装。安装包较大，命令需要足够网络流量和临时磁盘空间。

隔离 Windows 测试机需另外验证首次安装、同 Edition 升级、UAC 取消、安装失败，以及升级前后 Workspace、学生源码、课程进度、AI 对话、设置及教学内容缓存保持不变。自动化测试不能替代真实 NSIS 升级验收。
