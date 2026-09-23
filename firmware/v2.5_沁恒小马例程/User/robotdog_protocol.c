#include "robotdog_protocol.h"
#include "robotdog_text.h"

#include <string.h>

/*
 * Allocation-free RDS1 parser and formatter.
 *
 * The USART interrupt only transfers bytes. Parsing is performed later in the
 * main loop so string handling cannot lengthen interrupt latency.  Every input
 * field is range checked here before it reaches the runtime safety layer.
 */
static void protocol_event_reset(robotdog_protocol_event_t *event)
{
    if(event == 0)
    {
        return;
    }

    event->type = ROBOTDOG_PROTOCOL_EVENT_NONE;
    event->error = ROBOTDOG_RESULT_OK;
    event->seq = 0U;
    event->command = ROBOTDOG_PROTOCOL_CMD_NONE;
    event->action = ROBOTDOG_ACTION_STOP;
    event->strength = ROBOTDOG_DEFAULT_STRENGTH;
    event->lease_ms = ROBOTDOG_DEFAULT_LEASE_MS;
    event->mode_request = ROBOTDOG_PROTOCOL_MODE_NONE;
    event->ccd_request = ROBOTDOG_PROTOCOL_CCD_NONE;
    event->ccd_rate_hz = ROBOTDOG_CCD_DEFAULT_RATE_HZ;
}

static bool parse_u16(const char *text, uint16_t *value)
{
    uint32_t parsed = 0U;
    const char *cursor = text;

    if(text == 0 || *text == '\0' || value == 0)
    {
        return false;
    }

    while(*cursor != '\0')
    {
        if(*cursor < '0' || *cursor > '9')
        {
            return false;
        }
        parsed = parsed * 10U + (uint32_t)(*cursor - '0');
        if(parsed > 65535U)
        {
            return false;
        }
        cursor++;
    }

    *value = (uint16_t)parsed;
    return true;
}

static bool parse_u8_range(const char *text, uint8_t min_value, uint8_t max_value, uint8_t *value)
{
    uint16_t parsed = 0U;

    if(!parse_u16(text, &parsed) || parsed < min_value || parsed > max_value)
    {
        return false;
    }

    *value = (uint8_t)parsed;
    return true;
}

static const char *value_after_key(const char *token, const char *key)
{
    const size_t key_len = strlen(key);

    if(strncmp(token, key, key_len) == 0 && token[key_len] == '=')
    {
        return token + key_len + 1U;
    }

    return 0;
}

static bool parse_request_line(char *line, robotdog_protocol_event_t *event)
{
    char *tokens[16] = {0};
    uint8_t count = 0U;
    char *cursor = line;

    protocol_event_reset(event);

    /* Tokenize in place; delimiters become NUL bytes in the parser's buffer. */
    while(*cursor != '\0' && count < (uint8_t)(sizeof(tokens) / sizeof(tokens[0])))
    {
        while(*cursor == ' ' || *cursor == '\t')
        {
            cursor++;
        }
        if(*cursor == '\0')
        {
            break;
        }
        tokens[count++] = cursor;
        while(*cursor != '\0' && *cursor != ' ' && *cursor != '\t')
        {
            cursor++;
        }
        if(*cursor != '\0')
        {
            *cursor = '\0';
            cursor++;
        }
    }

    /* All commands share a fixed protocol prefix and caller-supplied sequence. */
    if(count < 4U || strcmp(tokens[0], "@RDS1") != 0 || strcmp(tokens[1], "REQ") != 0)
    {
        event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
        event->error = ROBOTDOG_RESULT_BAD_COMMAND;
        return true;
    }

    if(!parse_u16(tokens[2], &event->seq))
    {
        event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
        event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
        return true;
    }

    event->type = ROBOTDOG_PROTOCOL_EVENT_REQUEST;

    if(strcmp(tokens[3], "HELLO") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_HELLO;
        return true;
    }
    if(strcmp(tokens[3], "CAPS") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_CAPS;
        return true;
    }
    if(strcmp(tokens[3], "PING") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_PING;
        return true;
    }
    if(strcmp(tokens[3], "HEARTBEAT") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_HEARTBEAT;
        return true;
    }
    if(strcmp(tokens[3], "STOP") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_STOP;
        return true;
    }
    if(strcmp(tokens[3], "STATUS") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_STATUS;
        return true;
    }
    if(strcmp(tokens[3], "ENTER_IAP") == 0)
    {
        event->command = ROBOTDOG_PROTOCOL_CMD_ENTER_IAP;
        return true;
    }

    if(strcmp(tokens[3], "ACTION") == 0)
    {
        uint8_t i = 0U;

        if(count < 5U || !RobotDogAction_FromName(tokens[4], &event->action))
        {
            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }

        event->command = ROBOTDOG_PROTOCOL_CMD_ACTION;
        /* ACTION accepts only named key/value options; unknown options fail. */
        for(i = 5U; i < count; i++)
        {
            const char *value = value_after_key(tokens[i], "strength");
            if(value != 0)
            {
                if(!parse_u8_range(value, ROBOTDOG_STRENGTH_MIN, ROBOTDOG_STRENGTH_MAX, &event->strength))
                {
                    event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
                    event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
                    return true;
                }
                continue;
            }

            value = value_after_key(tokens[i], "lease_ms");
            if(value != 0)
            {
                if(!parse_u16(value, &event->lease_ms) || event->lease_ms == 0U ||
                   event->lease_ms > ROBOTDOG_MAX_LEASE_MS)
                {
                    event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
                    event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
                    return true;
                }
                continue;
            }

            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }
        return true;
    }

    if(strcmp(tokens[3], "MODE") == 0)
    {
        if(count < 5U)
        {
            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }

        event->command = ROBOTDOG_PROTOCOL_CMD_MODE;
        if(strcmp(tokens[4], "auto") == 0 || strcmp(tokens[4], "line") == 0 ||
           strcmp(tokens[4], "autonomous_line") == 0)
        {
            event->mode_request = ROBOTDOG_PROTOCOL_MODE_AUTO_LINE;
            return true;
        }
        if(strcmp(tokens[4], "idle") == 0 || strcmp(tokens[4], "off") == 0)
        {
            event->mode_request = ROBOTDOG_PROTOCOL_MODE_IDLE;
            return true;
        }

        event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
        event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
        return true;
    }

    if(strcmp(tokens[3], "CCD") == 0)
    {
        uint8_t i = 0U;

        if(count < 5U)
        {
            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }

        event->command = ROBOTDOG_PROTOCOL_CMD_CCD;
        /* CCD controls telemetry only; physical sampling continues for control. */
        if(strcmp(tokens[4], "ON") == 0)
        {
            event->ccd_request = ROBOTDOG_PROTOCOL_CCD_ON;
        }
        else if(strcmp(tokens[4], "OFF") == 0)
        {
            event->ccd_request = ROBOTDOG_PROTOCOL_CCD_OFF;
        }
        else if(strcmp(tokens[4], "ONCE") == 0)
        {
            event->ccd_request = ROBOTDOG_PROTOCOL_CCD_ONCE;
        }
        else
        {
            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }

        for(i = 5U; i < count; i++)
        {
            const char *value = value_after_key(tokens[i], "rate_hz");
            if(value == 0 || !parse_u8_range(value, 1U, ROBOTDOG_CCD_MAX_RATE_HZ, &event->ccd_rate_hz))
            {
                event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
                event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
                return true;
            }
        }
        return true;
    }

    event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
    event->error = ROBOTDOG_RESULT_BAD_COMMAND;
    return true;
}

void RobotDogProtocol_Init(robotdog_protocol_parser_t *parser)
{
    if(parser == 0)
    {
        return;
    }

    parser->line[0] = '\0';
    parser->len = 0U;
    parser->overflow = false;
    parser->overflow_count = 0U;
    parser->bad_byte_count = 0U;
}

bool RobotDogProtocol_InputByte(robotdog_protocol_parser_t *parser,
                                uint8_t byte,
                                robotdog_protocol_event_t *event)
{
    if(parser == 0 || event == 0)
    {
        return false;
    }

    protocol_event_reset(event);

    /* CR and LF are both terminators; the second byte of CRLF is ignored. */
    if(byte == '\r' || byte == '\n')
    {
        /* Recover from an overlong line only at its terminator. */
        if(parser->overflow)
        {
            parser->overflow = false;
            parser->len = 0U;
            parser->line[0] = '\0';
            parser->overflow_count++;
            event->type = ROBOTDOG_PROTOCOL_EVENT_ERROR;
            event->error = ROBOTDOG_RESULT_BAD_ARGUMENT;
            return true;
        }

        if(parser->len == 0U)
        {
            return false;
        }

        parser->line[parser->len] = '\0';
        parser->len = 0U;
        return parse_request_line(parser->line, event);
    }

    /* Nonprintable bytes are counted and discarded without poisoning the line. */
    if(byte < 0x20U || byte > 0x7EU)
    {
        parser->bad_byte_count++;
        return false;
    }

    if(parser->overflow)
    {
        return false;
    }

    if(parser->len >= (uint16_t)(ROBOTDOG_PROTOCOL_LINE_MAX - 1U))
    {
        parser->overflow = true;
        parser->len = 0U;
        return false;
    }

    parser->line[parser->len++] = (char)byte;
    return false;
}

int RobotDogProtocol_FormatOk(uint16_t seq, const char *fields, char *out, size_t out_size)
{
    robotdog_text_builder_t builder;

    RobotDogText_Init(&builder, out, out_size);
    (void)RobotDogText_Append(&builder, "@RDS1 RES ");
    (void)RobotDogText_AppendU32(&builder, seq);
    (void)RobotDogText_Append(&builder, " OK");
    if(fields != 0 && fields[0] != '\0')
    {
        (void)RobotDogText_AppendChar(&builder, ' ');
        (void)RobotDogText_Append(&builder, fields);
    }
    (void)RobotDogText_Append(&builder, "\r\n");
    return RobotDogText_Finish(&builder);
}

int RobotDogProtocol_FormatError(uint16_t seq, robotdog_result_t error, char *out, size_t out_size)
{
    robotdog_text_builder_t builder;

    RobotDogText_Init(&builder, out, out_size);
    (void)RobotDogText_Append(&builder, "@RDS1 RES ");
    (void)RobotDogText_AppendU32(&builder, seq);
    (void)RobotDogText_Append(&builder, " ERR code=");
    (void)RobotDogText_Append(&builder, RobotDogResult_Code(error));
    (void)RobotDogText_Append(&builder, "\r\n");
    return RobotDogText_Finish(&builder);
}

int RobotDogProtocol_FormatData(uint16_t seq, const char *kind, const char *fields, char *out, size_t out_size)
{
    robotdog_text_builder_t builder;

    if(kind == 0 || fields == 0)
    {
        return -1;
    }

    RobotDogText_Init(&builder, out, out_size);
    (void)RobotDogText_Append(&builder, "@RDS1 DATA ");
    (void)RobotDogText_AppendU32(&builder, seq);
    (void)RobotDogText_AppendChar(&builder, ' ');
    (void)RobotDogText_Append(&builder, kind);
    (void)RobotDogText_AppendChar(&builder, ' ');
    (void)RobotDogText_Append(&builder, fields);
    (void)RobotDogText_Append(&builder, "\r\n");
    return RobotDogText_Finish(&builder);
}
