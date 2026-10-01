# RoboHorse Studio 项目入口

项目当前文档导航为 [docs/README.md](docs/README.md)。`docs/archive/` 是历史记录，不作为当前实施依据。

## 软件版本发布与远程升级

处理软件发版、安装包推送、App Update 或发布故障前，先阅读 [软件更新与发布操作说明](docs/development/app-updates.md)，按其中的“下一版操作清单”执行。操作命令以根 `package.json` 和发布脚本实际实现为准。

- 软件发布仓库是 `https://gitcode.com/Cider_Vinegar/robohorse-studio-releases`，使用发布端 `GITCODE_TOKEN`。README 和最后的更新清单由 API 提交，不要求 GitCode SSH；不要修改源码仓库的 `origin`。
- 根 `package.json.version` 是唯一手工版本来源。App Update 与课程、模板、Firmware Baseline 的 Content Update 独立，不迁移或重构教学内容更新源。
- 正式 NSIS 包由同一干净源码提交顺序构建，保留打包脚本生成的 `.exe.release.json`。构建后再改源码或提交文档会改变 HEAD，旧产物不能通过发布来源校验；应在构建前完成所有拟提交变更。
- `pnpm release:app` 默认 dry-run。用户要求实际发布时，才使用 `--publish`；只要求文档、检查或打包时不要上传。
- 先上传所有本批安装包，再完整匿名下载核对大小和 SHA-256，最后提交 `update.json`。失败时保留现有有效清单，不提前发布新清单，不手改构建记录或跳过正式固件门禁。
- MCU、TI、Fun 严格区分，缺失 Edition 不回退到其他包。Fun 能否正式发布取决于当时的固件门禁；不要把历史状态视为永久结论。
- Token、临时签名上传地址及请求头不得进入代码、日志、清单或安装包。客户端检查和下载不携带登录凭据。
- 发现已有改动或未跟踪文件时，先区分其归属并保留其他工作，不删除、隐藏或混入无关内容来凑干净工作区。
- 验收包括普通测试、类型检查、三个 Edition 的 Electron smoke、正式包门禁和独立 `pnpm test:app-update:live`。普通测试不执行安装器；真实 NSIS 升级及数据保留验收须单独报告是否完成。

发布完成后报告源码提交、版本、Edition、Release 和清单地址、产物大小/摘要及测试结果。`release/` 是本地构建输出，不能把其中的临时日志或聊天上下文当作新会话唯一的操作依据。
