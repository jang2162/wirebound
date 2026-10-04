/**
 * **트리 줄의 접힘** — 구조 트리(페이지마다)와 메뉴 트리(프로젝트마다)가 어느 줄을 접었는지(설계서 「설계서 화면 구조」 «트리 줄마다 접기»).
 *
 * **화면의 상태다 — 서버에 안 가고 새로 고침 뒤에는 모두 펼친다.** 그래서 스토어(`store/editor-store.ts` — 문서 · 선택 · 편집 큐)가 아니라 이
 * 모듈의 `Map` 에 둔다. 트리 컴포넌트의 `useState` 에 두지 않는 것은 읽는 자리가 트리 밖에도 있어서다 — 에디터 단축키(`shell/editor-keys.tsx`)의
 * ← → 가 접고 펴며, ↑ ↓ · Shift 범위는 접힌 줄 안을 건너뛴다(`edit/selection-move.ts` 의 `visibleNodeOrder`). 뷰 모드에서 구조 트리가 DOM 에서
 * 빠졌다 돌아와도(`routes/editor.tsx`) 접은 것이 남는다.
 *
 * 열쇠는 `structureKey(pageId)` · `menuKey(projectId)` 다 — 페이지를 옮겼다 돌아오면 그 페이지에서 접은 그대로다.
 */
import { useMemo, useSyncExternalStore } from 'react'

const NONE: ReadonlySet<string> = new Set()
const sets = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()

export function structureKey(pageId: string | undefined): string {
  return `structure:${pageId ?? ''}`
}

export function menuKey(projectId: string): string {
  return `menu:${projectId}`
}

/** 그 트리에서 접힌 줄의 id. */
export function collapsedOf(key: string): ReadonlySet<string> {
  return sets.get(key) ?? NONE
}

/** 접힌 줄을 갈아 끼운다. 같은 집합이면 아무것도 안 한다(구독자가 다시 그리지 않게). */
function put(key: string, next: ReadonlySet<string>): void {
  const prev = collapsedOf(key)
  if (prev.size === next.size && [...next].every((id) => prev.has(id))) return
  if (next.size === 0) sets.delete(key)
  else sets.set(key, next)
  for (const listener of listeners) listener()
}

/** 그 줄들을 접는다. */
export function collapse(key: string, ids: Iterable<string>): void {
  put(key, new Set([...collapsedOf(key), ...ids]))
}

/** 그 줄들을 편다. */
export function expand(key: string, ids: Iterable<string>): void {
  const next = new Set(collapsedOf(key))
  for (const id of ids) next.delete(id)
  put(key, next)
}

/** 모두 편다. */
export function expandAll(key: string): void {
  put(key, NONE)
}

/** 케이스 사이에 접힘을 비운다 — 운영은 새로 고침이 비운다. */
export function resetCollapsed(): void {
  if (sets.size === 0) return
  sets.clear()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export interface Collapsed {
  /** 접힌 줄의 id. */
  collapsed: ReadonlySet<string>
  /** 접혔으면 펴고 펴졌으면 접는다. */
  toggle: (id: string) => void
  collapse: (ids: Iterable<string>) => void
  expand: (ids: Iterable<string>) => void
  expandAll: () => void
}

/**
 * 그 트리의 접힘을 구독한다. **함수 넷은 열쇠가 바뀔 때만 새것이다** — 트리가 저절로 펴는 이펙트(`panels/structure-tree.tsx` 의 `chains`)가
 * `expand` 를 의존으로 든다. 접힐 때마다 새 함수면 사람이 고른 노드의 조상을 접은 바로 그 커밋에 이펙트가 다시 돌아 도로 편다.
 */
export function useCollapsed(key: string): Collapsed {
  const collapsed = useSyncExternalStore(subscribe, () => collapsedOf(key))
  const actions = useMemo(
    () => ({
      toggle: (id: string) => (collapsedOf(key).has(id) ? expand(key, [id]) : collapse(key, [id])),
      collapse: (ids: Iterable<string>) => collapse(key, ids),
      expand: (ids: Iterable<string>) => expand(key, ids),
      expandAll: () => expandAll(key),
    }),
    [key],
  )
  return useMemo(() => ({ collapsed, ...actions }), [collapsed, actions])
}
