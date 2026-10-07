/**
 * 새 노드의 타입을 고르는 목록. 툴바의 `안에 추가`·`아래 추가`가 연다.
 *
 * ## 갈래별 한국어 목록이다 — 갈래와 이름은 카탈로그가 갖는다
 *
 * **갈래와 사람이 읽을 이름은 `ComponentDef`에 있다**(`label`·`description`·`group`). 이 파일은
 * 그것을 읽기만 한다 — `apps/web`에 표를 손으로 두면 카탈로그가 늘 때 어긋나는 자리가 하나 더
 * 생긴다.
 *
 * 영문 타입명을 이름순 한 목록으로 내면 한국어 UI가 `EntryForm`·`KeyValue` 같은 **영문 타입명**을
 * `<select>` 하나에 내고, *"EntryForm이 무엇인가"*를 화면이 답하지 않는다.
 *
 * ## 설명은 옵션 글자에 붙이지 않는다
 *
 * **옵션 글자에 붙이면** 240px 좌측 패널에서 긴 옵션이 잘리고 `<select>` 폭이 2px까지
 * 떨어진다(프리셋 고르개에서 잰 값 — `shell.css`의 `.wb-shell-picker` 표). `<option>`은
 * 잘려도 아무 신호가 없다.
 *
 * 그래서 **목록은 이름만**(+ `담을 수 있음` 표시) 내고, **고른 것 하나의 설명을 아래
 * 자기 줄에** 낸다(`.wb-shell-picker-desc`). 거기에는 **영문 타입명도 함께** 싣는다 —
 * 내보낸 JSON·문서가 영문 타입으로 말하므로 둘을 잇는 자리가 화면에 있어야 한다.
 * `aria-describedby`로 `<select>`에 묶여 스크린리더가 고른 항목의 설명을 함께 읽는다.
 *
 * **꺼진 항목의 이유(`panels/toolbar-status.ts`)를 쓰지 않는다.** 그 이유는 *"고른 노드"*를 말하는
 * 자리인데 여기서 설명할 것은 **아직 만들지 않은 타입**이다. 그리고 고르개가 닫히면
 * 사라져야 하는 말이라 고르개와 생몰이 같은 것이 맞다.
 *
 * ## `<select>`인 까닭
 *
 * **`<select>`를 고른 근거는 잰 것이다.** 버튼 목록으로 만들면 **Tab 정지점이 페이지에 둘 수
 * 있는 타입 수만큼** 늘고, `<select>`는 1개다. 구조 트리는
 * 키보드로 지나가는 자리이고 Tab을 빼앗지 않으므로(`panels/structure-tree.tsx`의 `Tab` 주석) 그
 * 비용이 그대로 사용자에게 간다. `role="listbox"` + `aria-activedescendant`로 직접
 * 만들면 키보드 이동 코드가 늘고 그것을 재는 케이스가 또 필요한데, 새 런타임 의존을
 * 들이지 않는다는 제약과도 맞지 않는다. **`<optgroup>`은 그 셈을 바꾸지 않는다** —
 * 정지점도 새 코드도 늘지 않는다.
 *
 * **재지 못한 것:** 네이티브 `<select>`의 타이핑 탐색(첫 글자로 점프)은 jsdom에 없어
 * 확인하지 못했다 — 브라우저가 주는 것이지 이 코드가 만드는 것이 아니다. 이름이 한국어라
 * 그 탐색의 첫 글자도 한글이다.
 *
 * **페이지에 둘 수 없는 타입은 목록에 없다.** 지금 그런 것은 `Slot` 하나이고(설계서 「레이아웃」 —
 * 레이아웃 전용), 판정은 이름이 아니라 **`validatePage`를 실제로 돌려** 한다. 이름으로
 * 거르면 카탈로그에 같은 성질의 타입이 생길 때 어긋난다.
 */
import { useMemo, useState, type ReactElement } from 'react'
import {
  COMPONENT_GROUPS,
  COMPONENT_GROUP_LABELS,
  listComponents,
  validatePage,
  type ComponentGroup,
  type PageDocument,
} from '@wirebound/schema'
import { createNode } from '../edit/create-node'
import '../catalog-setup'

/** `many`인 타입에 붙는 표시. 이름과 갈라 두어야 `value`로 하는 대조가 흔들리지 않는다. */
const MANY_HINT = '담을 수 있음'

/** 목록에 아무것도 없을 때. 카탈로그가 비어 있는 판이라 정상 경로에서는 오지 않는다. */
const EMPTY_NOTICE = '고를 수 있는 타입이 없습니다'

/** 설명 줄의 id. `aria-describedby`가 가리킨다. */
const DESC_ID = 'wb-shell-picker-desc'

export function TypePicker(props: {
  onPick: (type: string) => void
  onCancel: () => void
}): ReactElement {
  // 카탈로그는 실행 중에 바뀌지 않는다(`catalog-setup`이 한 번 설치한다). 매 렌더
  // `validatePage`를 타입 수만큼 돌리지 않도록 한 번만 계산한다.
  const groups = useMemo(placeableGroups, [])
  const first = groups[0]?.types[0]?.type ?? ''
  const [picked, setPicked] = useState(() => first)

  if (groups.length === 0) {
    return <p className="wb-shell-picker-notice">{EMPTY_NOTICE}</p>
  }

  // 고른 것 하나. `picked`는 언제나 목록 안이라(초기값도 목록에서 왔다) 못 찾는 상태는
  // 성립하지 않지만, 찾지 못하면 설명 줄을 **비우지 않고 내지 않는다** — 빈 줄은
  // "설명이 없는 타입"으로 읽힌다.
  const chosen = groups.flatMap((group) => group.types).find((type) => type.type === picked)

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
        {...(chosen === undefined ? {} : { 'aria-describedby': DESC_ID })}
      >
        {groups.map((group) => (
          <optgroup key={group.group} label={group.label}>
            {group.types.map((type) => (
              // `value`는 타입 이름 그대로다 — 보이는 글자에만 한국어 이름과 표시가 붙는다.
              // 둘을 섞으면 카탈로그와 대조하는 테스트가 표시 문구에 흔들린다.
              <option key={type.type} value={type.type}>
                {type.many ? `${type.label} (${MANY_HINT})` : type.label}
              </option>
            ))}
          </optgroup>
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
      {chosen === undefined ? null : (
        <p className="wb-shell-picker-desc" id={DESC_ID}>
          <span className="wb-shell-picker-desc-type">{chosen.type}</span> {chosen.description}
        </p>
      )}
    </div>
  )
}

export interface PickableType {
  type: string
  label: string
  description: string
  many: boolean
}

export interface PickableGroup {
  group: string
  label: string
  types: PickableType[]
}

/**
 * 페이지 문서에 둘 수 있는 타입을 갈래별로. 하단 컴포넌트 판의 탭 · 카드(`palette/component-palette.tsx`)도 이 목록이다 — 고르개와 판이
 * 다른 타입을 내면 «판에는 있는데 `+` 에는 없다» 가 된다.
 *
 * **`validatePage`를 실제로 돌려 거른다.** `createNode`가 만든 노드를 빈 페이지의 자식으로
 * 넣어 이슈가 없는 것만 남긴다 — 이름 목록을 손으로 두는 것보다 정확하고, 카탈로그가
 * 늘어도 여기가 스스로 따라간다(머리말 «갈래와 이름은 카탈로그가 갖는다»와 같은 근거).
 *
 * **뿌리가 될 수 있는 타입도 뺀다.** 안에 두면 검증은 지나지만(`validatePage` 가 `Page` 안 `Page` 를 안 막는다) 한 장이 뿌리를 둘 갖게 된다. 그
 * 타입은 **그 노드를 뿌리로 세워 `bad-root` 가 안 나는 것**으로 가른다 — 이름이 아니라 검증의 뿌리 규칙이다(지금 `Page` 하나).
 *
 * **갈래를 데이터에서 모은 뒤 순서만 준다.** `COMPONENT_GROUPS`를 훑어 각 갈래의 타입을
 * 담으면 목록에 없는 갈래를 가진 타입이 **조용히 사라진다**. 반대로 하면 그 상태에서도
 * 항목이 남고(순서가 뒤로 갈 뿐), 사라지는 것보다 낫다.
 */
export function placeableGroups(): PickableGroup[] {
  const buckets = new Map<string, PickableType[]>()

  for (const def of listComponents()) {
    const node = createNode(def.type, () => 'n-probe')
    if (node === null) continue
    const probe: PageDocument = {
      version: 1,
      root: { id: 'n-probe-root', type: 'Page', children: [node] },
    }
    if (validatePage(probe).length > 0) continue
    if (!validatePage({ version: 1, root: node }).some((issue) => issue.code === 'bad-root')) continue

    const bucket = buckets.get(def.group) ?? []
    bucket.push({
      type: def.type,
      label: def.label,
      description: def.description,
      many: def.children === 'many',
    })
    buckets.set(def.group, bucket)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .map(([group, types]) => ({
      group,
      label: COMPONENT_GROUP_LABELS[group as ComponentGroup] ?? group,
      // **한국어 이름순이다.** 영문 타입명순으로 두면 화면에 보이는 글자와 순서가 갈려
      // 목록을 훑는 사람이 어디를 봐야 할지 모른다.
      types: types.sort((a, b) => a.label.localeCompare(b.label, 'ko')),
    }))
}

/** 갈래의 자리. 카탈로그가 정한 순서를 그대로 쓰고, 모르는 갈래는 맨 뒤다. */
function groupOrder(group: string): number {
  const index = (COMPONENT_GROUPS as readonly string[]).indexOf(group)
  return index === -1 ? COMPONENT_GROUPS.length : index
}
