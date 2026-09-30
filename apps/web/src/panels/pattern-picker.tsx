/**
 * 테마 패턴을 고르는 목록. 구조 트리 줄 `+` · 뿌리 `+`의 `패턴 넣기`가 연다.
 *
 * **컴포넌트 고르개(`type-picker.tsx`)와 나란한 성격이라 그 옆에 둔다** — 둘 다
 * *"무엇을 넣을까"*를 고르는 자리다. 새 패널을 만들지 않는다.
 *
 * **`<select>` 하나인 것은 `TypePicker`의 판단을 그대로 잇는다.** 그쪽은 타입 18종에
 * 대해 *"버튼 목록이면 Tab 정지점이 18개, `<select>`는 1개"*를 근거로 골랐다. 패턴 수는
 * 테마가 정하므로 상한이 없고, 보여야 하는 셋(이름·범주·슬롯)이 **한 줄에 들어간다** —
 * `option` 라벨 하나로 전부 말할 수 있으므로 목록 형태를 바꿀 이유가 없다.
 *
 * **패턴은 캔버스가 그리는 테마의 manifest 에서 읽는다**(`theme/project-theme.tsx` 의 바인딩 manifest) — 캔버스와 같은 테마라야
 * 넣은 패턴이 그 테마의 variant 로 그려진다. 따로 조회하지 않는다 — 셸이 쥔 값이다. 아직 못 읽었으면 테마 없음이라 패턴이 없다.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { NO_THEME } from '@wirebound/renderer'
import { PatternsSchema, type ThemePattern } from '@wirebound/themes'
import { useProjectTheme } from '../theme/project-theme'

/**
 * 패턴이 하나도 없는 테마일 때. **버튼을 회색으로 만들어 두지 않는다** — 패턴이 없는 테마가 **정상**이고(`system-admin`
 * 첫 판이 그렇다), 없다는 것과 고장난 것을 사용자가 갈라야 한다.
 */
export const EMPTY_NOTICE = '이 테마에는 패턴이 없습니다'

/**
 * manifest 의 패턴 선언이 규격(`PatternsSchema`)을 통과하지 못했을 때. 패턴 0개와 갈라 말한다 — 할 일이 «다른 테마를
 * 고르기»가 아니라 «테마를 고치기»다. A2 의 manifest 검증이 올리는 자리에서 막기 전까지는 여기가 그 판을 받는다.
 */
export const BROKEN_NOTICE = '테마의 패턴 선언을 읽지 못했습니다'

/** manifest 의 패턴을 목록으로 — 규격을 통과한 것만 낸다. 통과하지 못하면 목록이 비고 `broken` 이 선다. */
export function themePatterns(manifest: ThemeManifest): { entries: [string, ThemePattern][]; broken: string | null } {
  const parsed = PatternsSchema.safeParse(manifest.patterns ?? {})
  if (!parsed.success) return { entries: [], broken: BROKEN_NOTICE }
  return { entries: Object.entries(parsed.data), broken: null }
}

/** 슬롯을 선언하지 않은 패턴의 표시. 빈칸으로 두면 목록이 잘린 것처럼 읽힌다. */
const NO_SLOTS = '슬롯 없음'

export function PatternPicker(props: {
  onPick: (key: string, pattern: ThemePattern) => void
  onCancel: () => void
}): ReactElement {
  const manifest = useProjectTheme().manifest ?? NO_THEME.manifest
  const { entries, broken } = useMemo(() => themePatterns(manifest), [manifest])
  const [picked, setPicked] = useState('')

  // **어느 갈래든 같은 상자에 담는다.** 목록이 없을 때만 `<p>` 하나를 내면
  // 그 상태에서만 `패턴 취소`가 사라져 사용자가 목록을 닫을 방법이 달라진다.
  if (entries.length === 0) {
    return (
      <div className="wb-shell-picker" role="group" aria-label="패턴 고르기">
        <p className="wb-shell-picker-notice">{broken ?? EMPTY_NOTICE}</p>
        <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
          패턴 취소
        </button>
      </div>
    )
  }

  // 고른 것이 없으면(처음 연 판) 첫 항목이다.
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
 * 때문**이다 — 이름 규칙은 `checkPatterns`(`bad-pattern-name`)가 판정한다. 표시하는 자리가 두 번째로 판정하면 판정이
 * 갈릴 자리가 하나 더 생긴다.
 */
function optionLabel(key: string, pattern: ThemePattern): string {
  const category = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
  const slots = Object.keys(pattern.slots ?? {})
  const shown = slots.length === 0 ? NO_SLOTS : `슬롯: ${slots.join(', ')}`
  return `${pattern.name} — ${category} (${shown})`
}
