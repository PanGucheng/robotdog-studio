#include "ti_msp_dl_config.h"

int main(void)
{
    SYSCFG_DL_init();
    for (;;) {
        __WFI();
    }
}
