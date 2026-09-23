#ifndef __CCD_LINE_SENSOR_H
#define __CCD_LINE_SENSOR_H

#include "app_hal.h"
#include <stdbool.h>
#include <stdint.h>

/* Result of the latest CCD frame. center is retained when a frame is invalid. */
typedef struct
{
    uint8_t threshold;
    uint8_t center;
    uint8_t min_value;
    uint8_t max_value;
    bool line_valid;
} ccd_line_result_t;

void ccd_line_sensor_init(void);
/* Trigger one complete 128-pixel acquisition. This is a blocking capture. */
void ccd_line_sensor_capture(void);
/* Return the read-only raw pixel buffer from the latest acquisition. */
const uint8_t *ccd_line_sensor_pixels(void);
/* Return the result calculated from the latest acquisition. */
const ccd_line_result_t *ccd_line_sensor_result(void);

#endif /* __CCD_LINE_SENSOR_H */
