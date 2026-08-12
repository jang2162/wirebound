/**
 * 우측의 상호작용 탭(설계 §9의 셋째 · §8.1의 저작). **P5-1이 속성·코멘트 둘을 만들었고
 * 여기서 셋째가 붙는다.**
 *
 * ## 화면이 §8.1의 고정 5종을 그대로 보인다 (계획 D5)
 *
 * §8.1: *"액션 타입은 위 5종으로 고정한다. 스크립트나 표현식은 허용하지 않는다."*
 * **자유 입력 자리가 없는 것이 그 문장을 화면에서 지키는 방식이다** — 트리거는 4종
 * `<select>`, 액션 타입은 5종 `<select>`, 노드 타겟은 **문서의 노드 목록**에서 고른다.
 * 손으로 적는 곳은 셋뿐이고 전부 값이지 코드가 아니다: 페이지 경로(`navigate`·`openModal`),
 * `setProp`의 값, 그리고 카탈로그에 없는 타겟의 prop 이름.
 *
 * ## 저작은 이미 있는 편집 경로를 탄다 (D6)
 *
 * **새 계약을 만들지 않는다.** `interactions`는 페이지 문서의 일부이므로
 * `edit/ops.ts`의 `interactionsOps` → `useEditCommit` → `PATCH .../ops`를 그대로 지난다.
 * P5-1의 코멘트는 **서버가** 문서를 바꿔야 해서 `markerOps`라는 새 계약이 필요했지만,
 * 상호작용은 **클라이언트가** 바꾸므로 그 문제가 없다.
 *
 * ## 이 패널은 초안을 들지 않는다 — P5-1 이월 §1의 부류를 닫는 자리
 *
 * *"실패했다고 말하는데 조작은 일어났다"*의 거울상이 여기 있다: **저장에 실패했는데
 * 화면에는 내 편집이 남아 있는 것.** 편집 실패는 `useEditCommit`의 `recover`가 페이지를
 * 서버 상태로 되돌리며 끝나는데, 패널이 자기 `useState`에 규칙 목록을 들고 있으면
 * **문서만 되돌아가고 화면은 그대로**다 — 사용자는 취소됐다는 알림을 보면서 자기 규칙이
 * 그대로 있는 것을 본다.
 *
 * **그래서 문서가 유일한 진실이다.** 모든 조작이 그 자리에서 `commitInteractions`를 부르고,
 * 화면은 스토어의 문서를 다시 읽어 그린다.
 *
 * **다만 그 설계의 하중은 오늘 0이다 — 재 봤고 처음 적은 인과는 거짓이었다.** 규칙 목록을
 * `useState`로 들게 심어도 죽는 케이스가 없다. 실패 뒤 저작 자리가 사라지는 진짜 이유는
 * **선택이 풀리는 것**이다(`recover` → `loadPage` → `selectedNodeId: null`). 값과 다른
 * 장치로 잰 관측은 `test/panels/interaction-panel.test.tsx`의 마지막 describe에 있다.
 * 그래도 초안을 두지 않는 것은, 그 성질을 지탱하는 장치가 **다른 이유로** 거기 있어
 * 재조회 뒤 선택을 되살리는 판이 생기면 바로 깨지기 때문이다.
 *
 * ## 이 패널은 오류 경계 밖이다
 *
 * `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나다. 문서 순회는 던지지 않는
 * `walkSafely`를 쓰고, 그리는 값은 전부 문자열이다.
 *
 * ## 실행은 여기가 아니다
 *
 * §8.3: *"편집 모드에서는 상호작용이 동작하지 않는다."* 이 패널은 **적고 읽는** 데까지이고
 * 뷰 모드의 런타임은 P5-3이다. 뷰 모드의 탭 구성(페이지 설명 / 코멘트 / 상호작용)도 그쪽이다.
 */
import { useState, type ReactElement } from 'react'
import {
  describeInteraction,
  describeNode,
  getComponent,
  listInteractionSentences,
  type EditorField,
  type Interaction,
  type InteractionAction,
  type InteractionTrigger,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { useEditCommit } from '../edit/use-edit-commit'
import { walkSafely } from '../edit/safe-walk'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import '../catalog-setup'

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 상호작용이 보입니다'
/** 노드를 고르지 않아 규칙을 더할 수 없을 때. */
const NO_TARGET = '상호작용을 걸 노드를 캔버스나 구조 트리에서 고르세요'
/** 이 페이지에 규칙이 하나도 없을 때. */
const NO_INTERACTIONS = '아직 상호작용이 없습니다'
/** 아직 타겟을 고르지 않은 액션의 선택지 문안. */
const UNSET_TARGET_OPTION = '— 대상을 고르세요 —'

/** 트리거 4종. **§8.1이 고정한 것이고 화면은 그대로 보인다.** */
const TRIGGERS: readonly { value: InteractionTrigger; label: string }[] = [
  { value: 'click', label: '클릭' },
  { value: 'change', label: '변경' },
  { value: 'select', label: '선택' },
  { value: 'submit', label: '제출' },
]

/** 액션 5종. 순서는 §8.1의 예와 같다. */
const ACTION_TYPES: readonly { value: InteractionAction['type']; label: string }[] = [
  { value: 'setProp', label: '속성 바꾸기' },
  { value: 'setVisible', label: '보이기·숨기기' },
  { value: 'switchTab', label: '탭 전환' },
  { value: 'navigate', label: '페이지 이동' },
  { value: 'openModal', label: '모달 열기' },
]

/**
 * 액션 타입을 고를 때 만들어지는 빈 액션.
 *
 * **타겟이 빈 문자열로 시작한다.** 문서의 아무 노드나 기본으로 넣으면 사용자가 의도하지
 * 않은 규칙이 저장되고, 그것이 §8.2의 문장으로 나가면 **설계서가 거짓말을 한다.**
 * 빈 타겟은 문장이 *"아직 고르지 않은 대상"*이라고 말하고 검증이 경고로 잡는다.
 */
function emptyAction(type: InteractionAction['type']): InteractionAction {
  switch (type) {
    case 'setProp':
      return { type: 'setProp', target: '', prop: '', value: true }
    case 'setVisible':
      return { type: 'setVisible', target: '', value: false }
    case 'switchTab':
      return { type: 'switchTab', target: '', tab: 0 }
    case 'navigate':
      return { type: 'navigate', target: '' }
    case 'openModal':
      return { type: 'openModal', target: '' }
  }
}

export function InteractionPanel(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const store = useEditorStoreInstance()
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 속성 패널과 같은 관례 — 페이지가 없으면 `''`를 주고, 그러면 편집이 나갈 길이 없다.
  const { commitInteractions } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })

  if (doc === null) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }

  const node = selectedNodeId === null ? undefined : findSafely(doc, selectedNodeId)
  const sentences = listInteractionSentences(doc)

  return (
    <>
      <h2 className="wb-shell-panel-title">상호작용</h2>

      {node === undefined ? (
        <p className="wb-shell-panel-notice">{NO_TARGET}</p>
      ) : (
        <NodeRules
          document={doc}
          node={node}
          onChange={(next) => commitInteractions(node.id, next)}
        />
      )}

      {/* **이 페이지의 규칙 전부를 보인다** — 코멘트 탭이 같은 판정을 했다(그쪽 재라 #3).
          §9의 그림도 우측에 목록을 보이고, 탭의 쓸모가 *"이 설계서에 어떤 규칙이 걸려
          있는가"*를 훑는 것이기 때문이다. 고른 노드의 줄에는 표시를 단다. */}
      <section className="wb-shell-panel-section" aria-label="이 페이지의 상호작용">
        <h3 className="wb-shell-panel-subtitle">이 페이지의 상호작용</h3>
        {sentences.length === 0 ? (
          <p className="wb-shell-panel-notice">{NO_INTERACTIONS}</p>
        ) : (
          <ul className="wb-shell-interaction-list">
            {sentences.map((item) => (
              <li
                key={`${item.nodeId}:${item.index}`}
                className="wb-shell-interaction-sentence"
                {...(item.nodeId === selectedNodeId ? { 'aria-current': 'true' as const } : {})}
              >
                {item.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** 고른 노드의 규칙 목록과 저작 컨트롤. */
function NodeRules(props: {
  document: PageDocument
  node: WbNode
  onChange: (next: Interaction[]) => void
}): ReactElement {
  const { document: doc, node, onChange } = props
  // **문서에서 읽는다 — 로컬 사본을 두지 않는다**(머리말의 근거).
  const interactions = Array.isArray(node.interactions) ? node.interactions : []
  const choices = nodeChoices(doc)

  /** 규칙 하나를 바꿔 통째로 낸다. `interactionsOps`가 배열을 통째 다루므로 짝이 맞는다. */
  const replaceAt = (index: number, next: Interaction): void => {
    onChange(interactions.map((item, i) => (i === index ? next : item)))
  }

  return (
    <section className="wb-shell-panel-section" aria-label={`${describeNode(node)}의 상호작용`}>
      <h3 className="wb-shell-panel-subtitle">{describeNode(node)}</h3>

      {interactions.map((interaction, index) => (
        // **`key`가 자리(index)다.** 규칙에 식별자가 없고 배열의 자리가 곧 patch 경로
        // (`/…/interactions/{index}`)이므로, 여기서만 다른 키를 쓰면 화면과 경로가 갈린다.
        <fieldset className="wb-shell-interaction" key={index}>
          <legend>규칙 {index + 1}</legend>

          <label className="wb-shell-field">
            트리거
            <select
              className="wb-shell-select"
              value={interaction.on}
              onChange={(event) =>
                replaceAt(index, { ...interaction, on: event.target.value as InteractionTrigger })
              }
            >
              {TRIGGERS.map((trigger) => (
                <option key={trigger.value} value={trigger.value}>
                  {trigger.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="wb-shell-interaction-remove"
            onClick={() => onChange(interactions.filter((_, i) => i !== index))}
          >
            규칙 {index + 1} 삭제
          </button>

          {/* **문장이 여기 있는 것이 요점이다**(§8.2). 저작하는 사람이 자기가 만든 규칙이
              설계서에서 어떻게 읽히는지를 그 자리에서 본다. */}
          <p className="wb-shell-interaction-sentence">{describeInteraction(doc, node, interaction)}</p>

          {(interaction.actions ?? []).map((action, actionIndex) => (
            <ActionRow
              key={actionIndex}
              document={doc}
              action={action}
              index={actionIndex}
              choices={choices}
              onChange={(next) =>
                replaceAt(index, {
                  ...interaction,
                  actions: interaction.actions.map((item, i) => (i === actionIndex ? next : item)),
                })
              }
              onRemove={() =>
                replaceAt(index, {
                  ...interaction,
                  actions: interaction.actions.filter((_, i) => i !== actionIndex),
                })
              }
            />
          ))}

          <button
            type="button"
            className="wb-shell-interaction-add-action"
            onClick={() =>
              replaceAt(index, {
                ...interaction,
                actions: [...(interaction.actions ?? []), emptyAction('setVisible')],
              })
            }
          >
            규칙 {index + 1}에 액션 추가
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="wb-shell-interaction-add"
        onClick={() => onChange([...interactions, { on: 'click', actions: [] }])}
      >
        상호작용 추가
      </button>
    </section>
  )
}

/** 액션 한 줄. 타입에 따라 뒤따르는 컨트롤이 갈린다. */
function ActionRow(props: {
  document: PageDocument
  action: InteractionAction
  index: number
  choices: { id: string; label: string }[]
  onChange: (next: InteractionAction) => void
  onRemove: () => void
}): ReactElement {
  const { document: doc, action, index, choices, onChange, onRemove } = props
  const ordinal = index + 1

  return (
    <div className="wb-shell-interaction-action" role="group" aria-label={`액션 ${ordinal}`}>
      {/* **보이는 라벨은 `종류`이고 그룹의 이름이 `액션 N`이다.** 둘 다 `액션 N`이면
          접근성 이름이 겹쳐 보조 기술이 두 컨트롤을 같은 것으로 읽는다(실측: RTL의
          `getByLabelText('액션 1')`이 둘을 찾아 던졌다). */}
      <label className="wb-shell-field">
        종류
        <select
          className="wb-shell-select"
          value={action.type}
          // **타입을 바꾸면 액션을 새로 만든다.** 남은 필드를 이어 쓰면 `setProp`의 `prop`이
          // `navigate`에 남아 봉투 검증(`strictObject`)이 그 문서를 거절한다.
          onChange={(event) => onChange(emptyAction(event.target.value as InteractionAction['type']))}
        >
          {ACTION_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {action.type === 'navigate' || action.type === 'openModal' ? (
        // **페이지 경로는 목록에서 고를 수 없다** — 그 대상은 이 문서 안에 없다(재라 #1).
        <TextField
          label="페이지 경로"
          value={action.target}
          onCommit={(value) => onChange({ ...action, target: value })}
        />
      ) : (
        <label className="wb-shell-field">
          대상
          <select
            className="wb-shell-select"
            value={action.target}
            onChange={(event) => onChange({ ...action, target: event.target.value })}
          >
            {/* 빈 값이 선택지에 있어야 `<select>`가 아직 안 고른 상태를 그릴 수 있다. */}
            <option value="">{UNSET_TARGET_OPTION}</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {action.type === 'setVisible' && (
        <label className="wb-shell-field">
          어떻게
          <select
            className="wb-shell-select"
            value={action.value ? 'show' : 'hide'}
            onChange={(event) => onChange({ ...action, value: event.target.value === 'show' })}
          >
            <option value="show">보이기</option>
            <option value="hide">숨기기</option>
          </select>
        </label>
      )}

      {action.type === 'switchTab' && (
        <TabPicker
          document={doc}
          target={action.target}
          tab={action.tab}
          onChange={(tab) => onChange({ ...action, tab })}
        />
      )}

      {action.type === 'setProp' && (
        <PropPicker
          document={doc}
          target={action.target}
          prop={action.prop}
          value={action.value}
          onChange={(next) => onChange({ ...action, ...next })}
        />
      )}

      <button type="button" className="wb-shell-interaction-remove-action" onClick={onRemove}>
        액션 {ordinal} 삭제
      </button>
    </div>
  )
}

/**
 * `switchTab`의 탭 고르개. 타겟의 `tabs`를 읽어 이름으로 고르게 한다 —
 * 번호만 보이면 저작하는 사람이 그것이 어느 탭인지 세어야 한다.
 */
function TabPicker(props: {
  document: PageDocument
  target: string
  tab: number
  onChange: (tab: number) => void
}): ReactElement {
  const node = findSafely(props.document, props.target)
  const tabs = node?.props?.tabs
  const names = Array.isArray(tabs) ? tabs.filter((item): item is string => typeof item === 'string') : []

  if (names.length === 0) {
    // 타겟을 아직 안 골랐거나 `Tabs`가 아니다. 번호로라도 적을 수 있게 둔다 —
    // 컨트롤을 감추면 이미 적혀 있는 값을 고칠 길이 없어진다.
    return (
      <TextField
        label="탭 번호"
        value={String(props.tab)}
        onCommit={(value) => {
          const parsed = Number(value)
          if (Number.isInteger(parsed) && parsed >= 0) props.onChange(parsed)
        }}
      />
    )
  }

  return (
    <label className="wb-shell-field">
      탭
      <select
        className="wb-shell-select"
        value={String(props.tab)}
        onChange={(event) => props.onChange(Number(event.target.value))}
      >
        {names.map((name, index) => (
          <option key={index} value={String(index)}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * `setProp`의 prop과 값.
 *
 * **prop 목록은 카탈로그의 `editor`에서 온다** — 속성 패널이 자동 생성되는 것과 같은
 * 출처다(§5.1). 그래서 상호작용으로 바꿀 수 있는 것과 패널에서 손으로 바꿀 수 있는 것이
 * 같은 집합이고, 둘이 갈리면 *"패널에는 있는데 상호작용으로는 못 건드리는 속성"*이 생긴다.
 */
function PropPicker(props: {
  document: PageDocument
  target: string
  prop: string
  value: unknown
  onChange: (next: { prop?: string; value?: unknown }) => void
}): ReactElement {
  const node = findSafely(props.document, props.target)
  const def = node === undefined ? undefined : getComponent(node.type)
  const fields = def?.editor ?? []
  const field = fields.find((item) => item.prop === props.prop)

  return (
    <>
      {fields.length === 0 ? (
        // 타겟을 아직 안 골랐거나 카탈로그에 없는 타입이다. 목록을 만들 재료가 없으므로
        // 손으로 적게 두되, 그 값이 유효한지는 검증이 `invalid-interaction-prop`으로 말한다.
        <TextField label="속성" value={props.prop} onCommit={(value) => props.onChange({ prop: value })} />
      ) : (
        <label className="wb-shell-field">
          속성
          <select
            className="wb-shell-select"
            value={props.prop}
            onChange={(event) => props.onChange({ prop: event.target.value, value: defaultFor(fields, event.target.value) })}
          >
            <option value="">— 속성을 고르세요 —</option>
            {fields.map((item) => (
              <option key={item.prop} value={item.prop}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <ValueField field={field} value={props.value} onChange={(value) => props.onChange({ value })} />
    </>
  )
}

/** prop을 고를 때 함께 놓는 값. 스위치는 `true`, 그 밖은 빈 문자열이다. */
function defaultFor(fields: readonly EditorField[], prop: string): unknown {
  return fields.find((item) => item.prop === prop)?.control === 'switch' ? true : ''
}

/** `setProp`의 값. **컨트롤 종류가 위젯을 고른다** — 속성 패널과 같은 규칙이다. */
function ValueField(props: {
  field: EditorField | undefined
  value: unknown
  onChange: (value: unknown) => void
}): ReactElement {
  if (props.field?.control === 'switch') {
    return (
      <label className="wb-shell-field">
        값
        <select
          className="wb-shell-select"
          value={props.value === true ? 'on' : 'off'}
          onChange={(event) => props.onChange(event.target.value === 'on')}
        >
          <option value="on">켬</option>
          <option value="off">끔</option>
        </select>
      </label>
    )
  }

  if (props.field?.control === 'number') {
    return (
      <TextField
        label="값"
        value={typeof props.value === 'number' ? String(props.value) : ''}
        onCommit={(text) => {
          const parsed = Number(text)
          // 수가 아니면 문자열 그대로 보낸다 — 검증이 `invalid-interaction-prop`으로
          // 말하는 편이, 조용히 0으로 바꿔 **사용자가 안 적은 값을 저장하는** 것보다 낫다.
          props.onChange(text.trim() === '' ? '' : Number.isNaN(parsed) ? text : parsed)
        }}
      />
    )
  }

  return (
    <TextField
      label="값"
      value={typeof props.value === 'string' ? props.value : String(props.value ?? '')}
      onCommit={(text) => props.onChange(text)}
    />
  )
}

/**
 * blur/Enter에 커밋하는 입력. **속성 패널의 D5와 같은 규칙이다** — 글자마다 요청을 내면
 * 타이핑 한 번이 편집 수십 개가 된다.
 *
 * **초안이 여기에만 산다.** 커밋하면 문서가 진실이 되고, 저장에 실패해 문서가 되돌아가면
 * 다음 렌더의 `value`가 그것을 따라온다.
 */
function TextField(props: {
  label: string
  value: string
  onCommit: (value: string) => void
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? props.value

  const commit = (): void => {
    if (draft === null) return
    setDraft(null)
    if (draft !== props.value) props.onCommit(draft)
  }

  return (
    <label className="wb-shell-field">
      {props.label}
      <input
        className="wb-shell-input"
        type="text"
        value={shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </label>
  )
}

/**
 * 타겟으로 고를 수 있는 노드 목록 — **문서의 모든 노드다**(재라 #5).
 *
 * **자기 자신도 뺀다 → 빼지 않는다.** §8.1이 금지하지 않았고 *"버튼을 누르면 그 버튼이
 * 로딩 상태가 된다"*는 흔한 규칙이다.
 *
 * **캔버스에서 집는 대신 목록에서 고르게 한 근거**(재라 #5): 캔버스에서 집으려면
 * *"지금 타겟을 고르는 중"*이라는 모드가 하나 더 생기고, 그 모드에서는 클릭이 선택이
 * 아니라 지정이 된다 — §9가 캔버스를 *"구조 변경은 구조 트리에서, 속성 변경은 속성
 * 패널에서"*로 좁혀 둔 것과 어긋난다. 목록은 화면 밖 노드도 고를 수 있다는 이점이 덤이다.
 *
 * 이름은 문장과 **같은 함수**가 만든다(`describeNode`) — 목록에서 고른 이름과 문장에
 * 나오는 이름이 갈리면 사용자가 둘을 잇지 못한다.
 */
function nodeChoices(doc: PageDocument): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const visit of walkSafely(doc.root)) {
    out.push({ id: visit.node.id, label: describeNode(visit.node) })
  }
  return out
}

/** 문서에서 노드 하나. **던지지 않는다** — 이 패널은 오류 경계 밖이다. */
function findSafely(doc: PageDocument, nodeId: string): WbNode | undefined {
  if (nodeId === '') return undefined
  for (const visit of walkSafely(doc.root)) {
    if (visit.node.id === nodeId) return visit.node
  }
  return undefined
}
