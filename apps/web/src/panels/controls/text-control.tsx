/**
 * `text`·`textarea`·`number` 세 control의 위젯. **값은 blur/Enter에 한 번 나간다**.
 *
 * **왜 타이핑마다가 아닌가.** 근거 셋이다 — (1) undo 한 단계가 사람의 의도("이 필드를 이
 * 값으로 바꿨다")와 일치한다, (2) 요청 수가 최소다, (3) **디바운스 타이머가 없어 테스트가
 * 결정적이다.** 페이크 타이머 없이 디바운스 타이머를 쓰면 타이머가 끝나는 때와 단언이
 * 도는 때의 순서가 실행마다 갈려 셸 테스트(`editor-shell.test.tsx`)가 간헐적으로 실패한다.
 *
 * **타이핑 중에는 이 컴포넌트의 로컬 state만 바뀐다.** 그래서 노드가 바뀔 때 그 state를
 * 앞 노드에 묶어 둘 장치가 필요한데, 이 파일이 아니라 **부르는 쪽이 `key`로** 한다
 * (`../property-panel.tsx`). 거기에 그 선택의 근거와 잰 값이 있다. **`key`로 내려가는 위젯은 커밋하지 않은 초안을 `onLeave`로
 * 넘긴다** — 칸을 떠나지 않은 채(blur 없이) 고른 것이 바뀐 판이다(`../property-panel.tsx`의 «떠나기 전에 고른 것이 바뀐 초안»).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'

export interface TextControlProps {
  field: EditorField
  /** 문서에 있는 지금 값. 없으면 `undefined`다. */
  value: unknown
  /** 입력에 붙는 id. 라벨(`<dt>`의 `<label htmlFor>`)이 이것을 가리킨다. */
  id: string
  /**
   * 남이 잠근 자리라 못 바꾸는가(`../property-panel.tsx`). **선택 인자가 아니다** —
   * 빠뜨리면 잠긴 자리에서 위젯이 조용히 되살아난다(툴바도 같은 부류다).
   */
  disabled: boolean
  onCommit: (value: string | number) => void
  /**
   * 칸이 받는 글자 수의 상한 — **코드 포인트**로 센다(서버의 한도와 같은 단위 — 이모지 하나가 한 글자). 입력창의 `maxLength` 는 UTF-16 단위라 이모지를 둘로 세어
   * 한도의 절반에서 멈춘다(L-241) — 그래서 `onChange` 가 코드 포인트로 막고(`clampPoints`) 입력창의 `maxLength` 는 어느 글도 그보다 안 길 상한(`2 ×`)으로 둔다.
   * 주면 빈 칸의 자리표로 그 한도를 말한다(`placeholder`) — 안 주면 끝없이 받는다.
   */
  maxLength?: number
  /**
   * 칸이 받는 글 길이의 상한 — **UTF-16 단위**(카탈로그 prop 의 글 한도 · zod `.max()` 가 `length` 로 센다 — `propTextMax`). 입력창의 `maxLength` 가 같은 단위라
   * 그대로 걸고, `onChange` 도 같은 단위로 막는다(`clampUnits` — 붙여 넣은 글 · 흉내 낸 입력). `maxLength` 와 함께 주지 않는다.
   */
  maxUnits?: number
  placeholder?: string
  /**
   * 고른 노드들의 값이 갈린다(속성 패널의 일괄 편집 — `../property-panel.tsx`의 `BulkProperties`). 빈 칸에 «여러 값» 자리표를 보이고,
   * 아무것도 안 치고 떠나면 커밋하지 않는다(빈 초안이 원본과 같다).
   */
  mixed?: boolean
  /**
   * **커밋하지 않은 초안을 든 채 위젯이 내려간다** — 칸을 떠나지 않았는데(blur · Enter 없이) 부르는 쪽이 `key`로 위젯을 갈아 끼웠다(고른
   * 것이 바뀌었다). 값은 `onCommit`이 받았을 값이다(같은 규칙 — 안 바뀌었거나 수가 아니면 안 부른다).
   */
  onLeave?: (value: string | number) => void
  /**
   * 수 칸을 비우면 빈 글(`''`)을 커밋한다 — 기본값이 없는 prop(`SearchForm.columns`)을 «안 정한» 판으로 되돌리는 길이다. 안 주면 지금처럼 빈 수
   * 칸은 커밋하지 않는다(지우기만 해도 0 이 들어가지 않게 — 아래 `pending`).
   */
  clearable?: boolean
}

/** 값이 갈리는 칸의 자리표(일괄 편집). 고르개 · 켬/끔 칸도 같은 글자를 쓴다. */
export const MIXED_PLACEHOLDER = '여러 값'

/** 문서의 값을 입력창이 들 수 있는 문자열로. 없는 값은 빈 칸이다. */
function toDraft(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  // 카탈로그가 이 control에 문자열·수 말고 다른 것을 붙인 경우다. 지금 카탈로그에는
  // 없지만(실측: `text`·`textarea`·`number` 자리의 zod 스키마가 전부 문자열이거나 수다)
  // 검증을 통과하지 못한 문서가 스토어에 실릴 수 있으므로 빈 칸으로 시작한다 —
  // `JSON.stringify`를 쓰면 사용자가 코드를 편집하게 된다.
  return ''
}

/**
 * 코드 포인트 한도(`max`)를 넘는 입력을 한도로 자른다 — **넣은 글(앞 · 뒤가 안 바뀐 사이)만** 자른다. 입력창의 `maxLength` 처럼 가운데에 친 글자가 끝 글자를 밀어내지
 * 않는다. 한도 안이면 그대로, 한도 앞서 이미 넘은 글(`previous`)이면 더 늘리지 않는다.
 */
export function clampPoints(previous: string, next: string, max: number): string {
  return clampBy(previous, next, max, (text) => [...text].length)
}

/** `clampPoints` 와 같되 UTF-16 단위로 센다(zod `.max()` 의 단위) — 글자(코드 포인트)를 반으로 가르지 않는다: 두 단위짜리가 한 칸 남은 자리에 안 들어간다. */
export function clampUnits(previous: string, next: string, max: number): string {
  return clampBy(previous, next, max, (text) => text.length)
}

function clampBy(previous: string, next: string, max: number, size: (text: string) => number): string {
  if (size(next) <= max) return next
  let head = 0
  while (head < previous.length && head < next.length && previous[head] === next[head]) head += 1
  // 짝의 앞 절반(high surrogate)에서 멈췄으면 한 칸 물린다 — 글자를 반으로 가르지 않는다.
  if (head > 0 && /[\ud800-\udbff]/.test(next[head - 1]!)) head -= 1
  let tail = 0
  while (
    tail < previous.length - head &&
    tail < next.length - head &&
    previous[previous.length - 1 - tail] === next[next.length - 1 - tail]
  )
    tail += 1
  if (tail > 0 && /[\udc00-\udfff]/.test(next[next.length - tail]!)) tail -= 1
  const before = next.slice(0, head)
  const after = tail === 0 ? '' : next.slice(next.length - tail)
  const room = max - size(before) - size(after)
  if (room < 0) return size(previous) <= max ? previous : fit(next, max, size)
  return before + fit(next.slice(head, next.length - tail), room, size) + after
}

/** 글의 앞에서 `room` 안에 드는 만큼 — 코드 포인트 단위로 더한다. */
function fit(text: string, room: number, size: (text: string) => number): string {
  let out = ''
  for (const point of text) {
    if (size(out + point) > room) break
    out += point
  }
  return out
}

export function TextControl(props: TextControlProps): ReactElement {
  const { field, value, id, disabled, onCommit } = props
  const original = toDraft(value)
  const [draft, setDraft] = useState(original)
  const [seen, setSeen] = useState(original)

  // **문서 값이 밖에서 바뀌면 초안을 버린다.**
  //
  // 초안은 "아직 커밋하지 않은 사용자 입력"이고, 그 기준은 초안을 시작할 때의 문서 값이다.
  // 그 값이 밖에서 바뀌었다는 것은 **기준이 사라졌다**는 뜻이므로 초안을 붙들 근거가 없다.
  //
  // 이것이 없으면 undo가 신뢰할 수 없는 기능이 된다(실측): 값을 고쳐 커밋한 뒤 되돌리기를
  // 누르면 캔버스는 되돌아가는데 입력칸은 옛 초안을 붙들고, 그 상태에서 입력을 벗어나기만
  // 해도 `draft !== original`이라 **되돌린 편집이 다시 나간다** — 요청이 셋이 되고 마지막
  // ops가 방금 취소한 그 값이었다.
  //
  // **자기 커밋 경로는 깜빡이지 않는다.** 타이핑 → blur → 낙관적 적용으로 문서 값이 바뀌면
  // 여기서 초안을 새 값으로 맞추는데, 그 둘이 같은 값이라 화면에 보이는 변화가 없다.
  //
  // 렌더 중 `setState`는 React가 권하는 파생 상태 갱신 형태다 — 이펙트로 하면 옛 값이 한
  // 커밋 그려진 뒤 바뀐다.
  if (original !== seen) {
    setSeen(original)
    setDraft(original)
  }

  const isNumber = field.control === 'number'
  const isTextarea = field.control === 'textarea'

  /** 커밋할 값 — 없으면 `null`. `commit`과 `onLeave`가 같은 규칙을 쓴다. */
  function pending(): string | number | null {
    // **값이 안 바뀌었으면 커밋하지 않는다.** blur마다 revision이 나면 이력이 무의미해진다.
    if (draft === original) return null

    if (isNumber) {
      // `Number('')`은 `0`이고 `Number('abc')`는 `NaN`이다. 앞은 "지우기만 해도 0이 들어가는"
      // 형태이고 뒤는 서버가 422를 낼 값이라, 둘 다 보내지 않고 입력만 남긴다.
      if (draft.trim() === '') return props.clearable === true ? '' : null
      const parsed = Number(draft)
      return Number.isFinite(parsed) ? parsed : null
    }

    return draft
  }

  function commit(): void {
    const value = pending()
    if (value !== null) onCommit(value)
  }

  // **내려갈 때 커밋하지 않은 초안을 넘긴다**(`onLeave`). 마지막으로 그린 판의 초안 · 원본으로 판정한다 — 커밋이 나갔으면 낙관적 적용이
  // 원본을 초안으로 맞춰(위 «문서 값이 밖에서 바뀌면») 넘길 것이 없다. **«`onCommit`을 불렀다»로 거르지 않는다** — 부르는 쪽이 막은 커밋이
  // 있다(남의 잠금이 와 칸이 꺼지면 Chrome 이 blur 를 내고 그 커밋은 `blocked`가 버린다). 그 초안도 내려갈 때 넘겨야 남은 노드에 간다.
  const leave = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leave.current = () => {
      const value = pending()
      if (value !== null) props.onLeave?.(value)
    }
  })
  useEffect(() => () => leave.current(), [])

  const shared = {
    id,
    disabled,
    className: 'wb-shell-control',
    ...(props.mixed === true
      ? { placeholder: MIXED_PLACEHOLDER }
      : props.placeholder === undefined
        ? {}
        : { placeholder: props.placeholder, title: props.placeholder }),
    ...(props.maxLength !== undefined
      ? { maxLength: props.maxLength * 2 }
      : props.maxUnits !== undefined
        ? { maxLength: props.maxUnits }
        : {}),
    value: draft,
    onChange: (event: { target: { value: string } }) => {
      const typed = event.target.value
      const { maxLength, maxUnits } = props
      setDraft((previous) =>
        maxLength !== undefined
          ? clampPoints(previous, typed, maxLength)
          : maxUnits !== undefined
            ? clampUnits(previous, typed, maxUnits)
            : typed,
      )
    },
    onBlur: commit,
  }

  if (isTextarea) {
    // **`textarea`에는 Enter를 걸지 않는다.** 걸면 여러 줄을 칠 수 없다 —
    // `textarea에서 Enter는 커밋이 아니라 줄바꿈이다`가 그 자리를 지킨다.
    return <textarea {...shared} rows={3} />
  }

  return (
    <input
      {...shared}
      // `number`에도 `type="text"`를 쓴다. `type="number"`면 브라우저가 값을 스스로
      // 걸러서, 위 `수가 아닌 입력은 나가지 않는다` 판정이 브라우저마다 달라진다.
      // **jsdom과 실제 브라우저에서 그 차이를 재지는 않았다** — 판정을 이 파일 안에
      // 두려는 것이 이유다.
      type="text"
      inputMode={isNumber ? 'numeric' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}
