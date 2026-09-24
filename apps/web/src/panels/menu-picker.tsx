/**
 * 페이지의 소속 메뉴를 고르는 목록. 툴바의 `옮기기`가 연다.
 *
 * **`<select>`를 고른 근거는 잰 것이다** — `TypePicker`가 Tab 정지점으로 갈랐던 것과 같은
 * 축이지만 수가 다르다. 그쪽은 타입 수가 **카탈로그로 정해지고**, 여기 목록의 길이는
 * **프로젝트의 메뉴 수**라 상한이 없다: 버튼 목록이면 정지점이 그 수만큼 늘고 트리가 자랄수록
 * 키보드 사용자의 비용이 커진다. `<select>`는 그 수와 무관하게 1이다.
 * `닫혀 있을 때 목록이 DOM에 없다`가 그 수를 실제로 센다(열면 2 — `<select>`와 `취소`).
 *
 * **목록은 `flattenMenus`가 만든다.** 손목록을 두면 트리가 자랄 때 어긋나는 자리가 하나 더
 * 생긴다. 경로에 조상 제목이 들어가는 것은 제목이 같은 메뉴를 가리기 위해서다 —
 * 서버에 유일성 제약이 없다.
 */
import type { ReactElement } from 'react'

/** 아무것도 고르지 않은 상태의 값. `<option>`의 `value`와 겹치지 않아야 한다. */
const NONE = ''

export function MenuPicker(props: {
  /** 고를 수 있는 메뉴. **지금 소속은 부르는 쪽이 이미 뺐다.** */
  options: { id: string; path: string }[]
  onPick: (menuId: string) => void
  onCancel: () => void
}): ReactElement {
  return (
    <div className="wb-shell-menu-picker">
      <label className="wb-shell-menu-picker-label">
        소속 메뉴
        {/* **값을 들지 않는다.** 고르는 순간 요청이 나가고 목록이 닫히므로 중간 상태가
            없다 — `TypePicker`와 같은 형태다. */}
        <select
          className="wb-shell-menu-picker-select"
          value={NONE}
          onChange={(event) => {
            if (event.target.value !== NONE) props.onPick(event.target.value)
          }}
        >
          {/* 첫 항목은 자리표시다. 이것이 없으면 목록을 여는 순간 첫 메뉴가 고른 것으로
              읽히고, 같은 값을 다시 고를 때 `change`가 나지 않는다. */}
          <option value={NONE}>고르세요</option>
          {props.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.path}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="wb-shell-menu-tool" onClick={props.onCancel}>
        취소
      </button>
    </div>
  )
}
