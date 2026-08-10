import katex from 'katex'
import { AlertOctagon, BookOpen, CircleAlert, ExternalLink, FileCode2, Lightbulb, Link2, ShieldAlert } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { CourseLectureBlock, CourseLectureCalloutKind, CourseLectureDocument, CourseLectureInline, CourseLectureSelectionRange } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'

interface CourseLectureRendererProps {
  document: CourseLectureDocument
  sectionId: string
  onOpenSection(sectionId: string): void
  onOpenCode(path: string, line?: number): void
  onOpenTask(stepId: string): void
  onSelection(selection: CourseLectureSelectionRange, preview: string): void
  mode?: 'learn' | 'reference'
}

export function CourseLectureRenderer({ document, sectionId, onOpenSection, onOpenCode, onOpenTask, onSelection, mode = 'reference' }: CourseLectureRendererProps): React.JSX.Element {
  const section = document.sections.find((item) => item.sectionId === sectionId) ?? document.sections[0]
  if (!section) return <div className="lecture-empty"><BookOpen size={22} /><p>这份讲义暂时没有可阅读章节。</p></div>
  return <article className="lecture-document" data-lecture-digest={document.documentDigest} data-section-id={section.sectionId} onMouseUp={() => captureLectureSelection(document, section.sectionId, onSelection)}>
    <header className="lecture-section-heading"><span>第 {section.order + 1} 节</span><h2>{section.title}</h2></header>
    <div className="lecture-section-body">{section.blocks.map((block, index) => <LectureBlockView key={`${section.sectionId}-${index}`} block={block} document={document} mode={mode} onOpenSection={onOpenSection} onOpenCode={onOpenCode} onOpenTask={onOpenTask} />)}</div>
  </article>
}

function captureLectureSelection(document: CourseLectureDocument, sectionId: string, onSelection: CourseLectureRendererProps['onSelection']): void {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
  const range = selection.getRangeAt(0)
  const startElement = lectureTextElement(range.startContainer)
  const endElement = lectureTextElement(range.endContainer)
  const startId = startElement?.dataset.lectureTextNode
  const endId = endElement?.dataset.lectureTextNode
  if (!startElement || !endElement || !startId || !endId) return
  const preview = selection.toString().trim()
  if (!preview || preview.length > 1_000) return
  onSelection({
    documentDigest: document.documentDigest,
    sectionId,
    start: { textNodeId: startId, offset: offsetWithin(startElement, range.startContainer, range.startOffset) },
    end: { textNodeId: endId, offset: offsetWithin(endElement, range.endContainer, range.endOffset) }
  }, preview)
}

function lectureTextElement(node: Node): HTMLElement | undefined {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.closest<HTMLElement>('[data-lecture-text-node]') ?? undefined
}

function offsetWithin(element: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(element)
  try { range.setEnd(container, offset) } catch { return 0 }
  return range.toString().length
}

function LectureBlockView({ block, document, mode, onOpenSection, onOpenCode, onOpenTask }: { block: CourseLectureBlock; document: CourseLectureDocument; mode: 'learn' | 'reference'; onOpenSection(sectionId: string): void; onOpenCode(path: string, line?: number): void; onOpenTask(stepId: string): void }): React.JSX.Element {
  const inlineProps = { document, onOpenSection }
  if (block.type === 'heading') {
    const Tag = `h${block.depth}` as 'h1'
    return <Tag>{renderInline(block.children, inlineProps)}</Tag>
  }
  if (block.type === 'paragraph') return <p>{renderInline(block.children, inlineProps)}</p>
  if (block.type === 'blockquote') return <blockquote>{block.children.map((child, index) => <LectureBlockView key={index} block={child} document={document} mode={mode} onOpenSection={onOpenSection} onOpenCode={onOpenCode} onOpenTask={onOpenTask} />)}</blockquote>
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return <Tag start={block.start}>{block.items.map((item, index) => <li key={index}>{item.map((child, childIndex) => <LectureBlockView key={childIndex} block={child} document={document} mode={mode} onOpenSection={onOpenSection} onOpenCode={onOpenCode} onOpenTask={onOpenTask} />)}</li>)}</Tag>
  }
  if (block.type === 'code') return <figure className="lecture-code-example"><figcaption>讲义示例 · 不会写入工程{block.language ? ` · ${block.language}` : ''}</figcaption><pre data-lecture-text-node={block.textNodeId}><code>{block.value}</code></pre></figure>
  if (block.type === 'math') return <div className="lecture-math-block" data-lecture-text-node={block.textNodeId}><SafeMath value={block.value} displayMode /></div>
  if (block.type === 'thematic-break') return <hr />
  if (block.type === 'table') return <div className="lecture-table-wrap"><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{renderInline(cell, inlineProps)}</th> : <td key={cellIndex}>{renderInline(cell, inlineProps)}</td>)}</tr>)}</tbody></table></div>
  if (block.type === 'callout') return <LectureCallout block={block} document={document} mode={mode} onOpenSection={onOpenSection} onOpenCode={onOpenCode} onOpenTask={onOpenTask} />
  if (block.type === 'code-target') return mode === 'learn'
    ? <div className="lecture-action lecture-code-target is-learning"><FileCode2 size={15} /><span><strong>{block.label}</strong><small>{block.path}{block.line ? ` · 第 ${block.line} 行` : ''} · 该文件将在实验中使用</small></span></div>
    : <button type="button" className="lecture-action lecture-code-target" onClick={() => onOpenCode(block.path, block.line)}><FileCode2 size={15} /><span><strong>{block.label}</strong><small>{block.path}{block.line ? ` · 第 ${block.line} 行` : ''}</small></span></button>
  return <button type="button" className="lecture-action lecture-task-link" onClick={() => onOpenTask(block.stepId)}><Link2 size={15} /><span><strong>{block.label}</strong><small>{mode === 'learn' ? '进入实验后完成' : '返回实验任务'}</small></span></button>
}

function LectureCallout({ block, document, mode, onOpenSection, onOpenCode, onOpenTask }: { block: Extract<CourseLectureBlock, { type: 'callout' }>; document: CourseLectureDocument; mode: 'learn' | 'reference'; onOpenSection(sectionId: string): void; onOpenCode(path: string, line?: number): void; onOpenTask(stepId: string): void }): React.JSX.Element {
  const Icon = CALLOUT_META[block.kind].icon
  return <aside className={`lecture-callout is-${block.kind}`}><header><Icon size={16} /><strong>{CALLOUT_META[block.kind].label}{block.title ? ` · ${block.title}` : ''}</strong></header><div>{block.children.map((child, index) => <LectureBlockView key={index} block={child} document={document} mode={mode} onOpenSection={onOpenSection} onOpenCode={onOpenCode} onOpenTask={onOpenTask} />)}</div></aside>
}

const CALLOUT_META: Record<CourseLectureCalloutKind, { label: string; icon: typeof Lightbulb }> = {
  concept: { label: '核心概念', icon: Lightbulb },
  note: { label: '补充说明', icon: BookOpen },
  tip: { label: '学习提示', icon: Lightbulb },
  pitfall: { label: '常见错误', icon: CircleAlert },
  safety: { label: '安全要求', icon: ShieldAlert }
}

function renderInline(children: CourseLectureInline[], context: { document: CourseLectureDocument; onOpenSection(sectionId: string): void }): React.JSX.Element[] {
  return children.map((child, index) => {
    if (child.type === 'text') return <Fragment key={index}><span data-lecture-text-node={child.textNodeId}>{child.text}</span></Fragment>
    if (child.type === 'strong') return <strong key={index}>{renderInline(child.children, context)}</strong>
    if (child.type === 'emphasis') return <em key={index}>{renderInline(child.children, context)}</em>
    if (child.type === 'strikethrough') return <del key={index}>{renderInline(child.children, context)}</del>
    if (child.type === 'inline-code') return <code key={index} data-lecture-text-node={child.textNodeId}>{child.value}</code>
    if (child.type === 'inline-math') return <span key={index} className="lecture-math-inline" data-lecture-text-node={child.textNodeId}><SafeMath value={child.value} /></span>
    if (child.type === 'line-break') return <br key={index} />
    if (child.type === 'section-link') return <button type="button" key={index} className="lecture-inline-link" onClick={() => context.onOpenSection(child.sectionId)}>{renderInline(child.children, context)}</button>
    if (child.type === 'external-link') return <button type="button" key={index} className="lecture-inline-link is-external" onClick={() => void getRobotApi().openExternalUrl(child.url)}>{renderInline(child.children, context)} <ExternalLink size={11} /></button>
    if (child.type === 'asset-image') return <LectureAssetImage key={index} document={context.document} assetId={child.assetId} alt={child.alt} title={child.title} />
    return <Fragment key={index} />
  })
}

function LectureAssetImage({ document, assetId, alt, title }: { document: CourseLectureDocument; assetId: string; alt: string; title?: string }): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [source, setSource] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false
    setSource(undefined); setFailed(false)
    void api.getCourseLectureAsset(document.courseId, document.lessonId, document.documentDigest, assetId).then((asset) => {
      if (!disposed) setSource(`data:${asset.mimeType};base64,${asset.dataBase64}`)
    }).catch(() => { if (!disposed) setFailed(true) })
    return () => { disposed = true }
  }, [api, document.documentDigest, assetId])
  if (failed) return <span className="lecture-asset-error"><AlertOctagon size={15} /> 图片暂时无法显示{alt ? `：${alt}` : ''}</span>
  if (!source) return <span className="lecture-asset-loading">正在载入图片…</span>
  return <img className="lecture-asset" src={source} alt={alt} title={title} />
}

function SafeMath({ value, displayMode = false }: { value: string; displayMode?: boolean }): React.JSX.Element {
  const rendered = useMemo(() => {
    try {
      return katex.renderToString(value, { displayMode, throwOnError: true, trust: false, strict: 'error', output: 'html' })
    } catch { return undefined }
  }, [value, displayMode])
  if (!rendered) return <code className="lecture-math-fallback">{value}</code>
  return <span aria-label={value} dangerouslySetInnerHTML={{ __html: rendered }} />
}
