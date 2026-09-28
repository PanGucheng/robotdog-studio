#include "experiment.h"
#include "ch32v20x_gpio.h"
#include "ch32v20x_rcc.h"
#include "debug.h"

void RHS_Experiment_Init(void)
{
    /* 毫秒延时初始化，供 Delay_Ms 使用 */
    Delay_Init();

    /* 任务 2：开启 GPIOB 外设时钟 */
    // TODO: 调用 RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);

    /* 任务 3：配置 PB8 推挽输出参数 */
    // TODO: 定义 GPIO_InitTypeDef GPIO_InitStructure;
    // TODO: GPIO_InitStructure.GPIO_Pin = GPIO_Pin_8;
    // TODO: GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    // TODO: GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;

    /* 任务 4：调用初始化函数写入硬件 */
    // TODO: 调用 GPIO_Init(GPIOB, &GPIO_InitStructure);
}

void RHS_Experiment_Loop(void)
{
    /* 任务 6 & 任务 9：控制引脚高低电平与延时 */
    // 提示：
    // 点亮 LED（输出低电平）：GPIO_ResetBits(GPIOB, GPIO_Pin_8);
    // 熄灭 LED（输出高电平）：GPIO_SetBits(GPIOB, GPIO_Pin_8);
    // 毫秒级延时：Delay_Ms(500);
}
