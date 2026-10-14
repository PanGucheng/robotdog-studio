#include "ti_msp_dl_config.h"
#include "bsp.h"
/* One <=17-byte transaction per foreground pass; wall-clock timeout + guard. */
bool bsp_i2c_write(uint8_t control,const uint8_t *data,uint16_t count)
{
    uint8_t packet[17];
    if(count>16 || (!data && count)) return false;
    packet[0]=control;
    for(uint16_t i=0;i<count;i++) packet[i+1]=data[i];
    uint32_t start=bsp_millis(),guard=0;
    while(!(DL_I2C_getControllerStatus(I2C_OLED_INST)&DL_I2C_CONTROLLER_STATUS_IDLE)) {
        if((uint32_t)(bsp_millis()-start)>=5U || ++guard>32000U) goto fail;
    }
    DL_I2C_flushControllerTXFIFO(I2C_OLED_INST);
    DL_I2C_clearInterruptStatus(I2C_OLED_INST,DL_I2C_INTERRUPT_CONTROLLER_TX_DONE);
    uint16_t sent=DL_I2C_fillControllerTXFIFO(I2C_OLED_INST,packet,count+1);
    DL_I2C_startControllerTransfer(I2C_OLED_INST,0x3C,DL_I2C_CONTROLLER_DIRECTION_TX,count+1);
    DL_Common_delayCycles(CPUCLK_FREQ/160000U); /* SDK I2C_ERR_13 settling. */
    guard=0;
    for(;;) {
        uint32_t status=DL_I2C_getControllerStatus(I2C_OLED_INST);
        if(status&DL_I2C_CONTROLLER_STATUS_ERROR) goto fail;
        if(sent<count+1 && !DL_I2C_isControllerTXFIFOFull(I2C_OLED_INST))
            sent+=DL_I2C_fillControllerTXFIFO(I2C_OLED_INST,packet+sent,count+1-sent);
        if(DL_I2C_getRawInterruptStatus(I2C_OLED_INST,DL_I2C_INTERRUPT_CONTROLLER_TX_DONE)) return sent==count+1;
        if((uint32_t)(bsp_millis()-start)>=5U || ++guard>32000U) goto fail;
    }
fail:
    DL_I2C_resetControllerTransfer(I2C_OLED_INST);
    DL_I2C_flushControllerTXFIFO(I2C_OLED_INST);
    return false;
}
