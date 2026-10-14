#include "ti_msp_dl_config.h"
#include "bsp.h"
static bool s_raw,s_stable;
static uint32_t s_changed;
static bool read_key(void) { return DL_GPIO_readPins(GPIO_KEYS_PORT,GPIO_KEYS_STOP_KEY_PIN)==0; }
void bsp_key_init(uint32_t now) { s_raw=s_stable=read_key(); s_changed=now; }
int bsp_key_poll(uint32_t now)
{
    bool raw=read_key();
    if(raw!=s_raw) { s_raw=raw; s_changed=now; }
    if(s_stable!=s_raw && (uint32_t)(now-s_changed)>=20U) { s_stable=s_raw; return raw ? 1:2; }
    return 0;
}
bool bsp_key_pressed(void) { return s_stable; }
