#include "robotdog_protocol.h"
#include "robotdog_safety.h"
#include "robotdog_student_bridge.h"
#include "robotdog_telemetry.h"
#include "robotdog_text.h"
#include "robotdog_tx_queue.h"

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ASSERT_TRUE(expr) do { if(!(expr)) { fail(__FILE__, __LINE__, #expr); } } while(0)
#define ASSERT_EQ_U(a, b) ASSERT_TRUE((unsigned)(a) == (unsigned)(b))
#define ASSERT_EQ_S(a, b) ASSERT_TRUE(strcmp((a), (b)) == 0)

static void fail(const char *file, int line, const char *expr)
{
    fprintf(stderr, "%s:%d: assertion failed: %s\n", file, line, expr);
    exit(1);
}

static bool feed(robotdog_protocol_parser_t *parser, const char *text, robotdog_protocol_event_t *event)
{
    bool got = false;
    size_t i = 0U;
    robotdog_protocol_event_t current;

    for(i = 0U; text[i] != '\0'; i++)
    {
        if(RobotDogProtocol_InputByte(parser, (uint8_t)text[i], &current))
        {
            got = true;
            *event = current;
        }
    }
    return got;
}

static void test_protocol_basic(void)
{
    robotdog_protocol_parser_t parser;
    robotdog_protocol_event_t event;

    RobotDogProtocol_Init(&parser);
    ASSERT_TRUE(!feed(&parser, "@RDS1 REQ 42 ACT", &event));
    ASSERT_TRUE(feed(&parser, "ION walk strength=18 lease_ms=500\r\n", &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_REQUEST);
    ASSERT_EQ_U(event.command, ROBOTDOG_PROTOCOL_CMD_ACTION);
    ASSERT_EQ_U(event.seq, 42U);
    ASSERT_EQ_U(event.action, ROBOTDOG_ACTION_WALK);
    ASSERT_EQ_U(event.strength, 18U);
    ASSERT_EQ_U(event.lease_ms, 500U);
}

static void test_protocol_sticky_and_errors(void)
{
    robotdog_protocol_parser_t parser;
    robotdog_protocol_event_t event;
    unsigned events = 0U;
    const char *text = "@RDS1 REQ 1 PING\r\n@RDS1 REQ 2 STOP\r\n";
    size_t i = 0U;
    robotdog_protocol_event_t current;

    RobotDogProtocol_Init(&parser);
    for(i = 0U; text[i] != '\0'; i++)
    {
        if(RobotDogProtocol_InputByte(&parser, (uint8_t)text[i], &current))
        {
            events++;
            event = current;
        }
    }
    ASSERT_EQ_U(events, 2U);
    ASSERT_EQ_U(event.seq, 2U);
    ASSERT_EQ_U(event.command, ROBOTDOG_PROTOCOL_CMD_STOP);

    RobotDogProtocol_Init(&parser);
    ASSERT_TRUE(feed(&parser, "@RDS1 REQ 3 ACTION walk strength=99\r\n", &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_ERROR);
    ASSERT_EQ_U(event.error, ROBOTDOG_RESULT_BAD_ARGUMENT);

    RobotDogProtocol_Init(&parser);
    for(i = 0U; i < ROBOTDOG_PROTOCOL_LINE_MAX + 5U; i++)
    {
        (void)RobotDogProtocol_InputByte(&parser, (uint8_t)'A', &event);
    }
    ASSERT_TRUE(RobotDogProtocol_InputByte(&parser, (uint8_t)'\n', &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_ERROR);
    ASSERT_EQ_U(parser.overflow_count, 1U);

    RobotDogProtocol_Init(&parser);
    ASSERT_TRUE(feed(&parser, "noise\r\n", &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_ERROR);
    ASSERT_TRUE(feed(&parser, "@RDS1 REQ 9 PING\r\n", &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_REQUEST);
    ASSERT_EQ_U(event.seq, 9U);

    RobotDogProtocol_Init(&parser);
    ASSERT_TRUE(feed(&parser, "@RDS1 REQ 70000 STOP\r\n", &event));
    ASSERT_EQ_U(event.type, ROBOTDOG_PROTOCOL_EVENT_ERROR);
    ASSERT_EQ_U(event.error, ROBOTDOG_RESULT_BAD_ARGUMENT);
}

static void test_protocol_formatting(void)
{
    char out[96];
    char too_small[8];
    robotdog_text_builder_t builder;

    ASSERT_TRUE(RobotDogProtocol_FormatOk(42U, "pong=1", out, sizeof(out)) > 0);
    ASSERT_EQ_S(out, "@RDS1 RES 42 OK pong=1\r\n");
    ASSERT_TRUE(RobotDogProtocol_FormatError(7U, ROBOTDOG_RESULT_BUSY, out, sizeof(out)) > 0);
    ASSERT_EQ_S(out, "@RDS1 RES 7 ERR code=BUSY\r\n");
    ASSERT_TRUE(RobotDogProtocol_FormatData(3U, "TEST", "value=1", out, sizeof(out)) > 0);
    ASSERT_EQ_S(out, "@RDS1 DATA 3 TEST value=1\r\n");
    ASSERT_TRUE(RobotDogProtocol_FormatOk(1U, "pong=1", too_small, sizeof(too_small)) < 0);

    RobotDogText_Init(&builder, out, sizeof(out));
    ASSERT_TRUE(RobotDogText_AppendHex32(&builder, 0x1A2B3C4DU, 8U));
    ASSERT_EQ_U(RobotDogText_Finish(&builder), 8U);
    ASSERT_EQ_S(out, "1a2b3c4d");
}

static void test_safety_boundaries(void)
{
    robotdog_safety_t safety;

    RobotDogSafety_Init(&safety, 0U);
    RobotDogSafety_SetReady(&safety);
    ASSERT_EQ_U(safety.mode, ROBOTDOG_MODE_IDLE);

    ASSERT_EQ_U(RobotDogSafety_RequestManualAction(&safety, 0U, ROBOTDOG_ACTION_WALK, 18U, 1000U),
                ROBOTDOG_RESULT_OK);
    ASSERT_TRUE(!RobotDogSafety_Tick(&safety, 499U));
    ASSERT_TRUE(RobotDogSafety_Tick(&safety, 500U));
    ASSERT_EQ_U(safety.stop_reason, ROBOTDOG_STOP_HEARTBEAT_TIMEOUT);

    RobotDogSafety_Init(&safety, 0U);
    RobotDogSafety_SetReady(&safety);
    ASSERT_EQ_U(RobotDogSafety_RequestManualAction(&safety, 0U, ROBOTDOG_ACTION_WALK, 18U, 500U),
                ROBOTDOG_RESULT_OK);
    RobotDogSafety_Heartbeat(&safety, 400U);
    ASSERT_TRUE(RobotDogSafety_Tick(&safety, 500U));
    ASSERT_EQ_U(safety.stop_reason, ROBOTDOG_STOP_ACTION_LEASE_TIMEOUT);

    RobotDogSafety_Init(&safety, 0U);
    RobotDogSafety_SetReady(&safety);
    ASSERT_EQ_U(RobotDogSafety_EnterAutonomous(&safety, 0U), ROBOTDOG_RESULT_OK);
    RobotDogSafety_ReportLine(&safety, 10U, true);
    ASSERT_TRUE(!RobotDogSafety_Tick(&safety, 509U));
    ASSERT_TRUE(RobotDogSafety_Tick(&safety, 510U));
    ASSERT_EQ_U(safety.stop_reason, ROBOTDOG_STOP_LINE_LOST);

    RobotDogSafety_Init(&safety, 0U);
    RobotDogSafety_SetReady(&safety);
    ASSERT_EQ_U(RobotDogSafety_RequestManualAction(&safety, 0U, ROBOTDOG_ACTION_WALK, 18U, 1000U),
                ROBOTDOG_RESULT_OK);
    RobotDogSafety_Stop(&safety, ROBOTDOG_STOP_USER, 1U);
    RobotDogSafety_Stop(&safety, ROBOTDOG_STOP_USER, 2U);
    ASSERT_EQ_U(safety.mode, ROBOTDOG_MODE_IDLE);
    ASSERT_EQ_U(safety.action, ROBOTDOG_ACTION_STOP);
    ASSERT_TRUE(!safety.action_active);

    ASSERT_EQ_U(RobotDogSafety_EnterAutonomous(&safety, 3U), ROBOTDOG_RESULT_OK);
    RobotDogSafety_Stop(&safety, ROBOTDOG_STOP_USER, 4U);
    ASSERT_EQ_U(safety.mode, ROBOTDOG_MODE_IDLE);
    ASSERT_EQ_U(RobotDogSafety_EnterUpdate(&safety, 5U), ROBOTDOG_RESULT_OK);
    RobotDogSafety_Stop(&safety, ROBOTDOG_STOP_USER, 6U);
    ASSERT_EQ_U(safety.mode, ROBOTDOG_MODE_IDLE);
    RobotDogSafety_EnterError(&safety, ROBOTDOG_STOP_RUNTIME_ERROR, 7U);
    RobotDogSafety_Stop(&safety, ROBOTDOG_STOP_USER, 8U);
    ASSERT_EQ_U(safety.mode, ROBOTDOG_MODE_IDLE);
}

static void test_student_bridge(void)
{
    uint8_t pixels[ROBOTDOG_CCD_PIXELS] = {0};
    robotdog_student_bridge_input_t input;
    robotdog_student_bridge_output_t output;

    RobotDogStudentBridge_Init();
    memset(&input, 0, sizeof(input));
    input.now_ms = 20U;
    input.line_valid = true;
    input.line_center = 64U;
    input.threshold = 120U;
    input.pixels = pixels;

    RobotDogStudentBridge_Update(&input, &output);
    ASSERT_TRUE(output.valid);
    ASSERT_EQ_U(output.action, ROBOTDOG_ACTION_WALK);
    ASSERT_EQ_U(output.strength, 18U);

    input.line_center = 30U;
    RobotDogStudentBridge_Update(&input, &output);
    ASSERT_TRUE(output.valid);
    ASSERT_EQ_U(output.action, ROBOTDOG_ACTION_TURN_LEFT);

    input.line_valid = false;
    RobotDogStudentBridge_Update(&input, &output);
    ASSERT_TRUE(output.valid);
    ASSERT_EQ_U(output.action, ROBOTDOG_ACTION_STOP);

    RobotDogStudentBridge_Update(0, &output);
    ASSERT_TRUE(!output.valid);

    RobotDogStudentBridge_Update(&input, 0);
}

static void test_ccd_formatting_and_tx_priority(void)
{
    uint8_t pixels[ROBOTDOG_CCD_PIXELS];
    robotdog_telemetry_ccd_t ccd;
    robotdog_tx_queue_t queue;
    char ccd_frame[800];
    char output[900];
    const char *high = "@RDS1 RES 99 OK state=idle\r\n";
    size_t ccd_length = 0U;
    size_t output_length = 0U;
    uint8_t byte = 0U;
    unsigned iteration = 0U;

    memset(pixels, 255, sizeof(pixels));
    ccd.line_valid = true;
    ccd.center = 64U;
    ccd.threshold = 127U;
    ccd.min_value = 0U;
    ccd.max_value = 255U;
    ccd.pixels = pixels;

    for(iteration = 0U; iteration < 2000U; iteration++)
    {
        ASSERT_TRUE(RobotDogTelemetry_FormatCcd((uint16_t)(iteration + 1U),
                                                &ccd,
                                                ccd_frame,
                                                sizeof(ccd_frame)) > 0);
    }
    ASSERT_TRUE(strncmp(ccd_frame, "@RDS1 DATA ", 11U) == 0);
    ASSERT_TRUE(strstr(ccd_frame, " CCD valid=1 center=64 threshold=127 min=0 max=255 pixels=") != 0);
    ccd_length = strlen(ccd_frame);
    ASSERT_TRUE(ccd_length < sizeof(ccd_frame));
    ASSERT_TRUE(ccd_length > 500U);
    ASSERT_EQ_S(ccd_frame + ccd_length - 2U, "\r\n");

    RobotDogTxQueue_Init(&queue);
    ASSERT_TRUE(RobotDogTxQueue_Enqueue(&queue, ccd_frame, ROBOTDOG_TX_NORMAL));
    ASSERT_TRUE(RobotDogTxQueue_NormalBusy(&queue));
    ASSERT_TRUE(RobotDogTxQueue_Enqueue(&queue, high, ROBOTDOG_TX_HIGH));
    while(RobotDogTxQueue_PopByte(&queue, &byte))
    {
        ASSERT_TRUE(output_length + 1U < sizeof(output));
        output[output_length++] = (char)byte;
    }
    output[output_length] = '\0';
    ASSERT_TRUE(!RobotDogTxQueue_NormalBusy(&queue));
    ASSERT_TRUE(strncmp(output, high, strlen(high)) == 0);
    ASSERT_EQ_S(output + strlen(high), ccd_frame);

    RobotDogTxQueue_Init(&queue);
    ASSERT_TRUE(RobotDogTxQueue_Enqueue(&queue, ccd_frame, ROBOTDOG_TX_NORMAL));
    output_length = 0U;
    while(output_length < 20U)
    {
        ASSERT_TRUE(RobotDogTxQueue_PopByte(&queue, &byte));
        output[output_length++] = (char)byte;
    }
    ASSERT_TRUE(RobotDogTxQueue_Enqueue(&queue, high, ROBOTDOG_TX_HIGH));
    ASSERT_TRUE(!RobotDogTxQueue_Enqueue(&queue, ccd_frame, ROBOTDOG_TX_NORMAL));
    while(RobotDogTxQueue_PopByte(&queue, &byte))
    {
        ASSERT_TRUE(output_length + 1U < sizeof(output));
        output[output_length++] = (char)byte;
    }
    output[output_length] = '\0';
    ASSERT_TRUE(strncmp(output, ccd_frame, ccd_length) == 0);
    ASSERT_EQ_S(output + ccd_length, high);
    ASSERT_EQ_U(RobotDogTxQueue_Dropped(&queue), 1U);
    printf("CCD stress passed: 2000 frames, frame_bytes=%zu\n", ccd_length);
}

int main(void)
{
    test_protocol_basic();
    test_protocol_sticky_and_errors();
    test_protocol_formatting();
    test_safety_boundaries();
    test_student_bridge();
    test_ccd_formatting_and_tx_priority();
    puts("host C tests passed");
    return 0;
}
