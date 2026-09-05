/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성한다**
 * (설계 §5.1·§9) — 컴포넌트마다 패널을 따로 만들지 않는다는 뜻이고, 그래서 카탈로그에
 * 컴포넌트가 늘어도 이 파일은 그대로다.
 *
 * **여기가 편집의 입구다.** P2b-1에서는 읽기 전용이었고 `이 단계에서는 입력이 없다`
 * 케이스가 그 경계를 고정했다. 그 케이스를 `카탈로그의 control마다 대응하는 위젯이 있다`로
 * 바꾼 것이 "편집이 생겼다"는 신호다(이월 문서 §3).
 *
 * 설계 §9의 우측 패널은 탭 셋(속성·코멘트·상호작용)이고 **오늘 셋이 다 있다** —
 * 코멘트는 P5-1이, 상호작용은 P5-2가 채웠다. 이 패널은 그중 **속성 탭의 본문**이고,
 * 탭 자체는 `routes/editor.tsx`의 `RightPanel`이 든다. **여기 있던 *"이 단계에는 속성뿐이라
 * 탭을 두지 않는다"*는 P5-1이 탭을 만든 날 거짓이 됐고 아무도 고치지 않았다.**
 * 뷰 모드의 "페이지 설명" 탭은 아직 없다 — P5-3이다.
 */
import type { ReactElement } from 'react'
import {
  defaultStructure,
  getComponent,
  type ComponentDef,
  type EditorField,
  type WbNode,
} from '@wirebound/schema'
import { useEditCommit } from '../edit/use-edit-commit'
// **schema의 `findNode`를 쓰지 않는다** — `children` 배열 안의 원소가 노드가 아니면
// 던지고(`edit/safe-walk.ts` 머리말의 실측), 이 패널은 오류 경계 밖이라 그 예외가 셸을
// 통째로 지운다. 실측: 그 문서에서 **노드를 고르는 순간** `.wb-shell`이 DOM에서 사라진다 —
// 열기만 할 때는 여기까지 오지 않아 살아 있다.
import { findNodeSafely } from '../edit/safe-walk'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { ListControl } from './controls/list-control'
import { SelectControl } from './controls/select-control'
import { SwitchControl } from './controls/switch-control'
import { VariantControl } from './controls/variant-control'
import { TextControl } from './controls/text-control'
import { BROKEN_TYPE_LABEL, nodeType } from './node-shape'
// 카탈로그가 없으면 모든 노드가 "알 수 없는 타입"이 된다. 설치는 import만으로 끝난다.
import '../catalog-setup'

/** 고를 노드가 아직 없을 때. 페이지를 열지 않았을 때와 고르지 않았을 때가 같은 문장이다. */
const NO_SELECTION = '노드를 고르면 속성이 보입니다'

/** 타입을 읽지 못한 노드의 안내. 캔버스는 같은 노드를 폴백으로 그리고 배너로 알린다. */
const BROKEN_TYPE_NOTICE = '이 노드의 타입을 읽을 수 없습니다'

/**
 * 남이 잠근 자리라 위젯이 전부 꺼졌을 때의 안내.
 *
 * **구조 툴바의 상태줄과 문장을 나눈다**(`./toolbar-status.ts`). 그쪽은 *"고를 수도 바꿀
 * 수도 없습니다"*로 **선택**까지 말하는데, 이 패널은 이미 골라 둔 노드를 그리는 자리라
 * 고르기를 되풀이할 이유가 없다. 원인(남이 편집 중)은 같고 결과만 이 패널의 것이다.
 *
 * **자리를 나눈 이유는 상태줄이 안 보이는 판이 있어서다** — 이 패널은 셸의 반대쪽 끝이고
 * (`routes/editor.tsx`의 `RightPanel`), 좌측 사이드바를 접으면 그 줄이 화면에 없다.
 *
 * **상호작용 탭이 같은 문장을 쓴다**(`./interaction-panel.tsx`). 우측 패널의 두 탭이 같은
 * 이유로 같이 꺼지므로 문장도 한 벌이다 — 두 벌이면 한쪽만 고쳐지는 날이 온다.
 */
export function lockedNotice(userName: string): string {
  return `${userName}님이 편집 중이라 바꿀 수 없습니다`
}

export function PropertyPanel(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를 주는데,
  // 그 값은 어느 페이지 id와도 같지 않아 `useOpenPage('')`가 `null`을 내고 `commitProp`이
  // 그 자리에서 돌아온다 — 즉 페이지가 없을 때 편집이 나갈 길이 없다. (그 상태에서는 아래
  // `node === undefined` 분기가 먼저 걸려 위젯 자체가 그려지지 않는다.)
  const { commitProp, commitVariant } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })
  // **판정은 스토어가 한다**(D7 — `test/lock/one-verdict.test.ts`). 여기서 하는 것은 목록이
  // 바뀔 때 다시 그리는 것과 그 답을 위젯에 잇는 것뿐이고, 목록을 손에 쥐는 자리는
  // `store/use-locked-by.ts` 하나다.
  const lockOf = useLockedBy()

  // 선택은 id 하나이고 노드는 문서에서 찾는다. 노드 객체를 스토어에 두면 P2b-2의 낙관적
  // 패치가 문서를 갈아 끼울 때 패널만 옛 노드를 들고 있게 된다.
  const node =
    doc !== null && selectedNodeId !== null ? findNodeSafely(doc.root, selectedNodeId) : undefined

  /**
   * **재라 — 이 패널의 판정 단위는 «고른 노드»다.**
   *
   * §3.16이 되돌리기에서 세운 규칙은 *"그 조작의 단위에 맞춘다"*이고, 되돌리기의 단위가
   * `inverse` ops였던 것은 **그 조작에 선택이 없기 때문**이다. 이 패널은 반대다 — 존재
   * 자체가 *"고른 노드의 속성"*이고, 위의 `findNodeSafely(doc.root, selectedNodeId)`가 그
   * 단위를 그대로 적고 있다. 그래서 §3.14가 툴바에 쓴 그 값(`store.lockedBy`)을 쓴다.
   *
   * **서버보다 한 갈래 엄격하다 — 그것은 이미 적힌 대가다.** 진짜 서버로 잰 값이 아래이고,
   * 마지막 줄만 갈린다:
   *
   * | 고른 노드가 무엇인가 | 나가는 포인터 | 서버 | 이 패널 |
   * |---|---|---|---|
   * | 잠긴 노드 자신 | `replace …/props/title` | **423** | 막는다 |
   * | 잠긴 서브트리 **안쪽** | `replace …/props/content` | **423** | 막는다 |
   * | 잠긴 노드의 **형제** | `replace …/props/content` | 200 | 안 막는다 |
   * | 무관한 노드 | `replace …/props/content` | 200 | 안 막는다 |
   * | 잠긴 노드의 **조상** | `replace …/props/title` | **200** | **막는다** |
   *
   * 마지막 줄이 `packages/schema/test/lock.test.ts`의 `선택이 편집보다 엄격하다`가
   * *"구멍이 아니라 대가다 — 화면에서 그 자리를 고칠 길이 없어진다(툴바가 선택을 요구한다)"*
   * 로 이미 못박은 자리다. **속성 패널도 선택을 요구하므로 같은 대가를 진다.** 반대로 갔다면
   * §3.14가 툴바에서 반증한 모양이 그대로 돌아온다 — *"고를 수 없는 줄 위에 켜진 위젯"*이고,
   * 그때 상태줄의 *"바꿀 수도 없습니다"*가 이 패널에 대해 거짓인 채로 남는다.
   *
   * **과소차단은 0이다.** 잠금이 이 노드의 조상이거나 자신이어야 `…/props/…`가 그 잠긴
   * 서브트리 안에 들어가므로, 서버가 423을 낼 갈래는 전부 `lockedBy`가 먼저 낸다.
   */
  const lock = node === undefined ? null : lockOf(node.id)
  // **잠긴 동안 들어온 커밋은 요청을 만들지 않는다.** 위젯을 끄는 것과 **같은 값**에서
  // 나오는 가드다. 끄는 것만으로 안 되는 것은 blur 때문이다 — 포커스가 있는 입력이
  // `disabled`가 되면 실브라우저는 포커스를 놓고 blur를 내는데, 그 blur가 곧
  // `TextControl`·`ListControl`의 커밋이다. **jsdom은 안 놓는다(실측: `disabled`로 바꿔도
  // `activeElement`가 그대로이고 blur 이벤트 0건).** 어느 쪽이든 *"잠긴 동안 도착한 blur는
  // 커밋이 아니다"*가 이 줄이 잠그는 것이고, 케이스는 그 blur를 직접 낸다.
  const blocked = lock !== null

  if (node === undefined) {
    return <p className="wb-shell-panel-notice">{NO_SELECTION}</p>
  }

  // **타입부터 모양을 본다.** 검증 전 문서(P2b-2)에는 `type`이 문자열이 아닌 노드가 들어올
  // 수 있고, 그것을 그대로 `{node.type}`으로 그리면 React가 렌더 도중 던진다. 이 패널은 오류
  // 경계 밖이라 그 예외는 셸 전체를 지운다(`./node-shape.ts`의 머리말 — 실측). 아래 `stringify`가
  // 같은 이유로 있고, 이쪽이 더 흔한 경로다.
  const type = nodeType(node)

  if (type === null) {
    return (
      <>
        <h2 className="wb-shell-panel-title">{BROKEN_TYPE_LABEL}</h2>
        {/* "카탈로그에 없다"와 갈라 말한다. 카탈로그에 없는 것은 이름을 잘못 적은 문서이고,
            이쪽은 노드의 모양 자체가 깨진 것이라 사용자가 할 일이 다르다. */}
        <p className="wb-shell-panel-notice">{BROKEN_TYPE_NOTICE}</p>
      </>
    )
  }

  const def = getComponent(type)

  if (def === undefined) {
    return (
      <>
        <h2 className="wb-shell-panel-title">{type}</h2>
        {/* 캔버스는 이 노드를 폴백으로 그리고 배너로 알린다. 패널이 잠자코 비어 있으면
            사용자는 "왜 속성이 안 나오지"를 묻게 된다. */}
        <p className="wb-shell-panel-notice">카탈로그에 없는 컴포넌트입니다: {type}</p>
      </>
    )
  }

  const fields = visibleFields(def)
  const variantField = variantFieldOf(def)

  // **props 검증 실패는 이 패널이 말하지 않는다.** 캔버스는 그리지 못한 이유 둘(알 수 없는
  // 타입 / props 검증 실패)을 폴백과 배너로 알리는데, 여기는 앞의 하나만 안내하고 검증에
  // 실패한 노드에는 원본 값을 평범하게 보여 준다. 이 단계에서 닫지 않은 이유는 둘이다 —
  // 패널이 스스로 검증하면 렌더러의 판정과 갈라질 수 있고(같은 위험을 `currentStructure`의
  // 주석이 구조 선택에 대해 적고 있다), P2b-2의 편집이 필요로 하는 것은 노드 단위 성패가
  // 아니라 **필드 단위** 결과라 지금 만든 모양이 그때 다시 뒤집힌다.
  return (
    <>
      <h2 className="wb-shell-panel-title">{type}</h2>
      {fields.length === 0 && variantField === null ? (
        // `Page`·`Slot`처럼 `editor`가 빈 컴포넌트가 있다. 아무것도 그리지 않으면
        // "아직 고르지 않았다"와 구분되지 않는다.
        <p className="wb-shell-panel-notice">이 컴포넌트에는 편집할 속성이 없습니다</p>
      ) : (
        <>
          {/* **꺼진 위젯의 이유를 이 패널이 자기 자리에서 말한다.** 위젯이 없으면 설명할
              회색도 없으므로 이 갈래 안에만 둔다 — 편집할 속성이 없는 컴포넌트
              (`Page`·`Slot`)에서는 위의 문장이 이미 그 자리를 설명한다. */}
          {lock !== null && <p className="wb-shell-panel-notice">{lockedNotice(lock.userName)}</p>}
          <dl className="wb-shell-props">
            {/* **변형이 맨 앞이다.** 개별 prop이 아니라 이 노드가 어떤 표현인가를 정하는
                것이라 상위이고, §6.5도 `variants`를 `base`/`parts` 위의 층으로 둔다. */}
            {variantField !== null && (
              <div className="wb-shell-prop" key={VARIANT_FIELD}>
                <dt className="wb-shell-prop-label">
                  <label id={`${controlId(VARIANT_FIELD)}-label`} htmlFor={controlId(VARIANT_FIELD)}>
                    {variantField.label}
                  </label>
                </dt>
                <dd className="wb-shell-prop-value">
                  <VariantControl
                    // props 컨트롤과 같은 이유로 노드가 바뀌면 위젯을 다시 만든다.
                    key={node.id}
                    options={variantField.options}
                    value={node.variant}
                    id={controlId(VARIANT_FIELD)}
                    disabled={blocked}
                    onCommit={(variant) => {
                      if (!blocked) commitVariant(node.id, variant)
                    }}
                  />
                </dd>
              </div>
            )}
            {fields.map((field) => (
              // `<dl>` 안의 `<div>`는 표준이 허용하는 묶음이다. 라벨과 값을 한 줄로 묶어야
              // 스타일과 테스트가 "줄"을 다룰 수 있다.
              <div className="wb-shell-prop" key={field.prop}>
                <dt className="wb-shell-prop-label">
                  {/* 목록 컨트롤은 입력이 여럿이라 `htmlFor` 하나로 이름을 줄 수 없다.
                      그쪽은 `role="group"`이 이 `<label>`을 `aria-labelledby`로 가리킨다. */}
                  <label id={`${controlId(field.prop)}-label`} htmlFor={controlId(field.prop)}>
                    {field.label}
                  </label>
                </dt>
                <dd className="wb-shell-prop-value">
                  <PropControl
                    // **노드가 바뀌면 위젯을 다시 만든다.** 로컬 초안(타이핑 중인 값)을
                    // 버리는 장치이고, 아래 `PropControl`의 주석에 그 선택의 근거와 잰 값이 있다.
                    key={node.id}
                    field={field}
                    value={readProp(node, field.prop)}
                    disabled={blocked}
                    onCommit={(value) => {
                      if (!blocked) commitProp(node.id, field.prop, value)
                    }}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </>
  )
}

/** 입력에 붙는 id. 필드는 한 패널 안에서 `prop`이 유일하므로 그것으로 충분하다. */
function controlId(prop: string): string {
  return `wb-prop-${prop}`
}

/**
 * 변형 줄의 키. **props의 키와 겹칠 수 없다** — 그랬다면 `defineComponent`가
 * *"editor가 스키마에 없는 prop을 가리킵니다"*로 던졌을 이름이다.
 */
const VARIANT_FIELD = 'variant'

/** 변형 컨트롤의 라벨. 패널이 정한다 — 카탈로그에 그 자리가 없다(아래 머리말). */
const VARIANT_LABEL = '변형'

/**
 * **재라 #4 — 이 노드에 변형 컨트롤을 낼 것인가, 낸다면 무엇을 고르게 할 것인가.**
 *
 * `EditorField.prop`은 **props의 키**를 가리키는데 `variant`는 **노드 봉투의 필드**다(§4.3).
 * 그래서 `editor`에 적을 수 없고 — 적으면 `defineComponent`가 던진다 — P4a-2 이월이
 * *"`Button`·`Link`·`List`·`Section`·`Card`의 변형은 닿을 수 없다"*고 적은 상태였다.
 *
 * **패널이 특수 취급하는 쪽(A안)을 골랐다.** 대가가 계획서가 적은 것보다 작다:
 *
 * - **읽는 것이 전부 카탈로그의 값이다** — `def.variants`·`def.variantFrom`. 패널이 새로
 *   갖는 지식은 *"variant는 봉투의 필드다"* 하나이고, 그것은 §4.3·§6.11이 정한 **모델의
 *   사실**이지 컴포넌트별 지식이 아니다.
 * - **§5.1·§9의 *"컴포넌트 정의에서 자동 생성"*이 그대로 성립한다.** 카탈로그가 늘어도 이
 *   파일은 안 바뀐다 — `test/panels/property-panel.test.tsx`의 전수 케이스가 그것을 센다.
 * - **B안(`ComponentDef`에 `variantField` 선언)이 담을 정보가 라벨 하나뿐이다.** 낼지 말지는
 *   아래 조건으로 카탈로그에서 이미 유도된다. 라벨 하나를 위해 §5.1의 계약을 넓히지 않는다.
 *
 * **`variantFrom`이 있으면 내지 않는다.** 그쪽은 prop이 변형을 정하고 `node.variant`는
 * 버려진다 — 컨트롤을 내면 P4a-2가 만든 `ignored-variant` 경고를 **UI가 유도하는 셈**이다.
 * 그 컴포넌트의 변형은 이미 그 prop의 `select`로 도달한다(Text의 `역할`, Field의 `입력 종류`,
 * Divider의 `방향`).
 *
 * **`unknown-variant`도 UI에서 도달할 수 없다** — 선택지가 `def.variants` 그대로다.
 */
export function variantFieldOf(
  def: ComponentDef,
): { label: string; options: readonly string[] } | null {
  if (def.variants.length === 0 || def.variantFrom !== undefined) return null
  return { label: VARIANT_LABEL, options: def.variants }
}

/**
 * 필드 하나를 그린다. **control 종류가 위젯을 고른다.**
 *
 * 위젯이 아직 없는 control은 `formatValue`가 그린 글자로 남는다 — `formatValue`를 남겨 둔
 * 이유가 그것이고, 카탈로그 밖 값(검증을 통과하지 못한 문서)을 그리는 데도 쓴다.
 * 지금 덮은 것과 남은 것은 `test/panels/property-panel.test.tsx`의
 * `카탈로그의 control마다 대응하는 위젯이 있다`가 카탈로그를 세어 대조한다.
 *
 * **노드가 바뀔 때 로컬 초안을 버리는 일은 부르는 쪽의 `key`가 한다.** 이펙트로 동기화하는
 * 대신 `key`를 고른 근거:
 *
 * - **클릭으로 노드를 옮기면 초안이 사라진다 — 구조 트리든 캔버스든 같다.** 실측(jsdom):
 *   트리 버튼을 **클릭**하면 `activeElement`가 `BODY`에 남아 `blur`가 나지 않고 요청이
 *   0건이며, 입력은 새 노드의 값이 된다. 캔버스의 `<div onClick>`도 같은 값이다. 두 경로를
 *   각각 케이스가 고정한다(`구조 트리를 클릭해…`·`캔버스로 다른 노드를 고르면…`).
 * - **`focus()`로 옮기면 커밋된다.** 같은 하네스에서 트리 버튼에 `focus()`를 부르면
 *   `activeElement`가 `BUTTON`이 되고 `blur`가 나 요청이 1건 나간다. **앞 판의 주석은 이
 *   값을 "구조 트리로 고르면 손실이 없다"로 적었는데, 잰 것은 `focus()`이고 사용자가 하는
 *   것은 클릭이다** — 조건이 다른 값을 옮겨 적은 것이었다.
 * - **실브라우저에서는 재지 않았다.** 브라우저마다 `mousedown`에 버튼을 포커스하는지가
 *   다르므로 결과가 갈릴 수 있는데, 이 저장소에서 실브라우저를 띄워 본 적이 없다.
 *   **그래서 "실사용에서는 커밋된다"고 적지 않는다.**
 * - 대안(노드가 바뀔 때 초안을 커밋)을 고르지 않은 것은, 사용자가 **다른 노드로 옮겨 가며
 *   버린** 값을 서버에 쓰게 되기 때문이다. 지우는 쪽이 놀랍지 않다. 그 손실을 없애려면
 *   "선택이 바뀔 때 커밋한다"는 별도 경로가 필요한데 D5(blur/Enter 커밋)를 넘는다.
 *
 * **이펙트로 닫는 판을 만들어 재보지는 않았다** — 위 실측만으로 `key`를 골랐다.
 *
 * **문서 값이 밖에서 바뀔 때 초안을 버리는 것은 `key`가 아니라 `TextControl` 자신이 한다**
 * (`controls/text-control.tsx`). undo가 그 경로다 — 노드가 그대로라 `key`가 갈리지 않는다.
 */
function PropControl(props: {
  field: EditorField
  value: unknown
  /** 남이 잠근 자리인가. **위젯 넷에 전부 내려간다** — 하나만 빠뜨려도 그 control만 살아난다. */
  disabled: boolean
  onCommit: (value: unknown) => void
}): ReactElement {
  const { field, value, disabled, onCommit } = props
  const id = controlId(field.prop)

  if (field.control === 'text' || field.control === 'textarea' || field.control === 'number') {
    return <TextControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} />
  }

  if (field.control === 'switch') {
    return <SwitchControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} />
  }

  if (field.control === 'stringList' || field.control === 'pairList') {
    return <ListControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} />
  }

  // `options`가 없거나 비면 `<select>`를 그리지 않는다(`SelectControl`이 `null`을 낸다).
  // 그 판정을 여기서 한 번 더 하는 것은, 그때 **아래 글자로 되돌아가야** 하기 때문이다 —
  // 위젯도 글자도 없으면 그 줄이 통째로 비어 사용자가 값을 볼 수 없다.
  if (field.control === 'select' && field.options !== undefined && field.options.length > 0) {
    return <SelectControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} />
  }

  return <>{formatValue(value)}</>
}

/**
 * 지금 구조에서 보이는 필드만 남긴다(설계 §5.1의 `visibleWhen`). 컬럼처럼 특정 구조에서만
 * 뜻이 있는 속성이 다른 구조에서 편집 가능한 것처럼 보이면 안 된다.
 */
function visibleFields(def: ComponentDef): EditorField[] {
  const structure = currentStructure(def)
  return def.editor.filter(
    (field) => field.visibleWhen === undefined || field.visibleWhen.structure === structure,
  )
}

/**
 * 이 노드가 **지금 그려지고 있는 구조**.
 *
 * 테마가 없는 이 단계에서는 카탈로그의 첫 구조가 곧 지금 구조다 — 렌더러도 구조 표를
 * 받지 못하면 같은 값을 고른다(`packages/renderer/src/render.tsx`의 `resolveStructureOf`).
 *
 * **P4a가 이것을 테마의 구조 선택으로 바꿔야 한다.** 테마가 실리면 캔버스가
 * `renderDocument(doc, { structures })`로 넘기는 그 표가 진실이 되고, 여기도 같은 표를
 * 봐야 한다. 둘이 갈라지면 패널이 감춘 속성이 화면에는 그려지는(또는 그 반대) 어긋남이
 * 생기는데, 그것은 사용자에게 "없는 속성"으로 보인다.
 */
function currentStructure(def: ComponentDef): string {
  return defaultStructure(def)
}

/** 노드의 props에서 값 하나. 없으면 `undefined`다 — 기본값을 대신 채우지 않는다(아래). */
function readProp(node: WbNode, prop: string): unknown {
  return node.props?.[prop]
}

/**
 * 값을 사람이 읽는 한 줄로 만든다.
 *
 * **없는 값은 빈 문자열이다.** 카탈로그의 기본값을 대신 채우지 않는 것은 의도다 — 문서에
 * 실제로 있는 값과 스키마의 기본값은 다른 것이고, P2b-2가 편집을 얹으면 "비어 있음"과
 * "기본값과 같은 값을 넣어 둠"이 서로 다른 편집 결과가 된다.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  // 사용자가 읽을 문장이어야 한다. `true`를 그대로 찍으면 화면에 코드가 보인다.
  if (typeof value === 'boolean') return value ? '켜짐' : '꺼짐'
  if (Array.isArray(value)) return value.map(formatItem).join(', ')
  // 여기 오는 값은 카탈로그의 어느 control에도 해당하지 않는 것이다. 지금 카탈로그에는
  // 그런 prop이 없지만(문자열·수·불리언·문자열 배열·키-값 배열이 전부다), 검증을 통과하지
  // 못한 문서가 스토어에 실리는 P2b-2에서는 들어올 수 있다. 마지막 수단으로 원문을 보인다.
  return stringify(value)
}

/**
 * 마지막 수단의 서식. **`JSON.stringify`는 던진다** — 순환 참조와 `BigInt`가 그렇다.
 *
 * 이 패널은 오류 경계 **밖**이다(`apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary`
 * 하나뿐이다 — 실측). 그래서 여기서 예외가 새면 캔버스만 무너지는 것이 아니라 셸 전체가
 * 흰 화면이 된다. 위쪽의 `nodeType` 가드가 같은 이유로 있다(`./node-shape.ts`).
 *
 * **오늘은 던질 수 없다.** 스토어에 문서를 싣는 것은 `store.loadPage(…)` **하나이고**,
 * 그것을 부르는 자리는 여럿이지만 **전부 `getPage` 응답을 싣는다**(페이지를 여는 경로 ·
 * 재연결 재조회 · 실패 복구). JSON에서 나온 값에는 순환도 `BigInt`도 없다.
 *
 * **앞 판은 *"부르는 자리가 그 한 곳"*이라고 적었는데 거짓이었다** — `main`에서 이미 둘이었고
 * P3-2가 셋으로 늘렸다(리뷰가 잡았다). **논지는 자리 수가 아니라 값의 출처다.**
 *
 * **웨이브 3에서 이 `try`의 하중이 0이 됐다.** 걷어내도 죽는 케이스가 없다(실측).
 * 앞 판에서 그것을 지키던 `값을 문자열로 만들 수 없어도 셸은 살아 있다`는 이제 다른 자리를
 * 지난다 — `Card.title`이 `text` control이라 `TextControl`이 그리고, 그쪽은 객체 값을 빈
 * 칸으로 시작할 뿐 `JSON.stringify`를 부르지 않는다(`controls/text-control.tsx`의 `toDraft`).
 *
 * **그래도 지우지 않는다.** `formatValue` 자체는 아직 하중이 있고(`options`가 없는 `select`가
 * 그 길로 그려진다 — `options가 없는 select는 그리지 않는다`가 그 값을 단언한다), 이 `try`는
 * 그 길에 객체 값이 실릴 때의 마지막 방벽이다. 이 패널이 오류 경계 **밖**이라는 사정은
 * 그대로다. **다만 지금은 재지 않은 방어라는 것을 여기 적어 둔다.**
 */
function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '(표시할 수 없는 값)'
  }
}

/** 배열 원소 하나. `pairList`의 키-값 쌍만 따로 다룬다. */
function formatItem(item: unknown): string {
  if (isPair(item)) return `${item.key}: ${item.value}`
  return formatValue(item)
}

function isPair(value: unknown): value is { key: string; value: string } {
  if (typeof value !== 'object' || value === null) return false
  const pair = value as { key?: unknown; value?: unknown }
  return typeof pair.key === 'string' && typeof pair.value === 'string'
}
