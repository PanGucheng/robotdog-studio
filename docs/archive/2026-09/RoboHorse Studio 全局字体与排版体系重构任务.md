请对 `PanGucheng/robotdog-studio` 当前 `main` 分支进行一次完整但克制的 Typography Refactor。

本任务只调整字体体系、字号、字重、字距、行高以及与字体直接相关的少量间距，不重做 UI，不改变品牌配色，不调整业务布局，不修改任何功能逻辑。

## 一、任务背景

当前 RoboHorse Studio 已经形成较明确的视觉语言：

- 深蓝顶部品牌区；
- 浅灰 / 白色主体工作区；
- 青蓝色交互强调；
- 新 RoboHorse 小马品牌标识；
- 圆角卡片、细边框、轻阴影；
- 面向大学生的机器人与单片机教学软件。

但目前字体体系仍主要依赖：

`Microsoft YaHei UI`

标题大量使用：

`Bahnschrift + Microsoft YaHei UI`

同时 CSS 中存在较多：

`font-weight: 650 / 680 / 750 / 800`

以及大量：

`12px + 高字重`

的问题。

Bahnschrift 本身没有中文字形，因此中文标题最终仍会 fallback 到 Microsoft YaHei UI。当前首页中“今天想从哪里开始？”、“课程学习”、“自由练习”等中文标题视觉上偏厚、偏方、偏紧，与新版 RoboHorse Logo 和当前轻量化 UI 风格不够协调。

本次任务目标是建立统一、现代、友好且保持工程属性的字体系统。

---

## 二、目标字体体系

建立四套明确字体 token：

```css
--font-ui:
  "Inter",
  "Noto Sans SC",
  "Microsoft YaHei UI",
  system-ui,
  sans-serif;

--font-display:
  "Inter",
  "Noto Sans SC",
  "Microsoft YaHei UI",
  system-ui,
  sans-serif;

--font-brand:
  "Bahnschrift",
  "Inter",
  "Noto Sans SC",
  sans-serif;

--font-mono:
  "Cascadia Mono",
  "SFMono-Regular",
  Consolas,
  monospace;
```

职责必须明确：

`--font-brand`
仅用于 RoboHorse Studio 品牌文字等少数品牌场景。

`--font-display`
用于中文页面标题、模块标题、卡片标题、教学标题。

`--font-ui`
用于正文、按钮、导航、说明、表单等普通 UI。

`--font-mono`
仅用于代码、终端、文件名、哈希、版本号、技术状态、技术型英文 eyebrow 等真正需要等宽效果的内容。

不要再让 Bahnschrift 作为中文标题字体。

---

## 三、字体必须随应用稳定提供

不要只简单增加：

```css
"Noto Sans SC"
```

然后依赖用户系统是否安装。

请调查当前 Electron/Vite 构建方式，并实现可重复的字体加载方案，使正式打包后的应用在普通 Windows 环境中也能得到一致字体效果。

优先考虑可靠、可维护、许可证明确的字体集成方式。

目标：

- Inter 可稳定使用；
- Noto Sans SC 可稳定使用；
- 不依赖用户手动安装字体；
- 开发模式与打包版本显示一致；
- 不引入明显不必要的字体体积。

如果字体资源明显增加安装包大小，请选择合理的字重集合而不是盲目打包全部字体。

本项目常用字体只需重点覆盖：

```text
400
500
600
700
```

除非技术原因需要，否则不要引入大量无实际用途的字重。

---

## 四、统一字重体系

全项目字体权重尽量收敛到：

```text
400：正文
500：普通强调、部分按钮
600：标题、重要按钮
700：少数强提醒、关键状态
```

系统性检查并减少目前大量存在的：

```text
650
680
750
760
800
```

尤其避免：

```text
12px + 750/800
```

这种组合。

注意：

不要机械地进行全局文本替换。

例如：

- 警告；
- 急停；
- 强状态；
- 完成状态；
- 特殊工程标记；

仍可以保留较高视觉强调。

应根据语义逐项判断。

---

## 五、建立统一字号层级

请在现有 UI 基础上整理一套稳定的字号体系。

建议参考：

```text
首页 H1            38–42px / 600
页面大标题         24–28px / 600
卡片主标题         18–22px / 600
Section 标题       16–18px / 600
普通正文           14px / 400
按钮               13–14px / 500–600
辅助信息           12–13px / 400–500
Eyebrow            10–11px / 600
Tag / 状态         11–12px / 500–600
代码               12–14px / 400
```

不要求全部页面强行使用完全相同尺寸，但必须建立清晰层级。

重点减少目前全项目大量默认 `12px` 的情况。

教学软件中的说明文字、课程正文、操作说明应优先保证阅读舒适度。

---

## 六、首页必须重点调整

重点检查：

```css
.mcu-home
.mcu-home-hero
.mcu-free-home
.mcu-path-choices
.mcu-home-recent
```

当前：

```css
.mcu-home-hero h1,
.mcu-free-home h1 {
  font: 650 clamp(28px, 3.6vw, 46px)
    "Bahnschrift",
    "Microsoft YaHei UI",
    sans-serif;
  letter-spacing: -.035em;
}
```

建议修改方向：

```css
.mcu-home-hero h1,
.mcu-free-home h1 {
  font-family: var(--font-display);
  font-size: clamp(30px, 3.3vw, 42px);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -0.015em;
}
```

不要求机械复制数值，可以结合实际截图微调，但最终效果必须：

- 中文不再显得厚重；
- 字符间距自然；
- 与 RoboHorse Logo 风格协调；
- 保持页面明确的第一视觉层级。

同时检查：

“课程学习”

“自由练习”

等卡片标题。

建议：

```css
font-family: var(--font-display);
font-size: 21–22px;
font-weight: 600;
line-height: 1.3;
```

避免依赖 `<strong>` 默认粗体。

---

## 七、正文与教学文字调整

重点检查：

- 首页说明文字；
- 卡片说明文字；
- Lesson / Course 页面；
- Learning Center；
- 连续讲义；
- Question / Task；
- AI 助教回答区域；
- 表单输入；
- 空状态说明。

正文原则：

```text
14px 左右
font-weight: 400
line-height: 1.55–1.75
```

课程或连续讲义属于阅读型内容，可以适当比普通工具 UI 更宽松。

不要为了“工程感”把正文继续做得过小。

---

## 八、保留工程感的区域

以下区域不应完全去除 Mono 风格：

- 文件名；
- 工程路径；
- Hash；
- Commit；
- Build 状态；
- 固件信息；
- Terminal；
- Diff；
- 编译日志；
- 数字指标；
- MCU / 芯片型号；
- 技术标签。

例如：

```text
CH32V203
MSPM0G3507
SIMULATION
FREE WORKSHOP
LEARNING PATH
RECENT ACTIVITY
```

这些英文技术标签可以继续使用 `--font-mono`。

但是请适当降低字重。

推荐：

```css
font-size: 10px;
font-weight: 600;
letter-spacing: .08em ~ .11em;
```

Mono 应承担“工程信息”角色，而不是成为普通 UI 的默认字体。

---

## 九、品牌文字保持独立

顶部：

`RoboHorse Studio`

当前效果基本保留。

建议继续使用：

```css
font-family: var(--font-brand);
```

其中：

`RoboHorse`

可以保持约 600。

`Studio`

可以保持约 500，并继续使用现有青蓝品牌色。

不要把 RoboHorse 品牌文字改成 Noto Sans SC。

不要把品牌文字图片化。

---

## 十、重点审查这些现有选择器

请至少完整审查当前 `styles.css` 中涉及以下区域的字体：

- `.brand-block`
- `.section-heading`
- `.assistant-markdown`
- `.course-center-*`
- `.lesson-*`
- `.firmware-*`
- `.wch-*`
- `.diff-*`
- `.history-*`
- `.settings-*`
- `.course-task-*`
- `.learning-*`
- `.mcu-home-*`
- `.mcu-path-*`
- `.mcu-free-*`
- `.mcu-tool-*`
- `.mcu-lab-*`
- `.lecture-*`
- `.mcu-terminal-*`

不要只修改截图中的 MCU 首页。

---

## 十一、不要修改的内容

本任务禁止顺手进行无关视觉重构。

不要修改：

- 页面结构；
- 卡片布局；
- Grid/Flex 主布局；
- 导航结构；
- 课程逻辑；
- 工作区逻辑；
- AI Agent；
- 固件流程；
- 编译流程；
- 烧录流程；
- API；
- IPC；
- 状态管理；
- 当前 Logo；
- 当前品牌颜色体系。

只有字体改变导致非常明显的文字溢出时，才允许进行必要的最小尺寸或间距修正。

---

## 十二、避免字体变化引发 UI 回归

字体切换后重点检查：

- 按钮文字是否溢出；
- 顶栏是否变高；
- 导航是否错位；
- Card 标题是否换行；
- Tag 是否过宽；
- Workspace 名称是否截断异常；
- 表格列宽；
- 课程目录；
- Diff 文件列表；
- 编辑器工具栏；
- 设置页；
- 弹窗；
- Windows 缩放；
- 中文和英文混排。

尤其验证：

```text
100%
125%
150%
175%
```

UI Scale。

不要为了防止个别溢出而重新把整个字体缩小。

---

## 十三、中文排版细节

中文标题不要大幅负 letter-spacing。

原则：

大标题：

```text
-0.015em 左右
```

普通中文：

```text
0
```

英文大标题可酌情更紧。

英文 eyebrow 可以增加字距。

中英文混排时，以中文可读性优先。

---

## 十四、验证页面

开发模式下至少实际检查：

1. MCU 首页。
2. 自由练习首页。
3. 课程首页。
4. Lesson / 连续讲义。
5. 代码工作台。
6. AI 助教区域。
7. Diff 页面。
8. Build / Terminal。
9. 设置页面。
10. 顶栏及 Context Bar。

不要只依赖测试通过判断 UI 正确。

---

## 十五、自动化验证

修改完成后至少运行：

```bash
corepack pnpm typecheck
corepack pnpm test
```

若字体资源或构建配置发生变化，再运行：

```bash
corepack pnpm build
```

如果修改范围稳定且条件允许，最终运行：

```bash
corepack pnpm check
```

不要主动生成 Windows ZIP 或 NSIS 安装包，除非字体打包验证确实需要，或者项目所有者明确要求。

---

## 十六、验收标准

完成后应满足以下结果：

- 中文标题明显比当前微软雅黑 UI 风格更轻盈、更现代；
- “今天想从哪里开始？”不再有厚、方、紧的感觉；
- “课程学习 / 自由练习”等入口标题层级明确但不过粗；
- 普通正文阅读舒适；
- RoboHorse Studio 品牌文字保持现有识别度；
- 技术区域仍保留适当工程感；
- Mono 字体不再被滥用；
- 全项目字号和字重层级更加统一；
- 不影响功能；
- 不破坏现有布局；
- 高 DPI 与 UI Scale 下没有明显回归；
- 开发版与正式构建字体显示一致。

---

## 十七、完成后提交报告

完成后请提供：

1. 修改文件列表；
2. 新增字体依赖或字体资源列表；
3. 字体 token 最终定义；
4. 哪些区域使用 Brand / Display / UI / Mono；
5. 清理了哪些不合理的 650/680/750/800；
6. 哪些 12px 文本被调整；
7. 字体资源对构建体积的影响；
8. UI Scale 验证结果；
9. `typecheck / test / build / check` 结果；
10. 实际首页、课程页和工作台的视觉变化说明。

如果实施过程中发现个别页面依赖旧字体尺寸才能维持布局，请不要偷偷缩小字体，请记录该问题并做最小的布局兼容调整。