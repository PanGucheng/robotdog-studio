# RobotDog 串口协议 v1 草案

目标是把控制、状态和 CCD 遥测统一到一个 115200、8N1 串口。每条消息以 CRLF 结束，以 `@RDS1` 开头，避免普通调试文本被误判成协议消息。

```text
@RDS1 REQ 42 ACTION walk
@RDS1 RES 42 OK action=walk
@RDS1 EVT STATUS state=idle action=none
@RDS1 DATA 43 CCD valid=1 center=70 threshold=120 pixels=210,208,...
```

协议必须支持请求序号、能力握手、错误码、异步状态、128 点 CCD 帧和固件版本。`STOP` 必须可以抢占普通命令；固件在通信中断或动作超过安全时限时必须自行停止。

当前固件的 USART3 文本命令由 `LegacySerialAdapter` 兼容，但 USART1 上的 `printf`/CCD 数据不纳入首版双口配对。
