#ifndef ROBOTDOG_TELEMETRY_H
#define ROBOTDOG_TELEMETRY_H

#include "robotdog_types.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    /* One CCD snapshot; pixels is borrowed, not copied. */
    bool line_valid;
    uint8_t center;
    uint8_t threshold;
    uint8_t min_value;
    uint8_t max_value;
    const uint8_t *pixels;
} robotdog_telemetry_ccd_t;

typedef struct {
    /* Optional stream schedule and counters for asynchronous DATA frames. */
    bool ccd_stream_enabled;
    uint8_t ccd_rate_hz;
    uint32_t next_ccd_ms;
    uint16_t data_seq;
    uint32_t dropped_frames;
} robotdog_telemetry_t;

/* Initialize stream state and schedule. */
void RobotDogTelemetry_Init(robotdog_telemetry_t *telemetry, uint32_t now_ms);

/* Enable/disable streaming and select a bounded rate. */
void RobotDogTelemetry_SetCcdStream(robotdog_telemetry_t *telemetry, bool enabled, uint8_t rate_hz, uint32_t now_ms);

/* Return true at a due point and advance the next deadline. */
bool RobotDogTelemetry_CcdDue(robotdog_telemetry_t *telemetry, uint32_t now_ms);

/* Allocate a nonzero DATA sequence number. */
uint16_t RobotDogTelemetry_NextSeq(robotdog_telemetry_t *telemetry);

/* Format one CCD snapshot as an RDS1 DATA CCD line. */
int RobotDogTelemetry_FormatCcd(uint16_t seq,
                                const robotdog_telemetry_ccd_t *ccd,
                                char *out,
                                size_t out_size);

#endif /* ROBOTDOG_TELEMETRY_H */
