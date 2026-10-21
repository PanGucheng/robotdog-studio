# TI MSPM0G3507 烧录校验超时修复

日期：2026-10-21。适用于 TI 1.2.1 中写入结束后出现以下日志的情况：

```text
** Programming Finished **
** Verify Started **
Error: timed out while waiting for target halted
Error: [mspm0x.cpu] error executing cortex_m crc algorithm
Error: checksum mismatch - attempting binary compare
** Verify Failed **
```

## 原因与实测

内置 OpenOCD `d9b957f` 的通用 `target/ti/mspm0.cfg` 默认将工作区设为 `0x20000000`。MSPM0G3507 实际 SRAM 位于 `0x20200000`，见 [TI 数据手册内存映射](https://www.ti.com/lit/gpn/MSPM0G3507)。OpenOCD 在工作区写入并运行 CRC 校验辅助代码，使用错误地址会引发芯片端算法超时。参考 [该版本 OpenOCD CRC 实现](https://github.com/openocd-org/openocd/blob/d9b957f/src/target/armv7m.c)。

维护者允许读取当前连接板子的 Flash 并校验。本轮没有重新编程、擦除 Flash 或修改 NONMAIN：

- 从地址 0 读回 672 字节，与出错工程的 BIN 逐字节对应的 SHA-256 相同：`939dee188ca5dcbf0f9ff5a0778f4f13ab4bbdaa7da7104f89d32fda049d4118`。
- 保持同一 CMSIS-DAPv2、同一 4000 kHz 速度，只修正工作区地址，执行 `verify_image`：672 字节校验通过，耗时约 0.010 秒。
- 因此这次日志来自校验工作区配置错误；没有观察到 Flash 文件内容不一致。其他实际供电、连线或数据不一致故障仍须按各自日志判断。
- 调试读回和校验会暂停内核；本轮结束后保持暂停。维护者可按开发板复位键重新运行已有固件。

## 源码修复

TI 烧录服务在载入目标配置之前显式传入 `set WORKAREABASE 0x20200000`，保留完整 `program ... verify` 和成功后的复位流程。退出命令使用 `shutdown`。芯片端 CRC 算法失败会显示相应诊断，不再只提示检查电源和连线。

三份相关测试文件共 6 项通过，覆盖 SRAM 配置顺序、完整校验、CRC 超时与真实校验失败；Main / Renderer 类型检查通过。此次不是新版本发布，没有替换远程安装包或更新软件清单。

## 已安装 TI 1.2.1 的本地修复

关闭 Studio，在 PowerShell 运行下列命令，将路径替换为含 TI Studio EXE 和 `resources` 文件夹的实际目录。若安装在受保护目录，使用管理员 PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\RobotDog\RobotDog_Studio\scripts\repair-ti-mspm0-verify.ps1" -StudioDirectory "D:\实际安装目录"
```

脚本校验 TI 工具链身份和原始设置，在配置旁保存原始字节备份，只把默认工作区地址改为 `0x20200000`；重复运行不会重复修改。重新打开 Studio 后重试正常烧录，校验功能仍保留。

此脚本未自动应用到任何现有安装目录。远程 1.2.1 安装包保持原样，重新安装该包会恢复原始配置；未来正式版本应使用源码修复重新构建。三个工程共用该烧录服务，但此次只读硬件校验针对上述 672 字节 LED 工程，未冒充三类固件均已重新烧录通过。
