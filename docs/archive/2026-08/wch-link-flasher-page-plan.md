# RobotDog Studio WCH-Link 烧录器页面开发计划

更新日期：2026-07-09

## 1. 现场验证结论

用户已在本机执行以下只连接检测：

```powershell
.\vendor\wch\OpenOCD\OpenOCD\bin\openocd.exe `
  -f .\vendor\wch\OpenOCD\OpenOCD\bin\wch-riscv.cfg `
  -c init -c halt -c "flash banks" -c exit
```

关键输出：

- OpenOCD：`0.11.0+dev-snapshot (2026-03-12-15:20)`；
- 探针：`WCH-LinkE mode:RV version 2.18`；
- 初始化：`wlink_init ok`；
- 速度：`clock speed 6000 kHz`；
- 目标：`Examined RISC-V core; found 1 harts`；
- 目标已识别：`Target successfully examined`；
- GDB 端口：`3333`。

这说明本机内置 WCH OpenOCD、WCH-LinkE、目标板供电和调试连接已经基本打通。当前输出中的 `flash banks` 大小仍为 `0x00000000`，因此正式写入前还需要通过真实 `program ... verify` 路径验证 OpenOCD 配置、目标 Flash 映射和产物格式。

## 2. 产品方向调整

此前计划中，WCH-Link 主要作为“教师模式救砖”入口。现在调整为：

```text
编写代码
  → 修改确认
  → 编译 / 烧录
  → 烧录器烧录
```

“烧录器烧录”成为和“编写代码”“修改确认”“编译 / 烧录”同级的工作台页面，不依赖教师模式显示。

页面定位：

- 面向教师、社团教练、能力较强的学生和调试阶段开发者；
- 用 WCH-Link 将当前已生成的固件写入 CH32V203；
- 替代手敲 OpenOCD 命令；
- 不取代未来的板载串口 IAP 下载。串口 IAP 仍是面向普通学生的日常下载方式；
- WCH-Link 页面可以常驻可见，但必须有清晰的安全提示和最终确认，因为它会直接覆盖芯片程序。

## 3. 功能边界

### 3.1 首版要做

1. 新增同级页面：“烧录器烧录”。
2. 使用内置 `vendor/wch/OpenOCD/OpenOCD/bin/openocd.exe`。
3. 使用内置 `vendor/wch/OpenOCD/OpenOCD/bin/wch-riscv.cfg` 作为首版配置。
4. 支持“检测烧录器与芯片”。
5. 支持选择当前工作区最新、未过期的完整构建产物。
6. 首选烧录 `.hex`，因为 HEX 自带地址信息；在固件分区最终确认前不默认烧录裸 `.bin`。
7. 执行真实 OpenOCD 写入、校验和复位。
8. 解析 OpenOCD 输出，给出中文状态、进度和失败原因。
9. 保存烧录记录：工作区、构建证明、产物哈希、OpenOCD 版本、探针版本、开始/结束时间和结果。
10. 原始 OpenOCD 日志默认折叠，供调试时展开。

### 3.2 首版不做

1. 不允许 AI 自动触发烧录。
2. 不允许 Renderer 传入任意 OpenOCD 命令。
3. 不允许输入任意地址烧录 `.bin`。
4. 不做量产批量烧录。
5. 不做选项字节、读保护、擦整片等危险功能。
6. 不把 WCH-Link 烧录结果伪装成真机运动验收。
7. 不在普通“生成程序”后自动烧录；烧录必须由用户在页面中明确点击。

## 4. 页面设计

页面名称建议使用：“烧录器烧录”。

副标题：

> 用 WCH-Link 把当前程序写入小马。适合调试、首次写入和串口下载不可用时使用。

页面采用四段式任务轨道：

```text
[1 连接烧录器] → [2 识别芯片] → [3 选择当前程序] → [4 写入并校验]
```

这条轨道是页面的记忆点：像一排维修台指示灯，学生和老师能一眼知道自己卡在哪一步。视觉上应避免做成终端窗口，终端日志只放在“技术细节”里。

### 4.1 页面布局

```text
┌──────────────────────────────────────────────────────────┐
│ 烧录器烧录                                                │
│ WCH-Link 已连接时，可以把当前生成的程序写入 CH32V203。     │
├──────────────────────────────────────────────────────────┤
│ ① 连接烧录器  ② 识别芯片  ③ 当前程序  ④ 写入校验          │
├───────────────────────┬──────────────────────────────────┤
│ 探针与芯片状态         │ 当前可烧录程序                    │
│ - WCH-LinkE RV 2.18    │ RobotDog.hex                      │
│ - CH32V203 / RISC-V    │ 对应工作区、存档、SHA、生成时间     │
│ - 已暂停 / 已复位      │ 是否过期、是否匹配当前工作区        │
├───────────────────────┴──────────────────────────────────┤
│ [检测烧录器与芯片] [写入当前程序] [停止/查看日志]           │
├──────────────────────────────────────────────────────────┤
│ 中文结果卡 / 错误原因 / 下一步建议                         │
│ 技术细节：OpenOCD 原始日志，可复制                         │
└──────────────────────────────────────────────────────────┘
```

### 4.2 文案原则

- 按用户认识命名：说“烧录器”“芯片”“当前程序”，少说 `adapter`、`target`、`flash bank`。
- 危险操作说清结果：按钮使用“写入当前程序”，确认文案说明“会覆盖芯片中现有程序”。
- 报错给下一步：例如“没有识别到 WCH-Link，请检查 USB 线、驱动和烧录器模式”。
- 技术细节保留但不抢戏：OpenOCD 原始日志进入折叠区，便于开发者复制给我继续排查。

## 5. 后端架构

新增真实服务，不复用当前模拟恢复服务：

- `WchLinkFlashService`
  - 管理探针检测、烧录、校验、复位和状态快照；
  - 保证同一时间只有一个 OpenOCD 操作；
  - 和现有完整固件构建服务互斥，避免一边生成一边烧录旧产物。

- `OpenOcdRunner`
  - 使用 `child_process.spawn`，以参数数组调用 OpenOCD，不拼接 shell 字符串；
  - 捕获 stdout/stderr；
  - 支持超时、进程退出码和日志限长；
  - 将常见英文错误映射为中文问题。

- `FirmwareArtifactSelector`
  - 只选择当前工作区、当前提交、当前固件基线下的未过期产物；
  - 首版优先返回 `hex`；
  - 若只有 `bin`，页面提示“当前版本暂不直接烧录 BIN，请重新生成 HEX 或等待分区地址确认”。

- `FlashHistoryService`
  - 写入用户数据目录；
  - 记录烧录结果、产物哈希、OpenOCD 输出摘要和失败原因；
  - 不修改学生 Git 工作区。

## 6. IPC 设计

新增频道：

- `wchlink:get`
- `wchlink:probe`
- `wchlink:flash`
- `wchlink:cancel`
- `wchlink:event`
- `wchlink:history:list`

Renderer 只能传：

- `workspaceId`
- `artifactId` 或由 Main 根据当前工作区自动选择
- 枚举动作：`probe` / `flash-current` / `cancel`

Renderer 不能传：

- OpenOCD 可执行文件路径；
- OpenOCD 配置路径；
- 任意命令字符串；
- 任意固件绝对路径；
- 任意烧录地址。

所有 IPC 参数继续使用 Zod 或等价校验。失败时返回结构化错误，不向界面直接抛出裸异常。

## 7. 状态模型

新增 `WchLinkFlashSnapshot`：

```ts
type WchLinkFlashState =
  | 'idle'
  | 'probing'
  | 'target_ready'
  | 'artifact_missing'
  | 'confirming'
  | 'flashing'
  | 'verifying'
  | 'resetting'
  | 'completed'
  | 'failed'
  | 'cancelled'
```

关键字段：

- `state`
- `progress`
- `message`
- `canCancel`
- `probe`
  - `openocdVersion`
  - `adapterName`
  - `adapterVersion`
  - `targetExamined`
  - `xlen`
  - `misa`
  - `flashBanks`
- `artifact`
  - `name`
  - `kind`
  - `bytes`
  - `sha256`
  - `workspaceId`
  - `workspaceCommit`
  - `firmwareBaselineId`
  - `stale`
- `logs`
- `error`
- `startedAt`
- `completedAt`

## 8. OpenOCD 命令策略

### 8.1 探测命令

首版探测命令：

```text
openocd.exe
  -f vendor/wch/OpenOCD/OpenOCD/bin/wch-riscv.cfg
  -c init
  -c halt
  -c "flash banks"
  -c exit
```

成功判断：

- 退出码为 0；
- 输出包含 `wlink_init ok`；
- 输出包含 `Target successfully examined` 或等价目标识别信息；
- 能解析到 WCH-Link 模式和版本。

### 8.2 烧录命令

首版烧录优先使用当前构建的 `.hex`：

```text
openocd.exe
  -f vendor/wch/OpenOCD/OpenOCD/bin/wch-riscv.cfg
  -c init
  -c halt
  -c "program <RobotDog.hex> verify reset exit"
```

实现时必须用 `spawn(file, args)` 传参，并对 `<RobotDog.hex>` 做 OpenOCD 命令内引用转义。不能用 shell 字符串拼接。

若后续固件基线确认了 APP 起始地址，也可以增加受控 BIN 烧录：

```text
program <RobotDog.bin> <APP_START_ADDRESS> verify reset exit
```

但 APP 地址必须来自已校验的 `robotdog.firmware.json`，不能由用户在界面手填。

## 9. 安全策略

虽然页面不再隐藏在教师模式，但仍要保留以下安全边界：

1. “写入当前程序”前必须先完成探针检测。
2. 固件产物必须是当前工作区最新完整构建结果，旧产物显示“已过期”，按钮禁用。
3. 烧录前弹出一次明确确认：
   - 将写入哪个文件；
   - 文件大小和哈希；
   - 对应哪个学生对话/存档；
   - 会覆盖芯片中现有程序；
   - 烧录中不要断电或拔线。
4. AI 对话和候选修改流程不能调用 `wchlink:flash`。
5. 烧录进行中锁定构建、应用候选和工作区撤销。
6. 擦除/写入/校验阶段不提供“强行取消”按钮，只提示等待当前关键步骤结束。
7. OpenOCD 超时后进入失败状态，并提示重新检测，不自动重试写入。
8. 所有烧录记录进入本机历史，便于追踪课堂中哪份程序写入过哪次。

## 10. 错误映射

首版至少覆盖：

| OpenOCD 现象 | 界面中文解释 | 下一步 |
|---|---|---|
| 找不到 openocd.exe | 内置 WCH OpenOCD 不完整 | 重新安装或检查打包资源 |
| 未出现 `wlink_init ok` | 没有识别到 WCH-Link | 检查 USB、驱动、WCH-Link 模式 |
| `Target not examined` | 烧录器连上了，但没有识别到芯片 | 检查目标板供电、GND、SWDIO、SWCLK、NRST |
| 退出码非 0 且 verify 失败 | 写入后校验失败 | 不要继续比赛，重新检测并再次烧录 |
| 进程超时 | OpenOCD 长时间没有响应 | 断开重连 WCH-Link 和目标板后重试 |
| 产物过期 | 当前程序不是最新代码生成的 | 先回到“编译 / 烧录”重新生成程序 |

## 11. 实施顺序

### H1：计划与契约

- 新增本计划文档；
- 明确 WCH-Link 页面从“教师隐藏恢复”调整为同级页面；
- 不修改现有功能代码。

建议提交：`docs: plan wch-link flasher page`

### H2：共享类型与 IPC 骨架

- 在 `src/shared/channels.ts` 增加 WCH-Link 频道；
- 在 `src/shared/types.ts` 增加 `WchLinkFlashSnapshot`、事件和 API 类型；
- 在 `src/preload/index.ts` 暴露只读快照、探测、烧录、取消和事件订阅；
- 增加类型测试或编译校验。

建议提交：`feat: add wch-link ipc contract`

### H3：OpenOCD Runner 与探测服务

- 新增 `OpenOcdRunner`；
- 新增 `WchLinkFlashService.probe()`；
- 解析用户本次输出中已验证过的关键信息；
- 用 fixture 测试成功、未连接、目标未识别、超时和退出码失败；
- 暂不烧录。

验收：

- 点击“检测烧录器与芯片”能复现命令行检测结果；
- 页面能显示 `WCH-LinkE RV 2.18` 和目标已识别；
- 失败时有中文下一步。

建议提交：`feat: detect wch-link probe from studio`

### H4：同级页面 UI

- 在 `Workbench` 标签中加入“烧录器烧录”；
- 新增 `WchLinkFlasherPanel`；
- 使用四段任务轨道、状态卡、当前程序卡、确认区和折叠技术日志；
- 页面可在非教师模式打开；
- 没有当前构建产物时，引导回“编译 / 烧录”。

验收：

- 1024px 宽度下关键按钮不被裁切；
- 2K 屏幕下字体和按钮大小符合当前 UI 缩放设置；
- 技术日志可复制，但默认不压过学生操作信息。

建议提交：`feat: add wch-link flasher workspace page`

### H5：当前固件产物选择

- 从完整构建服务读取当前工作区的最新产物；
- 判断产物是否与当前 `workspace.headCommit`、`firmwareBaselineId` 和构建证明匹配；
- 优先选择 `.hex`；
- 显示文件名、大小、生成时间、SHA-256、对应工作区和是否过期。

验收：

- 修改代码后旧产物立即显示“已过期”；
- 重新生成程序后烧录按钮恢复可用；
- 没有 HEX 时不猜测 BIN 地址。

建议提交：`feat: select verified firmware artifact for wch-link flashing`

### H6：真实烧录与校验

- 实现 `WchLinkFlashService.flashCurrent()`；
- 烧录前做一次快速 probe；
- 使用 `program <hex> verify reset exit`；
- 解析阶段日志并更新 `flashing/verifying/resetting/completed`；
- 保存烧录记录；
- 失败时保留原始日志摘要。

验收：

- 能把当前 `RobotDog.hex` 通过 WCH-Link 写入目标板；
- OpenOCD `verify` 通过后页面显示完成；
- 复位后可重新 probe；
- 校验失败时页面明确阻止显示“成功”。

建议提交：`feat: flash current firmware with wch-link`

### H7：自动化与真机验收清单

- 单元测试覆盖 OpenOCD 输出解析；
- 服务测试覆盖并发互斥、过期产物拒绝、取消边界和失败映射；
- Electron smoke 覆盖页面加载和无硬件状态；
- 真机手测记录：
  1. WCH-Link 未连接；
  2. 仅连接 WCH-Link、不接目标板；
  3. 目标板未供电；
  4. 正常 probe；
  5. 正常烧录；
  6. 烧录后复位；
  7. 烧录错误固件被拒绝或失败可解释。

建议提交：`test: cover wch-link flashing workflow`

## 12. 与现有计划的关系

本计划不废弃“蓝牙调试 + 板载串口 IAP + WCH-Link 兜底”的总体方向，而是调整产品优先级：

- 现在先把 WCH-Link 真实烧录做成可用页面，方便当前硬件联调；
- 普通学生长期路径仍建议走板载串口 IAP，减少接线和误操作；
- WCH-Link 页面不再依赖教师模式显示，但仍是“高级/维护型”操作；
- 未来 IAP 完成后，“编译 / 烧录”页可继续服务学生一键下载，“烧录器烧录”页服务首次写入、开发调试和救砖。

## 13. 开始实施前的开放问题

这些问题不阻塞 H2/H3/H4，但会影响 H6 真烧录稳定性：

1. 当前生成的 `RobotDog.hex` 是否是完整镜像，还是仅 APP 镜像？
2. 若未来存在 Bootloader，WCH-Link 页面默认烧录完整出厂镜像还是学生 APP 镜像？
3. CH32V203 具体容量型号和 Flash 分区是否已经最终确认？
4. 烧录后是否能通过蓝牙或串口读取固件版本，用于“写入后验证运行”？
5. 是否需要支持选择外部 HEX 文件，还是首版只允许烧录当前工作区产物？

建议首版答案：

- 首版只烧录当前工作区生成的 HEX；
- 不开放外部文件选择；
- 不开放 BIN 地址输入；
- 烧录成功以 OpenOCD verify 为准；
- 真机运行验证留到蓝牙/串口协议稳定后追加。
