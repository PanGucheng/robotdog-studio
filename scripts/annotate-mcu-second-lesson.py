"""Editable draw.io guidance over native PNGs, without image resampling."""
import importlib.util
import json
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('course_annotations', ROOT / 'scripts/annotate-ti-first-lesson.py')
annotations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(annotations)
AUTHOR = ROOT / 'docs/courses/assets/mcu-second-lesson-20261014'
ASSETS = ROOT / 'resources/courses/mcu-foundations/ch32v203-foundations/lectures/gpio-output/assets'
annotations.AUTHOR, annotations.ASSETS = AUTHOR, ASSETS

FIGURES = [
    dict(name='studio-start', source='studio-start', crop=(760,770,1490,650), title='第二课：从讲义末尾进入实验',
         boxes=[(150,500,280,95)], labels=['点击「开始实验」，创建本课独立工程。','当前草稿只在作者开发环境显示；图片不是课程发布记录。']),
    dict(name='studio-skeleton', source='studio-skeleton', crop=(0,180,2560,1340), title='找到 experiment.c 和右侧任务',
         boxes=[(20,400,445,95),(1920,315,580,570)], badges=[(355,320,'1'),(2400,-100,'2')],
         labels=['① App → Src → experiment.c；② 任务「定位对象」打开相应代码。','总览用来找位置；下方步骤图放大显示实际代码与编译入口。']),
    dict(name='studio-init', source='studio-init', crop=(485,200,1360,770), title='Init 中的三个配置部分',
         boxes=[(170,235,1050,65),(170,370,1035,190),(170,645,1010,60)],
         labels=['① 开 GPIOB 时钟；② 填 PB8 / 推挽 / 输出速度档位。','③ GPIO_Init 传入 &GPIO_InitStructure；Ctrl + S 后再编译。']),
    dict(name='studio-on', source='studio-on', crop=(485,200,1360,920), title='Loop：写入低电平输出调用',
         boxes=[(170,595,670,60),(1040,0,290,85)],
         labels=['将点亮提示注释换成实际 GPIO_ResetBits 调用，保留分号。','保存后旧固件失效；点击顶部「编译」生成当前代码的固件。']),
    dict(name='studio-build-on', source='studio-build-on', crop=(485,1010,1360,510), title='编译通过：查看终端、用量和四类产物',
         boxes=[(780,15,535,65),(10,350,1050,150)],
         labels=['等待「编译完成」与 ELF / HEX / BIN / MAP 产物。','这是软件构建证据；LED 是否常亮仍需连接实板烧录、观察。']),
    dict(name='studio-blink', source='studio-blink', crop=(485,200,1360,920), title='Loop：亮 0.5 秒，再灭 0.5 秒',
         boxes=[(170,535,720,190)],
         labels=['ResetBits → Delay_Ms(500) → SetBits → Delay_Ms(500)。','保存并重新编译；完整亮灭一轮约 1 秒，实板观察另行完成。']),
    dict(name='studio-problems', source='studio-problems', crop=(485,500,1360,710), title='编译失败：从问题条目定位代码',
         boxes=[(170,285,650,55),(10,550,1320,140)],
         labels=['点击「问题」，再点击错误条目，定位到 experiment.c 的对应行。','本例第 28 行漏分号；补齐后保存、重新编译，不使用旧产物。']),
]

def model(name, title, width=1360, height=760):
    mx = ET.Element('mxfile', {'host':'app.diagrams.net'})
    diagram = ET.SubElement(mx, 'diagram', {'id':name, 'name':title})
    graph = ET.SubElement(diagram, 'mxGraphModel', {'adaptiveColors':'auto','page':'0','pageWidth':str(width),'pageHeight':str(height)})
    root = ET.SubElement(graph, 'root')
    ET.SubElement(root, 'mxCell', {'id':'0'})
    ET.SubElement(root, 'mxCell', {'id':'1','parent':'0'})
    return mx, root

def cell(root, identity, text, x, y, w, h, style=''):
    c = ET.SubElement(root, 'mxCell', {'id':identity,'value':text,'vertex':'1','parent':'1',
        'style':'rounded=1;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontFamily=Microsoft YaHei;fontSize=38;fontColor=#123044;strokeWidth=3;'+style})
    ET.SubElement(c,'mxGeometry',{'x':str(x),'y':str(y),'width':str(w),'height':str(h),'as':'geometry'})

def edge(root, identity, source, target, style=''):
    c=ET.SubElement(root,'mxCell',{'id':identity,'edge':'1','source':source,'target':target,'parent':'1',
        'style':'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=4;strokeColor=#087f8c;endArrow=block;'+style})
    ET.SubElement(c,'mxGeometry',{'relative':'1','as':'geometry'})

def save(mx, name):
    target=AUTHOR/'annotations'/f'{name}.drawio'
    ET.ElementTree(mx).write(target, encoding='utf-8', xml_declaration=True)
    ET.parse(target)

def concepts():
    mx, root=model('port-and-pin','端口名称与引脚编号',1360,650)
    cell(root,'background','',0,0,1360,650,'fillColor=#ffffff;strokeColor=none;')
    cell(root,'title','PB8：端口 B 内的第 8 号引脚',30,25,1300,90,'text;fontSize=52;fontStyle=1;strokeColor=none;')
    cell(root,'port','GPIOB<br>选择端口 B',60,180,340,150,'fillColor=#e6f4f5;strokeColor=#087f8c;')
    cell(root,'pin','GPIO_Pin_8<br>选择组内编号 8',500,180,350,150,'fillColor=#e6f4f5;strokeColor=#087f8c;')
    cell(root,'result','PB8<br>控制目标',960,180,330,150,'fillColor=#fff2dc;strokeColor=#e06917;')
    edge(root,'combine', 'port','pin')
    edge(root,'name','pin','result')
    cell(root,'code','GPIO_Init(GPIOB, &GPIO_InitStructure);<br>GPIO_InitStructure.GPIO_Pin = GPIO_Pin_8;',70,375,1220,130,'fillColor=#edf7f8;strokeColor=none;fontSize=36;')
    cell(root,'warning','端口内编号 ≠ 封装物理脚号；不同封装要查对应数据手册。',50,535,1260,80,'text;fontSize=36;strokeColor=none;')
    save(mx,'port-and-pin')

    mx, root=model('active-low-led','LED 低电平有效的等效连接关系',1360,1130)
    cell(root,'background','',0,0,1360,1130,'fillColor=#ffffff;strokeColor=none;')
    cell(root,'title','同一条 LED 支路：PB8 拉低点亮，拉高熄灭',30,20,1300,110,'text;fontSize=46;fontStyle=1;strokeColor=none;')
    for prefix,x,state,color in [('low',55,'ResetBits：PB8 ≈ 0V','#e6f4f5'),('high',715,'SetBits：PB8 ≈ 3.3V','#fff2dc')]:
        cell(root,prefix+'-state',state,x,160,590,85,f'fillColor={color};strokeColor=none;fontSize=36;')
        cell(root,prefix+'-supply','3.3V 电源',x+100,285,390,80,'fillColor=#f4f7f8;strokeColor=#7995a0;')
        cell(root,prefix+'-resistor','限流电阻',x+100,415,390,85,'fillColor=#f4f7f8;strokeColor=#7995a0;')
        cell(root,prefix+'-led','LED<br>阳极 → 阴极',x+100,550,390,130,'fillColor=#f4f7f8;strokeColor=#7995a0;')
        cell(root,prefix+'-pin','PB8 输出级',x+100,730,390,80,'fillColor=#f4f7f8;strokeColor=#7995a0;')
        for i,(a,b) in enumerate([('supply','resistor'),('resistor','led'),('led','pin')]):
            edge(root,f'{prefix}-wire-{i}',prefix+'-'+a,prefix+'-'+b,'dashed=1;strokeColor=#bd8b33;endArrow=none;' if prefix=='high' else '')
        cell(root,prefix+'-result','电流经 PB8 输出级到地<br>LED 点亮' if prefix=='low' else '缺少足够正向驱动压差<br>LED 熄灭',x,865,590,135,f'fillColor={color};strokeColor=none;fontSize=36;')
    cell(root,'legend','实线箭头：有正向电流；虚线：电路仍连接，但 LED 支路电流很小。<br>教学等效关系图；不代表元件位置、具体电阻值或封装脚号。',30,1030,1300,80,'text;strokeColor=none;fontSize=30;')
    save(mx,'active-low-led')

if __name__ == '__main__':
    if '--record-exports' in sys.argv:
        path = AUTHOR/'capture-manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        for figure in manifest['figures']:
            exported = (ROOT/figure['output']).read_bytes()
            if exported[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError(f"Not an exported PNG: {figure['output']}")
            figure['exportSize'] = list(struct.unpack('>II', exported[16:24]))
        manifest['concepts'] = [dict(name=name, drawio=str((AUTHOR/'annotations'/f'{name}.drawio').relative_to(ROOT)),
            output=str((ASSETS/f'{name}.drawio.png').relative_to(ROOT))) for name in ['port-and-pin','active-low-led']]
        path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('Recorded exported PNG sizes and editable concept sources.')
        sys.exit(0)
    figures=[annotations.author_figure(figure) for figure in FIGURES]
    concepts()
    (AUTHOR/'capture-manifest.json').write_text(json.dumps(dict(date='2026-10-14',edition='mcu-foundations',capture='Alt+PrintScreen -> clipboard bitmap -> lossless PNG',resampling=False,hardware='not-connected',figures=figures),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Authored {len(figures)} real-screen figures and 2 editable concept figures.')
