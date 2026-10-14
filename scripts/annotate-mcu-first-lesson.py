"""Editable annotations over native PNG captures; crop only, never resample."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('course_annotations', ROOT / 'scripts/annotate-ti-first-lesson.py')
annotations = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(annotations)
annotations.AUTHOR = ROOT / 'docs/courses/assets/mcu-first-lesson-20261014'
annotations.ASSETS = ROOT / 'resources/courses/mcu-foundations/ch32v203-foundations/lectures/first-program-on-chip/assets'

FIGURES = [
    dict(name='studio-home', source='studio-home', crop=(0,34,2560,1060), title='从沁恒版首页进入课程',
         boxes=[(430,825,175,90)], labels=['点击「课程学习」中的「进入课程」。']),
    dict(name='studio-course', source='studio-course', crop=(0,180,2560,1300), title='课程中心：选第一课，再点击开始学习',
         boxes=[(55,505,770,145),(2315,1155,180,90)], labels=['① 左侧选择第一课；② 右下角点击「开始学习」。']),
    dict(name='studio-reader', source='studio-reader', crop=(0,180,2560,1320), title='阅读讲义：左侧目录定位，中间阅读',
         boxes=[(15,210,415,280)], labels=['点击左侧章节标题跳转；图片中的图框是教学标注。','阅读后滚动到讲义末尾，点击「开始实验」。']),
    dict(name='studio-start', source='studio-start', crop=(760,790,1490,620), title='讲义末尾：创建自己的实验工程',
         boxes=[(150,480,250,95)], labels=['点击「开始实验」，Studio 创建独立工程副本。']),
    dict(name='studio-workbench', source='studio-workbench', crop=(0,180,2560,1340), title='先认识实验工作台的五个区域',
         boxes=[(55,250,400,215),(485,190,1360,680),(1170,15,660,150),(1880,320,630,640),(485,865,1360,460)],
         badges=[(360,220,'1'),(1640,735,'2'),(1700,165,'3'),(2400,1010,'4'),(1650,1110,'5')],
         labels=['① 文件树　② 代码编辑器　③ 保存 / 编译 / 烧录','④ 实验任务与知识参考　⑤ 底部日志与问题；右下角机器人打开 AI 助教。']),
    dict(name='studio-ai-tutor', source='studio-ai-tutor', crop=(1190,200,1360,1290), title='AI 助教：从当前任务提出问题',
         boxes=[(60,810,665,240),(960,625,155,95),(1240,1190,115,90)],
         labels=['任务中的「问 AI」准备提问；先补充问题，再按 Enter 发送。','Shift + Enter 换行；拖动顶部移动，右下角调整大小，× 收起。']),
    dict(name='studio-locate', source='studio-locate', crop=(1165,200,1360,1150), title='定位文件与参数',
         boxes=[(765,680,550,55),(980,735,205,80)], labels=['点击任务中的「定位对象」。','自动打开 experiment.c 并定位第 5 行；左侧代码区显示参数。']),
    dict(name='studio-edit', source='studio-edit', crop=(485,200,1360,980), title='第 5 行：只把 500U 改为 1000U',
         boxes=[(120,410,750,65)], labels=['保留 blink_period_ms、U 和分号；其余代码保持原样。']),
    dict(name='studio-save', source='studio-edit', crop=(485,185,1360,490), title='保存后再编译',
         boxes=[(915,10,135,75),(1045,10,140,75),(1190,10,135,75)],
         labels=['Ctrl + S 或点「保存」。','看到「已保存」后，再点「编译」。']),
    dict(name='studio-build', source='studio-build', crop=(485,1010,1360,500), title='终端：确认完整程序已经生成',
         boxes=[(700,35,600,70)], labels=['等待「编译完成」与 ELF / HEX / BIN / MAP 产物。','编译成功只证明电脑已生成固件；连接开发板后才能烧录并观察。']),
    dict(name='studio-compare', source='studio-compare', crop=(485,200,1360,650), title='对比实验：改为 100U 后再次保存、编译',
         boxes=[(120,410,750,65)], labels=['100U 是每次翻转前约 0.1 秒；完整亮灭一轮约 0.2 秒。']),
]

if __name__ == '__main__':
    figures = [annotations.author_figure(figure) for figure in FIGURES]
    manifest = dict(date='2026-10-14', edition='mcu-foundations', capture='Alt+PrintScreen -> clipboard bitmap -> lossless PNG',
                    resampling=False, hardware='not-connected', figures=figures)
    (annotations.AUTHOR / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Authored {len(figures)} editable draw.io files.')
