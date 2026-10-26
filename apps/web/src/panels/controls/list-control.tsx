/**
 * `stringList`(문자열 배열) · `pairList`(키-값 배열) · `optionList`(선택지 — `{ label, selected }` 배열) · `fileList`(파일 목록 — `{ name, size }` 배열)의
 * 위젯. 항목 추가·삭제·수정·옮기기(↑ ↓), 선택지면 고르기 · 고른 것 풀기. 파일 목록은 키-값과 같은 두 칸 줄이다(이름 · 크기).
 *
 * **배열을 통째로 `replace`한다 — 항목마다 인덱스를 조작하지 않는다.** JSON Patch의 배열
 * 인덱스(`add /…/columns/-`·`remove /…/columns/1`)는 동시 편집에서 어긋나기 쉽다: 다른
 * 사람이 앞쪽 항목을 지운 뒤 내 `remove /…/1`이 도착하면 **엉뚱한 항목이 지워진다.** 그
 * 부류는 리베이스(설계서 「정방향 흐름」)가 다루고, 서버는 `baseSeq`가 어긋나면 409로 거절해
 * 재조회로 수렴시킨다. 통째 교체는 그 안에서 안전하다 — 내 배열이 낡았으면 `baseSeq`가
 * 어긋나 요청 자체가 거절된다.
 *
 * **커밋 규칙은 조작 종류에 따라 갈린다.** 추가·삭제·옮기기·고르기는 중간 상태가 없으므로 즉시 커밋하고
 * (스위치와 같다), 항목 텍스트 수정은 blur에 한 번 커밋한다(텍스트와 같다). 옮기기 · 고르기는 고치던 칸의 초안을 얹은 목록에서 짓는다 — 칸을 떠나지
 * 않고 단추를 누르는 길(키보드)에서 친 글이 사라지지 않게.
 *
 * **고른 것은 항목에 붙는다**(`@wirebound/schema` 의 `OptionSchema`) — 옮기면 고른 것이 따라간다. 하나만 고르는 선택지(`select: 'one'`)는 고르면 다른
 * 항목의 고름을 같은 연산에서 걷는다 — 그래서 이 위젯은 검증이 거절할 «둘 이상 고른» 배열을 못 만든다. 선택지는 하나 이상 · `OPTIONS_MAX` 이하라
 * 마지막 하나는 못 지우고 상한에서 더하지 못한다.
 *
 * **배열이 아닌 값과 모양이 깨진 원소를 흡수한다.** 이 패널은 캔버스의 오류 경계 **밖**이라
 * (`apps/web/src` 전체에서 경계는 `CanvasBoundary` 하나뿐) 여기서 던지면 셸 전체가 흰
 * 화면이 된다 — `../property-panel.tsx`의 `stringify`가 같은 이유로 있다. 검증을 통과하지
 * 못한 문서가 스토어에 실리는 창(재조회 전)이 그 유입 지점이다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { FILES_MAX, OPTIONS_MAX, type EditorField } from '@wirebound/schema'
import { shellIcon } from '../../shell/icons'

/** `pairList`의 원소. 키와 값 둘 다 문자열이다. */
export interface Pair {
  key: string
  value: string
}

/** `optionList`의 원소. 고르지 않은 항목은 `selected` 키가 없다(문서를 최소로). */
export interface Choice {
  label: string
  selected?: true
}

/** `fileList`의 원소(`@wirebound/schema` 의 `FileEntrySchema`). 이름 · 크기 둘 다 문자열이다. */
export interface FileRow {
  name: string
  size: string
}

export type ListValue = string[] | Pair[] | Choice[] | FileRow[]

type Kind = 'string' | 'pair' | 'option' | 'file'

/** 위젯 안의 한 줄 — 넷을 한 모양으로 다룬다(`value`가 글 · 라벨 · 파일 크기, `key`가 키 · 파일 이름이다). */
interface Item {
  key: string
  value: string
  selected: boolean
}

export interface ListControlProps {
  field: EditorField
  value: unknown
  /** 그룹에 붙는 id. 라벨(`<dt>`의 `<label htmlFor>`)이 이것을 가리킨다. */
  id: string
  /**
   * 남이 잠근 자리라 못 바꾸는가. **칸뿐 아니라 버튼 둘도 함께 꺼진다** — 추가·삭제는
   * 즉시 커밋이라 칸만 끄면 그 둘로 목록이 그대로 나간다.
   */
  disabled: boolean
  onCommit: (value: ListValue) => void
  /**
   * **고치던 칸의 초안을 든 채 위젯이 내려간다** — 칸을 떠나지 않았는데 부르는 쪽이 `key`로 위젯을 갈아 끼웠다(`./text-control.tsx`의
   * `onLeave`와 같다). 값은 blur 가 냈을 목록이다.
   */
  onLeave?: (value: ListValue) => void
}

function kindOf(field: EditorField): Kind {
  if (field.control === 'pairList') return 'pair'
  if (field.control === 'optionList') return 'option'
  return field.control === 'fileList' ? 'file' : 'string'
}

/**
 * 문서의 값을 항목 배열로. **배열이 아니면 빈 목록이다** — 던지지 않는다.
 *
 * 원소가 문자열이 아니거나(`stringList`) `{ key, value }`가 아니면(`pairList`) 빈 값으로
 * 그린다. **지우지 않고 자리를 남기는 것이 의도다** — 지우면 사용자가 무엇을 잃었는지
 * 모른 채 그 상태로 커밋하게 된다.
 */
function toItems(value: unknown, kind: Kind): Item[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (kind === 'string') return { key: '', value: typeof item === 'string' ? item : '', selected: false }
    if (typeof item !== 'object' || item === null) return { key: '', value: '', selected: false }
    if (kind === 'option') {
      const option = item as { label?: unknown; selected?: unknown }
      return { key: '', value: typeof option.label === 'string' ? option.label : '', selected: option.selected === true }
    }
    if (kind === 'file') {
      const file = item as { name?: unknown; size?: unknown }
      return { key: typeof file.name === 'string' ? file.name : '', value: typeof file.size === 'string' ? file.size : '', selected: false }
    }
    const pair = item as { key?: unknown; value?: unknown }
    return {
      key: typeof pair.key === 'string' ? pair.key : '',
      value: typeof pair.value === 'string' ? pair.value : '',
      selected: false,
    }
  })
}

/** 항목 배열을 문서에 넣을 모양으로 되돌린다. */
function toValue(items: Item[], kind: Kind): ListValue {
  if (kind === 'pair') return items.map((item) => ({ key: item.key, value: item.value }))
  if (kind === 'file') return items.map((item) => ({ name: item.key, size: item.value }))
  if (kind === 'option') return items.map((item): Choice => (item.selected ? { label: item.value, selected: true } : { label: item.value }))
  return items.map((item) => item.value)
}

export function ListControl(props: ListControlProps): ReactElement {
  const { field, value, id, disabled, onCommit } = props
  const kind = kindOf(field)
  // 두 칸 줄 — 키-값(키 · 값) · 파일 목록(이름 · 크기).
  const pairs = kind === 'pair' || kind === 'file'
  const items = toItems(value, kind)

  // **수정 중인 한 칸만 로컬 state로 든다.** 목록 전체를 초안으로 들면 추가·삭제가
  // 즉시 커밋인 것과 어긋나 두 진실이 생긴다. 어느 칸을 고치는 중인지와 그 값만 기억하고,
  // 나머지는 문서를 그대로 비춘다.
  const [draft, setDraft] = useState<{ index: number; part: 'key' | 'value'; text: string } | null>(null)

  function textOf(index: number, part: 'key' | 'value'): string {
    if (draft !== null && draft.index === index && draft.part === part) return draft.text
    return items[index]?.[part] ?? ''
  }

  /** 고치던 칸의 초안을 얹은 항목들 — 초안이 없거나 안 바뀌었으면 `null`. */
  function pendingItems(): Item[] | null {
    if (draft === null) return null
    const current = items[draft.index]
    if (current === undefined || current[draft.part] === draft.text) return null
    return items.map((item, index) => (index === draft.index ? { ...item, [draft.part]: draft.text } : item))
  }

  /** 고치던 칸의 초안을 얹은 목록 — 초안이 없거나 안 바뀌었으면 `null`. `commitDraft`와 `onLeave`가 같은 규칙을 쓴다. */
  function pendingList(): ListValue | null {
    const pending = pendingItems()
    return pending === null ? null : toValue(pending, kind)
  }

  /** 즉시 커밋하는 조작(옮기기 · 고르기)의 바탕 — 고치던 칸의 초안까지 얹은 항목들. */
  function current(): Item[] {
    return pendingItems() ?? items
  }

  // **내려갈 때 고치던 칸의 초안을 넘긴다**(`onLeave`) — 마지막으로 그린 판의 초안 · 목록으로 판정한다.
  const leave = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leave.current = () => {
      const value = pendingList()
      if (value !== null) props.onLeave?.(value)
    }
  })
  useEffect(() => () => leave.current(), [])

  function commitDraft(): void {
    if (draft === null) return
    // **꺼진 동안 도착한 blur는 커밋도 버리기도 아니다.** 남이 이 노드를 잠그면 칸이
    // `disabled`가 되고, 실브라우저는 그 순간 포커스를 거두며 blur를 낸다(Chrome 실측:
    // `focusout INPUT → null`, `activeElement`는 `BODY`). 커밋은 부르는 쪽의 가드가 막지만
    // (`../property-panel.tsx`의 `blocked`), 그 전에 여기서 초안을 `null`로 비우면 **친 글자가
    // 그 자리에서 사라진다** — 실측: `"새 항목"`을 치던 중 잠금이 오면 칸이 `"옛 항목"`이었다.
    // `TextControl`은 커밋이 막혀도 초안을 들고 있으므로 이 갈림이 없다.
    // *"친 글자는 잠금이 오가도 남는다"*(`test/lock/props-lock.test.tsx`)를 두 위젯이 같게 지킨다.
    if (disabled) return
    // 값이 안 바뀌었으면 커밋하지 않는다 — blur마다 revision이 나면 이력이 무의미해진다.
    const next = pendingList()
    setDraft(null)
    if (next !== null) onCommit(next)
  }

  function addItem(): void {
    setDraft(null)
    onCommit(toValue([...items, { key: '', value: '', selected: false }], kind))
  }

  function removeItem(index: number): void {
    setDraft(null)
    onCommit(
      toValue(
        items.filter((_, at) => at !== index),
        kind,
      ),
    )
  }

  /** 한 칸 옮긴다 — 이웃과 자리를 바꾼다. 고른 것 · 키가 항목에 붙어 함께 간다. */
  function moveItem(index: number, delta: -1 | 1): void {
    const next = [...current()]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setDraft(null)
    onCommit(toValue(next, kind))
  }

  /** 고른다 — 하나만 고르는 선택지는 다른 항목의 고름을 함께 걷고, 여럿이면 그 항목만 뒤집는다. */
  function pick(index: number): void {
    const one = field.select === 'one'
    const next = current().map((item, at) =>
      at === index ? { ...item, selected: one ? true : !item.selected } : one ? { ...item, selected: false } : item,
    )
    setDraft(null)
    onCommit(toValue(next, kind))
  }

  function clearPicks(): void {
    setDraft(null)
    onCommit(
      toValue(
        current().map((item) => ({ ...item, selected: false })),
        kind,
      ),
    )
  }

  const options = kind === 'option'
  // 선택지는 하나 이상 · 상한 이하다(`OptionSchema` 의 배열 규칙) · 파일 목록은 상한 이하다(`FILES_MAX`) — 넘는 값은 서버가 422 로 거절한다.
  const canRemove = !options || items.length > 1
  const canAdd = options ? items.length < OPTIONS_MAX : kind === 'file' ? items.length < FILES_MAX : true
  const nth = (index: number): string => `${field.label} ${index + 1}번째`

  /** 아이콘만 남는 단추 — 이름 · `title` 은 아이콘을 얹기 전의 글 그대로(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»). */
  function iconButton(
    name: string,
    icon: 'moveUp' | 'moveDown' | 'remove',
    className: string,
    off: boolean,
    onClick: () => void,
  ): ReactElement {
    return (
      <button type="button" className={className} aria-label={name} title={name} disabled={disabled || off} onClick={onClick}>
        {shellIcon(icon, 14)}
      </button>
    )
  }

  function cell(index: number, part: 'key' | 'value', label: string): ReactElement {
    return (
      <input
        className="wb-shell-control wb-shell-list-cell"
        type="text"
        disabled={disabled}
        aria-label={label}
        value={textOf(index, part)}
        onChange={(event) => {
          // **다른 칸의 초안이 남아 있으면 먼저 낸다.** 초안은 한 칸 몫이라 새 칸의
          // 초안이 앞 칸의 것을 덮는다. 평소에는 앞 칸의 blur가 먼저 커밋해 여기 올 때 초안이
          // 비어 있지만, **잠금이 오면 포커스 없는 초안이 남는다**(위 `commitDraft`의 가드). 먼저
          // 내지 않으면 풀린 뒤 같은 목록의 다른 칸에 한 글자 칠 때 앞 칸의 `"새 항목"`이 커밋 없이
          // `"옛 항목"`으로 돌아간다(Chrome 실측). 그 초안을 blur가 냈을 값 그대로 먼저 낸다 — Chrome:
          // `x`를 치는 순간 `["새 항목","항목 2"]` 1건, 떠나면 `["새 항목","항목 2x"]` 1건.
          if (draft !== null && (draft.index !== index || draft.part !== part)) commitDraft()
          setDraft({ index, part, text: event.target.value })
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitDraft()
        }}
      />
    )
  }

  return (
    // `role="group"`에 이름을 붙여 목록 하나를 통째로 집을 수 있게 한다. 개별 칸은
    // `aria-label`로 갈린다 — `<label htmlFor>` 하나가 여러 입력을 가리킬 수 없다.
    <div className="wb-shell-list" role="group" aria-labelledby={`${id}-label`} id={id}>
      <ul className="wb-shell-list-items">
        {items.map((item, index) => (
          // **인덱스가 key다.** 항목에 고유 id가 없고, 목록이 통째로 교체되므로 그 외의
          // 안정된 키를 만들 수 없다. 항목을 지우면 뒤 항목이 앞 자리를 물려받는데,
          // 그때 수정 중이던 초안은 `removeItem`이 먼저 버린다.
          <li className="wb-shell-list-item" key={index}>
            {options && (
              <input
                className="wb-shell-list-pick"
                type={field.select === 'one' ? 'radio' : 'checkbox'}
                aria-label={`${nth(index)} 고르기`}
                checked={item.selected}
                disabled={disabled}
                onChange={() => pick(index)}
              />
            )}
            {pairs && cell(index, 'key', `${nth(index)} ${kind === 'file' ? '이름' : '키'}`)}
            {cell(index, 'value', `${nth(index)} ${kind === 'file' ? '크기' : pairs ? '값' : '항목'}`)}
            {iconButton(`${index + 1}번째 위로`, 'moveUp', 'wb-shell-list-move', index === 0, () => moveItem(index, -1))}
            {iconButton(`${index + 1}번째 아래로`, 'moveDown', 'wb-shell-list-move', index === items.length - 1, () => moveItem(index, 1))}
            {iconButton(`${index + 1}번째 지우기`, 'remove', 'wb-shell-list-remove', !canRemove, () => removeItem(index))}
          </li>
        ))}
      </ul>
      <div className="wb-shell-list-foot">
        <button type="button" className="wb-shell-list-add" disabled={disabled || !canAdd} onClick={addItem}>
          {shellIcon('add', 14, 'wb-shell-icon-lead')}
          항목 추가
        </button>
        {options && (
          <button
            type="button"
            className="wb-shell-list-add"
            disabled={disabled || !items.some((item) => item.selected)}
            onClick={clearPicks}
          >
            고른 것 풀기
          </button>
        )}
      </div>
    </div>
  )
}
