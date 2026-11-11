/**
 * 코멘트 토큰 — 코멘트 본문 글 안의 `[<보이는 글>](wb:<종류>/<대상>)` 이다(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`).
 * 서버는 토큰을 모르고 글로 저장한다. 패널 · 번들 · PPTX · MCP · CLI 가 이 파일의 한 벌을 지나 같은 글로 푼다.
 *
 * 보이는 글은 대상이 끊겼을 때만 쓰는 대체 글이다. 모르는 종류 · 꼴이 깨진 토큰은 원문 글자 그대로 글 조각이 된다 — 그 꼴로 쓴
 * 보통 글(`[링크](https://…)`)을 망가뜨리지 않는다.
 */
import { CODE_KEY_PATTERN } from './codes'
import type { CodeIndex } from './codes-resolve'
import { NODE_ID_PATTERN } from './envelope'
import { nodeDisplayName } from './interaction/describe'
import type { PageDocument } from './node'
import { walkNodes } from './tree'

export type CommentTokenTarget =
  | { kind: 'page'; pageId: string }
  /** 번호(그 노드의 코멘트 묶음)를 가리킨다 — 코멘트 하나가 아니다. 노드 id 는 페이지 안에서만 유일해 페이지 id 를 함께 싣는다. */
  | { kind: 'comment'; pageId: string; nodeId: string }
  | { kind: 'code'; group: string; item?: string }

export type CommentSegment = { type: 'text'; text: string } | { type: 'token'; label: string; target: CommentTokenTarget; raw: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseTarget(target: string): CommentTokenTarget | null {
  if (!target.startsWith('wb:')) return null
  const parts = target.slice(3).split('/')
  const [kind, a, b] = parts
  if (kind === 'page' && parts.length === 2 && UUID_PATTERN.test(a ?? '')) return { kind: 'page', pageId: a! }
  if (kind === 'comment' && parts.length === 3 && UUID_PATTERN.test(a ?? '') && NODE_ID_PATTERN.test(b ?? '')) {
    return { kind: 'comment', pageId: a!, nodeId: b! }
  }
  if (kind === 'code' && CODE_KEY_PATTERN.test(a ?? '')) {
    if (parts.length === 2) return { kind: 'code', group: a! }
    if (parts.length !== 3 || b === '') return null
    let item: string
    try {
      item = decodeURIComponent(b!)
    } catch {
      return null
    }
    return { kind: 'code', group: a!, item }
  }
  return null
}

/**
 * `start` 의 `[` 에서 토큰 하나를 읽는다. 아니면 `null` — 부르는 쪽은 `[` 를 글로 두고 다음 글자부터 다시 본다(중첩 `[` 뒤의 토큰이 산다).
 * 라벨 안의 맨 `[` 는 토큰을 깨뜨린다 — 그래야 `[[x [A](wb:…)` 에서 앞의 `[` 들이 라벨을 삼키지 않고 뒤 토큰이 산다. 정규식 하나로 짓지 않은
 * 까닭: 라벨 안의 `\]` · `\[` 이스케이프와 앞선 `[` 를 정규식이 가르지 못한다.
 */
function readToken(body: string, start: number): { segment: CommentSegment; end: number } | null {
  let label = ''
  let i = start + 1
  for (;;) {
    const ch = body[i]
    if (ch === undefined || ch === '\n' || ch === '\r' || ch === '[') return null
    if (ch === '\\' && (body[i + 1] === ']' || body[i + 1] === '[' || body[i + 1] === '\\')) {
      label += body[i + 1]
      i += 2
      continue
    }
    if (ch === ']') break
    label += ch
    i += 1
  }
  if (body[i + 1] !== '(') return null
  const close = body.indexOf(')', i + 2)
  if (close < 0) return null
  const target = parseTarget(body.slice(i + 2, close))
  if (target === null) return null
  return { segment: { type: 'token', label, target, raw: body.slice(start, close + 1) }, end: close + 1 }
}

/** 본문을 글 · 토큰 조각으로 가른다. 조각의 `text` · `raw` 를 이어 붙이면 원문과 글자 그대로 같다. */
export function parseCommentBody(body: string): CommentSegment[] {
  const segments: CommentSegment[] = []
  let text = ''
  let i = 0
  while (i < body.length) {
    const open = body.indexOf('[', i)
    if (open < 0) {
      text += body.slice(i)
      break
    }
    text += body.slice(i, open)
    const token = readToken(body, open)
    if (token === null) {
      text += '['
      i = open + 1
      continue
    }
    if (text !== '') segments.push({ type: 'text', text })
    text = ''
    segments.push(token.segment)
    i = token.end
  }
  if (text !== '') segments.push({ type: 'text', text })
  return segments
}

/** `encodeURIComponent` 는 `(` · `)` 를 그대로 두어 토큰의 닫는 `)` 와 겹친다 — 둘을 더 감싼다. */
function encodeCodeValue(value: string): string {
  return encodeURIComponent(value).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/** 토큰 원문. 라벨의 줄바꿈은 공백으로 적는다 — 줄바꿈이 든 라벨은 토큰으로 안 읽는다. */
export function formatCommentToken(label: string, target: CommentTokenTarget): string {
  const text = label.replace(/\r\n|[\r\n]/g, ' ').replace(/[\\[\]]/g, (ch) => `\\${ch}`)
  return `[${text}](${formatTarget(target)})`
}

function formatTarget(target: CommentTokenTarget): string {
  switch (target.kind) {
    case 'page':
      return `wb:page/${target.pageId}`
    case 'comment':
      return `wb:comment/${target.pageId}/${target.nodeId}`
    case 'code':
      return target.item === undefined ? `wb:code/${target.group}` : `wb:code/${target.group}/${encodeCodeValue(target.item)}`
  }
}

/**
 * 풀 자료 — 그 코멘트가 사는 프로젝트의 것만 담는다(반-목표 «다른 프로젝트의 것을 보이는 것»). 여기 없는 id 는 까닭을 가르지 않고 끊김이다 —
 * 가르면 남의 프로젝트 id 의 존재가 샌다.
 */
export interface CommentTokenContext {
  /** 그 코멘트가 달린 페이지 — 같은 페이지의 번호는 «#3» 만 보인다. */
  currentPageId: string
  /** `menuPath` 는 조상 메뉴 이름을 ` › ` 로 이은 글 — 같은 제목이 둘일 때만 앞에 붙인다. */
  pages: ReadonlyMap<string, { title: string; menuPath: string }>
  /** 열쇠 `${pageId}/${nodeId}`(`markerKey`). 문서에 있는 노드면 번호가 걷혀도 든다 — 번호 없는 노드는 «페이지 › 노드 이름» 으로 이어진다. */
  markers: ReadonlyMap<string, { marker: number | null; nodeName: string }>
  /** 없으면 공통코드 토큰은 끊김(대체 글)이다. */
  codes?: CodeIndex
}

export type ResolvedSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; target: CommentTokenTarget }
  | { type: 'broken'; text: string }

export function markerKey(pageId: string, nodeId: string): string {
  return `${pageId}/${nodeId}`
}

/** 페이지 문서들의 모든 노드 → 번호 · 이름. 이름은 공통코드 표로 푼다(`nodeDisplayName`). */
export function buildMarkerIndex(
  pages: readonly { id: string; document: PageDocument }[],
  codes?: CodeIndex,
): Map<string, { marker: number | null; nodeName: string }> {
  const index = new Map<string, { marker: number | null; nodeName: string }>()
  for (const page of pages) {
    for (const { node } of walkNodes(page.document.root)) {
      const marker = typeof node.marker === 'number' ? node.marker : null
      index.set(markerKey(page.id, node.id), { marker, nodeName: nodeDisplayName(node, undefined, codes) })
    }
  }
  return index
}

function pageName(pageId: string, context: CommentTokenContext, titleCounts: ReadonlyMap<string, number>): string | null {
  const page = context.pages.get(pageId)
  if (page === undefined) return null
  return (titleCounts.get(page.title) ?? 0) > 1 && page.menuPath !== '' ? `${page.menuPath} › ${page.title}` : page.title
}

function resolveTarget(target: CommentTokenTarget, context: CommentTokenContext, titleCounts: ReadonlyMap<string, number>): string | null {
  switch (target.kind) {
    case 'page':
      return pageName(target.pageId, context, titleCounts)
    case 'comment': {
      const page = pageName(target.pageId, context, titleCounts)
      const entry = context.markers.get(markerKey(target.pageId, target.nodeId))
      if (page === null || entry === undefined) return null
      if (entry.marker === null) return `${page} › ${entry.nodeName}`
      return target.pageId === context.currentPageId ? `#${entry.marker}` : `${page} #${entry.marker}`
    }
    case 'code': {
      const group = context.codes?.get(target.group)
      if (group === undefined) return null
      if (target.item === undefined) return group.name
      return group.items.find((item) => item.value === target.item)?.name ?? null
    }
  }
}

/** 본문을 지금의 이름 · 번호로 푼 조각. 이웃한 글 조각은 하나로 잇지 않는다 — 원문의 조각 차례 그대로다. */
export function resolveCommentTokens(body: string, context: CommentTokenContext): ResolvedSegment[] {
  const titleCounts = new Map<string, number>()
  for (const page of context.pages.values()) titleCounts.set(page.title, (titleCounts.get(page.title) ?? 0) + 1)
  return parseCommentBody(body).map((segment): ResolvedSegment => {
    if (segment.type === 'text') return segment
    const text = resolveTarget(segment.target, context, titleCounts)
    return text === null ? { type: 'broken', text: segment.label } : { type: 'link', text, target: segment.target }
  })
}

/** 에이전트가 다음 호출에 쓰는 대상 꼴 — `page:<id>` · `comment:<pageId>/<nodeId>` · `code:<KEY>[/<인코딩한 값>]`. */
export function commentTokenTargetText(target: CommentTokenTarget): string {
  return formatTarget(target).slice('wb:'.length).replace('/', ':')
}

export const COMMENT_TOKEN_BROKEN_TEXT = '찾을 수 없음'

/**
 * 글 한 줄로 편 본문 — PPTX · CLI 사람 출력은 `withTarget: false`, MCP · CLI `--json` 은 `true`(풀린 글 뒤에 대상을 괄호로).
 * 끊긴 토큰은 대상 없이 `대체 글 (찾을 수 없음)` 이다.
 */
export function commentTokenText(body: string, context: CommentTokenContext, withTarget: boolean): string {
  return resolveCommentTokens(body, context)
    .map((segment) => {
      if (segment.type === 'text') return segment.text
      if (segment.type === 'broken') return `${segment.text} (${COMMENT_TOKEN_BROKEN_TEXT})`
      return withTarget ? `${segment.text} (${commentTokenTargetText(segment.target)})` : segment.text
    })
    .join('')
}
