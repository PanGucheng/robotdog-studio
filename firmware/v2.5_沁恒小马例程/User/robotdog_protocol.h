#ifndef ROBOTDOG_PROTOCOL_H
#define ROBOTDOG_PROTOCOL_H

#include "robotdog_types.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/*
 * RDS1 is the bounded, line-oriented command protocol carried by USART3.
 * A request is written as:
 *   @RDS1 REQ <sequence> <command> [key=value ...]\r\n
 * The parser accepts printable ASCII only and never allocates memory.  This
 * makes malformed or overlong input recoverable on the microcontroller.
 */
#define ROBOTDOG_PROTOCOL_LINE_MAX 160U

typedef enum {
    ROBOTDOG_PROTOCOL_EVENT_NONE = 0,
    ROBOTDOG_PROTOCOL_EVENT_REQUEST,
    ROBOTDOG_PROTOCOL_EVENT_ERROR
} robotdog_protocol_event_type_t;

typedef enum {
    ROBOTDOG_PROTOCOL_CMD_NONE = 0,
    ROBOTDOG_PROTOCOL_CMD_HELLO,
    ROBOTDOG_PROTOCOL_CMD_CAPS,
    ROBOTDOG_PROTOCOL_CMD_PING,
    ROBOTDOG_PROTOCOL_CMD_HEARTBEAT,
    ROBOTDOG_PROTOCOL_CMD_STOP,
    ROBOTDOG_PROTOCOL_CMD_ACTION,
    ROBOTDOG_PROTOCOL_CMD_MODE,
    ROBOTDOG_PROTOCOL_CMD_STATUS,
    ROBOTDOG_PROTOCOL_CMD_CCD,
    ROBOTDOG_PROTOCOL_CMD_ENTER_IAP
} robotdog_protocol_command_t;

typedef enum {
    ROBOTDOG_PROTOCOL_MODE_NONE = 0,
    ROBOTDOG_PROTOCOL_MODE_IDLE,
    ROBOTDOG_PROTOCOL_MODE_AUTO_LINE
} robotdog_protocol_mode_request_t;

typedef enum {
    ROBOTDOG_PROTOCOL_CCD_NONE = 0,
    ROBOTDOG_PROTOCOL_CCD_ON,
    ROBOTDOG_PROTOCOL_CCD_OFF,
    ROBOTDOG_PROTOCOL_CCD_ONCE
} robotdog_protocol_ccd_request_t;

typedef struct {
    /* Meaning of one complete CR/LF-terminated request. */
    robotdog_protocol_event_type_t type;
    robotdog_result_t error;
    uint16_t seq;
    robotdog_protocol_command_t command;
    robotdog_action_t action;
    uint8_t strength;
    uint16_t lease_ms;
    robotdog_protocol_mode_request_t mode_request;
    robotdog_protocol_ccd_request_t ccd_request;
    uint8_t ccd_rate_hz;
} robotdog_protocol_event_t;

typedef struct {
    /* Byte-by-byte line accumulator used by RobotDogProtocol_InputByte. */
    char line[ROBOTDOG_PROTOCOL_LINE_MAX];
    uint16_t len;
    bool overflow;
    uint32_t overflow_count;
    uint32_t bad_byte_count;
} robotdog_protocol_parser_t;

/* Reset the accumulator and diagnostic counters. */
void RobotDogProtocol_Init(robotdog_protocol_parser_t *parser);

/* Feed one byte; return true only when event contains a completed result. */
bool RobotDogProtocol_InputByte(robotdog_protocol_parser_t *parser,
                                uint8_t byte,
                                robotdog_protocol_event_t *event);
/* Format a normal response. Return the byte count or -1 on overflow/error. */
int RobotDogProtocol_FormatOk(uint16_t seq, const char *fields, char *out, size_t out_size);

/* Format a stable protocol error code. */
int RobotDogProtocol_FormatError(uint16_t seq, robotdog_result_t error, char *out, size_t out_size);

/* Format an asynchronous DATA frame, for example a CCD telemetry frame. */
int RobotDogProtocol_FormatData(uint16_t seq, const char *kind, const char *fields, char *out, size_t out_size);

#endif /* ROBOTDOG_PROTOCOL_H */
