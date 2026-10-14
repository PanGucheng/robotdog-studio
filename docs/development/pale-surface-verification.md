# 浅色底色微调

日期：2026-10-14。按用户最新三张截图反馈调整，承接[全软件底色统一](surface-system-verification.md)。软件版本保持 1.1.0，课程、布局和教学功能不变；深色模式尚未在本次微调中实施。

## 当前规则

- 公共导航浅蓝灰从 `#EAF2F6` 调整为 `#F2F8FB`。红、绿通道更接近蓝通道，减弱灰感；更接近白色，减小大面积色差。
- 文件树、树标题与底部安全说明统一为 `#FFFFFF`。普通与抽屉布局共享规则，覆盖 MCU/TI 课程和自由工程、复用该组件的 Fun 页面。
- 课程中心课次列表和讲义目录统一白色，章节进度圆点的遮罩边框同步白色，避免留下旧底色边缘。
- 设置顶部改为新的导航浅蓝灰；设置分类侧栏也读取同一 Token，正文保持白色。
- 页面外围 `#F5F8FA`、主文字 `#142F46`、次级文字 `#526B7A`、选中底色 `#DFF3F6`、悬停底色 `#DCEAF0` 保留。区域边界由细线表达，选中、悬停与键盘焦点仍可辨认。

颜色只在 `src/shared/studio-theme.ts` 修改；Electron 原生按钮区和 renderer 标题栏、顶部导航一起读取新值。`styles.css` 调整对应区域的表面角色，视觉脚本的角色断言同步更新，没有新增独立调色板。

## 验证与原图

通过隔离用户数据的隐藏 Electron 窗口检查，不操作用户桌面。原图由 `webContents.capturePage` 直接保存为无损 PNG，没有缩小；采集前刷新合成帧。界面缩放通过真实设置按钮切换，窗口尺寸、DPI 和比例记录在 JSON 中。

- 类型检查与生产构建通过；视觉脚本语法检查通过。
- MCU、TI 隐藏窗口视觉复验通过，分别检查 25/23 个截图场景、24/23 组布局、36/34 组底色。覆盖普通和窄窗口、100%～175% 缩放、课次列表、讲义目录、工作台、AI 浮窗和设置分类。代表性小字最低实测对比度仍为 4.89:1；导航 hover、键盘焦点和状态样式检查通过。
- Fun 完整视觉检查两次在等待 Monaco 代码行渲染时超时，尚未完成。设置与关于存在此前已记录的 `course:update-status:get` 未注册日志。本次不把未完成的检查报告为通过，也不为配色微调改动编辑器加载逻辑。
- 本次仅修改颜色与区域表面，没有重跑固件构建、硬件和发布验收。未操作用户桌面，原生窗口按钮仍需手动验收。

已人工查看原始工作台、讲义和设置截图，白色侧栏、浅蓝灰标题及选中状态符合预期。保留 9 张相关原图及两份完整样式/布局记录；JSON 的 `totalCaptured` 记录全部采集数，`screenshots` 只列本次保留文件。

| 场景 | 当前原图 |
| --- | --- |
| MCU 课程中心 | [课程中心](assets/pale-surface-20261014/mcu/after-course.png) |
| MCU 工作台白色文件树 | [工作台](assets/pale-surface-20261014/mcu/after-workbench.png) |
| MCU 白色讲义目录 | [讲义](assets/pale-surface-20261014/mcu/after-reader.png) |
| 设置浅蓝灰顶部 | [设置](assets/pale-surface-20261014/mcu/after-settings.png) |
| 175% 窄窗口 | [文件抽屉](assets/pale-surface-20261014/mcu/after-workbench-narrow-files.png)、[设置](assets/pale-surface-20261014/mcu/after-settings-narrow.png) |
| TI | [工作台](assets/pale-surface-20261014/ti/after-workbench.png)、[讲义](assets/pale-surface-20261014/ti/after-reader.png)、[设置](assets/pale-surface-20261014/ti/after-settings.png) |

旧的 67 张截图仍保留在 `assets/surface-system-20261014/`，代表调整前的配色。上述调整在实现验收时尚未提交或更新安装包，现纳入 1.2.0 发版范围；正式上线结果以公开 App Update 清单为准。
