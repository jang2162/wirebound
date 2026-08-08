/**
 * 새 노드의 타입을 고르는 목록(D6). 툴바의 `안에 추가`·`아래 추가`가 연다.
 *
 * **이름순 한 목록이고 그룹을 만들지 않는다**(D6). 카탈로그 파일이 `action`·`data`·
 * `document`·`input`·`structure`로 나뉘지만 **그 분류가 런타임에 없다**(`ComponentDef`에
 * group 필드가 없다) — `apps/web`에 표를 손으로 두면 카탈로그가 늘 때 어긋나는 자리가
 * 하나 더 생긴다. **대신 런타임 정보로 가르는 것은 한다:** `def.children === 'many'`인
 * 타입에 표시를 붙여 "무언가를 담을 수 있는 것"을 고를 수 있게 한다.
 *
 * **`<select>`를 고른 근거는 잰 것이다.** 페이지에 둘 수 있는 타입이 **18종**이므로
 * 버튼 목록으로 만들면 **Tab 정지점이 18개** 늘고, `<select>`는 1개다. 구조 트리는
 * 키보드로 지나가는 자리이고 Task 8이 Tab을 빼앗지 않기로 했으므로(그 파일 참고) 그
 * 비용이 그대로 사용자에게 간다. `role="listbox"` + `aria-activedescendant`로 직접
 * 만들면 키보드 이동 코드가 늘고 그것을 재는 케이스가 또 필요한데, 새 런타임 의존을
 * 들이지 않는다는 제약과도 맞지 않는다.
 *
 * **재지 못한 것:** 네이티브 `<select>`의 타이핑 탐색(첫 글자로 점프)은 jsdom에 없어
 * 확인하지 못했다 — 브라우저가 주는 것이지 이 코드가 만드는 것이 아니다.
 *
 * **페이지에 둘 수 없는 타입은 목록에 없다.** 지금 그런 것은 `Slot` 하나이고(설계 §4.4 —
 * 레이아웃 전용), 판정은 이름이 아니라 **`validatePage`를 실제로 돌려** 한다. 이름으로
 * 거르면 카탈로그에 같은 성질의 타입이 생길 때 어긋난다.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { listComponents, validatePage, type PageDocument } from '@wirebound/schema'
import { createNode } from '../edit/create-node'
import '../catalog-setup'

/** `many`인 타입에 붙는 표시. 이름과 갈라 두어야 `value`로 하는 대조가 흔들리지 않는다. */
const MANY_HINT = '담을 수 있음'

/** 목록에 아무것도 없을 때. 카탈로그가 비어 있는 판이라 정상 경로에서는 오지 않는다. */
const EMPTY_NOTICE = '고를 수 있는 타입이 없습니다'

export function TypePicker(props: {
  onPick: (type: string) => void
  onCancel: () => void
}): ReactElement {
  // 카탈로그는 실행 중에 바뀌지 않는다(`catalog-setup`이 한 번 설치한다). 매 렌더
  // `validatePage`를 18번 돌리지 않도록 한 번만 계산한다.
  const types = useMemo(placeableTypes, [])
  const [picked, setPicked] = useState(() => types[0]?.type ?? '')

  if (types.length === 0) {
    return <p className="wb-shell-picker-notice">{EMPTY_NOTICE}</p>
  }

  return (
    <div className="wb-shell-picker" role="group" aria-label="타입 고르기">
      <label className="wb-shell-picker-label" htmlFor="wb-shell-picker-type">
        타입
      </label>
      <select
        id="wb-shell-picker-type"
        className="wb-shell-picker-select"
        value={picked}
        onChange={(event) => setPicked(event.target.value)}
      >
        {types.map((type) => (
          // `value`는 타입 이름 그대로다 — 보이는 글자에만 표시가 붙는다. 둘을 섞으면
          // 카탈로그와 대조하는 테스트가 표시 문구에 흔들린다.
          <option key={type.type} value={type.type}>
            {type.many ? `${type.type} (${MANY_HINT})` : type.type}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="wb-shell-picker-action"
        onClick={() => props.onPick(picked)}
      >
        추가
      </button>
      <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
        취소
      </button>
    </div>
  )
}

interface PickableType {
  type: string
  many: boolean
}

/**
 * 페이지 문서에 둘 수 있는 타입을 이름순으로.
 *
 * **`validatePage`를 실제로 돌려 거른다.** `createNode`가 만든 노드를 빈 페이지의 자식으로
 * 넣어 이슈가 없는 것만 남긴다 — 이름 목록을 손으로 두는 것보다 정확하고, 카탈로그가
 * 늘어도 여기가 스스로 따라간다(D6과 같은 근거).
 */
function placeableTypes(): PickableType[] {
  return listComponents()
    .filter((def) => {
      const node = createNode(def.type, () => 'n-probe')
      if (node === null) return false
      const probe: PageDocument = {
        version: 1,
        root: { id: 'n-probe-root', type: 'Page', children: [node] },
      }
      return validatePage(probe).length === 0
    })
    .map((def) => ({ type: def.type, many: def.children === 'many' }))
    .sort((a, b) => a.type.localeCompare(b.type))
}
