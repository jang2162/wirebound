/**
 * **코멘트 탭이 그릴 줄들.**
 *
 * 순수 함수다. 코멘트가 **어디서 왔는지**는 이 파일이 묻지 않는다 — 출처는 셋이고(살아
 * 있는 값 / 한 시점의 값 / 스냅샷의 *"그때"*) 성질이 서로 다르다. 순수 패키지가 그 정책을
 * 가지면 그것을 부르는 api 라우트가 되돌릴 수 없다.
 *
 * ---
 *
 * ## 조용히 버리지 않는다
 *
 * 문서의 `marker`와 입력의 코멘트는 **서로 어긋날 수 있다.** 여기서는 갈래마다 **다른 줄**을
 * 낸다:
 *
 * | 상태 | 낸다 |
 * |---|---|
 * | 노드에 번호가 있고 그 노드를 가리키는 코멘트도 있다 | `comment` |
 * | 노드에 번호가 **있는데** 코멘트가 없다 (고아 마커) | `marker-without-comment` |
 * | 코멘트가 있는데 그 노드가 문서에 **없다** (고아 코멘트) | `comment`, 이름이 *"사라진 노드"* |
 * | 노드에 번호가 없는데 코멘트는 있다 | `comment`, `marker`가 `null` |
 *
 * **버리는 쪽을 고르지 않은 이유:** 목업에는 ①이 찍혀 있는데 목록에 아무것도 없으면 읽는
 * 사람이 *"내가 못 찾은 것"*으로 읽는다 — **화면이 못 보는 것을 세어 적고 화면이 그것을
 * 말하게 한다.**
 */
import {
  buildMarkerIndex,
  COMMENT_TOKEN_BROKEN_TEXT,
  describeNode,
  namingContexts,
  unresolvedCommentText,
  resolveCommentTokens,
  type CodeIndex,
  type CommentTokenContext,
  type PageDocument,
  type ResolvedSegment,
  type WbNode,
} from '@wirebound/schema'
import { eachNode } from '../nodes'
import { MARKER_ANCHOR_PREFIX } from '../page-data'

/**
 * 번들이 받는 코멘트 하나.
 *
 * **`authorName`·`createdAt`은 선택이다.** 설계서 「페이지 JSON」의 봉투(`PageJsonComment`)는
 * `nodeId`와 `body`뿐이라 그 길로 만든 번들에는 애초에 없다. **없으면 안 그린다** —
 * 자리를 비워 두면 *"이름이 없는 사람"*과 *"이름을 안 실은 경로"*가 같은 화면이 된다.
 */
export interface BundleComment {
  nodeId: string
  body: string
  authorName?: string
  createdAt?: string
}

/**
 * 코멘트 탭의 한 줄.
 *
 * `label`은 `describeNode`가 만든 문장이고 **번호가 그 안에 들어 있다**(`① 검색 버튼`).
 * 그래서 `marker`를 화면에 다시 찍지 않는다 — 이 필드는 **기계가 읽는 자리**다(`runtime.js`가
 * 겹layer를 그릴 때 노드와 번호를 짝지어야 한다).
 */
export type CommentEntry =
  | {
      kind: 'comment'
      nodeId: string
      label: string
      marker: number | null
      body: string
      /** 본문을 토큰까지 푼 조각(`resolveCommentTokens`) — 번들이 링크로 그린다. 풀 자료가 없으면 토큰은 대체 글의 글 조각이다. */
      segments: ResolvedSegment[]
      /** 조각을 글 한 줄로 편 것 — PPTX 가 싣는다(끊김은 `대체 글 (찾을 수 없음)`). */
      text: string
      authorName: string | null
      createdAt: string | null
    }
  | { kind: 'marker-without-comment'; nodeId: string; label: string; marker: number }

/**
 * 문서에 없는 노드를 가리키는 코멘트의 이름.
 *
 * **`schema`의 문장화가 쓰는 말과 같다**(`interaction/describe.ts`의 `MISSING_NODE`).
 * 그쪽은 모듈 안의 상수라 부를 수 없어 글자를 옮겼다 — **같은 상태를 두 말로 부르면**
 * 상호작용 탭과 코멘트 탭이 같은 노드를 다르게 부른다. 아래 케이스가 두 탭의 말을 견준다.
 */
export const MISSING_NODE_LABEL = '사라진 노드'

/**
 * 노드의 번호. **`schema`의 문장화와 같은 기준이다** — 정수이고 1 이상일 때만 번호다.
 *
 * 기준이 갈리면 `label`에는 번호가 없는데 `marker`에는 값이 있는 줄이 생긴다. 케이스가
 * 두 값을 함께 잰다.
 */
function markerOf(node: WbNode): number | null {
  const marker = node.marker
  if (typeof marker !== 'number' || !Number.isInteger(marker) || marker < 1) return null
  return marker
}

/**
 * 코멘트 탭의 줄들을 **문서 순서로** 만든다.
 *
 * 문서에 있는 노드가 먼저고, 고아 코멘트가 뒤다 — 그것들은 문서에 자리가 없으므로
 * **입력 순서**말고 줄 세울 근거가 없다. 같은 노드에 달린 코멘트끼리도 입력 순서다.
 */
export function commentEntries(
  page: PageDocument,
  comments: readonly BundleComment[],
  codes?: CodeIndex,
  tokens?: CommentTokenContext,
): CommentEntry[] {
  const byNode = new Map<string, BundleComment[]>()
  for (const comment of comments) {
    const list = byNode.get(comment.nodeId)
    if (list === undefined) byNode.set(comment.nodeId, [comment])
    else list.push(comment)
  }

  const entries: CommentEntry[] = []
  const inTree = new Set<string>()
  // 이름은 그 노드가 속한 상태를 붙인다 — 문장 · 화면과 같은 이름(`namingContexts`). 묶인 노드는 표(`codes`)의 이름으로 부른다.
  const naming = namingContexts(page)

  for (const node of eachNode(page.root)) {
    if (typeof node.id !== 'string') continue
    inTree.add(node.id)
    const label = describeNode(node, naming.get(node.id), codes)
    const marker = markerOf(node)
    const own = byNode.get(node.id)
    if (own === undefined) {
      if (marker !== null) {
        entries.push({ kind: 'marker-without-comment', nodeId: node.id, label, marker })
      }
      continue
    }
    for (const comment of own) entries.push(commentLine(node.id, label, marker, comment, tokens))
  }

  for (const comment of comments) {
    if (inTree.has(comment.nodeId)) continue
    entries.push(commentLine(comment.nodeId, MISSING_NODE_LABEL, null, comment, tokens))
  }

  return entries
}

function commentLine(
  nodeId: string,
  label: string,
  marker: number | null,
  comment: BundleComment,
  tokens: CommentTokenContext | undefined,
): CommentEntry {
  const segments = commentSegments(comment.body, tokens)
  return {
    kind: 'comment',
    nodeId,
    label,
    marker,
    body: comment.body,
    segments,
    text: segmentsText(segments),
    authorName: comment.authorName ?? null,
    createdAt: comment.createdAt ?? null,
  }
}

/**
 * 내보내는 페이지들로 지은 토큰 풀 자료 — 번들 · PPTX 가 내보내는 때의 프로젝트 자료로 푼다(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`).
 * `id` 가 없는 페이지는 토큰이 가리킬 수 없다(그 페이지로 가는 토큰은 끊김). 하나도 없으면 `null` — 토큰은 대체 글로만 선다.
 */
export function exportTokenBase(
  pages: readonly { id?: string; title: string; pageTitle?: string; menuPath?: readonly string[]; document: PageDocument }[],
  codes: CodeIndex | undefined,
): Omit<CommentTokenContext, 'currentPageId'> | null {
  const known = pages.filter((page): page is typeof page & { id: string } => typeof page.id === 'string')
  if (known.length === 0) return null
  return {
    pages: new Map(known.map((page) => [page.id, { title: page.pageTitle ?? page.title, menuPath: (page.menuPath ?? []).join(' › ') }])),
    markers: buildMarkerIndex(known, codes),
    ...(codes === undefined ? {} : { codes }),
  }
}

function commentSegments(body: string, tokens: CommentTokenContext | undefined): ResolvedSegment[] {
  if (tokens !== undefined) return resolveCommentTokens(body, tokens)
  const text = unresolvedCommentText(body)
  return text === '' ? [] : [{ type: 'text', text }]
}

function segmentsText(segments: readonly ResolvedSegment[]): string {
  return segments.map((segment) => (segment.type === 'broken' ? `${segment.text} (${COMMENT_TOKEN_BROKEN_TEXT})` : segment.text)).join('')
}

/** «공통코드» 장의 그룹 · 항목 닻 — 코드값은 아무 글자나 들 수 있어 UTF-8 바이트를 16진으로 적는다(닻 글자가 늘 안전하다). */
export function codeAnchor(group: string, item?: string): string {
  if (item === undefined) return `wb-code-${group}`
  // `TextEncoder` 는 이 패키지의 lib 에 없다 — `encodeURIComponent` 가 UTF-8 바이트를 `%XX` 로 낸다.
  const hex = encodeURIComponent(item).replace(/%([0-9A-F]{2})|./g, (match, byte: string | undefined) =>
    (byte ?? match.charCodeAt(0).toString(16).padStart(2, '0')).toLowerCase(),
  )
  return `wb-code-${group}--${hex}`
}

/** 페이지 장 코멘트 칸의 번호 닻. 노드 id 는 `NODE_ID_PATTERN` 이라 그대로 쓴다. */
export function markerAnchor(nodeId: string): string {
  return `${MARKER_ANCHOR_PREFIX}${nodeId}`
}
