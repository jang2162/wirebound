/**
 * 테마 패턴을 고르는 목록. 구조 툴바의 `패턴 넣기`가 연다.
 *
 * **컴포넌트 고르개(`type-picker.tsx`)와 나란한 성격이라 그 옆에 둔다** — 둘 다
 * *"무엇을 넣을까"*를 고르는 자리다. 새 패널을 만들지 않는다.
 *
 * **`<select>` 하나인 것은 `TypePicker`의 판단을 그대로 잇는다.** 그쪽은 타입 18종에
 * 대해 *"버튼 목록이면 Tab 정지점이 18개, `<select>`는 1개"*를 근거로 골랐다. 패턴 수는
 * 테마가 정하므로 상한이 없고, 보여야 하는 셋(이름·범주·슬롯)이 **한 줄에 들어간다** —
 * `option` 라벨 하나로 전부 말할 수 있으므로 목록 형태를 바꿀 이유가 없다.
 *
 * **테마를 여기서 읽는다.** 툴바는 테마를 모르고, 이 컴포넌트는 **열렸을 때만 DOM에
 * 있으므로**(툴바가 `adding === 'pattern'`일 때만 그린다) 조회는 사용자가 버튼을 누른
 * 순간에만 일어난다. 열 때마다 새로 읽으므로 테마 고르개가 바꾼 테마도 그대로 따라온다 —
 * `useProjectTheme`의 `reloadToken`을 여기까지 내려보낼 이유가 없는 것이 그 때문이다.
 *
 * **`apps/web`에 새 런타임 의존을 더하지 않는다** — 쓰는 것은 이미 있는
 * `useProjectTheme`과 `@wirebound/themes`의 타입뿐이다.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { ThemePattern } from '@wirebound/themes'
import { useProjectThemeState, type ProjectThemeState } from '../theme/use-project-theme'

/**
 * 패턴이 하나도 없는 테마일 때. **버튼을 회색으로 만들어 두지 않는다** — 시스템 테마
 * 다섯 중 셋이 패턴을 갖지 않으므로(`packages/themes/src/system/`) 이 상태가 **정상**이고, 없다는 것과 고장난 것을
 * 사용자가 갈라야 한다.
 */
const EMPTY_NOTICE = '이 테마에는 패턴이 없습니다'

/**
 * 테마를 손에 넣지 못한 상태들. **이것들을 한 문장으로 합치지 않는다** —
 * 사용자가 할 일이 각각 다르다.
 *
 * **문장 하나(`테마를 아직 읽지 못했습니다`)로 합치면 서버가 답으로 낸 `theme: null`
 * (=테마를 고르지 않았다)까지 덮는다.** 위 `EMPTY_NOTICE`가 지키는 *"없다는 것과 고장난 것을
 * 사용자가 가른다"*를 **한 층 위에서 깨는** 꼴이고, `theme/use-project-theme.ts`의 상태 표와도 어긋난다.
 *
 * **여기서 가르는 수를 산문에 적지 않는다** — `NOTICE`가 `Record<Exclude<…,'ready'>, string>`
 * 이라 **타입이 상태마다 문장 하나를 요구하고**, 그 키 목록은 케이스가 센다
 * (`test/panels/pattern-picker.test.tsx`의 `안내 문장 표에 겹치는 것이 없다`).
 * 상태를 왜 그렇게 갈랐는지는 `ProjectThemeState`의 표에 있다.
 */
export const NOTICE: Record<Exclude<ProjectThemeState['status'], 'ready'>, string> = {
  // **`unset`과 갈라 적는다.** 프로젝트가 없는데
  // *"이 프로젝트는"*으로 시작하면 없는 것을 가리켜 말하게 된다.
  'no-project': '프로젝트를 아직 읽지 못했습니다',
  loading: '테마를 읽는 중입니다',
  failed: '테마를 읽지 못했습니다. 새로고침해 보세요.',
  unset: '이 프로젝트는 테마를 고르지 않았습니다. 상단에서 테마를 고르세요.',
  // **`unset`과 갈라 적는다.** 이쪽은 고르기는 골랐는데 그 테마가 서지 않는 것이라
  // 할 일이 *"고르기"*가 아니라 *"고치기"*다(설계서 「테마 관리」의 테마 저작).
  unresolved: '이 프로젝트의 테마를 해석하지 못했습니다. 테마를 고쳐야 합니다.',
}

/** 슬롯을 선언하지 않은 패턴의 표시. 빈칸으로 두면 목록이 잘린 것처럼 읽힌다. */
const NO_SLOTS = '슬롯 없음'

export function PatternPicker(props: {
  projectId: string
  onPick: (key: string, pattern: ThemePattern) => void
  onCancel: () => void
}): ReactElement {
  // **`useProjectTheme`이 아니라 상태 훅을 쓴다** — `ThemeSource`는 `ready`가 아닌 상태를
  // 전부 `null` 하나로 좁히므로 무엇을 말할지 고를 수 없다.
  const state = useProjectThemeState(props.projectId)
  const theme = state.status === 'ready' ? state.theme : null

  // 목록은 테마가 바뀔 때만 다시 만든다.
  const entries = useMemo(() => Object.entries(theme?.patterns ?? {}), [theme])
  const [picked, setPicked] = useState('')

  // **어느 갈래든 같은 상자에 담는다.** 테마가 없을 때만 `<p>` 하나를 내면
  // 그 상태에서만 `패턴 취소`가 사라져 사용자가 목록을 닫을 방법이 달라진다.
  if (state.status !== 'ready' || entries.length === 0) {
    return (
      <div className="wb-shell-picker" role="group" aria-label="패턴 고르기">
        <p className="wb-shell-picker-notice">
          {state.status === 'ready' ? EMPTY_NOTICE : NOTICE[state.status]}
        </p>
        <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
          패턴 취소
        </button>
      </div>
    )
  }

  // 첫 항목을 기본값으로 삼되 **`useState`의 초기값으로 두지 않는다** — 테마 조회가
  // 끝나기 전에 이 컴포넌트가 먼저 마운트되므로(그때 `entries`는 비어 있다) 초기값이
  // 영원히 빈 문자열로 굳는다 — 목록이 나온 뒤에도 `value=""`인 `<select>`가 된다.
  const current = entries.some(([key]) => key === picked) ? picked : entries[0]![0]
  const selected = entries.find(([key]) => key === current)!

  return (
    <div className="wb-shell-picker" role="group" aria-label="패턴 고르기">
      <label className="wb-shell-picker-label" htmlFor="wb-shell-pattern-picker">
        패턴
      </label>
      <select
        id="wb-shell-pattern-picker"
        className="wb-shell-picker-select"
        value={current}
        onChange={(event) => setPicked(event.target.value)}
      >
        {entries.map(([key, pattern]) => (
          // `value`는 패턴 키 그대로다 — 보이는 글자에만 꾸밈이 붙는다(`TypePicker`의 관례).
          // 키와 표시를 섞으면 테마와 대조하는 케이스가 문구에 흔들린다.
          <option key={key} value={key}>
            {optionLabel(key, pattern)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="wb-shell-picker-action"
        onClick={() => props.onPick(current, selected[1])}
      >
        패턴 추가
      </button>
      <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
        패턴 취소
      </button>
    </div>
  )
}

/**
 * 보여야 하는 셋을 한 줄로 — 이름 · 범주 · 슬롯 이름들.
 *
 * **범주는 키의 앞부분이다.** 설계서 「patterns — 테마가 소유한 구성 레시피」가 패턴 이름을 `<범주>.<변형>`으로 정했고 그 목록은
 * `PATTERN_CATEGORIES`에 있다. 여기서 그 배열과 대조하지 않는 것은 **표시일 뿐이기
 * 때문**이다 — 규칙 위반은 `checkPatterns`가 저장 경계에서 이미 막는다(`bad-pattern-name`).
 */
function optionLabel(key: string, pattern: ThemePattern): string {
  const category = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
  const slots = Object.keys(pattern.slots ?? {})
  const shown = slots.length === 0 ? NO_SLOTS : `슬롯: ${slots.join(', ')}`
  return `${pattern.name} — ${category} (${shown})`
}
