#include "ssd1306_oled.h"
#include "ssd1306_font6x8.h"

#include "ch32v20x_conf.h"

#include <string.h>

/*
 * SSD1306 128x64 framebuffer driver using CH32V203 hardware I2C1.
 *
 * The configured 7-bit address is 0x3C; WCH's send-address API receives the
 * shifted value, so the wire write byte is 0x78. Drawing modifies a 1024-byte
 * page framebuffer and Refresh performs the physical transfer. Every I2C wait
 * is bounded so a disconnected display cannot permanently block the robot.
 */
#define SSD1306_TIMEOUT  20000U

static uint8_t g_oled_gram[SSD1306_PAGE_COUNT][SSD1306_WIDTH];
static bool g_oled_present = false;

static bool ssd1306_i2c_wait_event(uint32_t event)
{
    uint32_t timeout = SSD1306_TIMEOUT;

    while(I2C_CheckEvent(SSD1306_I2C, event) == NoREADY)
    {
        if(timeout-- == 0U)
        {
            return false;
        }
    }
    return true;
}

static void ssd1306_i2c_abort(void)
{
    /* Release the bus and clear sticky faults before a future transaction. */
    I2C_GenerateSTOP(SSD1306_I2C, ENABLE);
    I2C_ClearFlag(SSD1306_I2C, I2C_FLAG_AF);
    I2C_ClearFlag(SSD1306_I2C, I2C_FLAG_ARLO);
    I2C_ClearFlag(SSD1306_I2C, I2C_FLAG_BERR);
}

static bool ssd1306_i2c_write(uint8_t control, const uint8_t *data, uint16_t len)
{
    uint16_t i = 0U;

    I2C_GenerateSTART(SSD1306_I2C, ENABLE);
    if(!ssd1306_i2c_wait_event(I2C_EVENT_MASTER_MODE_SELECT))
    {
        ssd1306_i2c_abort();
        return false;
    }

    /* Shift 0x3C to the 0x78 write-address representation expected here. */
    I2C_Send7bitAddress(SSD1306_I2C, (uint8_t)(SSD1306_I2C_ADDR_7BIT << 1), I2C_Direction_Transmitter);
    if(!ssd1306_i2c_wait_event(I2C_EVENT_MASTER_TRANSMITTER_MODE_SELECTED))
    {
        ssd1306_i2c_abort();
        return false;
    }

    /* Control 0x00 selects commands; 0x40 selects display RAM data. */
    I2C_SendData(SSD1306_I2C, control);
    if(!ssd1306_i2c_wait_event(I2C_EVENT_MASTER_BYTE_TRANSMITTED))
    {
        ssd1306_i2c_abort();
        return false;
    }

    for(i = 0U; i < len; i++)
    {
        I2C_SendData(SSD1306_I2C, data[i]);
        if(!ssd1306_i2c_wait_event(I2C_EVENT_MASTER_BYTE_TRANSMITTED))
        {
            ssd1306_i2c_abort();
            return false;
        }
    }

    I2C_GenerateSTOP(SSD1306_I2C, ENABLE);
    return true;
}

static bool ssd1306_write_cmd(uint8_t cmd)
{
    return ssd1306_i2c_write(0x00U, &cmd, 1U);
}

static bool ssd1306_write_data(const uint8_t *data, uint16_t len)
{
    return ssd1306_i2c_write(0x40U, data, len);
}

void SSD1306_Init(void)
{
    GPIO_InitTypeDef gpio_init = {0};
    I2C_InitTypeDef i2c_init = {0};
    /* 128x64 panel, horizontal addressing, normal display and charge pump. */
    static const uint8_t init_commands[] = {
        0xAEU, 0x20U, 0x00U, 0xB0U, 0xC8U, 0x00U, 0x10U, 0x40U,
        0x81U, 0x7FU, 0xA1U, 0xA6U, 0xA8U, 0x3FU, 0xA4U, 0xD3U,
        0x00U, 0xD5U, 0x80U, 0xD9U, 0xF1U, 0xDAU, 0x12U, 0xDBU,
        0x40U, 0x8DU, 0x14U
    };

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO | APP_OLED_I2C_GPIO_CLK_APB2, ENABLE);
    RCC_APB1PeriphClockCmd(SSD1306_I2C_CLK_APB1, ENABLE);

    gpio_init.GPIO_Pin = APP_OLED_I2C_SCL_PIN | APP_OLED_I2C_SDA_PIN;
    /* Alternate-function open drain requires external bus pull-up resistors. */
    gpio_init.GPIO_Mode = GPIO_Mode_AF_OD;
    gpio_init.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(APP_OLED_I2C_PORT, &gpio_init);

    I2C_DeInit(SSD1306_I2C);
    i2c_init.I2C_ClockSpeed = 100000U;
    i2c_init.I2C_Mode = I2C_Mode_I2C;
    i2c_init.I2C_DutyCycle = I2C_DutyCycle_2;
    i2c_init.I2C_OwnAddress1 = 0x00U;
    i2c_init.I2C_Ack = I2C_Ack_Enable;
    i2c_init.I2C_AcknowledgedAddress = I2C_AcknowledgedAddress_7bit;
    I2C_Init(SSD1306_I2C, &i2c_init);
    I2C_Cmd(SSD1306_I2C, ENABLE);

    Delay_Ms(100U);

    /* Remember failed probing so periodic refreshes return immediately. */
    g_oled_present = ssd1306_i2c_write(0x00U, init_commands, (uint16_t)sizeof(init_commands));
    if(!g_oled_present)
    {
        return;
    }

    SSD1306_Clear();
    g_oled_present = ssd1306_write_cmd(0xAFU);
}

void SSD1306_Fill(uint8_t value)
{
    uint16_t x = 0U;
    uint8_t page = 0U;

    for(page = 0U; page < SSD1306_PAGE_COUNT; page++)
    {
        for(x = 0U; x < SSD1306_WIDTH; x++)
        {
            g_oled_gram[page][x] = value;
        }
    }
}

void SSD1306_Clear(void)
{
    SSD1306_Fill(0x00U);
    SSD1306_Refresh();
}

void SSD1306_DrawChar(uint8_t x, uint8_t page, char ch)
{
    uint8_t idx = 0U;
    uint8_t i = 0U;

    if(page >= SSD1306_PAGE_COUNT || x >= SSD1306_WIDTH)
    {
        return;
    }

    if(ch < 0x20 || ch > 0x7F)
    {
        ch = '?';
    }

    idx = (uint8_t)(ch - 0x20);

    if(x <= (SSD1306_WIDTH - 6U))
    {
        for(i = 0U; i < 6U; i++)
        {
            g_oled_gram[page][x + i] = g_font6x8[idx][i];
        }
    }
}

void SSD1306_SetPixel(uint8_t x, uint8_t y, bool on)
{
    uint8_t page = 0U;
    uint8_t bit = 0U;
    uint8_t mask = 0U;

    if(x >= SSD1306_WIDTH || y >= SSD1306_HEIGHT)
    {
        return;
    }

    /* SSD1306 RAM stores eight vertical pixels in each page byte. */
    page = (uint8_t)(y / 8U);
    bit = (uint8_t)(y % 8U);
    mask = (uint8_t)(1U << bit);

    if(on)
    {
        g_oled_gram[page][x] |= mask;
    }
    else
    {
        g_oled_gram[page][x] &= (uint8_t)(~mask);
    }
}

void SSD1306_DrawBitmap(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const uint8_t *bmp)
{
    uint16_t byte_idx = 0U;
    uint8_t row = 0U;
    uint8_t col_byte = 0U;
    uint8_t bytes_per_row = 0U;
    uint8_t bit = 0U;
    uint8_t value = 0U;
    uint8_t px = 0U;

    if(bmp == NULL || width == 0U || height == 0U)
    {
        return;
    }

    bytes_per_row = (uint8_t)((width + 7U) / 8U);

    for(row = 0U; row < height; row++)
    {
        for(col_byte = 0U; col_byte < bytes_per_row; col_byte++)
        {
            value = bmp[byte_idx++];
            for(bit = 0U; bit < 8U; bit++)
            {
                px = (uint8_t)(col_byte * 8U + bit);
                if(px < width)
                {
                    SSD1306_SetPixel((uint8_t)(x + px), (uint8_t)(y + row), (value & (uint8_t)(1U << bit)) != 0U);
                }
            }
        }
    }
}

void SSD1306_DrawTestPattern(void)
{
    uint8_t x = 0U;
    uint8_t y = 0U;

    SSD1306_Fill(0x00U);

    for(x = 0U; x < SSD1306_WIDTH; x++)
    {
        SSD1306_SetPixel(x, 0U, true);
        SSD1306_SetPixel(x, (uint8_t)(SSD1306_HEIGHT - 1U), true);
    }

    for(y = 0U; y < SSD1306_HEIGHT; y++)
    {
        SSD1306_SetPixel(0U, y, true);
        SSD1306_SetPixel((uint8_t)(SSD1306_WIDTH - 1U), y, true);
    }

    for(x = 0U; x < SSD1306_WIDTH; x++)
    {
        y = (uint8_t)((((uint16_t)x) * (SSD1306_HEIGHT - 1U)) / (SSD1306_WIDTH - 1U));
        SSD1306_SetPixel(x, y, true);
        SSD1306_SetPixel(x, (uint8_t)((SSD1306_HEIGHT - 1U) - y), true);
    }

    SSD1306_DrawString(8U, 1U, "SSD1306 TEST");
    SSD1306_DrawString(8U, 6U, "PB6/PB7 I2C1");
    SSD1306_Refresh();
}

void SSD1306_DrawString(uint8_t x, uint8_t page, const char *text)
{
    while(text != NULL && *text != '\0' && x <= (SSD1306_WIDTH - 6U))
    {
        SSD1306_DrawChar(x, page, *text);
        x = (uint8_t)(x + 6U);
        text++;
    }
}

void SSD1306_Refresh(void)
{
    uint8_t page = 0U;

    if(!g_oled_present)
    {
        return;
    }

    /* Set page/column origin, then transfer exactly 128 bytes per page. */
    for(page = 0U; page < SSD1306_PAGE_COUNT; page++)
    {
        if(!ssd1306_write_cmd((uint8_t)(0xB0U + page)) ||
           !ssd1306_write_cmd(0x00U) ||
           !ssd1306_write_cmd(0x10U))
        {
            g_oled_present = false;
            return;
        }
        if(!ssd1306_write_data(&g_oled_gram[page][0], SSD1306_WIDTH))
        {
            g_oled_present = false;
            return;
        }
    }
}
