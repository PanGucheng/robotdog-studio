#include "number_tools.h"

uint8_t NumberTools_ClampU8(uint8_t value, uint8_t upper_limit)
{
    if(value > upper_limit)
    {
        return upper_limit;
    }

    return value;
}
