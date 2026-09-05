/**
 * `stringList`(문자열 배열)와 `pairList`(키-값 배열)의 위젯. 항목 추가·삭제·수정.
 *
 * **배열을 통째로 `replace`한다 — 항목마다 인덱스를 조작하지 않는다.** JSON Patch의 배열
 * 인덱스(`add /…/columns/-`·`remove /…/columns/1`)는 동시 편집에서 어긋나기 쉽다: 다른
 * 사람이 앞쪽 항목을 지운 뒤 내 `remove /…/1`이 도착하면 **엉뚱한 항목이 지워진다.** 그
 * 부류를 다루는 것은 P3의 리베이스이고, 이 단계는 `baseSeq`가 어긋나면 409를 받아 재조회로
 * 수렴하는 것이 전부다(D4). 통째 교체는 그 안에서 안전하다 — 내 배열이 낡았으면 `baseSeq`가
 * 어긋나 요청 자체가 거절된다.
 *
 * **커밋 규칙은 조작 종류에 따라 갈린다.** 추가·삭제는 중간 상태가 없으므로 즉시 커밋하고
 * (스위치와 같다), 항목 텍스트 수정은 blur에 한 번 커밋한다(텍스트와 같다 — D5).
 *
 * **배열이 아닌 값과 모양이 깨진 원소를 흡수한다.** 이 패널은 캔버스의 오류 경계 **밖**이라
 * (`apps/web/src` 전체에서 경계는 `CanvasBoundary` 하나뿐) 여기서 던지면 셸 전체가 흰
 * 화면이 된다 — `../property-panel.tsx`의 `stringify`가 같은 이유로 있다. 검증을 통과하지
 * 못한 문서가 스토어에 실리는 창(D4의 재조회 전)이 그 유입 지점이다.
 */
import { useState, type ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'

/** `pairList`의 원소. 키와 값 둘 다 문자열이다. */
export interface Pair {
  key: string
  value: string
}

export type ListValue = string[] | Pair[]

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
}

function isPairList(field: EditorField): boolean {
  return field.control === 'pairList'
}

/**
 * 문서의 값을 항목 배열로. **배열이 아니면 빈 목록이다** — 던지지 않는다.
 *
 * 원소가 문자열이 아니거나(`stringList`) `{ key, value }`가 아니면(`pairList`) 빈 값으로
 * 그린다. **지우지 않고 자리를 남기는 것이 의도다** — 지우면 사용자가 무엇을 잃었는지
 * 모른 채 그 상태로 커밋하게 된다.
 */
function toItems(value: unknown, pairs: boolean): Pair[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!pairs) return { key: '', value: typeof item === 'string' ? item : '' }
    if (typeof item !== 'object' || item === null) return { key: '', value: '' }
    const pair = item as { key?: unknown; value?: unknown }
    return {
      key: typeof pair.key === 'string' ? pair.key : '',
      value: typeof pair.value === 'string' ? pair.value : '',
    }
  })
}

/** 항목 배열을 문서에 넣을 모양으로 되돌린다. */
function toValue(items: Pair[], pairs: boolean): ListValue {
  return pairs ? items.map((item) => ({ ...item })) : items.map((item) => item.value)
}

export function ListControl(props: ListControlProps): ReactElement {
  const { field, value, id, disabled, onCommit } = props
  const pairs = isPairList(field)
  const items = toItems(value, pairs)

  // **수정 중인 한 칸만 로컬 state로 든다.** 목록 전체를 초안으로 들면 추가·삭제가
  // 즉시 커밋인 것과 어긋나 두 진실이 생긴다. 어느 칸을 고치는 중인지와 그 값만 기억하고,
  // 나머지는 문서를 그대로 비춘다.
  const [draft, setDraft] = useState<{ index: number; part: 'key' | 'value'; text: string } | null>(
    null,
  )

  function textOf(index: number, part: 'key' | 'value'): string {
    if (draft !== null && draft.index === index && draft.part === part) return draft.text
    return items[index]?.[part] ?? ''
  }

  function commitDraft(): void {
    if (draft === null) return
    const current = items[draft.index]
    setDraft(null)
    if (current === undefined) return
    // 값이 안 바뀌었으면 커밋하지 않는다 — blur마다 revision이 나면 이력이 무의미해진다.
    if (current[draft.part] === draft.text) return

    const next = items.map((item, index) =>
      index === draft.index ? { ...item, [draft.part]: draft.text } : item,
    )
    onCommit(toValue(next, pairs))
  }

  function addItem(): void {
    setDraft(null)
    onCommit(toValue([...items, { key: '', value: '' }], pairs))
  }

  function removeItem(index: number): void {
    setDraft(null)
    onCommit(toValue(items.filter((_, at) => at !== index), pairs))
  }

  function cell(index: number, part: 'key' | 'value', label: string): ReactElement {
    return (
      <input
        className="wb-shell-control wb-shell-list-cell"
        type="text"
        disabled={disabled}
        aria-label={label}
        value={textOf(index, part)}
        onChange={(event) => setDraft({ index, part, text: event.target.value })}
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
            {pairs && cell(index, 'key', `${field.label} ${index + 1}번째 키`)}
            {cell(index, 'value', `${field.label} ${index + 1}번째 ${pairs ? '값' : '항목'}`)}
            <button
              type="button"
              className="wb-shell-list-remove"
              disabled={disabled}
              onClick={() => removeItem(index)}
            >
              {`${index + 1}번째 지우기`}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="wb-shell-list-add" disabled={disabled} onClick={addItem}>
        항목 추가
      </button>
    </div>
  )
}
