#ifndef CCD_BACKEND_H
#define CCD_BACKEND_H
#include <stdbool.h>
#include <stdint.h>
/* Future hardware backend: only publish a complete, timestamped real frame.
 * No implementation is linked in the CCD-disabled first-stage firmware. */
typedef struct {
    uint8_t pixels[128];
    uint8_t center, threshold, min_value, max_value;
    bool line_valid;
    uint32_t sampled_ms;
} ccd_backend_frame_t;
bool ccd_backend_read(ccd_backend_frame_t *frame);
#endif
