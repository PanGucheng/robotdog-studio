# RobotDog 串口协议 v1 草案

目标是把控制、状态和 CCD 遥测统一到一个 115200、8N1 蓝牙运行态串口。板载有线串口使用独立 IAP 协议下载固件，不与本协议混合。每条运行态消息以 CRLF 结束，以 `@RDS1` 开头，避免普通调试文本被误判成协议消息。

```text
@RDS1 REQ 42 ACTION walk
@RDS1 RES 42 OK action=walk
@RDS1 EVT STATUS state=idle action=none
@RDS1 DATA 43 CCD valid=1 center=70 threshold=120 pixels=210,208,...
```

协议必须支持稳定设备 ID、请求序号、能力握手、错误码、异步状态、遥测速率协商、128 点 CCD 帧、固件版本和受控进入 IAP。`STOP` 必须可以抢占普通命令；持续运动依赖心跳，固件在通信中断或动作超过安全时限时必须自行停止。

当前固件的 USART3 文本命令由 `LegacySerialAdapter` 兼容。正式固件应把运行态命令、应答、状态和 CCD 集中到蓝牙 UART；板载有线 UART 专用于 IAP。历史硬件分工方案见 `archive/2026-07-14-completed-plans/three-channel-connection-plan.md`。
