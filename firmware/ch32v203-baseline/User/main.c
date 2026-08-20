/********************************** (C) COPYRIGHT *******************************
 * CH32V203 firmware baseline application.
 *
 * This file intentionally contains no board pin mapping and no peripheral
 * activity.  It is the first-stage reset/system/linker build proof.
 *******************************************************************************/

#include "ch32v20x.h"

int main(void)
{
    SystemCoreClockUpdate();

    for (;;)
    {
        /* Intentionally idle: no GPIO, UART, timer, CCD, or servo activity. */
    }
}
