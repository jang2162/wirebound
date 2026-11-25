/**
 * 우측의 상호작용 탭 — 설계서 「설계서 화면 구조」의 셋째 탭(속성 · 코멘트 다음)이고,
 * 설계서 「상호작용」 「모델」의 규칙을 저작한다.
 *
 * ## 화면이 「상호작용」 「모델」의 고정 7종을 그대로 보인다
 *
 * 「상호작용」 「모델」: *"액션 타입은 위 7종으로 고정한다. 스크립트나 표현식은 허용하지 않는다."*
 * **자유 입력 자리가 없는 것이 그 문장을 화면에서 지키는 방식이다** — 트리거는 4종
 * `<select>`, 액션 타입은 7종 `<select>`, 노드 타겟은 **문서의 노드 목록**에서, 화면 상태 타겟은 **그 페이지의 상태 트리**(기본 + 상태)에서,
 * 페이지 타겟은 **프로젝트 트리의 페이지 목록**(팝업 페이지 먼저)에서 고른다. 손으로 적는 곳은 셋뿐이고 전부 값이지 코드가 아니다: 목록 밖 페이지 경로(`navigate`·`openModal` — 아직 없는
 * 페이지 · 다른 프로젝트에서 가져온 규칙), `setProp`의 값, 그리고 카탈로그에 없는 타겟의 prop 이름. 팝업 닫기(`closeModal`)는 대상이 없다.
 *
 * ## 저작은 이미 있는 편집 경로를 탄다
 *
 * **새 계약을 만들지 않는다.** `interactions`는 페이지 문서의 일부이므로
 * `edit/ops.ts`의 `interactionsOps` → `useEditCommit` → `PATCH .../ops`를 그대로 지난다.
 * 코멘트는 **서버가** 문서를 바꿔야 해서 `markerOps`라는 새 계약이 필요했지만,
 * 상호작용은 **클라이언트가** 바꾸므로 그 문제가 없다.
 *
 * ## 이 패널은 초안을 들지 않는다
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
 * **이 설계의 하중은 재조회가 선택을 남기는 데서 온다.** `loadPage`는 **같은 페이지를 다시
 * 싣는 경로에서 선택을 건드리지 않는다**(`store/editor-store.ts`의 `#selectionFor` — 사용자가
 * 하지도 않은 재조회가 자리를 뺏지 않는다). 그래서 409 복구 뒤에도 `NodeRules`가 마운트된 채 남고, 규칙 목록을 로컬
 * state로 들면 **문서만 되돌아가고 화면에는 내 규칙이 남는다** — 잰 자리는
 * `test/panels/interaction-panel.test.tsx`의 마지막 describe다. 재조회가 선택을 비우면
 * (`recover` → `loadPage` → `selectedNodeId: null`) 저작 자리가 통째로 사라져 로컬 state를
 * 들어도 죽는 케이스가 없다 — 그 성질은 다른 이유로 거기 있는 장치가 지탱하는 것이라, 이
 * 규칙을 거기 기대 풀지 않는다.
 *
 * ## 이 패널은 오류 경계 밖이다
 *
 * `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나다. 문서 순회는 던지지 않는
 * `walkSafely`를 쓰고, 그리는 값은 전부 문자열이다.
 *
 * ## 실행은 여기가 아니다
 *
 * 「상호작용」 「실행」: *"편집 모드에서는 상호작용이 동작하지 않는다."* 이 패널은 **적고 읽는**
 * 데까지이고 뷰 모드의 런타임은 `renderer`의 상호작용 런타임(`packages/renderer/src/interaction/runtime.ts`)
 * 이다. 뷰 모드의 탭 구성(페이지 설명 / 코멘트 / 상호작용)도 이 패널 밖이다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import {
  DEFAULT_VIEW_STATE,
  describeInteraction,
  describeNode,
  getComponent,
  isolateBidi,
  nodeRowLabel,
  viewStateName,
  viewStateOrder,
  listInteractionSentences,
  namingContexts,
  type CodeIndex,
  type EditorField,
  type Interaction,
  type InteractionAction,
  type InteractionTrigger,
  type NamingContext,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { useApi } from '../api/context'
import type { TreeMenuNode } from '../api/types'
import { useProjectCodes } from '../codes/project-codes'
import { pageTargetsOf } from '../edit/paste-ops'
import { useEditCommit } from '../edit/use-edit-commit'
import { walkSafely } from '../edit/safe-walk'
import { shellIcon } from '../shell/icons'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { stateShowingNode, useViewState } from '../shell/use-view-state'
import { useCommentPointing } from '../comments/comment-pointing'
import { ancestorsOf } from './node-head'
// 우측 패널의 두 탭이 같은 이유로 같이 꺼진다 — 문장을 두 벌로 두지 않는다.
import { blockedNotice } from './property-panel'
import '../catalog-setup'

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 상호작용이 보입니다'
/** 노드를 고르지 않아 규칙을 더할 수 없을 때. */
const NO_TARGET = '상호작용을 걸 노드를 캔버스나 구조 트리에서 고르세요'

/** 여럿을 고른 판(설계서 «여럿을 고른 판의 동작» — 상호작용 탭은 하나일 때만). 아래 «이 페이지의 상호작용» 목록은 그대로다. */
export const MANY_TARGETS = '상호작용은 노드 하나를 골랐을 때 겁니다'
/** 이 페이지에 규칙이 하나도 없을 때. */
const NO_INTERACTIONS = '아직 상호작용이 없습니다'
/** 아직 타겟을 고르지 않은 액션의 선택지 문안. */
const UNSET_TARGET_OPTION = '— 대상을 고르세요 —'
/** «화면 상태 바꾸기» 의 대상이 목록에 없다(지운 상태) — 고른 값을 그대로 보여 고칠 길을 남긴다. 문장의 «사라진 상태» 와 같은 말이다. */
export function missingStateOption(id: string): string {
  return `사라진 상태 (${id})`
}
/** 상태가 없는 페이지의 «화면 상태 바꾸기» — 기본 하나만 고를 수 있다. */
export const NO_VIEW_STATES = '이 페이지에는 화면 상태가 없습니다 — 상태를 먼저 만드세요'

/** 트리거 4종. **「상호작용」 「모델」이 고정한 것이고 화면은 그대로 보인다.** */
const TRIGGERS: readonly { value: InteractionTrigger; label: string }[] = [
  { value: 'click', label: '클릭' },
  { value: 'change', label: '변경' },
  { value: 'select', label: '선택' },
  { value: 'submit', label: '제출' },
]

/** 액션 7종. 순서는 「상호작용」 「모델」의 예와 같다. */
const ACTION_TYPES: readonly { value: InteractionAction['type']; label: string }[] = [
  { value: 'setProp', label: '속성 바꾸기' },
  { value: 'setVisible', label: '보이기·숨기기' },
  { value: 'switchTab', label: '탭 전환' },
  { value: 'setViewState', label: '화면 상태 바꾸기' },
  { value: 'navigate', label: '페이지 이동' },
  { value: 'openModal', label: '팝업 열기' },
  { value: 'closeModal', label: '팝업 닫기' },
]

/**
 * 액션 타입을 고를 때 만들어지는 빈 액션.
 *
 * **타겟이 빈 문자열로 시작한다.** 문서의 아무 노드나 기본으로 넣으면 사용자가 의도하지
 * 않은 규칙이 저장되고, 그것이 「자동 문장화」의 문장으로 나가면 **설계서가 거짓말을 한다.**
 * 빈 타겟은 문장이 *"아직 고르지 않은 대상"*이라고 말하고 검증이 경고로 잡는다.
 */
function emptyAction(type: InteractionAction['type']): InteractionAction {
  switch (type) {
    case 'setProp':
      return { type: 'setProp', target: '', prop: '', value: true }
    case 'setVisible':
      return { type: 'setVisible', target: '', value: false }
    case 'switchTab':
      return { type: 'switchTab', target: '' }
    case 'setViewState':
      return { type: 'setViewState', target: '' }
    case 'navigate':
      return { type: 'navigate', target: '' }
    case 'openModal':
      return { type: 'openModal', target: '' }
    case 'closeModal':
      return { type: 'closeModal' }
  }
}

export function InteractionPanel(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 고칠 수 있는가 — 셸의 `canEdit`(`projectAbilities(role).editDesign`). `false`면 규칙 위젯 · 추가 · 삭제가
   * **꺼지고** 이유가 선다 — 속성 패널과 같은 관례다(규칙이 곧 읽을 값이라 숨기지 않는다). 아래 «이 페이지의 상호작용»
   * 문장 목록은 그대로다.
   */
  canEdit: boolean
}): ReactElement {
  const store = useEditorStoreInstance()
  const doc = useOpenDocument(props.pageId)
  const codes = useProjectCodes().index
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const many = useEditorStore(store, (s) => s.selectedNodeIds.length > 1)
  // 속성 패널과 같은 관례 — 페이지가 없으면 `''`를 주고, 그러면 편집이 나갈 길이 없다.
  const { commitInteractions } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })
  // **속성 패널과 같은 값을 같은 자리에서 받는다**(`store/use-locked-by.ts`) — 판정은
  // 스토어의 `lockedBy` 하나이고 여기서 하는 것은 그것을 위젯에 잇는 것뿐이다.
  const lockOf = useLockedBy()
  const viewState = useViewState(props.pageId)
  const { reveal } = useCommentPointing()

  if (doc === null) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }

  const node = selectedNodeId === null ? undefined : findSafely(doc, selectedNodeId)
  const sentences = listInteractionSentences(doc, codes)
  /**
   * **이 탭도 «고른 노드»가 단위다** — 근거는 `./property-panel.tsx`의 `lock` 선언이
   * 소유한다. 나가는 op이 `…/interactions`라 잠금 판정이 속성과 **같은 값**이기도 하다
   * (스파이크: 잠긴 노드 423 · 조상 200 — 그 표도 그쪽이 갖는다).
   */
  const lock = node === undefined ? null : lockOf(node.id)
  const blocked = lock !== null || !props.canEdit
  /** 목록 줄의 «그 노드로 가기»(아래 줄 단추의 주석). 남이 잡아 고름이 안 서면 아무것도 안 한다(캔버스 누름과 같은 판정 — 스토어). */
  const go = (nodeId: string): void => {
    const verdict = stateShowingNode(doc, nodeId, viewState.state)
    if (verdict.change) viewState.choose(verdict.state)
    store.selectNode(nodeId)
    const state = store.getState()
    if (state.selectedNodeId !== nodeId) return
    const selection = state.selectedNodeIds.join('\n')
    // 화면 상태를 바꿨으면 그 상태의 판이 다 선 뒤(두 프레임)에 들인다 — 먼저 들이면 바뀌는 중의 자리를 재 칸 끝에 못 미친다.
    if (verdict.change) requestAnimationFrame(() => requestAnimationFrame(() => reveal({ nodeId, selection })))
    else reveal({ nodeId, selection })
  }
  const notice = blockedNotice(props.canEdit, lock)

  return (
    <>
      <h2 className="wb-shell-panel-title">상호작용</h2>

      {many ? (
        <p className="wb-shell-panel-notice">{MANY_TARGETS}</p>
      ) : node === undefined ? (
        <p className="wb-shell-panel-notice">{NO_TARGET}</p>
      ) : (
        <>
          {/* 꺼진 위젯의 이유를 이 탭이 자기 자리에서 말한다(속성 패널과 같은 판단). */}
          {notice !== null && <p className="wb-shell-panel-notice">{notice}</p>}
          <NodeRules
            projectId={props.projectId}
            document={doc}
            node={node}
            disabled={blocked}
            // **커밋이 나가는 자리가 하나라 가드도 하나다.** 위젯을 끄는 것만으로는 안 되는
            // 이유는 속성 패널의 `blocked` 주석에 있다(잠긴 동안 도착하는 blur).
            onChange={(next) => {
              if (!blocked) commitInteractions(node.id, next)
            }}
          />
        </>
      )}

      {/* **이 페이지의 규칙 전부를 보인다** — 코멘트 탭도 같은 판정이다.
          「설계서 화면 구조」의 그림도 우측에 목록을 보이고, 탭의 쓸모가 *"이 설계서에 어떤 규칙이 걸려
          있는가"*를 훑는 것이기 때문이다. 고른 노드의 줄에는 표시를 단다. */}
      <section className="wb-shell-panel-section" aria-label="이 페이지의 상호작용">
        <h3 className="wb-shell-panel-subtitle">
          이 페이지의 상호작용
          {sentences.length > 0 && <span className="wb-shell-interaction-count">{` · ${sentences.length}`}</span>}
        </h3>
        {sentences.length === 0 ? (
          <p className="wb-shell-panel-notice">{NO_INTERACTIONS}</p>
        ) : (
          <ul className="wb-shell-interaction-list">
            {sentences.map((item) => {
              const owner = findSafely(doc, item.nodeId)
              const where = owner === undefined ? [] : ancestorsOf(doc.root, item.nodeId).slice(1)
              return (
                <li
                  key={`${item.nodeId}:${item.index}`}
                  className="wb-shell-interaction-item"
                  {...(item.nodeId === selectedNodeId ? { 'aria-current': 'true' as const } : {})}
                >
                  {/* **줄을 누르면 그 노드를 고르고 캔버스로 데려간다** — 코멘트 묶음 머리 단추와 같은 길(`./comment-panel.tsx` 의 `pickNode`): 숨은
                      상태면 보이는 상태로 바꾸고, 고른 뒤 펼침(`reveal`)이 캔버스 칸 안으로 굴린다. 탭은 안 옮긴다 — 위에 그 노드의 규칙이 선다. */}
                  <button type="button" className="wb-shell-interaction-row" onClick={() => go(item.nodeId)}>
                    {owner !== undefined && (
                      <span className="wb-shell-interaction-who">
                        <span className="wb-shell-node-head-type">{String(owner.type)}</span>
                        <bdi className="wb-shell-interaction-who-name">
                          {nodeRowLabel(owner, codes).slice(String(owner.type).length).trim()}
                        </bdi>
                      </span>
                    )}
                    <span className="wb-shell-interaction-sentence">{item.text}</span>
                    {where.length > 0 && (
                      <span className="wb-shell-interaction-where">
                        <bdi>{where.map((node) => nodeRowLabel(node, codes)).join(' › ')}</bdi>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

/** 고른 노드의 규칙 목록과 저작 컨트롤. */
function NodeRules(props: {
  projectId: string
  document: PageDocument
  node: WbNode
  /** 남이 잠근 자리라 못 바꾸는가. **아래 모든 위젯에 내려간다** — 하나만 빠져도 그것으로 나간다. */
  disabled: boolean
  onChange: (next: Interaction[]) => void
}): ReactElement {
  const { document: doc, node, disabled, onChange } = props
  // **문서에서 읽는다 — 로컬 사본을 두지 않는다**(머리말의 근거).
  const interactions = Array.isArray(node.interactions) ? node.interactions : []
  // 이름은 그 노드가 속한 상태를 붙인다 — 문장(`listInteractionSentences`)과 같은 이름이다(`namingContexts`).
  const naming = namingContexts(doc)
  // 묶인 노드는 표의 이름으로 부른다 — 제목 · 대상 목록 · 문장이 같은 표를 읽어야 셋이 같은 이름이다.
  const codes = useProjectCodes().index
  const choices = nodeChoices(doc, naming, codes)
  const title = describeNode(node, naming.get(node.id), codes)

  /** 규칙 하나를 바꿔 통째로 낸다. `interactionsOps`가 배열을 통째 다루므로 짝이 맞는다. */
  const replaceAt = (index: number, next: Interaction): void => {
    onChange(interactions.map((item, i) => (i === index ? next : item)))
  }

  return (
    <section className="wb-shell-panel-section" aria-label={`${title}의 상호작용`}>
      <h3 className="wb-shell-panel-subtitle">{title}</h3>

      {interactions.map((interaction, index) => (
        // **`key`가 자리(index)다.** 규칙에 식별자가 없고 배열의 자리가 곧 patch 경로
        // (`/…/interactions/{index}`)이므로, 여기서만 다른 키를 쓰면 화면과 경로가 갈린다.
        <fieldset className="wb-shell-interaction" key={index}>
          <legend>규칙 {index + 1}</legend>

          <label className="wb-shell-field wb-shell-field-oneline">
            트리거
            <select
              className="wb-shell-select"
              disabled={disabled}
              value={interaction.on}
              onChange={(event) => replaceAt(index, { ...interaction, on: event.target.value as InteractionTrigger })}
            >
              {TRIGGERS.map((trigger) => (
                <option key={trigger.value} value={trigger.value}>
                  {trigger.label}
                </option>
              ))}
            </select>
          </label>

          {/* 아이콘만 남는 단추 — 이름 · `title` 은 아이콘을 얹기 전의 글 그대로(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»). */}
          <button
            type="button"
            className="wb-shell-interaction-remove"
            aria-label={`규칙 ${index + 1} 삭제`}
            title={`규칙 ${index + 1} 삭제`}
            disabled={disabled}
            onClick={() => onChange(interactions.filter((_, i) => i !== index))}
          >
            {shellIcon('remove', 14)}
          </button>

          {/* **문장이 여기 있는 것이 요점이다**(「자동 문장화」). 저작하는 사람이 자기가 만든 규칙이
              설계서에서 어떻게 읽히는지를 그 자리에서 본다. */}
          <p className="wb-shell-interaction-sentence">{describeInteraction(doc, node, interaction, codes)}</p>

          {(interaction.actions ?? []).map((action, actionIndex) => (
            <ActionRow
              key={actionIndex}
              projectId={props.projectId}
              document={doc}
              disabled={disabled}
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
            disabled={disabled}
            onClick={() =>
              replaceAt(index, {
                ...interaction,
                actions: [...(interaction.actions ?? []), emptyAction('setVisible')],
              })
            }
          >
            {shellIcon('add', 14, 'wb-shell-icon-lead')}
            규칙 {index + 1}에 액션 추가
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="wb-shell-interaction-add"
        disabled={disabled}
        onClick={() => onChange([...interactions, { on: 'click', actions: [] }])}
      >
        {shellIcon('add', 14, 'wb-shell-icon-lead')}
        상호작용 추가
      </button>
    </section>
  )
}

/** 액션 한 줄. 타입에 따라 뒤따르는 컨트롤이 갈린다. */
function ActionRow(props: {
  projectId: string
  document: PageDocument
  action: InteractionAction
  index: number
  choices: { id: string; type: string; label: string }[]
  /** 남이 잠근 자리인가. `NodeRules`가 그대로 내려 준다. */
  disabled: boolean
  onChange: (next: InteractionAction) => void
  onRemove: () => void
}): ReactElement {
  const { document: doc, action, index, choices, disabled, onChange, onRemove } = props
  const ordinal = index + 1

  return (
    <div className="wb-shell-interaction-action" role="group" aria-label={`액션 ${ordinal}`}>
      {/* **보이는 라벨은 `종류`이고 그룹의 이름이 `액션 N`이다.** 둘 다 `액션 N`이면
          접근성 이름이 겹쳐 보조 기술이 두 컨트롤을 같은 것으로 읽는다(실측: RTL의
          `getByLabelText('액션 1')`이 둘을 찾아 던졌다). */}
      <label className="wb-shell-field wb-shell-field-oneline">
        종류
        <select
          className="wb-shell-select"
          disabled={disabled}
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

      {action.type === 'closeModal' ? null : action.type === 'setViewState' ? (
        <ViewStateTargetField
          document={doc}
          value={action.target}
          disabled={disabled}
          onCommit={(value) => onChange({ ...action, target: value })}
        />
      ) : action.type === 'navigate' || action.type === 'openModal' ? (
        <PageTargetField
          projectId={props.projectId}
          value={action.target}
          disabled={disabled}
          onCommit={(value) => onChange({ ...action, target: value })}
        />
      ) : (
        <label className="wb-shell-field wb-shell-field-oneline">
          대상
          <select
            className="wb-shell-select"
            disabled={disabled}
            value={action.target}
            onChange={(event) => onChange({ ...action, target: event.target.value })}
          >
            {/* 빈 값이 선택지에 있어야 `<select>`가 아직 안 고른 상태를 그릴 수 있다. */}
            <option value="">{UNSET_TARGET_OPTION}</option>
            {/* 탭 전환의 대상은 탭 패널이다 — 패널만 고르게 한다(이미 적힌 다른 대상은 그대로 보인다 — 고칠 길을 남긴다). */}
            {choices
              .filter((choice) => action.type !== 'switchTab' || choice.type === 'TabPanel' || choice.id === action.target)
              .map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
          </select>
        </label>
      )}

      {action.type === 'setVisible' && (
        <label className="wb-shell-field wb-shell-field-oneline">
          어떻게
          <select
            className="wb-shell-select"
            disabled={disabled}
            value={action.value ? 'show' : 'hide'}
            onChange={(event) => onChange({ ...action, value: event.target.value === 'show' })}
          >
            <option value="show">보이기</option>
            <option value="hide">숨기기</option>
          </select>
        </label>
      )}

      {action.type === 'setProp' && (
        <PropPicker
          document={doc}
          disabled={disabled}
          target={action.target}
          prop={action.prop}
          value={action.value}
          onChange={(next) => onChange({ ...action, ...next })}
        />
      )}

      <button
        type="button"
        className="wb-shell-interaction-remove-action"
        aria-label={`액션 ${ordinal} 삭제`}
        title={`액션 ${ordinal} 삭제`}
        disabled={disabled}
        onClick={onRemove}
      >
        {shellIcon('remove', 14)}
      </button>
    </div>
  )
}

/**
 * «화면 상태 바꾸기» 의 대상 — 그 페이지의 상태 트리(«기본» + 트리 차례 · 하위 상태는 깊이만큼 들인다). 상태가 없는 페이지는 «기본» 하나와
 * 안내를 보인다. 목록에 없는 대상(지운 상태)은 «사라진 상태» 로 그대로 보인다 — 지우지 않는다(노드 대상과 같다).
 */
function ViewStateTargetField(props: {
  document: PageDocument
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}): ReactElement {
  const states = Array.isArray(props.document.viewStates) ? props.document.viewStates : []
  const order = viewStateOrder(states)
  const known = props.value === '' || props.value === DEFAULT_VIEW_STATE || states.some((state) => state.id === props.value)
  return (
    <>
      <label className="wb-shell-field wb-shell-field-oneline">
        대상 상태
        <select
          className="wb-shell-select"
          disabled={props.disabled}
          value={props.value}
          onChange={(event) => props.onCommit(event.target.value)}
        >
          <option value="">{UNSET_TARGET_OPTION}</option>
          <option value={DEFAULT_VIEW_STATE}>{viewStateName(states, DEFAULT_VIEW_STATE)}</option>
          {order.map(({ state, depth }) => (
            <option key={state.id} value={state.id}>
              {`${STATE_INDENT.repeat(depth)}${isolateBidi(state.name)}`}
            </option>
          ))}
          {!known && <option value={props.value}>{missingStateOption(props.value)}</option>}
        </select>
      </label>
      {states.length === 0 && <p className="wb-shell-panel-notice">{NO_VIEW_STATES}</p>}
    </>
  )
}

/** 하위 상태를 들이는 글자 — 깊이마다 둘(고르개 항목은 꾸밀 수 없다). */
const STATE_INDENT = '\u00a0\u00a0'

/**
 * `setProp`의 prop과 값.
 *
 * **prop 목록은 카탈로그의 `editor`에서 온다** — 속성 패널이 자동 생성되는 것과 같은
 * 출처다(설계서 「컴포넌트 정의 구조」). 그래서 상호작용으로 바꿀 수 있는 것과 패널에서 손으로 바꿀 수 있는 것이
 * 같은 집합이고, 둘이 갈리면 *"패널에는 있는데 상호작용으로는 못 건드리는 속성"*이 생긴다.
 */
function PropPicker(props: {
  document: PageDocument
  target: string
  prop: string
  value: unknown
  /** 남이 잠근 자리인가. `ActionRow`가 그대로 내려 준다. */
  disabled: boolean
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
        <TextField label="속성" value={props.prop} disabled={props.disabled} onCommit={(value) => props.onChange({ prop: value })} />
      ) : (
        <label className="wb-shell-field wb-shell-field-oneline">
          속성
          <select
            className="wb-shell-select"
            disabled={props.disabled}
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

      <ValueField field={field} value={props.value} disabled={props.disabled} onChange={(value) => props.onChange({ value })} />
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
  /** 남이 잠근 자리인가. `PropPicker`가 그대로 내려 준다. */
  disabled: boolean
  onChange: (value: unknown) => void
}): ReactElement {
  if (props.field?.control === 'switch') {
    return (
      <label className="wb-shell-field wb-shell-field-oneline">
        값
        <select
          className="wb-shell-select"
          disabled={props.disabled}
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
        disabled={props.disabled}
        onCommit={(text) => {
          const parsed = Number(text)
          // 수가 아니면 문자열 그대로 보낸다 — 검증이 `invalid-interaction-prop`으로
          // 말하는 편이, 조용히 0으로 바꿔 **사용자가 안 적은 값을 저장하는** 것보다 낫다.
          // **`Infinity`도 수가 아니다**(`isNaN`이 아니라 `isFinite`로 가르는 까닭) — «Infinity» · «1e999»가 그 값이 되고,
          // JSON 에 없는 값이라 서버는 `null`을 저장하는데 로컬 문서만 `Infinity`를 든 채 갈린다.
          props.onChange(text.trim() === '' ? '' : Number.isFinite(parsed) ? parsed : text)
        }}
      />
    )
  }

  return (
    <TextField
      label="값"
      value={typeof props.value === 'string' ? props.value : String(props.value ?? '')}
      disabled={props.disabled}
      onCommit={(text) => props.onChange(text)}
    />
  )
}

/**
 * blur/Enter에 커밋하는 입력. **속성 패널의 텍스트 위젯과 같은 규칙이다** — 글자마다 요청을 내면
 * 타이핑 한 번이 편집 수십 개가 된다.
 *
 * **초안이 여기에만 산다.** 커밋하면 문서가 진실이 되고, 저장에 실패해 문서가 되돌아가면
 * 다음 렌더의 `value`가 그것을 따라온다.
 */
/** 페이지 고르개의 한 줄 — 대상 글자와 목록에 보일 이름. */
interface PageChoice {
  target: string
  label: string
  kind: 'page' | 'popup'
}

/**
 * **페이지 경로 — 목록에서 고르거나 직접 적는다.** 대상은 이 문서 안에 없어 프로젝트 트리(`getTree`)를 읽어 대상 글자(`pageTargetsOf` —
 * 붙이기 · 문장 · CLI · MCP 와 같은 조립)로 편다. 팝업 페이지를 먼저, 화면 페이지를 뒤에 보인다 — «팝업 열기» 의 대상은 대개 팝업이다
 * («페이지 이동» 도 같은 고르개다). 목록 밖 글자(아직 없는 페이지 · 다른 프로젝트에서 온 규칙)는 아래 «페이지 경로» 칸이 그대로 보이고 고친다.
 * 트리를 못 읽으면 고르개는 비고 칸만 남는다. 고르개에서 «새 팝업 만들기» 는 하지 않는다 — 메뉴 트리에서 만든다.
 */
function PageTargetField(props: { projectId: string; value: string; disabled: boolean; onCommit: (value: string) => void }): ReactElement {
  const api = useApi()
  const [choices, setChoices] = useState<readonly PageChoice[]>([])
  useEffect(() => {
    let live = true
    api.getTree(props.projectId).then(
      (tree) => {
        if (live) setChoices(pageChoices(tree))
      },
      () => {
        if (live) setChoices([])
      },
    )
    return () => {
      live = false
    }
  }, [api, props.projectId])
  const known = choices.some((choice) => choice.target === props.value)
  const group = (kind: PageChoice['kind']): ReactElement[] =>
    choices
      .filter((choice) => choice.kind === kind)
      .map((choice) => (
        <option key={choice.target} value={choice.target}>
          {choice.label}
        </option>
      ))
  return (
    <>
      <label className="wb-shell-field wb-shell-field-oneline">
        페이지
        <select
          className="wb-shell-select"
          disabled={props.disabled}
          value={known ? props.value : ''}
          onChange={(event) => {
            if (event.target.value !== '' && event.target.value !== props.value) props.onCommit(event.target.value)
          }}
        >
          <option value="">{props.value === '' || known ? '— 페이지를 고르세요 —' : '— 목록 밖 경로 —'}</option>
          {choices.some((choice) => choice.kind === 'popup') && <optgroup label="팝업 페이지">{group('popup')}</optgroup>}
          {choices.some((choice) => choice.kind === 'page') && <optgroup label="화면 페이지">{group('page')}</optgroup>}
        </select>
      </label>
      <TextField label="페이지 경로" value={props.value} disabled={props.disabled} onCommit={props.onCommit} />
    </>
  )
}

/** 트리를 고르개의 줄로 — 대상 글자는 `pageTargetsOf` 가 짓고, 종류는 트리 응답의 `kind` 다(없으면 화면). */
function pageChoices(tree: readonly TreeMenuNode[]): PageChoice[] {
  const kinds = new Map<string, 'page' | 'popup'>()
  const walk = (nodes: readonly TreeMenuNode[]): void => {
    for (const node of nodes) {
      for (const page of node.pages) kinds.set(page.id, page.kind === 'popup' ? 'popup' : 'page')
      walk(node.children)
    }
  }
  walk(tree)
  return pageTargetsOf(tree).map((page) => ({
    target: page.target,
    label: [...page.menuPath, page.title].join(' / '),
    kind: kinds.get(page.id) ?? 'page',
  }))
}

function TextField(props: {
  label: string
  value: string
  /** 남이 잠근 자리인가. **선택 인자가 아니다** — 빠뜨리면 그 칸만 조용히 되살아난다. */
  disabled: boolean
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
    <label className="wb-shell-field wb-shell-field-oneline">
      {props.label}
      <input
        className="wb-shell-input"
        type="text"
        disabled={props.disabled}
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
 * 타겟으로 고를 수 있는 노드 목록 — **문서의 모든 노드다**.
 *
 * **자기 자신도 빼지 않는다.** 「상호작용」 「모델」이 금지하지 않았고 *"버튼을 누르면 그 버튼이
 * 로딩 상태가 된다"*는 흔한 규칙이다.
 *
 * **캔버스에서 집는 대신 목록에서 고르게 한 근거**: 캔버스에서 집으려면
 * *"지금 타겟을 고르는 중"*이라는 모드가 하나 더 생기고, 그 모드에서는 클릭이 선택이
 * 아니라 지정이 된다 — 「설계서 화면 구조」가 캔버스의 누름을 고르기로 두고 캔버스의 편집을 끌어 놓기 둘로
 * 좁혀 둔 것과 어긋난다. 목록은 화면 밖 노드도 고를 수 있다는 이점이 덤이다.
 *
 * 이름은 문장과 **같은 함수**가 만든다(`describeNode`) — 목록에서 고른 이름과 문장에
 * 나오는 이름이 갈리면 사용자가 둘을 잇지 못한다.
 */
function nodeChoices(
  doc: PageDocument,
  naming: ReadonlyMap<string, NamingContext>,
  codes: CodeIndex | undefined,
): { id: string; type: string; label: string }[] {
  const out: { id: string; type: string; label: string }[] = []
  for (const visit of walkSafely(doc.root)) {
    out.push({ id: visit.node.id, type: String(visit.node.type), label: describeNode(visit.node, naming.get(visit.node.id), codes) })
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
