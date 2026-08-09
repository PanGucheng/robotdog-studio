import { createHash } from 'node:crypto'
import type { Root, RootContent, PhrasingContent, Heading, Paragraph, List, Blockquote, Code, Link, Image } from 'mdast'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { CourseLectureAssetReference, CourseLectureBlock, CourseLectureCalloutKind, CourseLectureDocument, CourseLectureInline, CourseLectureSection, CourseLectureTextNode } from '../../shared/types'

const SECTION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const RESOURCE_PATH_PATTERN = /^\.\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/
const CALLOUTS = new Set<CourseLectureCalloutKind>(['concept', 'note', 'tip', 'pitfall', 'safety'])
const IMAGE_MIME = new Map<string, CourseLectureAssetReference['mimeType']>([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.svg', 'image/svg+xml']
])

interface DirectiveNode {
  type: 'containerDirective' | 'leafDirective' | 'textDirective'
  name: string
  attributes?: Record<string, string | null | undefined>
  children?: Array<RootContent | PhrasingContent>
  position?: RootContent['position']
}

interface MathNode {
  type: 'math' | 'inlineMath'
  value: string
  position?: RootContent['position']
}

interface DeleteNode {
  type: 'delete'
  children: PhrasingContent[]
  position?: RootContent['position']
}

interface TableNode {
  type: 'table'
  align?: Array<'left' | 'right' | 'center' | null>
  children: Array<{ type: 'tableRow'; children: Array<{ type: 'tableCell'; children: PhrasingContent[] }> }>
  position?: RootContent['position']
}

export interface ParsedCourseLecture {
  document: CourseLectureDocument
  assetPaths: Map<string, string>
}

export class CourseLectureParseError extends Error {
  readonly line?: number
  readonly column?: number

  constructor(readonly code: string, node?: { position?: RootContent['position'] }) {
    super(code)
    this.name = 'CourseLectureParseError'
    this.line = node?.position?.start.line
    this.column = node?.position?.start.column
  }
}

export function parseCourseLecture(source: string, identity: { courseId: string; lessonId: string; contentVersion: number }): ParsedCourseLecture {
  if (!source.trim()) throw new CourseLectureParseError('LECTURE_EMPTY')
  if (/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/.test(source)) throw new CourseLectureParseError('LECTURE_FRONT_MATTER_FORBIDDEN')

  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkDirective).parse(source) as Root
  const digest = createHash('sha256').update(source, 'utf8').digest('hex')
  const context = new ConversionContext(identity, digest)
  const sections: CourseLectureSection[] = []
  const sectionIds = new Set<string>()
  const internalLinks: Array<{ sectionId: string; node: unknown }> = []
  let active: MutableSection | undefined

  for (const node of tree.children) {
    if (node.type === 'definition') continue
    if (node.type === 'heading') {
      const heading = context.convertHeading(node)
      if (node.depth === 2) {
        if (!heading.sectionId) throw new CourseLectureParseError('LECTURE_H2_ID_REQUIRED', node)
        active = startSection(heading, sections, sectionIds, node)
        continue
      }
      if (node.depth === 3 && heading.sectionId) {
        active = startSection(heading, sections, sectionIds, node)
        continue
      }
      if (!active) throw new CourseLectureParseError('LECTURE_CONTENT_BEFORE_SECTION', node)
      active.blocks.push(heading.block)
      context.collectInlineLinks(heading.block.children, internalLinks, node)
      continue
    }
    if (!active) {
      if (node.type === 'thematicBreak') continue
      throw new CourseLectureParseError('LECTURE_CONTENT_BEFORE_SECTION', node)
    }
    const block = context.convertBlock(node, active.sectionId, false)
    if (block) {
      active.blocks.push(block)
      context.collectBlockLinks(block, internalLinks, node)
    }
  }

  if (!sections.length) throw new CourseLectureParseError('LECTURE_H2_REQUIRED')
  for (const link of internalLinks) if (!sectionIds.has(link.sectionId)) throw new CourseLectureParseError('LECTURE_SECTION_LINK_NOT_FOUND', link.node as { position?: RootContent['position'] })

  for (const section of sections) {
    const textNodes = collectTextNodes(section.blocks)
    section.textNodes = textNodes
    section.canonicalText = textNodes.map((item) => item.text).join('\n')
  }

  return {
    document: {
      ...identity,
      documentDigest: digest,
      sections,
      assets: [...context.assets.values()].map(({ assetId, mimeType }) => ({ assetId, mimeType })),
      codeTargetIndex: mapSetRecord(context.codeTargets),
      taskLinkIndex: mapSetRecord(context.taskLinks)
    },
    assetPaths: new Map([...context.assets.values()].map((asset) => [asset.assetId, asset.relativePath]))
  }
}

interface MutableSection extends CourseLectureSection {}

function startSection(heading: ReturnType<ConversionContext['convertHeading']>, sections: CourseLectureSection[], ids: Set<string>, node: Heading): MutableSection {
  const sectionId = heading.sectionId!
  if (ids.has(sectionId)) throw new CourseLectureParseError('LECTURE_SECTION_ID_DUPLICATE', node)
  ids.add(sectionId)
  const section: MutableSection = {
    sectionId,
    title: inlineText(heading.block.children).trim(),
    level: node.depth as 2 | 3,
    order: sections.length,
    blocks: [],
    canonicalText: '',
    textNodes: []
  }
  if (!section.title) throw new CourseLectureParseError('LECTURE_SECTION_TITLE_EMPTY', node)
  sections.push(section)
  return section
}

class ConversionContext {
  private textSequence = 0
  readonly assets = new Map<string, { assetId: string; relativePath: string; mimeType: CourseLectureAssetReference['mimeType'] }>()
  readonly codeTargets = new Map<string, Set<string>>()
  readonly taskLinks = new Map<string, Set<string>>()

  constructor(private readonly identity: { courseId: string; lessonId: string; contentVersion: number }, private readonly digest: string) {}

  convertHeading(node: Heading): { sectionId?: string; block: Extract<CourseLectureBlock, { type: 'heading' }> } {
    const children = structuredClone(node.children) as PhrasingContent[]
    let sectionId: string | undefined
    const last = children.at(-1)
    if (last?.type === 'text') {
      const match = /\s*\{#([^{}]+)\}\s*$/.exec(last.value)
      if (match) {
        if (!SECTION_ID_PATTERN.test(match[1])) throw new CourseLectureParseError('LECTURE_SECTION_ID_INVALID', node)
        sectionId = match[1]
        last.value = last.value.slice(0, match.index)
        if (!last.value) children.pop()
      } else if (/\{#.*\}\s*$/.test(last.value)) throw new CourseLectureParseError('LECTURE_SECTION_ID_INVALID', node)
    }
    const inline = this.convertInlineChildren(children)
    return { sectionId, block: { type: 'heading', depth: node.depth, sectionId, children: inline } }
  }

  convertBlock(node: RootContent | DirectiveNode | MathNode | TableNode, sectionId: string, insideDirective: boolean): CourseLectureBlock | undefined {
    if (isDirective(node)) return this.convertDirective(node, sectionId, insideDirective)
    if (node.type === 'html') throw new CourseLectureParseError('LECTURE_RAW_HTML_FORBIDDEN', node)
    if (node.type === 'heading') return this.convertHeading(node).block
    if (node.type === 'paragraph') {
      const text = plainMdastText(node.children).trim()
      if (/^(?:import|export)\s+(?:[\w*{]|default\b)/.test(text)) throw new CourseLectureParseError('LECTURE_ESM_FORBIDDEN', node)
      return { type: 'paragraph', children: this.convertInlineChildren(node.children) }
    }
    if (node.type === 'list') return this.convertList(node, sectionId, insideDirective)
    if (node.type === 'blockquote') return { type: 'blockquote', children: this.convertBlockChildren(node.children, sectionId, insideDirective) }
    if (node.type === 'code') return { type: 'code', textNodeId: this.nextTextId(), language: node.lang ?? undefined, value: node.value }
    if (node.type === 'math') return { type: 'math', textNodeId: this.nextTextId(), value: (node as MathNode).value }
    if (node.type === 'table') return this.convertTable(node as TableNode)
    if (node.type === 'thematicBreak') return { type: 'thematic-break' }
    throw new CourseLectureParseError(`LECTURE_NODE_UNSUPPORTED:${node.type}`, node)
  }

  private convertBlockChildren(nodes: Array<RootContent | DirectiveNode | MathNode | TableNode>, sectionId: string, insideDirective: boolean): CourseLectureBlock[] {
    return nodes.flatMap((child) => {
      const block = this.convertBlock(child, sectionId, insideDirective)
      return block ? [block] : []
    })
  }

  private convertList(node: List, sectionId: string, insideDirective: boolean): Extract<CourseLectureBlock, { type: 'list' }> {
    const items = node.children.map((item) => {
      if (item.checked !== null && item.checked !== undefined) throw new CourseLectureParseError('LECTURE_TASK_LIST_FORBIDDEN', item)
      return this.convertBlockChildren(item.children, sectionId, insideDirective)
    })
    return { type: 'list', ordered: Boolean(node.ordered), start: node.ordered ? node.start ?? 1 : undefined, items }
  }

  private convertTable(node: TableNode): Extract<CourseLectureBlock, { type: 'table' }> {
    return {
      type: 'table',
      align: (node.align ?? []).map((item) => item ?? undefined),
      rows: node.children.map((row) => row.children.map((cell) => this.convertInlineChildren(cell.children)))
    }
  }

  private convertDirective(node: DirectiveNode, sectionId: string, insideDirective: boolean): CourseLectureBlock {
    if (insideDirective) throw new CourseLectureParseError('LECTURE_DIRECTIVE_NESTING_FORBIDDEN', node)
    if (CALLOUTS.has(node.name as CourseLectureCalloutKind)) {
      if (node.type !== 'containerDirective') throw new CourseLectureParseError('LECTURE_CALLOUT_FORM_INVALID', node)
      this.requireAttributes(node, [])
      const { label, body } = directiveParts(node)
      return {
        type: 'callout', kind: node.name as CourseLectureCalloutKind, title: label,
        children: this.convertBlockChildren(body as RootContent[], sectionId, true)
      }
    }
    if (node.name === 'code-target') {
      if (node.type !== 'leafDirective') throw new CourseLectureParseError('LECTURE_CODE_TARGET_FORM_INVALID', node)
      this.requireAttributes(node, ['path', 'line'])
      const { label } = directiveParts(node)
      const path = node.attributes?.path?.trim()
      if (!label || !path || !isSafeProjectPath(path)) throw new CourseLectureParseError('LECTURE_CODE_TARGET_INVALID', node)
      const lineValue = node.attributes?.line
      const line = lineValue === undefined ? undefined : Number(lineValue)
      if (line !== undefined && (!Number.isInteger(line) || line < 1 || line > 100_000)) throw new CourseLectureParseError('LECTURE_CODE_TARGET_LINE_INVALID', node)
      addToSetMap(this.codeTargets, path, sectionId)
      return { type: 'code-target', label, path, line }
    }
    if (node.name === 'task-link') {
      if (node.type !== 'leafDirective') throw new CourseLectureParseError('LECTURE_TASK_LINK_FORM_INVALID', node)
      this.requireAttributes(node, ['step'])
      const { label } = directiveParts(node)
      const stepId = node.attributes?.step?.trim()
      if (!label || !stepId || !SECTION_ID_PATTERN.test(stepId)) throw new CourseLectureParseError('LECTURE_TASK_LINK_INVALID', node)
      addToSetMap(this.taskLinks, stepId, sectionId)
      return { type: 'task-link', label, stepId }
    }
    throw new CourseLectureParseError(`LECTURE_DIRECTIVE_UNKNOWN:${node.name}`, node)
  }

  private requireAttributes(node: DirectiveNode, allowed: string[]): void {
    const keys = Object.keys(node.attributes ?? {})
    if (keys.some((key) => !allowed.includes(key))) throw new CourseLectureParseError('LECTURE_DIRECTIVE_ATTRIBUTE_INVALID', node)
  }

  private convertInlineChildren(children: PhrasingContent[]): CourseLectureInline[] {
    return children.map((child) => this.convertInline(child))
  }

  private convertInline(node: PhrasingContent | DeleteNode | MathNode): CourseLectureInline {
    if (node.type === 'text') return { type: 'text', textNodeId: this.nextTextId(), text: node.value }
    if (node.type === 'strong' || node.type === 'emphasis') return { type: node.type, children: this.convertInlineChildren(node.children) }
    if (node.type === 'delete') return { type: 'strikethrough', children: this.convertInlineChildren((node as DeleteNode).children) }
    if (node.type === 'inlineCode') return { type: 'inline-code', textNodeId: this.nextTextId(), value: node.value }
    if (node.type === 'inlineMath') return { type: 'inline-math', textNodeId: this.nextTextId(), value: (node as MathNode).value }
    if (node.type === 'break') return { type: 'line-break' }
    if (node.type === 'link') return this.convertLink(node)
    if (node.type === 'image') return this.convertImage(node)
    if (node.type === 'html') throw new CourseLectureParseError('LECTURE_RAW_HTML_FORBIDDEN', node)
    throw new CourseLectureParseError(`LECTURE_INLINE_NODE_UNSUPPORTED:${node.type}`, node)
  }

  private convertLink(node: Link): CourseLectureInline {
    if (node.url.startsWith('#')) {
      const sectionId = node.url.slice(1)
      if (!SECTION_ID_PATTERN.test(sectionId)) throw new CourseLectureParseError('LECTURE_SECTION_LINK_INVALID', node)
      return { type: 'section-link', sectionId, children: this.convertInlineChildren(node.children) }
    }
    let parsed: URL
    try { parsed = new URL(node.url) } catch { throw new CourseLectureParseError('LECTURE_LINK_INVALID', node) }
    if (parsed.protocol !== 'https:') throw new CourseLectureParseError('LECTURE_LINK_PROTOCOL_FORBIDDEN', node)
    return { type: 'external-link', url: parsed.toString(), children: this.convertInlineChildren(node.children) }
  }

  private convertImage(node: Image): CourseLectureInline {
    const normalized = node.url.replace(/\\/g, '/')
    if (!RESOURCE_PATH_PATTERN.test(normalized) || normalized.split('/').includes('..')) throw new CourseLectureParseError('LECTURE_ASSET_PATH_INVALID', node)
    const extension = normalized.slice(normalized.lastIndexOf('.')).toLowerCase()
    const mimeType = IMAGE_MIME.get(extension)
    if (!mimeType) throw new CourseLectureParseError('LECTURE_ASSET_TYPE_INVALID', node)
    const assetId = `asset_${createHash('sha256').update(`${this.identity.courseId}\0${this.identity.lessonId}\0${this.identity.contentVersion}\0${this.digest}\0${normalized}`).digest('hex').slice(0, 24)}`
    this.assets.set(normalized, { assetId, relativePath: normalized, mimeType })
    return { type: 'asset-image', assetId, alt: node.alt ?? '', title: node.title ?? undefined }
  }

  collectInlineLinks(children: CourseLectureInline[], links: Array<{ sectionId: string; node: unknown }>, node: unknown): void {
    for (const child of children) {
      if (child.type === 'section-link') links.push({ sectionId: child.sectionId, node })
      if ('children' in child) this.collectInlineLinks(child.children, links, node)
    }
  }

  collectBlockLinks(block: CourseLectureBlock, links: Array<{ sectionId: string; node: unknown }>, node: unknown): void {
    if (block.type === 'paragraph' || block.type === 'heading') this.collectInlineLinks(block.children, links, node)
    else if (block.type === 'blockquote' || block.type === 'callout') for (const child of block.children) this.collectBlockLinks(child, links, node)
    else if (block.type === 'list') for (const item of block.items) for (const child of item) this.collectBlockLinks(child, links, node)
    else if (block.type === 'table') for (const row of block.rows) for (const cell of row) this.collectInlineLinks(cell, links, node)
  }

  private nextTextId(): string {
    this.textSequence += 1
    return `text_${String(this.textSequence).padStart(6, '0')}`
  }
}

function isDirective(node: { type: string }): node is DirectiveNode {
  return node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective'
}

function directiveParts(node: DirectiveNode): { label?: string; body: Array<RootContent | PhrasingContent> } {
  const children = node.children ?? []
  if (node.type === 'leafDirective' || node.type === 'textDirective') {
    const label = plainMdastText(children as PhrasingContent[]).trim()
    return { label: label || undefined, body: [] }
  }
  const first = children[0] as (Paragraph & { data?: { directiveLabel?: boolean } }) | undefined
  if (first?.type === 'paragraph' && first.data?.directiveLabel) {
    const label = plainMdastText(first.children).trim()
    return { label: label || undefined, body: children.slice(1) }
  }
  return { body: children }
}

function isSafeProjectPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')
  return value === normalized && !normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized)
    && normalized.split('/').every((part) => Boolean(part) && part !== '.' && part !== '..' && !part.startsWith('.'))
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const current = map.get(key) ?? new Set<string>()
  current.add(value)
  map.set(key, current)
}

function mapSetRecord(map: Map<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries([...map].map(([key, values]) => [key, [...values]]))
}

function inlineText(children: CourseLectureInline[]): string {
  return children.map((child) => {
    if (child.type === 'text') return child.text
    if (child.type === 'inline-code' || child.type === 'inline-math') return child.value
    if ('children' in child) return inlineText(child.children)
    return ''
  }).join('')
}

function plainMdastText(children: PhrasingContent[]): string {
  return children.map((child) => {
    if ('value' in child && typeof child.value === 'string') return child.value
    if ('children' in child && Array.isArray(child.children)) return plainMdastText(child.children as PhrasingContent[])
    return ''
  }).join('')
}

function collectTextNodes(blocks: CourseLectureBlock[]): CourseLectureTextNode[] {
  const result: CourseLectureTextNode[] = []
  const collectInline = (children: CourseLectureInline[]): void => {
    for (const child of children) {
      if (child.type === 'text') result.push({ textNodeId: child.textNodeId, text: child.text })
      else if (child.type === 'inline-code' || child.type === 'inline-math') result.push({ textNodeId: child.textNodeId, text: child.value })
      else if ('children' in child) collectInline(child.children)
    }
  }
  const collectBlock = (block: CourseLectureBlock): void => {
    if (block.type === 'paragraph' || block.type === 'heading') collectInline(block.children)
    else if (block.type === 'code' || block.type === 'math') result.push({ textNodeId: block.textNodeId, text: block.value })
    else if (block.type === 'blockquote' || block.type === 'callout') block.children.forEach(collectBlock)
    else if (block.type === 'list') block.items.flat().forEach(collectBlock)
    else if (block.type === 'table') block.rows.flat().forEach(collectInline)
  }
  blocks.forEach(collectBlock)
  return result
}
