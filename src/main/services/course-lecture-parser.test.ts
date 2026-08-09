import { describe, expect, it } from 'vitest'
import { CourseLectureParseError, parseCourseLecture } from './course-lecture-parser'

const identity = { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 3 }

describe('parseCourseLecture', () => {
  it('creates one safe model for sections, directives, math and assets', () => {
    const parsed = parseCourseLecture(`## 源文件 {#source-files}

源文件包含函数的**定义**，频率记为 $f_{clk}$。

:::concept[编译单元]
每个源文件会单独编译。
:::

::code-target[打开实验代码]{path="App/Src/experiment.c" line="12"}

![结构图](./assets/source-files.svg)

## 下一步 {#next-step}

返回[源文件](#source-files)。

::task-link[开始练习]{step="read-entry"}
`, identity)

    expect(parsed.document.sections.map((section) => section.sectionId)).toEqual(['source-files', 'next-step'])
    expect(parsed.document.sections[0].blocks.some((block) => block.type === 'callout')).toBe(true)
    expect(parsed.document.codeTargetIndex['App/Src/experiment.c']).toEqual(['source-files'])
    expect(parsed.document.taskLinkIndex['read-entry']).toEqual(['next-step'])
    expect(parsed.document.assets).toHaveLength(1)
    expect(parsed.document.assets[0].assetId).toMatch(/^asset_[a-f0-9]{24}$/)
    expect(JSON.stringify(parsed.document)).not.toContain('./assets/source-files.svg')
    expect(parsed.assetPaths.get(parsed.document.assets[0].assetId)).toBe('./assets/source-files.svg')
    expect(parsed.document.sections[0].textNodes.every((node) => /^text_\d{6}$/.test(node.textNodeId))).toBe(true)
  })

  it.each([
    ['H2 needs an explicit id', '## 没有 ID\n\n正文', 'LECTURE_H2_ID_REQUIRED'],
    ['ids use the narrow syntax', '## 错误 {#Function_ID}\n\n正文', 'LECTURE_SECTION_ID_INVALID'],
    ['raw html is forbidden', '## 正文 {#content}\n\n<div>不能使用</div>', 'LECTURE_RAW_HTML_FORBIDDEN'],
    ['unknown directives are forbidden', '## 正文 {#content}\n\n:::warning\n错误\n:::', 'LECTURE_DIRECTIVE_UNKNOWN:warning'],
    ['attributes are whitelisted', '## 正文 {#content}\n\n:::tip{class="red"}\n错误\n:::', 'LECTURE_DIRECTIVE_ATTRIBUTE_INVALID'],
    ['directives cannot nest', '## 正文 {#content}\n\n:::tip\n:::note\n嵌套\n:::\n:::', 'LECTURE_DIRECTIVE_NESTING_FORBIDDEN'],
    ['images stay under assets', '## 正文 {#content}\n\n![错误](../../../secret.png)', 'LECTURE_ASSET_PATH_INVALID'],
    ['remote images are forbidden', '## 正文 {#content}\n\n![错误](https://example.com/a.png)', 'LECTURE_ASSET_PATH_INVALID'],
    ['links only allow https', '## 正文 {#content}\n\n[错误](file:///c:/secret.txt)', 'LECTURE_LINK_PROTOCOL_FORBIDDEN'],
    ['internal links must exist', '## 正文 {#content}\n\n[错误](#missing)', 'LECTURE_SECTION_LINK_NOT_FOUND']
  ])('%s', (_label, source, code) => {
    expect(() => parseCourseLecture(source, identity)).toThrowError(expect.objectContaining({ code }))
  })

  it('reports source positions for author diagnostics', () => {
    try {
      parseCourseLecture('## 正文 {#content}\n\n:::unknown\n错误\n:::', identity)
      throw new Error('expected parser failure')
    } catch (caught) {
      expect(caught).toBeInstanceOf(CourseLectureParseError)
      expect(caught).toMatchObject({ code: 'LECTURE_DIRECTIVE_UNKNOWN:unknown', line: 3, column: 1 })
    }
  })
})
