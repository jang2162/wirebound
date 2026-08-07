/**
 * `text`·`textarea`·`number` 세 control의 위젯. **값은 blur/Enter에 한 번 나간다**(D5).
 *
 * **왜 타이핑마다가 아닌가.** 근거 셋이다 — (1) undo 한 단계가 사람의 의도("이 필드를 이
 * 값으로 바꿨다")와 일치한다, (2) 요청 수가 최소다, (3) **디바운스 타이머가 없어 테스트가
 * 결정적이다.** 이월 문서가 `editor-shell.test.tsx`의 3/20 간헐 실패를 기록하고 있고,
 * 페이크 타이머 없이 타이머를 쓰면 같은 성질이 다시 생긴다.
 *
 * **타이핑 중에는 이 컴포넌트의 로컬 state만 바뀐다.** 그래서 노드가 바뀔 때 그 state를
 * 버릴 장치가 필요한데, 이 파일이 아니라 **부르는 쪽이 `key`로** 한다
 * (`../property-panel.tsx`). 거기에 그 선택의 근거와 잰 값이 있다.
 */
import { useState, type ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'

export interface TextControlProps {
  field: EditorField
  /** 문서에 있는 지금 값. 없으면 `undefined`다. */
  value: unknown
  /** 입력에 붙는 id. 라벨(`<dt>`의 `<label htmlFor>`)이 이것을 가리킨다. */
  id: string
  onCommit: (value: string | number) => void
}

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

export function TextControl(props: TextControlProps): ReactElement {
  const { field, value, id, onCommit } = props
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

  function commit(): void {
    // **값이 안 바뀌었으면 커밋하지 않는다.** blur마다 revision이 나면 이력이 무의미해진다.
    if (draft === original) return

    if (isNumber) {
      // `Number('')`은 `0`이고 `Number('abc')`는 `NaN`이다. 앞은 "지우기만 해도 0이 들어가는"
      // 형태이고 뒤는 서버가 422를 낼 값이라, 둘 다 보내지 않고 입력만 남긴다.
      if (draft.trim() === '') return
      const parsed = Number(draft)
      if (!Number.isFinite(parsed)) return
      onCommit(parsed)
      return
    }

    onCommit(draft)
  }

  const shared = {
    id,
    className: 'wb-shell-control',
    value: draft,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
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
