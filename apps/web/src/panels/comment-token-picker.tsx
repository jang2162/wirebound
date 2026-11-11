/**
 * 코멘트 글 상자의 `#` 자동완성(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` «자동완성»). `#` 를 치면 후보가 뜨고 이어 친 글로
 * 거른다. 고르면 `#<친 글>` 자리를 토큰 원문(`formatCommentToken`)으로 바꾼다. 입력 칸은 그대로 글 상자다 — 토큰은 고칠 때 원문으로 보인다.
 *
 * | 키 | 열린 동안 |
 * |---|---|
 * | ↑ ↓ | 후보를 옮긴다(끝에서 멈춘다) |
 * | Enter · 누름 | 고른다 |
 * | Escape | 닫는다 — 친 `#…` 는 보통 글로 남는다(그 `#` 로는 다시 안 열린다) |
 *
 * **한글 조합 중에는 열지도 고르지도 않는다** — 조합 중의 Enter 는 조합을 끝내는 키다(`isComposing` · `compositionstart` ~ `compositionend` 둘 다
 * 본다 — Chrome 은 조합을 끝내는 Enter 의 `keydown` 에 `isComposing: true` 를 싣지만, 끝난 뒤의 `compositionend` 와의 차례는 브라우저마다 다르다).
 * 조합이 끝난 뒤 그 글로 거른다.
 *
 * `#` 는 줄 머리나 공백 · 여는 괄호 뒤에서만 연다 — `a#b` 같은 글의 `#` 로는 안 연다. 친 글에 줄바꿈이 들면 닫는다(제목 · 이름의 공백은 받는다).
 */
import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from 'react'
import {
  COMMENT_BODY_MAX_LENGTH,
  formatCommentToken,
  isolateBidi,
  markerKey,
  type CommentTokenContext,
  type CommentTokenTarget,
} from '@wirebound/schema'
import type { CommentIndex } from '../api/types'

/** 후보 무리 — 차례가 목록 차례다. */
export type CandidateGroup = 'this-page' | 'page' | 'page-marker' | 'code-group' | 'code-item'

export const GROUP_LABEL: Record<CandidateGroup, string> = {
  'this-page': '이 페이지 번호',
  page: '페이지',
  'page-marker': '다른 페이지 번호',
  'code-group': '공통코드 그룹',
  'code-item': '공통코드 항목',
}

export interface Candidate {
  group: CandidateGroup
  /** 토큰의 보이는 글 — 고른 때의 이름이다. */
  label: string
  /** 목록 줄의 덧말(노드 이름 · 첫 코멘트 · 그룹 키). */
  hint: string
  target: CommentTokenTarget
}

/** 목록에 한 번에 세우는 후보 수 — 넘으면 더 쳐서 거른다. */
export const PICKER_LIMIT = 40
/** 친 글이 이보다 길면 후보를 찾는 글로 보지 않는다. */
const QUERY_MAX = 40
export const PICK_TOO_LONG = `넣으면 코멘트가 ${COMMENT_BODY_MAX_LENGTH}자를 넘어 넣지 않았습니다`

/** 상자의 지금 글과 캐럿으로 연 `#` 의 자리 · 친 글. 열 자리가 아니면 `null`. */
export function hashQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const start = before.lastIndexOf('#')
  if (start < 0) return null
  const query = before.slice(start + 1)
  if (query.length > QUERY_MAX || /[\r\n]/.test(query)) return null
  const prev = start === 0 ? '' : before[start - 1]!
  if (prev !== '' && !/[\s(（[]/u.test(prev)) return null
  return { start, query }
}

/** 컨텍스트 · 색인에서 후보 다섯 무리를 짓는다. 이름 글은 풀린 모양과 같은 꼴이다(`resolveCommentTokens`). */
export function tokenCandidates(context: CommentTokenContext, index: CommentIndex | null): Candidate[] {
  const titleCounts = new Map<string, number>()
  for (const page of context.pages.values()) titleCounts.set(page.title, (titleCounts.get(page.title) ?? 0) + 1)
  const pageName = (id: string): string | null => {
    const page = context.pages.get(id)
    if (page === undefined) return null
    return (titleCounts.get(page.title) ?? 0) > 1 && page.menuPath !== '' ? `${page.menuPath} › ${page.title}` : page.title
  }
  const firstComment = new Map((index?.markers ?? []).map((entry) => [markerKey(entry.pageId, entry.nodeId), entry.firstComment]))

  const here: Candidate[] = []
  const pages: Candidate[] = []
  const elsewhere: Candidate[] = []
  for (const [key, entry] of context.markers) {
    if (entry.marker === null) continue
    const cut = key.indexOf('/')
    const pageId = key.slice(0, cut)
    const nodeId = key.slice(cut + 1)
    const target: CommentTokenTarget = { kind: 'comment', pageId, nodeId }
    const hint = [entry.nodeName, firstComment.get(key) ?? ''].filter((part) => part !== '').join(' · ')
    if (pageId === context.currentPageId) here.push({ group: 'this-page', label: `#${entry.marker}`, hint, target })
    else {
      const name = pageName(pageId)
      if (name !== null) elsewhere.push({ group: 'page-marker', label: `${name} #${entry.marker}`, hint, target })
    }
  }
  for (const id of context.pages.keys()) {
    if (id === context.currentPageId) continue
    const name = pageName(id)
    if (name !== null) pages.push({ group: 'page', label: name, hint: '', target: { kind: 'page', pageId: id } })
  }
  const byMarker = (a: Candidate, b: Candidate): number => a.label.localeCompare(b.label, 'ko', { numeric: true })
  here.sort(byMarker)
  elsewhere.sort(byMarker)

  const groups: Candidate[] = []
  const items: Candidate[] = []
  for (const group of context.codes?.values() ?? []) {
    groups.push({ group: 'code-group', label: group.name, hint: group.key, target: { kind: 'code', group: group.key } })
    for (const item of group.items) {
      items.push({
        group: 'code-item',
        label: item.name,
        hint: `${group.name} › ${item.value}`,
        target: { kind: 'code', group: group.key, item: item.value },
      })
    }
  }
  return [...here, ...pages, ...elsewhere, ...groups, ...items]
}

export function filterCandidates(candidates: readonly Candidate[], query: string): Candidate[] {
  const needle = query.trim().toLocaleLowerCase('ko')
  const hits = needle === '' ? candidates : candidates.filter((c) => `${c.label} ${c.hint}`.toLocaleLowerCase('ko').includes(needle))
  return hits.slice(0, PICKER_LIMIT)
}

export interface TokenPicker {
  /** 글 상자에 펴 넣는 속성 — `onChange` 는 상자의 것을 그대로 두고 이것들을 더한다. */
  inputProps: {
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
    onSelect: () => void
    onCompositionStart: () => void
    onCompositionEnd: () => void
    onBlur: () => void
    'aria-autocomplete': 'list'
    'aria-expanded': boolean
    'aria-controls'?: string
    'aria-activedescendant'?: string
  }
  /** 글이 바뀐 뒤 부른다(상자의 `onChange` 끝에서) — 연 자리를 다시 본다. */
  sync: (value: string, caret: number) => void
  /** 목록 · 한 줄 말. 닫혔으면 `null`. */
  list: ReactElement | null
}

/**
 * 글 상자 하나의 자동완성. `value` · `setValue` 는 상자의 글이다(초안 칸). 컨텍스트가 `null`(색인을 아직 못 읽었다)이면 열지 않는다.
 */
export function useTokenPicker(options: {
  id: string
  value: string
  setValue: (next: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  context: CommentTokenContext | null
  index: CommentIndex | null
}): TokenPicker {
  const { id, value, setValue, inputRef, context, index } = options
  const composing = useRef(false)
  const [open, setOpen] = useState<{ start: number; query: string } | null>(null)
  // Escape 로 닫은 `#` 의 자리 — 그 `#` 로는 다시 안 연다.
  const dismissed = useRef<number | null>(null)
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const all = useMemo(() => (context === null ? [] : tokenCandidates(context, index)), [context, index])
  const shown = useMemo(() => (open === null ? [] : filterCandidates(all, open.query)), [all, open])

  const sync = (text: string, caret: number): void => {
    if (composing.current || context === null) return
    const found = hashQuery(text, caret)
    if (found === null || found.start === dismissed.current) {
      if (found === null) dismissed.current = null
      setOpen(null)
      return
    }
    setOpen((prev) => {
      if (prev === null || prev.start !== found.start || prev.query !== found.query) setActive(0)
      return found
    })
    setNotice(null)
  }

  const resync = (): void => {
    const input = inputRef.current
    if (input !== null) sync(input.value, input.selectionStart ?? input.value.length)
  }

  const pick = (candidate: Candidate): void => {
    if (open === null) return
    const input = inputRef.current
    const caret = open.start + 1 + open.query.length
    const raw = formatCommentToken(candidate.label, candidate.target)
    const next = `${value.slice(0, open.start)}${raw}${value.slice(caret)}`
    setOpen(null)
    // 서버 검증과 같은 셈(`string.length`).
    if (next.length > COMMENT_BODY_MAX_LENGTH) {
      setNotice(PICK_TOO_LONG)
      return
    }
    setValue(next)
    const at = open.start + raw.length
    // 글이 그려진 뒤 캐럿을 토큰 뒤로 둔다.
    queueMicrotask(() => {
      input?.focus()
      input?.setSelectionRange(at, at)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (open === null || shown.length === 0) return
    if (event.nativeEvent.isComposing || composing.current) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((at) => Math.max(0, Math.min(shown.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1))))
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const candidate = shown[Math.min(active, shown.length - 1)]
      if (candidate === undefined) return
      event.preventDefault()
      pick(candidate)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dismissed.current = open.start
      setOpen(null)
    }
  }

  const listId = `${id}-tokens`
  const optionId = (at: number): string => `${listId}-${at}`
  const expanded = open !== null && shown.length > 0
  const list =
    expanded || notice !== null ? (
      <>
        {expanded && (
          <ul className="wb-shell-comment-picker" role="listbox" id={listId} aria-label="넣을 토큰">
            {shown.map((candidate, at) => (
              <li
                key={`${candidate.group}:${JSON.stringify(candidate.target)}`}
                id={optionId(at)}
                role="option"
                className="wb-shell-comment-picker-option"
                aria-selected={at === active}
                // 누름이 상자의 포커스를 빼앗지 않게 — 고른 뒤 이어 친다.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(candidate)}
              >
                <span className="wb-shell-comment-picker-group">{GROUP_LABEL[candidate.group]}</span>
                {/* 라벨은 토큰 원문에 이름 그대로 들고(방향 제어를 안 걷는다) 보일 때만 가둔다 — 풀린 글과 같다(`resolveCommentTokens`). */}
                <span className="wb-shell-comment-picker-label">{isolateBidi(candidate.label)}</span>
                {candidate.hint !== '' && <span className="wb-shell-comment-picker-hint">{candidate.hint}</span>}
              </li>
            ))}
          </ul>
        )}
        {notice !== null && (
          <p className="wb-shell-panel-notice" role="status">
            {notice}
          </p>
        )}
      </>
    ) : null

  return {
    inputProps: {
      onKeyDown,
      onSelect: resync,
      onCompositionStart: () => {
        composing.current = true
      },
      onCompositionEnd: () => {
        composing.current = false
        resync()
      },
      onBlur: () => setOpen(null),
      'aria-autocomplete': 'list',
      'aria-expanded': expanded,
      ...(expanded ? { 'aria-controls': listId, 'aria-activedescendant': optionId(Math.min(active, shown.length - 1)) } : {}),
    },
    sync,
    list,
  }
}
