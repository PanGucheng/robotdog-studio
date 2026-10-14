/* Keep the TI-generated device linker script untouched. No heap is used. */
ASSERT(__heap_end__ + 4096 <= __StackTop, "Less than 4096 bytes remain for the stack")
