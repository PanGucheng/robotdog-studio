#include "oled.h"
#include "bsp.h"
#include "ssd1306_font6x8.h"
#include <string.h>
static uint8_t s_gram[1024];
static uint16_t s_offset;
static uint8_t s_init_offset,s_state;
static uint32_t s_wait,s_errors;
static const uint8_t s_init[]={0xAE,0x20,0x00,0xC8,0x40,0x81,0x7F,0xA1,0xA6,0xA8,0x3F,0xA4,0xD3,0,0xD5,0x80,0xD9,0xF1,0xDA,0x12,0xDB,0x40,0x8D,0x14,0xAF};
void oled_init(uint32_t now) { s_state=0;s_wait=now;s_init_offset=0;s_errors=0; }
bool oled_can_render(void) { return s_state==2; }
void oled_clear(void) { memset(s_gram,0,sizeof(s_gram)); }
void oled_text(uint8_t row,const char *s)
{
    if(row>=8 || !s) return;
    unsigned x=0;
    while(*s && x+6<=128) {
        uint8_t c=(uint8_t)*s++; if(c<32 || c>127) c='?';
        memcpy(&s_gram[row*128U+x],g_font6x8[c-32],6); x+=6;
    }
}
void oled_flush(void) { if(s_state==2) { s_state=3;s_offset=0; } }
uint32_t oled_errors(void) { return s_errors; }
void oled_tick(uint32_t now)
{
    bool ok=true;
    if(s_state==0) { if((uint32_t)(now-s_wait)>=30U) s_state=1; return; }
    if(s_state==1) {
        unsigned left=sizeof(s_init)-s_init_offset,n=left>16?16:left;
        ok=bsp_i2c_write(0,&s_init[s_init_offset],(uint16_t)n);
        if(ok) { s_init_offset+=(uint8_t)n; if(s_init_offset==sizeof(s_init)) s_state=2; }
    } else if(s_state==3) {
        const uint8_t window[]={0x21,0,127,0x22,0,7};
        ok=bsp_i2c_write(0,window,sizeof(window)); if(ok) s_state=4;
    } else if(s_state==4) {
        ok=bsp_i2c_write(0x40,&s_gram[s_offset],16);
        if(ok) { s_offset+=16;if(s_offset==sizeof(s_gram)) s_state=2; }
    } else if(s_state==5) {
        if((uint32_t)(now-s_wait)>=5000U) { s_state=0;s_init_offset=0;s_wait=now; }
    }
    if(!ok) { s_errors++;s_state=5;s_wait=now; }
}
