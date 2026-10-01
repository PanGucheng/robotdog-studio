# 软件更新与发布

App Update 更新软件安装本体。Content Update 继续独立更新课程、模板与 Firmware Baseline，两者不共享服务、版本号、缓存或清单。

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
