# RoboHorse Studio 技术文档导航

欢迎阅读 RoboHorse Studio 开发者与课程作者技术文档。本文档库是项目当前有效规范的**唯一定义与导航入口**。

---

## 1. 开始开发 (Development)

- [系统架构设计 (Architecture)](architecture.md)：系统总体定位、Main/Preload/Renderer 进程边界、三发行版模型、工作区与安全设计；
- [本地开发指南 (Local Development)](development/local-development.md)：Node.js 24 与 pnpm 11.8.0 环境准备、Reasonix 运行时初始化与发行版启动命令；
- [测试与质量门禁 (Testing & Validation)](development/testing-and-validation.md)：`pnpm check` 验证命令、课程校验、TypeScript 类型检查与 Vitest 服务测试；
- [Windows 打包与基线门禁 (Windows Packaging)](development/windows-packaging.md)：便携版 ZIP 与 NSIS 安装包打包命令、WCH-Link 驱动集成及正式发布门禁。
- [软件更新与发布操作说明 (App Update & Release)](development/app-updates.md)：GitCode 软件安装包发布、统一版本来源、下一版 Agent 操作清单、凭据检查、失败处理与独立 Live Test。
- [1.2.2 发布与 TI 安装包裁剪记录](releases/1.2.2-verification.md)：离线编辑器、TI 烧录校验修复、工具链裁剪收益及两版软件正式发布。
- [TI 1.2.1 与第一课发布记录](releases/1.2.1-verification.md)：正式安装包、三类固件与教学内容 v3 的来源、下载摘要和线上验收。
- [MCU 1.2.0 与沁恒第二课发布记录](releases/1.2.0-verification.md)：已发布版本、源码来源、下载地址与摘要、Gitee 大包下载修复、线上检查及未完成人工验收。
- [自由工程文件编辑与构建](development/sandbox-projects.md)：沁恒/TI 基础 SDK 空工程与完整小马例程选择、文件与文件夹新建、完整工程副本、编译接入、课程权限边界和生成代码保留规则。
- [代码编辑器 Loading 与离线加载修复](development/editor-offline-verification.md)：外部 CDN 依赖复现、本地 Monaco 与后台线程打包、断网编辑保存验收及学生端更新边界。
- [TI 安装包裁剪方案](development/ti-package-trimming-plan.md)：既有 Git 精简核对、TI 工具链体积明细、首轮裁剪范围与三类工程验收要求。
- [浅色界面与应用内提示框验收](development/light-theme-verification.md)：公共主题、窗口标题栏、课程横幅、提示框与跨页面渲染检查。
- [全软件浅色界面与底色职责规划](development/surface-system-plan.md)：统一导航、内容和页面留白，覆盖三个 Edition 的页面、交互状态与后续验收范围。
- [全软件底色统一与视觉验收](development/surface-system-verification.md)：实际修改、共享颜色来源、跨页面与缩放检查、原始截图及测试边界。
- [浅色底色微调](development/pale-surface-verification.md)：当前导航浅蓝灰、白色文件树与课程侧栏、设置顶部配色及复验记录。
- [深色模式与主题切换](development/dark-theme-verification.md)：汉堡菜单切换、偏好恢复、原生标题栏与代码编辑器同步，以及跨页面验收。

---

## 2. 课程开发 (Courses)

- [单片机与 TI 实验课程制作指南 (Course Authoring)](courses/mcu-course-authoring.md)：课程目录、Manifest 规范、独立工程模板与验收条件定义；
- [讲义受控 Markdown 语法规范 (Lecture Markdown)](courses/lecture-markdown.md)：章节 ID 锚点规则、白名单指令语法与数学公式规范；
- [真实界面截图与清晰度验收](courses/course-screenshots.md)：操作截图的无损采集、局部裁切、实际显示尺寸检查和本次保留事项；
- [TI 第一课制作与软件验收记录](courses/ti-first-lesson-verification.md)：课程内容、SysConfig 窗口修复、软件验证结果与剩余实板验收；
- [TI 正式发布准备记录](courses/ti-release-preparation.md)：第一课与两套自由工程的发布范围、文案整理、保留截图及独立固件门禁；
- [沁恒第一课截图与软件验收记录](courses/mcu-first-lesson-verification.md)：真实界面、AI 助教引导、参数修改与构建的软件验收；
- [沁恒第二课截图与软件验收记录](courses/mcu-second-lesson-verification.md)：GPIO 操作、错误定位、概念配图与未发布课的软件验收；
- [课次编写与硬件验证要求 (Hardware Validation)](courses/lesson-hardware-validation.md)：普通课与硬件实物课编写准则、真机运行验证门禁；
- [远程课程热更新机制 (Remote Course Updates)](courses/remote-course-updates.md)：Gitee 远程源规范、Manifest 配置、缓存管理与原子回滚机制。

---

## 3. 固件开发 (Firmware)

- [固件基线目录总览 (Firmware Baselines Overview)](../firmware/README.md)：`firmware/` 下教学基线与机器马全功能基线的职责划分与对应关系；
- [CH32V203 固件开发指南 (CH32V203 Guide)](firmware/ch32v203.md)：硬件引脚分配、两套基线结构、WCH-Link 烧录与串口监视；
- [TI MSPM0 教学版开发与验证 (TI MSPM0 Guide)](firmware/ti-mspm0.md)：MSPM0G3507 硬件平台、SysConfig 集成与开发验证；
- [TI 固件发布资格与热更新边界](firmware/ti-release-qualification.md)：维护者实板确认、三类固件晋升，以及源码更新与开发板烧录的区别；
- [TI 烧录校验超时修复](firmware/ti-flash-verify-fix.md)：1.2.1 的 CRC 工作区地址问题、实板只读核验和带备份的本地修复脚本；
- [TI MSPM0 托管工具链规范 (Managed Toolchain)](firmware/ti-mspm0-managed-toolchain.md)：MSPM0 SDK、SysConfig、Arm GCC 与 OpenOCD 版本清单；
- [TI MSPM0 净机安装验收清单 (Clean Windows Checklist)](firmware/ti-mspm0-clean-windows-checklist.md)：无开发环境的裸机 Windows 11 验收规范；
- [下位机固件接口与安全修改要求 (Firmware Developer Requirements)](firmware/firmware-developer-requirements.md)：固件开发者接口约定、安全状态机与构建规范。

---

## 4. 通信与协议 (Protocols)

- [RDS1 串口通信协议规范 (Serial Protocol v1)](firmware/protocols/serial-v1.md)：运行态控制帧、状态回传、CCD 数据流与租约心跳规范；
- [IAP 在线升级协议规范 (IAP Protocol v1)](firmware/protocols/iap-v1.md)：板载串口固件安全升级握手与数据分包协议。

---

## 5. 品牌与资源 (Brand & Assets)

- [品牌资产与使用规范 (Brand Assets)](../resources/brand/README.md)：RoboHorse Studio 图标资产清单、色彩规范与 Windows 图标生成脚本。

---

## 6. 历史设计记录 (Archive)

- [设计历史与归档索引 (Archive Index)](archive/README.md)：早期实施计划、阶段设计方案、Agent 任务书与手工验收记录追溯。

> [!NOTE]
> `docs/archive/` 中的所有文件仅作为历史决策追溯与参考依据，不作为当前系统开发、代码实现与课程发布的依据。系统当前状态以本目录中的活跃文档为准。
