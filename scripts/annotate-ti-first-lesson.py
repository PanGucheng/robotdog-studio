"""Author editable draw.io annotations over unscaled, real window PNG captures.

Run with the bundled Python/Pillow runtime, then export each .drawio with draw.io Desktop.
The capture image is cropped only. Text, highlights and numbered badges remain editable.
"""
from pathlib import Path
import base64
import json
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
AUTHOR = ROOT / 'docs/courses/assets/ti-first-lesson-v3'
ASSETS = ROOT / 'resources/courses/ti-mspm0-foundations/ti-mspm0-gpio-foundations/lectures/gpio-sysconfig-toggle/assets'

# Rectangles and points use original physical pixels, not the Computer Use preview.
FIGURES = [
    dict(name='studio-home', source='studio-home', crop=(0,34,1920,880), title='从首页进入课程学习',
         boxes=[(255,660,190,90)], labels=['① 点击「进入课程」，进入 TI 第一课。']),
    dict(name='studio-course', source='studio-course', crop=(0,150,2560,1110), title='课程中心：先选第一课，再打开讲义',
         boxes=[(40,430,785,110),(2320,1020,190,70)], labels=['① 左侧选择第一课。② 右下角打开本课。','截图为制作中的作者验证界面；发布后的按钮以实际界面为准。']),
    dict(name='studio-reader', source='studio-reader', crop=(0,150,2560,1370), title='讲义阅读页：用左侧目录定位章节',
         boxes=[(12,160,330,870)], labels=['① 左侧为课程目录；② 中间阅读讲义。','阅读后向下滚动，到讲义末尾点击「开始实验」。']),
    dict(name='studio-start', source='studio-start', crop=(760,920,1370,530), title='讲义末尾：点击「开始实验」',
         boxes=[(215,400,220,80)], labels=['Studio 会创建当前课次的独立工程副本。']),
    dict(name='studio-workbench', source='studio-workbench', crop=(0,150,2560,1370), title='工作台：找到入口，再进行操作',
         boxes=[(230,50,240,75),(40,435,360,70),(1390,60,435,100),(1875,600,650,590),(490,1070,1350,280)],
         badges=[(365,140,'1'),(375,515,'2'),(1680,170,'3'),(2380,555,'4'),(1700,990,'5'),(2370,1260,'6')],
         labels=['① SysConfig　② 工程文件树　③ 保存 / 编译 / 烧录','④ 实验任务与知识参考　⑤ 构建日志与问题　⑥ AI 助教；中间为代码编辑器。']),
    dict(name='studio-ai-tutor', source='studio-ai-tutor', crop=(1125,180,1430,1310), title='遇到疑问时，打开 AI 助教',
         boxes=[(70,540,650,230),(1290,1210,115,95),(1030,600,150,70)],
         labels=['右下角机器人打开助教；任务中的「问 AI」可带入当前步骤。','在输入框写清楚问题，Enter 发送，Shift + Enter 换行。','拖动窗口顶部移动位置；右下角调整大小，右上角 × 收起。']),
    dict(name='studio-edit-interval', source='studio-edit-interval', crop=(485,200,1360,920), title='实验 B：将第 4 行的 500U 改为 1000U',
         boxes=[(785,290,110,50),(910,10,135,90)], labels=['只改数字，保留 U 和分号；点击保存，确认「已保存」后重新编译。']),
    dict(name='studio-blue-program', source='studio-blue-program', crop=(485,200,1360,920), title='实验 C：程序也要切换到蓝色通道',
         boxes=[(835,740,390,50),(785,290,110,50)], labels=['第 14 行改用 GPIO_LEDS_LED_BLUE_PIN；间隔仍为 1000U。','先保存 main.c，再点击编译；只改 SysConfig 不会切换程序的控制目标。']),
    dict(name='sysconfig-overview', source='sysconfig-overview', crop=(0,34,2560,1490), title='先认识 SysConfig 的五个区域',
         badges=[(255,30,'1'),(435,600,'2'),(1430,530,'3'),(2450,145,'4'),(2400,950,'5')],
         labels=['① FILE：保存配置　② 左侧：选择外设　③ 中间：填写当前外设参数','④ Problems：查看配置错误　⑤ 芯片图：查看引脚分配；本课从左侧 GPIO 进入。']),
    dict(name='sysconfig-gpio-group', source='sysconfig-overview', crop=(55,125,1465,790), title='在左侧选 GPIO，进入已有的 GPIO_LEDS',
         boxes=[(50,350,370,75),(955,315,500,70),(1070,535,140,75)],
         labels=['组端口为 PORTA；本课点击下方 Group Pins 的 ADD。','上方 ADD 新建 GPIO 分组；下方 ADD 才在当前组中增加引脚。']),
    dict(name='sysconfig-add-pin', source='sysconfig-add-pin', crop=(55,125,1465,1040), title='Group Pins 的 ADD：新增第 3 个引脚',
         boxes=[(1070,535,140,75),(490,750,940,90)], labels=['确认数量变成 3 added，并出现 PIN_0；原有绿、红引脚仍保留。']),
    dict(name='sysconfig-blue-name', source='sysconfig-blue-name', crop=(55,125,1465,1060), title='在新增引脚内填写 Name 和 Direction',
         boxes=[(950,830,480,85)], labels=['Name 输入 LED_BLUE（全大写）；Direction 保持 Output。','Group Pins 中应同时看到 LED_GREEN、LED_RED、LED_BLUE。']),
    dict(name='sysconfig-initial-menu', source='sysconfig-initial-menu', crop=(55,125,1465,1130), title='Initial Value：展开菜单，选择 Set',
         boxes=[(950,940,480,60),(960,1030,170,65)], labels=['在 LED_BLUE 的 Initial Value 菜单中选择 Set。','本板 LED 低电平点亮：Set 为初始高电平，让蓝灯先熄灭。']),
    dict(name='sysconfig-blue-settings', source='sysconfig-blue-settings', crop=(55,125,1465,1330), title='绑定 PA6：检查蓝色引脚完整配置',
         boxes=[(950,830,480,175),(950,1125,480,175)], labels=['核对：LED_BLUE / Output / Set / Assigned Port PORTA / Assigned Pin 6。','Assigned Pin 填数字 6；PORTA + 6 对应 PA6。']),
    dict(name='sysconfig-save-menu', source='sysconfig-save-menu', crop=(0,34,1520,890), title='左上角 FILE → Save：保存到当前工程',
         boxes=[(40,30,95,65),(30,145,590,60)], labels=['点击 Save，或按 Ctrl + S；标题末尾的 * 应消失。','保存的是 .syscfg；返回 Studio 后还要保存程序并重新编译。']),
]

def author_figure(spec):
    ASSETS.mkdir(parents=True, exist_ok=True)
    (AUTHOR / 'annotations').mkdir(parents=True, exist_ok=True)
    original = Image.open(AUTHOR / 'raw' / (spec['source'] + '.png'))
    x,y,w,h = spec['crop']
    if x+w > original.width or y+h > original.height:
        raise ValueError(f"Crop outside capture: {spec['name']}")
    crop = original.crop((x,y,x+w,y+h))
    crop_path = AUTHOR / 'annotations' / (spec['name'] + '-crop.png')
    crop.save(crop_path)
    data = base64.b64encode(crop_path.read_bytes()).decode()
    header = 140 if w > 2000 else 100
    line_height = 85 if w > 2000 else 70
    total_height = header+h+line_height*len(spec['labels'])+30
    mxfile=ET.Element('mxfile', {'host':'app.diagrams.net','version':'29.0.0'})
    diagram=ET.SubElement(mxfile,'diagram',{'name':spec['title'],'id':spec['name']})
    model=ET.SubElement(diagram,'mxGraphModel',{'adaptiveColors':'auto','grid':'0','page':'0','pageWidth':str(w),'pageHeight':str(total_height)})
    tree=ET.SubElement(model,'root')
    ET.SubElement(tree,'mxCell',{'id':'0'})
    ET.SubElement(tree,'mxCell',{'id':'1','parent':'0'})
    def cell(id, text, style, x,y,w,h):
        c=ET.SubElement(tree,'mxCell',{'id':id,'value':text,'style':style,'vertex':'1','parent':'1'})
        ET.SubElement(c,'mxGeometry',{'x':str(x),'y':str(y),'width':str(w),'height':str(h),'as':'geometry'})
    cell('background','','fillColor=#ffffff;strokeColor=none;',0,0,w,total_height)
    cell('title',spec['title'],f'text;html=1;align=left;verticalAlign=middle;fontFamily=Microsoft YaHei;fontSize={66 if w>2000 else 48};fontStyle=1;fontColor=#123044;spacingLeft=26;',0,0,w,header)
    cell('real-capture','',f'shape=image;imageAspect=0;aspect=fixed;image=data:image/png,{data};',0,header,w,h)
    for n,(bx,by,bw,bh) in enumerate(spec.get('boxes',[])):
        cell(f'highlight-{n}','','rounded=1;arcSize=10;fillColor=none;strokeColor=#e06917;strokeWidth=5;',bx,header+by,bw,bh)
    for n,(bx,by,label) in enumerate(spec.get('badges',[])):
        cell(f'number-{n}',label,'ellipse;html=1;fillColor=#087f8c;strokeColor=#ffffff;strokeWidth=5;fontColor=#ffffff;fontStyle=1;fontSize=52;fontFamily=Microsoft YaHei;',bx,header+by,80,80)
    for n,text in enumerate(spec['labels']):
        cell(f'caption-{n}',text,f'text;html=1;whiteSpace=wrap;align=left;verticalAlign=middle;fillColor=#edf7f8;strokeColor=none;fontFamily=Microsoft YaHei;fontSize={48 if w>2000 else 34};fontColor=#123044;spacingLeft=24;',0,header+h+15+n*line_height,w,line_height)
    target=AUTHOR / 'annotations' / (spec['name']+'.drawio')
    ET.ElementTree(mxfile).write(target,encoding='utf-8',xml_declaration=True)
    # Mechanical repair/validation: ElementTree emits well-formed escaped XML;
    # root/layer IDs are fixed and all cells have distinct semantic IDs.
    parsed=ET.parse(target)
    ids=[c.attrib['id'] for c in parsed.iter('mxCell')]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate draw.io IDs')
    return dict(name=spec['name'],source=spec['source']+'.png',crop=spec['crop'],captureSize=[original.width,original.height],outputSize=[w,total_height],drawio=str(target.relative_to(ROOT)),output=str((ASSETS/(spec['name']+'.drawio.png')).relative_to(ROOT)))

if __name__ == '__main__':
    manifest=[author_figure(s) for s in FIGURES]
    (AUTHOR/'capture-manifest.json').write_text(json.dumps({'date':'2026-10-14','capture':'Alt+PrintScreen -> clipboard bitmap -> lossless PNG','resampling':False,'figures':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Authored {len(manifest)} editable draw.io files from real PNG captures.')
