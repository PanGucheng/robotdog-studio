#ifndef RHS_HAL_DEF_H
#define RHS_HAL_DEF_H

#ifdef __cplusplus
extern "C" {
#endif

/** Common return status for RHS HAL operations. */
typedef enum
{
    RHS_OK = 0,
    RHS_ERROR,
    RHS_INVALID_ARGUMENT
} RHS_StatusTypeDef;

#ifdef __cplusplus
}
#endif

#endif /* RHS_HAL_DEF_H */
