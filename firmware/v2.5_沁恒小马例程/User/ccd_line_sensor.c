#include "ccd_line_sensor.h"

/*
 * Linear CCD acquisition and simple dark-line extraction.
 *
 * The sensor exposes one analog output and two digital timing signals.  A
 * capture clocks out 128 samples into g_ccd_pixels.  Extraction ignores a few
 * edge pixels, computes a frame-local threshold, and searches for a bright to
 * dark edge followed by a dark to bright edge.  No dynamic allocation or
 * filtering task is used, so the returned pointer is stable between captures.
 */
static uint8_t g_ccd_pixels[APP_CCD_PIXEL_COUNT];
static ccd_line_result_t g_ccd_result = {0U, 0U, 0U, 0U, false};
static uint8_t g_ccd_last_valid_center = (APP_CCD_PIXEL_COUNT / 2U);
static bool g_ccd_has_valid_center = false;

static void ccd_clock_write(BitAction value)
{
    GPIO_WriteBit(APP_CCD_CLK_PORT, APP_CCD_CLK_PIN, value);
}

static void ccd_si_write(BitAction value)
{
    GPIO_WriteBit(APP_CCD_SI_PORT, APP_CCD_SI_PIN, value);
}

static uint8_t ccd_adc_read_pixel(void)
{
    uint16_t sample = 0U;

    /* The long sample time gives the CCD analog output time to settle. */
    ADC_RegularChannelConfig(ADC1, APP_CCD_AO_ADC_CHANNEL, 1, ADC_SampleTime_239Cycles5);
    ADC_SoftwareStartConvCmd(ADC1, ENABLE);
    while(ADC_GetFlagStatus(ADC1, ADC_FLAG_EOC) == RESET)
    {
    }
    sample = ADC_GetConversionValue(ADC1);
    /* Compress the 12-bit ADC value to the 8-bit format used by telemetry. */
    return (uint8_t)(sample >> 4);
}

static void ccd_extract_line(void)
{
    uint8_t i = 0U;
    uint8_t left = 0U;
    uint8_t right = 0U;
    uint8_t min_value = g_ccd_pixels[5];
    uint8_t max_value = g_ccd_pixels[5];
    bool left_found = false;
    bool right_found = false;

    /* Discard five pixels at each edge, where optical/electrical artifacts are common. */
    for(i = 5U; i < 123U; i++)
    {
        if(g_ccd_pixels[i] < min_value)
        {
            min_value = g_ccd_pixels[i];
        }
        if(g_ccd_pixels[i] > max_value)
        {
            max_value = g_ccd_pixels[i];
        }
    }

    g_ccd_result.min_value = min_value;
    g_ccd_result.max_value = max_value;
    /* Midpoint threshold adapts independently to the brightness of each frame. */
    g_ccd_result.threshold = (uint8_t)(((uint16_t)min_value + (uint16_t)max_value) / 2U);
    g_ccd_result.line_valid = false;

    if((uint8_t)(max_value - min_value) >= APP_CCD_MIN_CONTRAST)
    {
        /* Require three bright then three dark samples to reject single-pixel noise. */
        for(i = 5U; i < 118U; i++)
        {
            if((g_ccd_pixels[i] > g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 1U] > g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 2U] > g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 3U] < g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 4U] < g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 5U] < g_ccd_result.threshold))
            {
                left = i;
                left_found = true;
                break;
            }
        }

        /* Search backwards for the matching dark-to-bright right edge. */
        for(i = 118U; i > 5U; i--)
        {
            if((g_ccd_pixels[i] < g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 1U] < g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 2U] < g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 3U] > g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 4U] > g_ccd_result.threshold) &&
               (g_ccd_pixels[i + 5U] > g_ccd_result.threshold))
            {
                right = i;
                right_found = true;
                break;
            }
        }
    }

    if(left_found && right_found && (right > left))
    {
        uint8_t center = (uint8_t)(((uint16_t)left + (uint16_t)right) / 2U);

        /* Reject implausibly large one-frame jumps but preserve the last center. */
        if(!g_ccd_has_valid_center ||
           ((center > g_ccd_last_valid_center) ?
                ((center - g_ccd_last_valid_center) <= 70U) :
                ((g_ccd_last_valid_center - center) <= 70U)))
        {
            g_ccd_last_valid_center = center;
            g_ccd_has_valid_center = true;
            g_ccd_result.center = center;
            g_ccd_result.line_valid = true;
            return;
        }
    }

    /* `line_valid` remains false; center is diagnostic fallback data only. */
    g_ccd_result.center = g_ccd_has_valid_center ? g_ccd_last_valid_center : (APP_CCD_PIXEL_COUNT / 2U);
}

void ccd_line_sensor_init(void)
{
    GPIO_InitTypeDef gpio_init = {0};
    ADC_InitTypeDef adc_init = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_GPIOB | RCC_APB2Periph_ADC1, ENABLE);
    /* CH32V203 ADC must remain within its rated clock range. */
    RCC_ADCCLKConfig(RCC_PCLK2_Div8);

    gpio_init.GPIO_Pin = APP_CCD_AO_PIN;
    gpio_init.GPIO_Mode = GPIO_Mode_AIN;
    GPIO_Init(APP_CCD_AO_PORT, &gpio_init);

    gpio_init.GPIO_Mode = GPIO_Mode_Out_PP;
    gpio_init.GPIO_Speed = GPIO_Speed_2MHz;
    gpio_init.GPIO_Pin = APP_CCD_SI_PIN;
    GPIO_Init(APP_CCD_SI_PORT, &gpio_init);
    gpio_init.GPIO_Pin = APP_CCD_CLK_PIN;
    GPIO_Init(APP_CCD_CLK_PORT, &gpio_init);

    ccd_si_write(Bit_RESET);
    ccd_clock_write(Bit_RESET);

    ADC_DeInit(ADC1);
    adc_init.ADC_Mode = ADC_Mode_Independent;
    adc_init.ADC_ScanConvMode = DISABLE;
    adc_init.ADC_ContinuousConvMode = DISABLE;
    adc_init.ADC_ExternalTrigConv = ADC_ExternalTrigConv_None;
    adc_init.ADC_DataAlign = ADC_DataAlign_Right;
    adc_init.ADC_NbrOfChannel = 1;
    adc_init.ADC_OutputBuffer = ADC_OutputBuffer_Disable;
    adc_init.ADC_Pga = ADC_Pga_1;
    ADC_Init(ADC1, &adc_init);
    ADC_Cmd(ADC1, ENABLE);
    /* WCH requires reset-calibration followed by calibration after ADC enable. */
    ADC_ResetCalibration(ADC1);
    while(ADC_GetResetCalibrationStatus(ADC1) != RESET)
    {
    }
    ADC_StartCalibration(ADC1);
    while(ADC_GetCalibrationStatus(ADC1) != RESET)
    {
    }
}

void ccd_line_sensor_capture(void)
{
    uint8_t i = 0U;

    /* SI high across the first clock edge starts a new integration readout. */
    ccd_clock_write(Bit_RESET);
    ccd_si_write(Bit_RESET);
    Delay_Us(1);
    ccd_si_write(Bit_SET);
    Delay_Us(1);
    ccd_clock_write(Bit_RESET);
    Delay_Us(1);
    ccd_clock_write(Bit_SET);
    Delay_Us(1);
    ccd_si_write(Bit_RESET);
    Delay_Us(1);

    /* Sample AO while CLK is low, then advance the CCD on the rising edge. */
    for(i = 0U; i < APP_CCD_PIXEL_COUNT; i++)
    {
        ccd_clock_write(Bit_RESET);
        Delay_Us(1);
        g_ccd_pixels[i] = ccd_adc_read_pixel();
        ccd_clock_write(Bit_SET);
        Delay_Us(1);
    }

    ccd_clock_write(Bit_RESET);
    ccd_extract_line();
}

const uint8_t *ccd_line_sensor_pixels(void)
{
    return g_ccd_pixels;
}

const ccd_line_result_t *ccd_line_sensor_result(void)
{
    return &g_ccd_result;
}
