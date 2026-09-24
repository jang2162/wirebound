/**
 * **프로젝트가 쓸 테마를 고른다.** 에디터 셸 머리에 산다.
 *
 * **왜 이것이 없으면 테마를 만든 것이 아닌가.** 화면에서 `layouts.theme_id`를 바꾸는 수단은
 * 이것 하나다 — 없으면 테마를 저장해도 **DB를 직접 고쳐야** 그 테마가 캔버스에 실린다.
 *
 * ---
 *
 * **자리와 꼴.** 자리는 셸 머리다. 꼴은 이렇다.
 *
 * - **`<select>`다.** 근거는 `MenuPicker`가 같은 축에서 이미 잰 것이다 — 목록의 길이가
 *   **프로젝트의 테마 수**라 상한이 없고(시스템 다섯 + 파생 몇이든), 버튼 목록이면 Tab
 *   정지점이 그 수만큼 는다. `<select>`는 그 수와 무관하게 1이다.
 * - **`MenuPicker`와 달리 값을 든다.** 그쪽은 고르는 순간 목록이 닫혀 중간 상태가 없지만,
 *   여기는 **늘 떠 있고 지금 무엇이 골라져 있는지를 보여주는 것이 절반의 쓸모**다.
 * - **`없음`이 첫 항목이고 자리표시가 아니다.** *"테마를 고르지 않았다"*는 이미 정상
 *   상태이고(`layouts.theme_id`가 `NULL`을 받는다), 화면은 그때 구조 기본 CSS만으로
 *   그려진다. 고르개에 그 선택지가 있어야 **그 상태를 눈으로 확인할 수 있다** — 테마를
 *   바꾸는 라우트가 `null`을 받는 이유가 이것이다.
 * - **시스템 테마에 표시를 붙인다.** 시스템과 프로젝트 테마가 **같은 slug를 가질 수
 *   있어서**(유일성 단위가 `(project_id, slug)`다) 이름만으로는 갈리지 않는다.
 *
 * **owner가 아니면 `disabled`로 그린다.** 서버가 이미 403으로 막지만(설계서 「권한 모델」) 화면이 미리
 * 보여주는 편이 낫다. **판정은 여기서 하지 않는다** — 셸이 `projectAbilities`를 지나
 * `canChoose` 하나를 내려보낸다(`projects/project-actions.ts`의 `projectAbilities` — *"역할별 표를
 * 두지 않는다"*, `test/role-access.test.ts`가 그 단일성을 실행으로 센다).
 *
 * ---
 *
 * **고른 값이 캔버스에 닿는 경로.**
 *
 * 캔버스는 자기 훅으로 테마를 읽으므로(`canvas.tsx`가 `useProjectTheme`을 부른다) 여기서
 * 서버를 고쳐도 그쪽이 다시 조회하지 않으면 화면이 그대로다. 그래서 **성공하면
 * `onChanged()`를 부르고**, 셸이 그것으로 `reloadToken`을 올려 캔버스에 내린다.
 *
 * **`useProjectTheme`의 안정 참조 계약을 건드리지 않는 방법이다** — 그 훅이 내는 함수는
 * 여전히 `useMemo(…, [theme])` 하나이고, 바뀐 것은 **언제 다시 조회하는가**뿐이다.
 *
 * ---
 *
 * **실패하면 고른 값을 되돌린다.** 그대로 두면 고르개가 서버에 없는 상태를 말하게 되고,
 * 사용자는 테마가 바뀐 줄 안 채 캔버스만 안 바뀌는 것을 본다. 문안은 콘솔에만 남긴다 —
 * 이 화면의 조회 실패 처리와 같은 형식이고(`use-project-theme.ts`), **보이는 실패 표면은
 * 아직 없다**(편집 실패의 `EditAlert`는 편집 파이프라인 전용이다).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/context'
import type { ThemeSummary } from '../api/types'

/**
 * *"테마 없음"*의 `<option>` 값. **빈 문자열이어야 한다** — 테마 id는 uuid라
 * (`SHAPES.themeList`가 빈 문자열을 이미 막는다) 실제 항목과 겹치지 않는다.
 */
const NONE = ''

export function ThemePicker(props: {
  projectId: string
  /**
   * 고를 수 있는가. **역할이 아니라 판정을 받는다** — `.role`을 읽는 자리는 이 저장소에서
   * `projectAbilities(…)`의 인자 자리뿐이고(`test/role-access.test.ts`가 실행으로 센다),
   * 여기서 역할을 다시 읽으면 판정이 두 곳이 된다.
   */
  canChoose: boolean
  /** 서버의 테마가 실제로 바뀐 뒤에만 불린다. 셸이 이것으로 캔버스를 다시 조회시킨다. */
  onChanged: () => void
}): ReactElement | null {
  const api = useApi()
  const [options, setOptions] = useState<ThemeSummary[] | null>(null)
  const [selected, setSelected] = useState<string>(NONE)

  useEffect(() => {
    // 앞 프로젝트의 응답이 늦게 도착해 새 프로젝트의 목록을 덮는 것을 막는다
    // (`use-project-theme.ts`·`routes/editor.tsx`의 조회들과 같은 형식이다).
    let alive = true

    void (async () => {
      try {
        // **둘을 함께 받는다.** 목록만으로는 *"지금 무엇이 골라져 있는가"*를 알 수 없고
        // (`themeId`는 현재 테마 응답에만 있다), 현재 테마만으로는 고를 것을 그릴 수 없다.
        const [list, current] = await Promise.all([
          api.listProjectThemes(props.projectId),
          api.getProjectTheme(props.projectId),
        ])
        if (!alive) return
        setOptions(list)
        setSelected(current.themeId ?? NONE)
      } catch (error) {
        if (!alive) return
        // 조회 실패면 고르개를 **안 그린다.** 빈 목록을 그리면 사용자가 *"고를 테마가
        // 없다"*로 읽는데, 실제로는 못 읽은 것이다.
        console.error('테마 목록을 읽지 못했습니다', error)
        setOptions(null)
      }
    })()

    return () => {
      alive = false
    }
  }, [api, props.projectId])

  if (options === null) return null

  async function choose(next: string): Promise<void> {
    const previous = selected
    setSelected(next)
    try {
      await api.setProjectTheme(props.projectId, next === NONE ? null : next)
      props.onChanged()
    } catch (error) {
      console.error('테마를 바꾸지 못했습니다', error)
      // 서버가 거절했으므로 화면이 말하는 것을 서버의 상태로 되돌린다.
      setSelected(previous)
    }
  }

  return (
    <div className="wb-shell-theme-picker-group">
      <label className="wb-shell-theme-picker">
        테마
        <select
          className="wb-shell-theme-select"
          value={selected}
          disabled={!props.canChoose}
          onChange={(event) => void choose(event.target.value)}
        >
          <option value={NONE}>없음</option>
          {options.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.system ? `${entry.theme.meta.name} (내장)` : entry.theme.meta.name}
            </option>
          ))}
        </select>
      </label>
      {/* **저작 화면으로 가는 길.** 고르개 자체는 고르기만 하므로, 셸 머리에서 테마 편집
          화면으로 가는 입구를 여기 둔다.

          **`canChoose`로 감추지 않는다.** 편집 화면은 읽기 전용으로도 쓸모가 있고
          (`routes/theme-editor.tsx`의 권한 절 — 읽기는 viewer 게이트다), 감추면 owner가
          아닌 사람이 *"이 프로젝트가 무엇을 입고 있는지"*를 볼 길이 없어진다.

          **고른 것이 없으면 갈 곳이 없다.** `NONE`은 *"테마를 고르지 않았다"*는 정상
          상태이고 그때는 편집할 대상 자체가 없다 — 목록에서 아무거나 골라 열게 하면
          **보고 있는 것과 다른 테마의 편집 화면**으로 보내는 셈이다. */}
      {selected !== NONE && (
        <Link
          className="wb-shell-theme-edit-link"
          to={`/projects/${props.projectId}/themes/${selected}`}
        >
          테마 편집
        </Link>
      )}
    </div>
  )
}
