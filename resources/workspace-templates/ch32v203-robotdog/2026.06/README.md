# RobotDog CH32V203 学生工程

这是 RobotDog Studio 管理的巡线教学模板。AI 修改功能只会在候选副本中修改允许的学生文件。

- `Core/Src/student_control.c`：根据最新的 128 点 CCD 快照选择停止、前进或转弯。
- `Core/Inc/student_control.h`：学生控制接口；输入只读，输出会由固件安全层再次检查。
- `student-config/line-following.yaml`：巡线目标和转弯强度，构建时生成只读 C 头文件。

每次新建学生对话都会复制一份本模板并初始化独立 Git。完整 SDK 是只读参考，不会被复制到这里，也不会被学生或 AI 直接修改。
