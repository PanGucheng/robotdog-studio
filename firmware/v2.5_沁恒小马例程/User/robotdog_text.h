#ifndef ROBOTDOG_TEXT_H
#define ROBOTDOG_TEXT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    /* Bounded append-only formatter used instead of printf on the MCU. */
    char *buffer;
    size_t capacity;
    size_t length;
    bool valid;
} robotdog_text_builder_t;

/* Bind a builder to caller-owned storage and reset its state. */
void RobotDogText_Init(robotdog_text_builder_t *builder, char *buffer, size_t capacity);

/* Append text or one character; overflow marks the builder invalid. */
bool RobotDogText_Append(robotdog_text_builder_t *builder, const char *text);
bool RobotDogText_AppendChar(robotdog_text_builder_t *builder, char value);
bool RobotDogText_AppendU32(robotdog_text_builder_t *builder, uint32_t value);
bool RobotDogText_AppendHex32(robotdog_text_builder_t *builder, uint32_t value, uint8_t width);
/* NUL-terminate and return length, or -1 after invalid input/overflow. */
int RobotDogText_Finish(robotdog_text_builder_t *builder);

#endif /* ROBOTDOG_TEXT_H */
