#include "app.h"
#include "bsp.h"
#include "oled.h"
#include "robotdog_runtime.h"
#include "robotdog_text.h"
static uint32_t s_last;
static bool s_first=true;
static void text_row(uint8_t row,const char *label,const char *value)
{
    char line[48];robotdog_text_builder_t b;
    RobotDogText_Init(&b,line,sizeof(line));RobotDogText_Append(&b,label);RobotDogText_Append(&b,value);
    RobotDogText_Finish(&b);oled_text(row,line);
}
void app_oled_render(uint32_t now)
{
    if(!oled_can_render() || (!s_first && (uint32_t)(now-s_last)<1000U)) return;
    s_first=false;s_last=now;
    robotdog_runtime_status_t st;RobotDogRuntime_GetStatus(&st);
    oled_clear();
    text_row(0,"mode ",RobotDogMode_Name(st.mode));
    text_row(1,"action ",RobotDogAction_Name(st.action));
    text_row(2,"motion ",st.motion_name);
    oled_text(3,"ccd disabled");text_row(4,"stop ",RobotDogStopReason_Name(st.stop_reason));
    char line[48];robotdog_text_builder_t b;
    RobotDogText_Init(&b,line,sizeof(line));RobotDogText_Append(&b,"tx ");RobotDogText_AppendU32(&b,bsp_uart_dropped());
    RobotDogText_Append(&b," rx ");RobotDogText_AppendU32(&b,bsp_uart_faults());RobotDogText_Finish(&b);oled_text(5,line);
    RobotDogText_Init(&b,line,sizeof(line));RobotDogText_Append(&b,"oled errors ");RobotDogText_AppendU32(&b,oled_errors());RobotDogText_Finish(&b);oled_text(6,line);
    oled_flush();
}
