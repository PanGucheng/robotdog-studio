# RoboHorse Studio

![RoboHorse Studio](resources/brand/robohorse-logo.svg)

RoboHorse Studio 是一套面向机器人与嵌入式单片机教学的集成开发上位机环境。通过将受控 C 代码编辑、硬件状态可视化、本地隔离 AI 助教与真机在线烧录深度结合，为不同学习阶段提供闭环实验体验。

仓库由同一套工程维护三个彼此隔离的教学发行版（Editions）：
- **`fun-line-following`（趣味巡线版）**：面向中小学生和零基础学习者，围绕 CH32V203 机器马运动、简单控制参数与 CCD 巡线波形展开；
- **`mcu-foundations`（CH32 单片机入门版）**：面向大学低年级嵌入式课程，以 RISC-V 裸机 C 工程结构、外设驱动及结构化课次实验为核心；
- **`ti-mspm0-foundations`（TI MSPM0 教学版）**：面向现代 ARM Cortex-M0+ 体系，结合 TI SysConfig 图形化配置、DriverLib 与在线调试。

---

## 快速开始

开发环境要求：Windows 11 x64、Node.js 24、pnpm 11.8.0（通过 Corepack 管理）。

```powershell
# 1. 初始化依赖与受控 Reasonix 运行时
corepack prepare pnpm@11.8.0 --activate
corepack pnpm install
corepack pnpm reasonix:prepare

# 2. 启动对应教学发行版
corepack pnpm dev:fun    # 启动趣味巡线版
corepack pnpm dev:mcu    # 启动 CH32 单片机入门版 (亦可双击 start-mcu-dev.cmd)
corepack pnpm dev:ti     # 启动 TI MSPM0 教学版 (亦可双击 start-ti-mspm0-dev.cmd)
```

---

## 质量验证

在提交代码、课次或固件变更前，请运行综合检验门禁：

```powershell
corepack pnpm check
```

`check` 命令将顺序执行课程资源与讲义校验（`courses:validate`）、全量单元与服务集成测试（`test`）、TypeScript 类型检查与生产构建（`build`）。

---

## 目录结构概览

```text
RobotDog_Studio/
├─ src/          # Electron 源码 (main 主进程、preload 桥接层、renderer 前端界面、shared 共享层)
├─ firmware/     # 下位机固件源码基线 (CH32V203 教学基线与小马全功能基线)
├─ resources/    # 教学课程、课次模板、品牌资产、工具链画像及固件清单
├─ scripts/      # 构建、校验、品牌生成、冒烟测试与 Windows 打包脚本
├─ docs/         # 开发者、课程作者与固件规范文档
└─ vendor/       # 内置免配置的第三方开发工具链 (WCH RISC-V GCC12 与 OpenOCD)
```

---

## 开发者文档入口

完整系统架构、课次编写指南、讲义 Markdown 规范、远程更新机制与固件协议，请查阅统一技术文档中心：

👉 **[查看完整技术文档导航 (docs/README.md)](docs/README.md)**

- [系统架构设计 (Architecture)](docs/architecture.md)
- [本地开发指南 (Local Development)](docs/development/local-development.md)
- [测试与质量门禁 (Testing & Validation)](docs/development/testing-and-validation.md)
- [Windows 打包与基线门禁 (Windows Packaging)](docs/development/windows-packaging.md)
- [单片机与 TI 课程制作指南 (Course Authoring)](docs/courses/mcu-course-authoring.md)
- [固件基线说明 (Firmware Baselines)](firmware/README.md)
- [品牌资产说明 (Brand Assets)](resources/brand/README.md)
