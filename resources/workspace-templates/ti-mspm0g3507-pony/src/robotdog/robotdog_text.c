#include "robotdog_text.h"

/*
 * Small fail-closed text builder. Once an append would overflow, valid is
 * cleared and Finish returns -1, ensuring no partial protocol line is sent.
 */
void RobotDogText_Init(robotdog_text_builder_t *builder, char *buffer, size_t capacity)
{
    if(builder == 0)
    {
        return;
    }

    builder->buffer = buffer;
    builder->capacity = capacity;
    builder->length = 0U;
    builder->valid = buffer != 0 && capacity > 0U;
    if(builder->valid)
    {
        buffer[0] = '\0';
    }
}

bool RobotDogText_AppendChar(robotdog_text_builder_t *builder, char value)
{
    if(builder == 0 || !builder->valid || builder->length + 1U >= builder->capacity)
    {
        if(builder != 0)
        {
            builder->valid = false;
        }
        return false;
    }

    builder->buffer[builder->length++] = value;
    builder->buffer[builder->length] = '\0';
    return true;
}

bool RobotDogText_Append(robotdog_text_builder_t *builder, const char *text)
{
    if(builder == 0 || text == 0)
    {
        if(builder != 0)
        {
            builder->valid = false;
        }
        return false;
    }

    while(*text != '\0')
    {
        if(!RobotDogText_AppendChar(builder, *text++))
        {
            return false;
        }
    }
    return true;
}

bool RobotDogText_AppendU32(robotdog_text_builder_t *builder, uint32_t value)
{
    char digits[10];
    uint8_t count = 0U;

    /* Collect least-significant digits, then append them in reverse order. */
    do
    {
        digits[count++] = (char)('0' + (value % 10U));
        value /= 10U;
    } while(value != 0U && count < (uint8_t)sizeof(digits));

    while(count > 0U)
    {
        if(!RobotDogText_AppendChar(builder, digits[--count]))
        {
            return false;
        }
    }
    return true;
}

bool RobotDogText_AppendHex32(robotdog_text_builder_t *builder, uint32_t value, uint8_t width)
{
    static const char hex[] = "0123456789abcdef";
    int8_t shift = 0;

    if(width == 0U || width > 8U)
    {
        if(builder != 0)
        {
            builder->valid = false;
        }
        return false;
    }

    shift = (int8_t)((width - 1U) * 4U);
    while(shift >= 0)
    {
        if(!RobotDogText_AppendChar(builder, hex[(value >> (uint8_t)shift) & 0x0FU]))
        {
            return false;
        }
        shift = (int8_t)(shift - 4);
    }
    return true;
}

int RobotDogText_Finish(robotdog_text_builder_t *builder)
{
    if(builder == 0 || !builder->valid || builder->length >= builder->capacity)
    {
        return -1;
    }

    builder->buffer[builder->length] = '\0';
    return (int)builder->length;
}
