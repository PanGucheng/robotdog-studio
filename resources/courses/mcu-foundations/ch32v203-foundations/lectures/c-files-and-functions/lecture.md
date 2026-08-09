## 为什么工程有很多文件 {#multi-file-project}

小程序可以全部写在一个文件中，但真实单片机工程需要把不同职责分开。这样可以分别阅读、编译和维护各个模块，并让模块通过清晰的接口协作。

:::concept[模块]
模块是一组职责相关的代码。常见做法是用头文件公开接口，用源文件保存实现。
:::

## 源文件 {#source-files}

扩展名为 `.c` 的源文件通常保存函数定义和模块内部数据。每个源文件会先单独编译为目标文件，再由链接器组合为完整程序。

::code-target[打开辅助函数源文件]{path="App/Src/number_tools.c" line="1"}

## 头文件 {#header-files}

扩展名为 `.h` 的头文件通常公开函数声明、类型和常量。其他源文件包含这个头文件后，编译器就能检查函数调用是否符合接口。

::code-target[打开辅助函数头文件]{path="App/Inc/number_tools.h" line="1"}

## 声明与定义 {#declaration-and-definition}

函数声明告诉编译器函数的名字、参数和返回类型；函数定义提供真正执行的函数体。

```c
/* 声明：通常放在 .h 文件 */
int ClampNumber(int value, int minimum, int maximum);

/* 定义：通常放在 .c 文件 */
int ClampNumber(int value, int minimum, int maximum)
{
    /* 函数体 */
}
```

:::pitfall[签名必须一致]
声明和定义中的返回类型、函数名、参数数量与参数类型必须一致。否则可能在编译或链接阶段出现问题。
:::

::task-link[回到“辨认声明与定义”]{step="read-declaration-definition"}

## include 做了什么 {#include}

```c
#include "number_tools.h"
```

这行代码让当前源文件在编译时看到头文件公开的声明。它不是把已经编译好的函数实现复制进来；函数定义仍然来自对应源文件。

::code-target[查看实验入口中的调用]{path="App/Src/experiment.c" line="1"}

## 编译与链接 {#compile-and-link}

编译器分别检查每个源文件的语法和类型，链接器再把目标文件中的符号连接起来。

:::note
如果编译器看不到函数声明，通常会在编译当前源文件时报告问题；如果只有声明却没有任何匹配的定义，常见问题会出现在链接阶段。
:::

## 本课工程 {#lesson-project}

本课需要核对三个位置：

1. `number_tools.h` 中的函数声明；
2. `number_tools.c` 中的函数定义；
3. `experiment.c` 中的函数调用。

这三处共同描述同一个接口，但各自承担不同职责。

::task-link[开始实现辅助函数]{step="implement-helper"}

## 常见问题 {#common-errors}

- 函数名拼写不一致；
- 声明和定义的参数类型不同；
- 忘记包含对应头文件；
- 只有声明，没有把包含定义的源文件加入构建；
- 多个源文件重复定义同名的非静态函数。

:::tip
先阅读第一条有效诊断，并判断它发生在单文件编译还是最终链接阶段，再决定检查声明、定义还是构建输入。
:::

## 本课小结 {#summary}

头文件公开模块接口，源文件保存实现，`#include` 让调用方看到声明。多个源文件分别编译，再由链接器组合为完整程序。

::task-link[回答头文件作用]{step="reflect-header"}
