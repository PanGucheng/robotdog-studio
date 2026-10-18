# MSPM0G3507 基础 SDK 空工程

保留 SysConfig、启动和链接配置，不配置 LED、舵机、串口等业务。入口 src/main.c。
src 下 C 文件递归参与编译。SDK DriverLib 和 CMSIS 从固定 SDK 工具链引用，不复制整个 SDK 到学生工程。
使用 Studio 的 SysConfig 按钮打开 board.syscfg，保存后重新编译。
