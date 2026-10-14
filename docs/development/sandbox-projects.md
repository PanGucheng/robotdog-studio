# 自由工程的文件编辑与构建


## 创建时选择工程类型

沁恒、TI 的“自由练习”页都提供两个入口：**基础 SDK 空工程**与**完整小马例程**。侧栏的新建工程入口先进入这个选择页。工程类型在创建后固定，已有课程与自由工程不会被替换为另一模板。

| 平台 | 基础 SDK 空工程 | 完整小马例程 |
| --- | --- | --- |
| 沁恒 CH32V203 | `ch32v203-sdk-empty`，入口 `App/Src/main.c`；WCH Core、Peripheral、启动、时钟、链接和 CMake；不含小马业务 | 原有 `ch32v203-pony` / Pony v2.5，入口 `App/Src/experiment.c` |
| TI MSPM0G3507 | `ti-mspm0g3507-sdk-empty`，入口 `src/main.c`；最小 SysConfig 初始化与空循环 | `ti-mspm0g3507-pony` / 0.2.5-ti.1，包含协议、运动、舵机、OLED 和安全逻辑 |

TI 两种新工程使用根目录的 `board.syscfg`；旧 GPIO 工程仍使用 `gpio_toggle_output.syscfg`。Studio 的 SysConfig 按钮自动打开对应文件并加载固定 SDK 产品元数据。TI DriverLib/CMSIS 来自固定 SDK 工具链，不复制整个 SDK；项目自己的启动、链接、SysConfig、生成配置、源码、头文件和文档都在工程文件树中显示。首次构建可重新生成模板自带配置；学生手改过的生成文件继续保留。

TI 小马模板来源为独立交付的 `mspm0g3507_pony`，不再使用 GPIO 闪灯例程冒充完整工程。它尚未做实板验收，不支持 CCD 巡线或 IAP；软件编译通过不能代表舵机及机械动作验证通过。模板资源和相应基线登记纳入安装资源配置，本次不构建或发布新安装包。

新模板位于 `resources/workspace-templates/`，登记位于 `resources/firmware-baselines/`。它们使用独立身份与内容摘要；SDK 空工程不会合并完整小马业务文件。修改这些模板资源后需同步登记中的完整性摘要。课程模板和 Content Update 更新源保持原状。

验证命令：`pnpm exec vitest run src/main/services/sandbox-template-integration.test.ts`。测试创建并重新打开三种新模板，核对实际文件树，使用本机工具链构建，在子目录添加 C/H 模块并引用，故意加入编译错误后恢复；全程不烧录。没有本机工具链时仅验证文件结构。

沁恒和 TI 的 `mcu-sandbox` 自由工程拥有独立工程副本。学生可以编辑工程中的源码、头文件、启动代码、链接脚本、构建配置、SysConfig、说明文档及其他 UTF-8 文本文件。编辑内容只写入当前 Workspace，不修改共享固件基线或 SDK。

文件浏览器不开放 Git 数据、软件内部权限配置、运行时元数据和构建缓存。二进制文件与超过 2 MiB 的文件不进入文本编辑器。自由工程支持新建文本文件和文件夹，暂不提供删除、重命名、移动或导入。

新自由工程创建时复制绑定的固件基线，模板中的现有文件优先保留。旧自由工程首次访问时补齐缺失文件并建立 Git 检查点，保留学生已有内容；存在未提交修改或活动 AI 草稿时暂缓补齐，工程仍可访问，处理完成后再次访问时补齐。迁移完成记录保存在工程外的 `sandbox-project-v1.json`。课程工程 `mcu-lesson-attempt` 继续采用课程声明的编辑白名单。

沁恒构建从当前自由工程复制源码到暂存区，使用学生编辑的 CMake 工程、启动文件、链接脚本和驱动。TI 自由工程编译 `src` 下的 C 源码、工程内的 `gcc/startup_mspm0g350x_gcc.c` 和 `gcc/device_linker.lds`。工具链版本和目标芯片仍由发行版确定。

TI 的 SysConfig 输出先生成到构建缓存，再与工程中的 `generated/` 合并：未手改的文件可以更新，手改文件保留并在构建日志中说明。生成基准摘要保存在构建缓存的 `<workspaceId>.sysconfig.json`；没有基准记录时保守保留已有生成文件。因此手改生成代码后再修改 `.syscfg`，需自行同步被保留的文件。

学生保存建立 Git 检查点，包含原先被 Git 忽略的生成代码；修改后旧固件不能直接烧录，需要重新编译。

验证命令：`pnpm test`、`pnpm build`、三个 Edition 的 Electron smoke。MCU/TI smoke 会创建并引用子目录中的 C 模块和头文件，故意在新增源码中加入编译错误，确认实际参与构建，恢复后再次构建；RHS 集成测试覆盖直接 GCC 路径；TI 额外检查生成代码手改后不会被覆盖。测试不执行烧录。

## 新建文件与文件夹

在自由工程文件树的目标文件夹上右键，选择“新建文件”或“新建文件夹”；工程根目录同样支持右键。在该目录下出现的输入框中输入单个名称，按 Enter 创建，Esc 取消。新建不使用顶部按钮或弹窗；创建嵌套结构时先逐级创建文件夹。新建前会等待当前编辑保存，保存失败不继续创建。编译、烧录、AI 草稿活动及安装交接期间不能新建。

新 `.h` 包含 `#pragma once`，`.c` 和其他文本文件初始为空，不生成 `main()`。文件创建后立即打开；目录创建后保留当前编辑内容。空文件夹使用隐藏的 `.gitkeep` 建立 Git 检查点，重新打开仍然显示；该名称保留给服务使用。重名（含大小写差异）、非法 Windows 名称及内部目录被拒绝，不覆盖任何已有内容。

沁恒自动编译 `App/Src/**/*.c`，TI 自动编译 `src/**/*.c`。沁恒 Pony 的递归源码接入仅写入构建暂存副本，不改学生 CMake 或共享基线。其他目录中的源码需自行按构建规则接入。头文件子目录使用相对包含路径，不自动把每个子目录加入 include 搜索范围。

例如沁恒创建 `App/Src/modules/helper.h` 和 `helper.c`，TI 创建 `src/modules/helper.h` 和 `helper.c`：

```c
// modules/helper.h
#pragma once
int Helper(void);
```

```c
// modules/helper.c
#include "helper.h"
int Helper(void) { return 7; }
```

在沁恒 `App/Src/experiment.c`（基础空工程为 `App/Src/main.c`）或 TI `src/main.c` 中添加 `#include "modules/helper.h"`，在已有初始化或主函数中调用 `(void)Helper();`，保存后重新编译。沁恒使用 `App/Inc/modules/helper.h` 时同样通过 `#include "modules/helper.h"` 引用。

新建失败会报告原因。Git 提交前失败只清理本次创建的条目；提交成功但检查点同步失败会保留文件，重新打开工程，勿重复创建同名文件。
