# 本地开发指南

更新日期：2026-09-27  
适用系统：Windows 11 x64  
开发依赖：Node.js 24、pnpm 11.8.0（通过 Corepack 管理）

---

## 1. 环境准备

1. **安装 Node.js 24**（推荐 LTS 或 v24.x 官方安装包）。
2. **激活 Corepack 并锁定 pnpm**：
   ```powershell
   corepack prepare pnpm@11.8.0 --activate
   ```
3. **获取源码与子模块**：
   本项目包含用于 AI 候选推理的 `third_party/reasonix` 子模块，建议在克隆时递归同步：
   ```powershell
   git clone --recurse-submodules https://github.com/PanGucheng/robotdog-studio.git
   cd robotdog-studio
   ```
   若已经克隆主仓库，请在根目录同步子模块：
   ```powershell
   git submodule update --init --recursive
   ```

---

## 2. 依赖安装与运行时初始化

在仓库根目录执行：

```powershell
# 1. 安装项目依赖
corepack pnpm install

# 2. 准备 Reasonix 运行时（解压本地受控二进制工具）
corepack pnpm reasonix:prepare
```

`reasonix:prepare` 脚本会自动检测并在 `resources/tools/` 下就绪经过哈希校验的 Reasonix 执行文件，用于本地隔离沙盒的 AI 代码生成与诊断。

---

## 3. 启动开发模式

RoboHorse Studio 在同一套工程中维护了三个互为隔离的教学发行版（Editions）。通过环境变量 `ROBOTDOG_EDITION` 区分：

### 3.1 趣味巡线版 (`fun-line-following`)
面向中小学机器马控制与巡线竞技：
```powershell
corepack pnpm dev:fun
```

### 3.2 CH32 单片机入门版 (`mcu-foundations`)
面向大学低年级嵌入式与 RISC-V 裸机开发课程：
```powershell
corepack pnpm dev:mcu
```
*提示：亦可直接双击根目录脚本 `start-mcu-dev.cmd` 启动。*

### 3.3 TI MSPM0 教学版 (`ti-mspm0-foundations`)
面向基于 ARM Cortex-M0+ 与 TI SysConfig 的单片机课程：
```powershell
corepack pnpm dev:ti
```
*提示：亦可直接双击根目录脚本 `start-ti-mspm0-dev.cmd` 启动。*

---

## 4. 开发工作流与热重载

工程使用 `electron-vite` 进行多进程开发管理：
- **Renderer（React + Tailwind + Monaco Editor）**：修改前端组件或样式时，Vite 提供毫秒级 HMR（热模块替换），无需重启应用；
- **Main / Preload（Node.js / TypeScript）**：修改主进程服务、IPC 通道或 Preload 桥接接口时，`electron-vite` 会自动重新编译并重启 Electron 实例；
- **课程资源修改**：修改 `resources/courses/` 下的课次或讲义后，在应用内刷新或切换课次即可重新加载。
