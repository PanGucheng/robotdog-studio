# RoboHorse Studio 远程课程更新 V1 实施任务书

## 一、任务目标

为 RoboHorse Studio 增加一个**轻量级远程课程更新机制**。

目标是：

> 今后教师只需要修改并发布 Gitee 上的课程内容，学生无需更新 RoboHorse Studio 客户端，就可以获得新版课程。

课程仓库：

```text
https://gitee.com/Cidervinegar/robohorse-courses
```

本地已经克隆至：

```text
D:\RobotDog\robohorse-courses
```

RoboHorse Studio 主工程：

```text
https://github.com/PanGucheng/robotdog-studio
```

请基于当前实际工程进行实现。

本次遵循：

**简单、稳定、够用，不进行过度工程化。**

---

# 二、现有环境

Gitee SSH 已配置并验证成功：

```text
git@gitee.com:Cidervinegar/robohorse-courses.git
```

本地课程仓库：

```text
D:\RobotDog\robohorse-courses
```

因此不要：

- 创建新的 Gitee 仓库
- 修改用户 Gitee 账号设置
- 修改 SSH 配置
- 创建 Access Token
- 使用 Gitee OpenAPI
- 修改全局 Git 配置

直接使用现有 Git/SSH 环境即可。

开始工作前执行：

```powershell
cd D:\RobotDog\robohorse-courses

git remote -v
git status
git pull
```

确认仓库状态正常。

---

# 三、先审查 RoboHorse Studio 当前课程体系

不要先按照假想架构改代码。

首先阅读当前 RoboHorse Studio 实际实现，明确：

1. 当前课程数据放在哪里
2. 当前课程目录结构
3. lesson/tutorial/exercise/example 如何组织
4. 当前课程导航如何生成
5. Renderer 如何读取课程
6. Electron Main Process 当前有哪些文件操作能力
7. 当前课程是否随安装包打包
8. 自由练习模块如何加载资源
9. MCU 教学模块如何获取：
   - 示例代码
   - 工程模板
   - 固件
   - 课程配置
10. 是否已经存在课程版本或配置机制

特别注意近期已经完成的：

- CH32V203 Pony v2.5 教学适配
- FirmwareBaselineResolver
- Teaching Adapter
- rhs_teaching_platform
- 自由练习相关功能
- 大学生版课程

本次不能破坏这些已有功能。

---

# 四、核心设计原则

本次不是重构教学系统。

核心目标只有一个：

> 将“课程从安装包内部读取”扩展为“优先从已下载课程读取”。

因此尽量保留现有：

```text
课程 schema
课程目录结构
教学组件
练习结构
示例工程
固件调用逻辑
```

不要重新设计一套课程格式。

---

# 五、Gitee 课程仓库

本地仓库固定为：

```text
D:\RobotDog\robohorse-courses
```

在充分理解当前课程结构后，将其组织为类似：

```text
D:\RobotDog\robohorse-courses
│
├── README.md
├── update.json
├── course.zip
│
├── source\
│   └── 当前正式课程源文件
│
└── scripts\
    └── publish-course.*
```

具体 `source` 内部结构：

**以 RoboHorse Studio 当前真实课程结构为准。**

不要为了符合本任务书而强行重新命名现有课程文件。

---

# 六、update.json

V1 保持极简。

建议：

```json
{
  "version": 1,
  "minAppVersion": "1.0.0",
  "url": "https://gitee.com/Cidervinegar/robohorse-courses/raw/master/course.zip"
}
```

注意：

开始前先检查 Gitee 仓库实际默认分支。

不要默认一定是：

```text
master
```

也不要默认一定是：

```text
main
```

根据实际情况生成正确 URL。

字段含义：

### version

整数递增：

```text
1
2
3
4
...
```

不需要课程 SemVer。

### minAppVersion

表示该课程最低支持的 RoboHorse Studio 版本。

### url

指向：

```text
course.zip
```

实际 Raw 下载地址。

客户端不要通过 Gitee API 查询 Release。

---

# 七、客户端课程更新流程

由 **Electron Main Process** 负责：

- HTTP 请求
- 下载
- 文件写入
- ZIP 解压
- 课程目录切换

Renderer 不直接承担 course.zip 下载。

基本流程：

```text
RoboHorse Studio 启动
        ↓
启动现有课程系统
        ↓
后台检查 update.json
        ↓
比较远程版本和本地版本
```

如果：

```text
远程 version <= 本地 version
```

则：

```text
不做任何处理
继续使用现有课程
```

如果：

```text
远程 version > 本地 version
```

则：

```text
下载 course.zip
        ↓
解压至临时目录
        ↓
确认解压成功
        ↓
替换当前远程课程缓存
        ↓
记录 version
        ↓
刷新课程数据
```

---

# 八、不要阻塞软件启动

这是重要要求。

Gitee 网络状态不能影响 RoboHorse Studio 正常打开。

禁止：

```text
启动
↓
等待 Gitee
↓
等待下载
↓
完成后才允许进入软件
```

推荐：

```text
启动 RoboHorse Studio
        ↓
立即加载现有本地课程
        ↓
同时后台检查课程更新
```

如果发现更新：

```text
下载
↓
完成
↓
提示课程更新完成
```

根据当前应用结构选择：

- 当前立即刷新

或者

- 下次进入课程时使用新版

不要为了热更新引入复杂机制。

---

# 九、本地课程缓存目录

不要将下载内容写入：

```text
Program Files
应用安装目录
resources/app
```

使用 Electron：

```ts
app.getPath("userData")
```

例如：

```text
RoboHorse Studio\
└── courses\
    ├── current\
    ├── temp\
    └── state.json
```

实际目录名称可根据现有工程风格调整。

`state.json` 最低只需要：

```json
{
  "version": 1
}
```

---

# 十、课程加载优先级

建立统一的课程根目录解析逻辑。

推荐逻辑：

```text
存在有效下载课程？
        │
       Yes
        ↓
userData/courses/current
```

否则：

```text
使用安装包内置课程
```

即：

```text
Downloaded Course
        ↓
Bundled Course
```

不要让多个 React 页面分别自行判断路径。

应尽可能集中到现有课程 Repository/Service/Resolver 中。

如果项目目前不存在这样的抽象，可以增加一个轻量级：

```text
CourseResolver
```

但不要因此大规模重构。

---

# 十一、内置课程必须继续存在

安装包仍然必须附带完整课程。

不能改成：

```text
第一次启动必须联网
```

必须满足：

### 新电脑第一次运行且断网

```text
正常使用安装包自带课程
```

### Gitee 无法访问

```text
正常使用本地课程
```

### Gitee 被墙/超时/拒绝

```text
正常使用本地课程
```

### 更新失败

```text
继续使用之前的课程
```

课程更新属于：

**增强功能，而不是应用运行前置条件。**

---

# 十二、最低限度的更新保护

本项目不做复杂校验。

不需要：

- SHA256
- Ed25519
- 数字签名
- 差分更新
- 多版本回滚
- Release 签名

但必须避免下载失败破坏现有课程。

禁止：

```text
先删除 current
↓
再下载
```

正确流程：

```text
下载 ZIP 到临时文件
        ↓
解压 temp
        ↓
解压成功
        ↓
删除旧 current
        ↓
temp → current
```

如果任何一步失败：

```text
保留旧 current
```

并清理失败的临时文件。

---

# 十三、课程兼容性

保留：

```json
"minAppVersion": "..."
```

如果：

```text
远程 minAppVersion > 当前 RoboHorse Studio 版本
```

则：

```text
不要下载/启用该课程
```

继续使用当前课程。

UI 可以提示：

```text
发现新版课程，但需要更新 RoboHorse Studio 后才能使用。
```

不要报致命错误。

---

# 十四、UI 要求

V1 不做课程中心或课程商店。

只增加必要的更新状态。

例如：

```text
课程版本：3
```

可以在当前合适的：

```text
设置
关于
课程页面
```

之一显示。

如果当前设置页合适，可以增加：

```text
检查课程更新
```

按钮。

需要支持的状态：

```text
正在检查课程更新…
课程已是最新版本
正在下载课程…
课程更新完成
课程更新失败，继续使用当前版本
新版课程需要更新软件后使用
```

提示应当：

- 非阻塞
- 不影响教学
- 不弹大量错误窗口

---

# 十五、启动自动检查

默认：

```text
每次 RoboHorse Studio 启动检查一次
```

即可。

不要增加：

- 定时轮询
- 每小时查询
- WebSocket
- 后台服务
- Windows Service

这不是实时更新系统。

---

# 十六、课程发布脚本

在：

```text
D:\RobotDog\robohorse-courses\scripts
```

提供一个简单发布脚本。

优先使用项目现有技术栈。

例如：

```text
publish-course.js
```

功能：

### 1. 获取 source

```text
source\
```

### 2. 打包

生成：

```text
course.zip
```

### 3. 读取 update.json

例如：

```json
{
  "version": 3
}
```

### 4. 自动：

```text
version + 1
```

### 5. 写回 update.json

不要让脚本直接调用 Gitee API。

---

# 十七、第一次课程迁移

将 RoboHorse Studio 当前正式课程复制/整理到：

```text
D:\RobotDog\robohorse-courses\source
```

第一次远程课程：

**必须尽量等价于当前安装包自带课程。**

本任务禁止趁机：

- 大规模重写第一课
- 调整课程顺序
- 修改教学内容
- 修改 MCU 教学逻辑
- 重构自由练习
- 更换课程 UI

先完成远程更新能力。

教学内容优化作为后续独立任务。

---

# 十八、Gitee 发布流程

因为：

```text
D:\RobotDog\robohorse-courses
```

已经配置好 SSH，所以 Agent 完成修改后直接执行：

```powershell
cd D:\RobotDog\robohorse-courses

git status
git diff

git add .
git commit -m "feat: initialize remote course distribution"
git push
```

不要：

- 修改 SSH key
- 修改 ~/.ssh/config
- 使用 Gitee Token
- 将任何凭据写进仓库

---

# 十九、RoboHorse Studio Git 操作

主工程继续保持其现有 GitHub 工作流。

如果当前 remote 为 HTTPS：

保持 HTTPS。

不要为了本任务修改 GitHub remote 或认证方式。

完成客户端改造后：

```text
git status
git diff
```

确认只包含本次相关修改。

测试通过后再 commit 和 push。

---

# 二十、禁止过度设计

本任务明确不实现：

```text
后端服务器
数据库
CMS
账号系统
课程市场
Gitee OpenAPI
Gitee OAuth
对象存储
CDN
数字签名
SHA256
增量包
Patch
多版本课程历史
灰度发布
Stable/Beta Channel
课程在线编辑器
WebSocket
自动应用更新
```

如果发现某个库/框架只是为了完成上述功能：

不要引入。

---

# 二十一、测试要求

至少完成以下测试。

## Test 1：无远程缓存

删除：

```text
userData/courses
```

启动 Studio。

要求：

```text
正常显示内置课程
```

---

## Test 2：发现新版本

例如：

```text
local version = 1
remote version = 2
```

要求：

```text
成功下载 course.zip
成功解压
成功记录 version = 2
后续加载新版课程
```

---

## Test 3：版本一致

```text
local = 2
remote = 2
```

要求：

```text
不重复下载 course.zip
```

---

## Test 4：Gitee 无网络

模拟：

```text
请求超时
DNS 失败
连接失败
```

要求：

```text
RoboHorse Studio 正常运行
课程正常打开
```

---

## Test 5：下载中断

要求：

```text
旧课程仍然存在
```

---

## Test 6：ZIP 损坏

要求：

```text
不替换 current
继续使用旧课程
```

---

## Test 7：应用重启

课程更新完成后关闭软件。

再次启动。

要求：

```text
直接读取最新缓存课程
```

---

## Test 8：软件版本不兼容

例如：

```text
current app = 1.0.0

remote:
minAppVersion = 2.0.0
```

要求：

```text
不启用远程课程
继续使用当前课程
```

---

## Test 9：现有教学功能回归测试

至少确认：

- 课程列表正常
- 课程正文正常
- 图片资源正常
- 示例代码正常
- 练习正常
- 自由练习正常
- 固件 Build 正常
- Flash 流程未受影响
- CH32V203 Pony v2.5 baseline 解析正常

---

# 二十二、完成后的最终发布状态

最终结构应形成：

```text
GitHub
PanGucheng/robotdog-studio

负责：
RoboHorse Studio 程序本体
课程运行引擎
MCU/Firmware 能力
```

以及：

```text
Gitee
Cidervinegar/robohorse-courses

本地：
D:\RobotDog\robohorse-courses

负责：
课程内容
课程版本
course.zip
update.json
```

发布流程：

```text
修改课程
    ↓
D:\RobotDog\robohorse-courses\source
    ↓
运行 publish-course
    ↓
生成 course.zip
    ↓
version + 1
    ↓
git commit
    ↓
git push Gitee
    ↓
学生打开 RoboHorse Studio
    ↓
自动发现课程更新
    ↓
下载并使用新版课程
```

---

# 二十三、最终汇报

完成以后不要只说“已经完成”。

必须提供：

## RoboHorse Studio

1. 修改文件列表
2. 新增文件列表
3. 课程解析逻辑
4. 更新检查逻辑
5. 本地缓存实际路径
6. UI 变化
7. 测试结果
8. GitHub commit hash
9. 是否已经 push

## robohorse-courses

1. 最终目录树
2. `update.json` 内容
3. 实际默认分支
4. update.json Raw URL
5. course.zip Raw URL
6. `source` 来源
7. 发布脚本使用方法
8. 当前课程 version
9. Gitee commit hash
10. 是否已经 push

最后确认：

```text
RoboHorse Studio 原有构建通过
自动化测试通过
课程功能回归测试通过
Gitee 远程课程下载测试通过
```

后再结束任务。