#ifndef MCU_EXPERIMENT_H
#define MCU_EXPERIMENT_H

#include "student_control.h"

void Experiment_Init(void);
void Experiment_Update(const student_control_input_t *input,
                       student_control_output_t *output);

#endif /* MCU_EXPERIMENT_H */
