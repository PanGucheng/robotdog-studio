#include "app.h"
#include "bsp.h"
#include "robotdog_protocol.h"
#include "robotdog_runtime.h"
#include "robotdog_text.h"
static robotdog_protocol_parser_t s_parser;
static bool s_ready;
static void ok(uint16_t seq,const char *fields)
{
    char line[420];
    if(RobotDogProtocol_FormatOk(seq,fields,line,sizeof(line))>=0) bsp_uart_send(line,ROBOTDOG_TX_HIGH);
}
static void error(uint16_t seq,robotdog_result_t code)
{
    char line[96];
    if(RobotDogProtocol_FormatError(seq,code,line,sizeof(line))>=0) bsp_uart_send(line,ROBOTDOG_TX_HIGH);
}
static void append_u32(robotdog_text_builder_t *b,const char *key,uint32_t v)
{ RobotDogText_Append(b,key); RobotDogText_AppendU32(b,v); }
static void handle(const robotdog_protocol_event_t *e,uint32_t now)
{
    char fields[340]; robotdog_text_builder_t b; robotdog_runtime_status_t st;
    RobotDogText_Init(&b,fields,sizeof(fields));
    if(e->type==ROBOTDOG_PROTOCOL_EVENT_ERROR) { error(e->seq,e->error); return; }
    if(e->type!=ROBOTDOG_PROTOCOL_EVENT_REQUEST) return;
    robotdog_result_t result=ROBOTDOG_RESULT_OK;
    switch(e->command) {
    case ROBOTDOG_PROTOCOL_CMD_HELLO:
        RobotDogText_Append(&b,"device_id=ti-trace-");
        RobotDogText_AppendHex32(&b,bsp_device_trace_id(),8);
        RobotDogText_Append(&b," board=" ROBOTDOG_BOARD_ID " chip=" ROBOTDOG_CHIP_ID " fw=" ROBOTDOG_FIRMWARE_VERSION " protocol=1");
        break;
    case ROBOTDOG_PROTOCOL_CMD_CAPS:
        RobotDogText_Append(&b,"actions=stop,stand,walk,turn_left,turn_right ccd_pixels=0 ccd_default_rate_hz=0 ccd_max_rate_hz=0 modes=manual_remote,update_safe iap=placeholder ccd_supported=0");
        break;
    case ROBOTDOG_PROTOCOL_CMD_PING: RobotDogText_Append(&b,"pong=1"); break;
    case ROBOTDOG_PROTOCOL_CMD_HEARTBEAT:
        RobotDogRuntime_Heartbeat(now); RobotDogRuntime_GetStatus(&st);
        RobotDogText_Append(&b,"mode="); RobotDogText_Append(&b,RobotDogMode_Name(st.mode)); break;
    case ROBOTDOG_PROTOCOL_CMD_STOP:
        RobotDogRuntime_Stop(now,ROBOTDOG_STOP_USER); RobotDogText_Append(&b,"state=idle"); break;
    case ROBOTDOG_PROTOCOL_CMD_ACTION:
        if(e->action!=ROBOTDOG_ACTION_STOP && (!s_ready || bsp_key_pressed())) { error(e->seq,ROBOTDOG_RESULT_UNSAFE_STATE); return; }
        result=RobotDogRuntime_RequestManualAction(now,e->action,e->strength,e->lease_ms);
        RobotDogText_Append(&b,"action="); RobotDogText_Append(&b,RobotDogAction_Name(e->action));
        append_u32(&b," strength=",e->strength); append_u32(&b," lease_ms=",e->lease_ms); break;
    case ROBOTDOG_PROTOCOL_CMD_MODE:
        if(e->mode_request==ROBOTDOG_PROTOCOL_MODE_IDLE) {
            RobotDogRuntime_EnterIdle(now); RobotDogText_Append(&b,"mode=idle");
        } else result=ROBOTDOG_RESULT_NOT_SUPPORTED;
        break;
    case ROBOTDOG_PROTOCOL_CMD_STATUS:
        RobotDogRuntime_GetStatus(&st);
        RobotDogText_Append(&b,"mode="); RobotDogText_Append(&b,RobotDogMode_Name(st.mode));
        RobotDogText_Append(&b," action="); RobotDogText_Append(&b,RobotDogAction_Name(st.action));
        RobotDogText_Append(&b," motion="); RobotDogText_Append(&b,st.motion_name);
        RobotDogText_Append(&b," stop_reason="); RobotDogText_Append(&b,RobotDogStopReason_Name(st.stop_reason));
        RobotDogText_Append(&b," ccd_valid=0 ccd_center=0 ccd_supported=0");
        append_u32(&b," tx_dropped=",bsp_uart_dropped()); append_u32(&b," rx_overflow=",bsp_uart_overflows());
        append_u32(&b," rx_errors=",bsp_uart_errors());
        append_u32(&b," hardware_ready=",s_ready); break;
    case ROBOTDOG_PROTOCOL_CMD_CCD:
        if(e->ccd_request==ROBOTDOG_PROTOCOL_CCD_OFF) RobotDogText_Append(&b,"ccd=off");
        else result=ROBOTDOG_RESULT_NOT_SUPPORTED;
        break;
    case ROBOTDOG_PROTOCOL_CMD_ENTER_IAP:
        result=RobotDogRuntime_EnterUpdate(now);
        RobotDogText_Append(&b,"supported=0 state=update_safe reason=bootloader_not_implemented"); break;
    default: result=ROBOTDOG_RESULT_BAD_COMMAND; break;
    }
    if(result!=ROBOTDOG_RESULT_OK) error(e->seq,result);
    else if(RobotDogText_Finish(&b)>=0) ok(e->seq,fields);
    else error(e->seq,ROBOTDOG_RESULT_BAD_ARGUMENT);
}
void app_init(uint32_t now,bool ready)
{ s_ready=ready; RobotDogProtocol_Init(&s_parser); RobotDogRuntime_Init(now); }
void app_reset_parser(void) { RobotDogProtocol_Init(&s_parser); }
void app_protocol_tick(uint32_t now)
{
    uint8_t byte; robotdog_protocol_event_t e;
    for(unsigned i=0;i<64 && bsp_uart_pop(&byte);i++)
        if(RobotDogProtocol_InputByte(&s_parser,byte,&e)) handle(&e,now);
}
