/**
 * `treeItems`(트리 항목 — `{ label, open?, children? }` 의 중첩 배열 · `@wirebound/schema` 의 `TreeItemSchema`)의 위젯. 줄마다 펼침 표지 · 이름 칸 ·
 * `…`(아래에 항목 추가 · 하위 항목 추가 · 펼치기 / 접기 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 지우기)이고, 바닥에 «항목 추가»(맨 위 끝)가 선다.
 *
 * **prop 하나를 통째로 `replace` 한다** — 어느 조작이든 편집 하나다(되돌리기 한 번 · «뒤의 것이 이긴다»). 그 근거는 `./list-control.tsx` 머리말과 같다.
 * 커밋 규칙도 그 파일과 같다 — 계층 · 차례 · 펼침을 바꾸는 조작은 바로 커밋하고, 이름은 blur · Enter 에 한 번 커밋한다. 바로 커밋하는 조작은 고치던
 * 칸의 초안을 얹은 계층에서 짓는다(키보드로 칸을 안 떠나고 들여쓰기해도 친 글이 남는다).
 *
 * ## 패널은 접힌 항목의 자식도 그린다
 *
 * 펼침은 **문서의 값**이다(캔버스 · 번들이 접힌 항목의 자식을 안 그린다). 패널이 그 값으로 줄을 감추면, 접힌 항목의 자식을 고치려면 문서를 펼쳐야
 * 한다 — 고치는 일이 그리는 값을 바꾼다. 그래서 패널은 모든 줄을 그리고, 표지(▸ · ▾)는 그 항목의 펼침만 말한다. 펼침 단추는 포인터 몫이고
 * (`../tree-fold.tsx` 의 `TreeToggle` — 그 머리말 «펼침 단추는 포인터 몫이다»), 키보드는 `…` 의 «펼치기» · «접기» 다.
 *
 * ## 키는 이름 칸에서 — 구조 트리와 같은 단축키
 *
 * 이름 칸에서 Alt+↑ · Alt+↓(위로 · 아래로) · Alt+Shift+→ · Alt+Shift+←(들여쓰기 · 내어쓰기)가 선다 — 에디터 단축키 표(`../../edit/editor-shortcuts.ts`)의
 * 그 줄과 같은 판정(`shortcutFor`)을 쓴다. 칸은 글 입력 표면이라 에디터의 단축키가 안 서고(`shortcutsBlocked`), 위젯 상자는 제 단축키를 받는
 * 상자(`[data-wb-own-shortcuts]`)라 펼침 단추 · `…` 에서 친 Delete 가 캔버스의 고른 노드를 지우지 않는다. 옮긴 뒤 포커스는 그 항목의 새 자리의 칸으로
 * 간다 — 줄의 key 가 자리(경로)라 안 옮기면 같은 칸에 다른 항목이 선다.
 *
 * ## 한도는 칸이 먼저 막는다
 *
 * 항목 수(`TREE_ITEMS_MAX`) · 깊이(`TREE_DEPTH_MAX`)를 넘는 조작은 항목을 끄고 까닭을 적는다 — 넘는 값은 서버가 422 로 거절해 다시 불러오기로 사라진다.
 * 판정이 막은 항목은 끄고, 그 줄이 결코 못 하는 항목(자식 없는 항목의 펼치기 · 접기)은 뺀다(`../tree-row-actions.tsx` 머리말 «할 수 없는 항목은 끈다 —
 * 늘 못 하는 항목은 뺀다»).
 *
 * **배열이 아닌 값과 모양이 깨진 원소를 흡수한다** — 이 패널은 캔버스의 오류 경계 밖이다(`./list-control.tsx` 머리말). 객체가 아닌 원소는 빈 이름의
 * 잎으로, 글이 아닌 이름은 빈 이름으로 그린다(지우지 않는다 — 사용자가 무엇을 잃었는지 모른 채 커밋하지 않게).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { TREE_DEPTH_MAX, TREE_ITEMS_MAX, type EditorField, type TreeItem } from '@wirebound/schema'
import { platformOf, shortcutFor } from '../../edit/editor-shortcuts'
import { ActionMenu, type ActionMenuItem } from '../../shell/action-menu'
import { ICONS, shellIcon } from '../../shell/icons'
import { TreeToggle } from '../tree-fold'
import { clampUnits } from './text-control'

/** 위젯 안의 항목 — 펼침 · 자식을 늘 갖는 꼴(`toValue` 가 문서의 최소 꼴로 되돌린다). */
interface Entry {
  label: string
  open: boolean
  children: Entry[]
}

/** 항목의 자리 — 맨 위부터 차례 번호. */
type Path = readonly number[]

export interface TreeItemsControlProps {
  field: EditorField
  value: unknown
  /** 그룹에 붙는 id. 라벨(`<dt>`의 `<label htmlFor>`)이 이것을 가리킨다. */
  id: string
  /** 남이 잠근 자리라 못 바꾸는가 — 칸 · 펼침 단추 · `…` 항목 · «항목 추가» 가 다 꺼진다(바로 커밋하는 조작이 남지 않게). */
  disabled: boolean
  onCommit: (value: TreeItem[]) => void
  /** 고치던 칸의 초안을 든 채 위젯이 내려간다(`./list-control.tsx` 의 `onLeave` 와 같다). 값은 blur 가 냈을 계층이다. */
  onLeave?: (value: TreeItem[]) => void
  /** 이름 칸의 글 상한(`./list-control.tsx` 의 `textMax` 와 같다). */
  textMax?: (path: readonly string[]) => number | undefined
}

function toEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return []
  return value.map((item): Entry => {
    if (typeof item !== 'object' || item === null) return { label: '', open: false, children: [] }
    const raw = item as { label?: unknown; open?: unknown; children?: unknown }
    return { label: typeof raw.label === 'string' ? raw.label : '', open: raw.open === true, children: toEntries(raw.children) }
  })
}

/** 문서에 넣을 꼴 — 자식이 없는 항목은 `open` · `children` 키가 없다(`TreeItemSchema` 머리말 «문서를 최소로»). */
function toValue(entries: readonly Entry[]): TreeItem[] {
  return entries.map((entry): TreeItem => {
    if (entry.children.length === 0) return { label: entry.label }
    return entry.open
      ? { label: entry.label, open: true, children: toValue(entry.children) }
      : { label: entry.label, children: toValue(entry.children) }
  })
}

const keyOf = (path: Path): string => path.join('.')

function count(entries: readonly Entry[]): number {
  return entries.reduce((sum, entry) => sum + 1 + count(entry.children), 0)
}

/** 그 항목 밑의 단 수 — 잎이 1. */
function height(entry: Entry): number {
  return 1 + Math.max(0, ...entry.children.map(height))
}

function at(entries: readonly Entry[], path: Path): Entry | undefined {
  let list = entries
  let found: Entry | undefined
  for (const index of path) {
    found = list[index]
    if (found === undefined) return undefined
    list = found.children
  }
  return found
}

/** 깊은 사본 — 조작이 사본을 고친다. */
function clone(entries: readonly Entry[]): Entry[] {
  return entries.map((entry) => ({ ...entry, children: clone(entry.children) }))
}

/** 그 자리를 품은 목록(사본 안) — 맨 위면 `root` 자신. */
function listOf(root: Entry[], parent: Path): Entry[] {
  return parent.length === 0 ? root : at(root, parent)!.children
}

/** 계층을 바꾸는 조작 하나 — 바뀐 계층과 옮긴 항목의 새 자리. 못 하면 `null`. */
type Edit = { entries: Entry[]; focus: Path | null } | null

const blank = (): Entry => ({ label: '', open: false, children: [] })

function addAfter(entries: readonly Entry[], path: Path): Edit {
  if (count(entries) >= TREE_ITEMS_MAX) return null
  const next = clone(entries)
  const index = path.at(-1)!
  listOf(next, path.slice(0, -1)).splice(index + 1, 0, blank())
  return { entries: next, focus: [...path.slice(0, -1), index + 1] }
}

/** 하위 항목을 그 항목의 자식 끝에 더하고 그 항목을 편다 — 더한 것이 캔버스에 보이게. */
function addChild(entries: readonly Entry[], path: Path): Edit {
  if (count(entries) >= TREE_ITEMS_MAX || path.length >= TREE_DEPTH_MAX) return null
  const next = clone(entries)
  const parent = at(next, path)!
  parent.children.push(blank())
  parent.open = true
  return { entries: next, focus: [...path, parent.children.length - 1] }
}

function move(entries: readonly Entry[], path: Path, delta: -1 | 1): Edit {
  const index = path.at(-1)!
  const parent = path.slice(0, -1)
  const next = clone(entries)
  const list = listOf(next, parent)
  const target = index + delta
  if (target < 0 || target >= list.length) return null
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  return { entries: next, focus: [...parent, target] }
}

/** 앞 형제의 자식 끝으로 — 앞 형제를 편다. 깊이 한도를 넘는 판은 못 한다(옮기는 항목 밑의 단까지 센다). */
function indent(entries: readonly Entry[], path: Path): Edit {
  const index = path.at(-1)!
  if (index === 0) return null
  const self = at(entries, path)!
  if (path.length + height(self) > TREE_DEPTH_MAX) return null
  const next = clone(entries)
  const list = listOf(next, path.slice(0, -1))
  const [moved] = list.splice(index, 1)
  const host = list[index - 1]!
  host.children.push(moved!)
  host.open = true
  return { entries: next, focus: [...path.slice(0, -1), index - 1, host.children.length - 1] }
}

/** 부모 바로 뒤로 — 뒤 형제는 그 자리에 남는다(구조 트리의 내어쓰기와 같다). */
function outdent(entries: readonly Entry[], path: Path): Edit {
  if (path.length < 2) return null
  const index = path.at(-1)!
  const parentPath = path.slice(0, -1)
  const next = clone(entries)
  const parent = at(next, parentPath)!
  const [moved] = parent.children.splice(index, 1)
  const grand = listOf(next, parentPath.slice(0, -1))
  const parentIndex = parentPath.at(-1)!
  grand.splice(parentIndex + 1, 0, moved!)
  return { entries: next, focus: [...parentPath.slice(0, -1), parentIndex + 1] }
}

function remove(entries: readonly Entry[], path: Path): Edit {
  const next = clone(entries)
  listOf(next, path.slice(0, -1)).splice(path.at(-1)!, 1)
  return { entries: next, focus: null }
}

function toggleOpen(entries: readonly Entry[], path: Path): Edit {
  const next = clone(entries)
  const entry = at(next, path)!
  if (entry.children.length === 0) return null
  entry.open = !entry.open
  return { entries: next, focus: path }
}

/** 항목을 끈 까닭 — 끈 항목의 `title` · `aria-description`(`../tree-row-actions.tsx` 와 같은 꼴). */
const ITEMS_FULL = `트리 항목은 ${TREE_ITEMS_MAX}개까지입니다`
const TOO_DEEP = `트리 깊이는 ${TREE_DEPTH_MAX}단까지입니다`

export function TreeItemsControl(props: TreeItemsControlProps): ReactElement {
  const { field, value, id, disabled, onCommit } = props
  const entries = toEntries(value)
  const platform = platformOf(navigator)
  const max = props.textMax?.(['[]', 'label'])

  // 고치는 칸 하나의 초안(`./list-control.tsx` 와 같다 — 계층 전체를 초안으로 들면 바로 커밋하는 조작과 두 진실이 생긴다).
  const [draft, setDraft] = useState<{ key: string; path: Path; text: string } | null>(null)
  /** 조작 뒤 포커스를 줄 칸의 자리 — 그린 뒤 옮긴다(머리말 «키는 이름 칸에서»). */
  const [focusAt, setFocusAt] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (focusAt === null) return
    const input = box.current?.querySelector<HTMLInputElement>(`input[data-tree-item="${focusAt}"]`)
    if (input === null || input === undefined) return
    input.focus()
    setFocusAt(null)
  })

  /** 고치던 칸의 초안을 얹은 계층 — 초안이 없거나 안 바뀌었으면 `null`. */
  function pending(): Entry[] | null {
    if (draft === null) return null
    const current = at(entries, draft.path)
    if (current === undefined || current.label === draft.text) return null
    const next = clone(entries)
    at(next, draft.path)!.label = draft.text
    return next
  }

  const current = (): Entry[] => pending() ?? entries

  const leave = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leave.current = () => {
      const next = pending()
      if (next !== null) props.onLeave?.(toValue(next))
    }
  })
  useEffect(() => () => leave.current(), [])

  function commitDraft(): void {
    if (draft === null) return
    // 꺼진 동안 온 blur 는 커밋도 버리기도 아니다 — `./list-control.tsx` 의 `commitDraft` 머리말과 같은 까닭이다.
    if (disabled) return
    const next = pending()
    setDraft(null)
    if (next !== null) onCommit(toValue(next))
  }

  function run(edit: (entries: readonly Entry[], path: Path) => Edit, path: Path): void {
    if (disabled) return
    const result = edit(current(), path)
    if (result === null) return
    setDraft(null)
    if (result.focus !== null) setFocusAt(keyOf(result.focus))
    onCommit(toValue(result.entries))
  }

  function addTop(): void {
    if (disabled || count(entries) >= TREE_ITEMS_MAX) return
    const base = current()
    setDraft(null)
    setFocusAt(keyOf([base.length]))
    onCommit(toValue([...base, blank()]))
  }

  const full = count(entries) >= TREE_ITEMS_MAX

  /** 줄 `…` 의 항목 — 판정을 지금 계층(초안 없는)으로 한다. 초안은 이름만 바꿔 판정에 안 닿는다. */
  function rowItems(path: Path, entry: Entry, siblings: number): ActionMenuItem[] {
    const index = path.at(-1)!
    const item = (
      key: string,
      label: string,
      icon: ActionMenuItem['icon'],
      why: string | null,
      edit: (e: readonly Entry[], p: Path) => Edit,
      danger = false,
    ): ActionMenuItem => ({
      key,
      label,
      icon,
      onSelect: () => run(edit, path),
      disabled: disabled || why !== null,
      title: why ?? undefined,
      description: why ?? undefined,
      danger,
    })
    const indentWhy = index === 0 ? '앞에 형제 항목이 있어야 합니다' : path.length + height(entry) > TREE_DEPTH_MAX ? TOO_DEEP : null
    return [
      item('add-after', '아래에 항목 추가', ICONS.add, full ? ITEMS_FULL : null, addAfter),
      item('add-child', '하위 항목 추가', ICONS.addMenu, full ? ITEMS_FULL : path.length >= TREE_DEPTH_MAX ? TOO_DEEP : null, addChild),
      ...(entry.children.length === 0
        ? []
        : [item('toggle', entry.open ? '접기' : '펼치기', entry.open ? ICONS.collapse : ICONS.expand, null, toggleOpen)]),
      item('up', '위로', ICONS.moveUp, index === 0 ? '앞에 형제가 있어야 합니다' : null, (e, p) => move(e, p, -1)),
      item('down', '아래로', ICONS.moveDown, index === siblings - 1 ? '뒤에 형제가 있어야 합니다' : null, (e, p) => move(e, p, 1)),
      item('indent', '들여쓰기', ICONS.indent, indentWhy, indent),
      item('outdent', '내어쓰기', ICONS.outdent, path.length < 2 ? '부모 항목이 있어야 합니다' : null, outdent),
      item('remove', '지우기', ICONS.remove, null, remove, true),
    ]
  }

  /** 이름 칸의 키 — 구조 트리 줄과 같은 단축키(머리말). 맞으면 기본 동작(글자 고르기)을 막는다. */
  function onKey(event: KeyboardEvent<HTMLInputElement>, path: Path): void {
    if (event.key === 'Enter') {
      commitDraft()
      return
    }
    if (event.nativeEvent.isComposing) return
    const command = shortcutFor(event.nativeEvent, platform)?.command
    const edit =
      command === 'moveUp'
        ? (e: readonly Entry[], p: Path) => move(e, p, -1)
        : command === 'moveDown'
          ? (e: readonly Entry[], p: Path) => move(e, p, 1)
          : command === 'indent'
            ? indent
            : command === 'outdent'
              ? outdent
              : null
    if (edit === null) return
    event.preventDefault()
    run(edit, path)
  }

  /** 줄 이름 — 접근 이름이 줄마다 갈리게 자리를 붙인다(«항목 1-2»). */
  const nameOf = (path: Path): string => `${field.label} ${path.map((index) => index + 1).join('-')}`

  function rows(list: readonly Entry[], parent: Path): ReactElement {
    return (
      <ul className={parent.length === 0 ? 'wb-shell-tree-items' : 'wb-shell-tree-items wb-shell-tree-items-nested'}>
        {list.map((entry, index) => {
          const path = [...parent, index]
          const key = keyOf(path)
          const name = nameOf(path)
          const text = draft !== null && draft.key === key ? draft.text : entry.label
          return (
            // 자리가 key 다 — 항목에 id 가 없고 계층이 통째로 바뀐다(`./list-control.tsx` 의 «인덱스가 key다»). 옮긴 뒤의 포커스는 `focusAt` 이 잇는다.
            <li key={key} className="wb-shell-tree-item">
              <div className="wb-shell-tree-item-row">
                <input
                  className="wb-shell-control wb-shell-list-cell"
                  type="text"
                  data-tree-item={key}
                  disabled={disabled}
                  aria-label={`${name} 이름`}
                  value={text}
                  maxLength={max}
                  onChange={(event) => {
                    // 다른 칸의 초안이 남았으면 먼저 낸다 — `./list-control.tsx` 의 `cell` 과 같은 까닭이다.
                    if (draft !== null && draft.key !== key) commitDraft()
                    const typed = event.target.value
                    setDraft({ key, path, text: max === undefined ? typed : clampUnits(text, typed, max) })
                  }}
                  onBlur={commitDraft}
                  onKeyDown={(event) => onKey(event, path)}
                />
                <TreeToggle
                  foldable={entry.children.length > 0}
                  folded={!entry.open}
                  onToggle={disabled ? undefined : () => run(toggleOpen, path)}
                />
                <ActionMenu label={`${name} 더 보기`} items={rowItems(path, entry, list.length)} compact disabled={disabled} />
              </div>
              {entry.children.length > 0 && rows(entry.children, path)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    // 목록 하나를 통째로 집는 이름(`role="group"` — `./list-control.tsx` 와 같다). 제 단축키를 받는 상자다(머리말 «키는 이름 칸에서»).
    <div ref={box} className="wb-shell-list" role="group" aria-labelledby={`${id}-label`} id={id} data-wb-own-shortcuts="">
      {rows(entries, [])}
      <div className="wb-shell-list-foot">
        <button
          type="button"
          className="wb-shell-list-add"
          disabled={disabled || full}
          title={full ? ITEMS_FULL : undefined}
          onClick={addTop}
        >
          {shellIcon('add', 14, 'wb-shell-icon-lead')}
          항목 추가
        </button>
      </div>
    </div>
  )
}
