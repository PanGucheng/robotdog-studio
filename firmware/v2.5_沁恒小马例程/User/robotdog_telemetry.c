#include "robotdog_telemetry.h"

#include "robotdog_text.h"

/* CCD telemetry scheduler and bounded ASCII formatter. */
static uint32_t ccd_period_ms(uint8_t rate_hz)
{
    if(rate_hz == 0U)
    {
        rate_hz = ROBOTDOG_CCD_DEFAULT_RATE_HZ;
    }
    return 1000UL / (uint32_t)rate_hz;
}

void RobotDogTelemetry_Init(robotdog_telemetry_t *telemetry, uint32_t now_ms)
{
    if(telemetry == 0)
    {
        return;
    }

    telemetry->ccd_stream_enabled = false;
    telemetry->ccd_rate_hz = ROBOTDOG_CCD_DEFAULT_RATE_HZ;
    telemetry->next_ccd_ms = now_ms;
    telemetry->data_seq = 1U;
    telemetry->dropped_frames = 0U;
}

void RobotDogTelemetry_SetCcdStream(robotdog_telemetry_t *telemetry, bool enabled, uint8_t rate_hz, uint32_t now_ms)
{
    if(telemetry == 0)
    {
        return;
    }

    if(rate_hz == 0U)
    {
        rate_hz = ROBOTDOG_CCD_DEFAULT_RATE_HZ;
    }
    if(rate_hz > ROBOTDOG_CCD_MAX_RATE_HZ)
    {
        rate_hz = ROBOTDOG_CCD_MAX_RATE_HZ;
    }

    telemetry->ccd_stream_enabled = enabled;
    telemetry->ccd_rate_hz = rate_hz;
    telemetry->next_ccd_ms = now_ms;
}

bool RobotDogTelemetry_CcdDue(robotdog_telemetry_t *telemetry, uint32_t now_ms)
{
    if(telemetry == 0 || !telemetry->ccd_stream_enabled)
    {
        return false;
    }

    /* Half-range comparison remains correct when the 32-bit clock wraps. */
    if((uint32_t)(now_ms - telemetry->next_ccd_ms) < 0x80000000UL)
    {
        telemetry->next_ccd_ms = now_ms + ccd_period_ms(telemetry->ccd_rate_hz);
        return true;
    }

    return false;
}

uint16_t RobotDogTelemetry_NextSeq(robotdog_telemetry_t *telemetry)
{
    uint16_t seq = 0U;

    if(telemetry == 0)
    {
        return 0U;
    }

    seq = telemetry->data_seq;
    telemetry->data_seq++;
    if(telemetry->data_seq == 0U)
    {
        telemetry->data_seq = 1U;
    }
    return seq;
}

int RobotDogTelemetry_FormatCcd(uint16_t seq,
                                const robotdog_telemetry_ccd_t *ccd,
                                char *out,
                                size_t out_size)
{
    robotdog_text_builder_t builder;
    uint8_t i = 0U;

    if(ccd == 0 || out == 0 || out_size == 0U)
    {
        return -1;
    }

    RobotDogText_Init(&builder, out, out_size);
    (void)RobotDogText_Append(&builder, "@RDS1 DATA ");
    (void)RobotDogText_AppendU32(&builder, seq);
    (void)RobotDogText_Append(&builder, " CCD valid=");
    (void)RobotDogText_AppendU32(&builder, ccd->line_valid ? 1U : 0U);
    (void)RobotDogText_Append(&builder, " center=");
    (void)RobotDogText_AppendU32(&builder, ccd->center);
    (void)RobotDogText_Append(&builder, " threshold=");
    (void)RobotDogText_AppendU32(&builder, ccd->threshold);
    (void)RobotDogText_Append(&builder, " min=");
    (void)RobotDogText_AppendU32(&builder, ccd->min_value);
    (void)RobotDogText_Append(&builder, " max=");
    (void)RobotDogText_AppendU32(&builder, ccd->max_value);
    (void)RobotDogText_Append(&builder, " pixels=");

    /* Decimal comma-separated pixels are verbose but easy for teaching tools. */
    if(ccd->pixels != 0)
    {
        for(i = 0U; i < ROBOTDOG_CCD_PIXELS; i++)
        {
            if(i != 0U)
            {
                (void)RobotDogText_AppendChar(&builder, ',');
            }
            (void)RobotDogText_AppendU32(&builder, ccd->pixels[i]);
        }
    }

    (void)RobotDogText_Append(&builder, "\r\n");
    return RobotDogText_Finish(&builder);
}
