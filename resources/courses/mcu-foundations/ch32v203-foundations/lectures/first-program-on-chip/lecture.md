## 从代码到芯片 {#source-to-chip}

电脑中的 C 源代码先经过编译和链接，形成 CH32V203 可以执行的 firmware 文件。Flash 把文件写入芯片，复位后 MCU 才会执行它。

## 找到你的实验代码 {#find-your-code}

本课的学生实验入口是 `App/Src/experiment.c`。底层启动、RHS Board 和 RHS HAL 已经准备好，第一课只观察入口如何工作。

## Candidate、Build 与 Flash {#build-and-flash}

Candidate Build 只检查当前实验源码。Firmware Build 把实验代码和 RHS baseline 一起编译、链接并生成 ELF、HEX、BIN、MAP。Flash 才是把生成的程序写进开发板。

## 第一次运行真实硬件 {#first-hardware}

模板中的 `blink_period_ms` 初始值是 500U。把它改成 100U 或 1000U，完成 Check、Diff、Build、Flash 后，确认 PB8 LED 按你选择的间隔明显闪烁。

## 本课小结 {#summary}

本课建立一条可重复的肌肉记忆：Edit → Check → Diff → Build → Flash → Observe。GPIO 和时间机制会在后续课程拆开学习。
