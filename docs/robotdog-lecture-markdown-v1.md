# RobotDog Lecture Markdown v1

## 1. 定位

RobotDog Lecture Markdown v1 是课程作者使用的受控 Markdown 方言。它属于课程数据，不是可执行代码，也不是 React 组件系统。

```text
CommonMark
+ 必要 GFM
+ 数学公式
+ 窄化稳定章节 ID
+ RobotDog 白名单 Directive
```

禁止 Front Matter、Raw HTML、MDX、JSX、JavaScript、ESM、任意组件、任意属性和课程必需的远程资源。

## 2. 章节

正式章节使用 H2，并必须在标题末尾声明稳定 ID：

```markdown
## 函数声明 {#function-declaration}
```

可被引用的 H3 也必须声明 ID：

```markdown
### 声明中的参数 {#declaration-parameters}
```

ID 必须匹配：

```text
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

禁止通用 Markdown Attribute：

```markdown
## 标题 {.red}
## 标题 {style="color:red"}
```

发布后的 `sectionId` 是课程稳定接口。标题文字可以修改，但 ID 不应因润色而改变。

## 3. 普通 Markdown

允许段落、粗体、斜体、删除线、有序/无序列表、引用、行内代码、fenced code、GFM 表格、内部章节链接和本地图片。

内部章节链接：

```markdown
回到[函数声明](#function-declaration)。
```

外部参考只允许 HTTPS。远程图片和课程必需的远程内容不允许。

## 4. 数学

行内数学：

```markdown
定时器时钟频率记为 $f_{clk}$。
```

块级数学：

```markdown
$$
D = \frac{T_{on}}{T}
$$
```

数学渲染器必须使用非信任模式，禁止外链、外部资源、HTML 和样式注入。无效公式安全降级为源码。

## 5. 图片

图片必须位于当前讲义的 `assets` 目录：

```markdown
![GPIO 输出结构](./assets/gpio-output.svg)
```

允许 PNG、JPEG、SVG。禁止绝对路径、`..`、`file:`、Data URL 和远程图片。SVG 只作为受控图片显示，不能 inline 注入 DOM。

## 6. 教学 Directive

允许五种教学块：

```markdown
:::concept[函数声明]
函数声明告诉编译器函数名称、参数和返回类型。
:::
```

```markdown
:::note
头文件也可以包含类型定义和宏定义。
:::
```

```markdown
:::tip
看到多个错误时，先处理第一条有效错误。
:::
```

```markdown
:::pitfall[声明和定义不一致]
函数声明和定义的参数类型必须一致。
:::
```

```markdown
:::safety[接线前断电]
改变外部接线前，请关闭开发板和执行器电源。
:::
```

教学块不允许属性。v1 不允许任何 Directive 嵌套。

## 7. Studio 交互 Directive

定位真实工程文件：

```markdown
::code-target[打开 number_tools.c]{path="App/Src/number_tools.c"}
```

可选行号：

```markdown
::code-target[查看辅助函数]{path="App/Src/number_tools.c" line="12"}
```

`path` 是主要身份，`line` 只是定位提示。最终浏览权限由 Project Explorer 决定。

定位当前 Lesson 已存在的任务：

```markdown
::task-link[开始实现辅助函数]{step="implement-helper"}
```

`task-link` 只定位任务，不完成任务。

## 8. 白名单

唯一合法 Directive：

```text
concept note tip pitfall safety code-target task-link
```

教学块无属性；`code-target` 只允许 `path` 和 `line`；`task-link` 只允许 `step`。未知 Directive、未知属性、缺失必填值和嵌套都必须在课程校验中报错。

v1 不增加 image、formula、summary、exercise、quiz、ask-ai、details、video、button、component 或 html Directive。

## 9. 作者流程

课程作者使用 VS Code、Git 和 Markdown 维护讲义。提交前运行：

```text
corepack pnpm courses:validate
```

讲义不能进入学生 Workspace，不能进入学生 Git 或 Diff。讲义发生实质变化时递增课程 `contentVersion`。涉及真实硬件引脚、接线、电压和现象时，必须继续遵守课次硬件验证门禁。

