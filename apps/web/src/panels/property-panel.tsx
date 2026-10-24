/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성한다**
 * (설계서 「컴포넌트 정의 구조」·「설계서 화면 구조」) — 컴포넌트마다 패널을 따로 만들지
 * 않는다는 뜻이고, 그래서 카탈로그에 컴포넌트가 늘어도 이 파일은 그대로다.
 *
 * **여기가 편집의 입구다.**
 *
 * 「설계서 화면 구조」의 우측 패널은 편집 모드에서 탭 넷(페이지 정보·속성·코멘트·상호작용)이다. 이 패널은 그중
 * **속성 탭의 본문**이고, 탭 자체는 `routes/editor.tsx`의 `RightPanel`이 든다.
 *
 * ## 페이지 이름 · 설명은 여기 없다
 *
 * 이름 · 설명을 읽고 고치는 자리는 «페이지 정보» 탭이다(`panels/page-info.tsx` — 「설계서 화면 구조」가 그렇게
 * 적는다). 루트 `Page`를 고르면 `PageDef.editor`가 `[]`라 *"편집할 속성이 없습니다"*가 뜬다.
 *
 * **여기로 옮기지 않는 까닭 — 값을 쟀다.** 이 패널은 편집 모드의 **첫 탭**이고 페이지를
 * 열면 스토어가 **루트를 고른 채로** 시작하므로(`store/editor-store.ts`), 여기 설명 편집기를
 * 붙이면 그것이 마운트되며 자기 `getPage`를 부른다 — 즉 **페이지를 열 때마다 `getPage`가
 * 둘이 된다.** 실측: 그렇게 붙이면 *"한 번만 읽는다"*를 재는 케이스가 여러 파일에서 죽는다
 * (재연결 재조회가 지키는 바로 그 불변식이다).
 *
 * **옮기려면 페이지 메타(`title`·`description`)가 셸에서 여기까지 와야 한다** — 스토어에
 * 실거나(그러면 `loadPage`의 시그니처가 바뀌어 테스트까지 부르는 자리가 전부 바뀐다) 프롭을
 * 한 겹 더 놓거나다. «페이지 정보» 탭은 처음 고른 탭이 아니라 자기 조회를 열 때만 낸다.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { NO_THEME, resolveVariant, weightRoom } from '@wirebound/renderer'
import {
  applyOps,
  getComponent,
  NODE_ALIAS_MAX,
  nodeAlias,
  nodeHeading,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type ComponentDef,
  type EditorField,
  type NodeLock,
  type PageDocument,
  type PatchOp,
  type WbNode,
  zoneDefs,
} from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { useProjectTheme } from '../theme/project-theme'
import { useEditCommit, type EditCommit } from '../edit/use-edit-commit'
// **schema의 `findNode`를 쓰지 않는다** — `children` 배열 안의 원소가 노드가 아니면
// 던지고(`edit/safe-walk.ts` 머리말의 실측), 이 패널은 오류 경계 밖이라 그 예외가 셸을
// 통째로 지운다. 실측: 그 문서에서 **노드를 고르는 순간** `.wb-shell`이 DOM에서 사라진다 —
// 열기만 할 때는 여기까지 오지 않아 살아 있다.
import { findNodeSafely, walkSafely } from '../edit/safe-walk'
import { aliasOps, propOps, variantOps, visibilityOps, weightOps } from '../edit/ops'
import { useHiddenNodes, useViewState } from '../shell/use-view-state'
import { VisibilityField } from './visibility-field'
import { removeManyOps } from '../edit/paste-ops'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { LOSS_RANK } from '../store/loss-notice'
import { useSessionEpochNowOrNull } from '../session/session-context'
import { ListControl } from './controls/list-control'
import { ColorControl } from './controls/color-control'
import { ImageControl, type PlaceOutcome } from './controls/image-control'
import { SelectControl } from './controls/select-control'
import { SwitchControl } from './controls/switch-control'
import { VariantControl } from './controls/variant-control'
import { MIXED_PLACEHOLDER, TextControl } from './controls/text-control'
import { BROKEN_TYPE_LABEL, nodeType } from './node-shape'
// 카탈로그가 없으면 모든 노드가 "알 수 없는 타입"이 된다. 설치는 import만으로 끝난다.
import '../catalog-setup'

/** 고를 노드가 아직 없을 때. 페이지를 열지 않았을 때와 고르지 않았을 때가 같은 문장이다. */
const NO_SELECTION = '노드를 고르면 속성이 보입니다'

/** 구역 줄을 고른 판의 안내(`PropertyPanel` 의 구역 갈래) — 고칠 수 있는 판과 없는 판. */
export const ZONE_SELECTED_NOTICE = '이 구역에 넣을 것을 하단 판에서 고르세요. 붙여넣기도 이 구역 끝에 들어갑니다.'
export const ZONE_SELECTED_READONLY = '구역입니다. 이 화면에서는 넣을 수 없습니다.'

/** 구역 줄을 고른 판의 제목 — «부모 머리 · 구역 이름». 부모 머리는 노드 제목과 같은 글이다(`nodeHeading`). */
function zoneHeading(parent: WbNode, zone: string): string {
  const label = zoneDefs(parent.type).find((def) => def.name === zone)?.label ?? zone
  return `${nodeHeading(parent)} · ${label}`
}

/** 타입을 읽지 못한 노드의 안내. 캔버스는 같은 노드를 폴백으로 그리고 배너로 알린다. */
const BROKEN_TYPE_NOTICE = '이 노드의 타입을 읽을 수 없습니다'

/**
 * 남이 잠근 자리라 위젯이 전부 꺼졌을 때의 안내.
 *
 * **구조 트리의 꺼진 항목이 드는 잠금 이유와 문장을 나눈다**(`./toolbar-status.ts`). 그쪽은 *"고를 수도 바꿀
 * 수도 없습니다"*로 **선택**까지 말하는데, 이 패널은 이미 골라 둔 노드를 그리는 자리라
 * 고르기를 되풀이할 이유가 없다. 원인(남이 편집 중)은 같고 결과만 이 패널의 것이다.
 *
 * **자리를 나눈 이유는 트리의 이유가 안 보이는 판이 있어서다** — 이 패널은 셸의 반대쪽 끝이고
 * (`routes/editor.tsx`의 `RightPanel`), 좌측 사이드바를 접으면 트리가 화면에 없다 — 트리의 이유는 꺼진 항목에 마우스를 올려야
 * 보이기도 한다.
 *
 * **상호작용 탭이 같은 문장을 쓴다**(`./interaction-panel.tsx`). 우측 패널의 두 탭이 같은
 * 이유로 같이 꺼지므로 문장도 한 벌이다 — 두 벌이면 한쪽만 고쳐지는 날이 온다.
 */
export function lockedNotice(userName: string): string {
  return `${userName}님이 편집 중이라 바꿀 수 없습니다`
}

/**
 * **고칠 수 없는 역할이라 꺼졌다**(설계서 「권한 모델」의 viewer). 남의 잠금과 **같은 자리 · 같은 꼴**이다(위 `lockedNotice`) —
 * 이 패널의 «꺼진 이유» 관례가 그것이고, 위젯은 값의 표시이기도 해서 숨기지 않고 끈다(셸 `canEdit`의 표).
 */
export const VIEWER_NOTICE = '보기 권한(viewer)이라 바꿀 수 없습니다'

/**
 * 위젯이 꺼진 이유 한 줄 — 없으면 `null`. **역할이 잠금보다 앞선다**: 잠금은 풀리길 기다리면 되지만 역할은 안 풀린다 —
 * 둘 다일 때 잠금을 말하면 풀린 뒤에도 여전히 못 고치는 까닭을 숨긴다. 상호작용 탭이 같은 것을 부른다(두 벌 금지).
 */
export function blockedNotice(canEdit: boolean, lock: { userName: string } | null): string | null {
  if (!canEdit) return VIEWER_NOTICE
  return lock === null ? null : lockedNotice(lock.userName)
}

/** 떠나기 전에 고른 것이 바뀐 초안을 쓸 노드가 남지 않았다(아래 `useLeftoverCommit`). 하단 바에 선다. */
export const DROPPED_DRAFT_NOTICE = '바뀐 선택 때문에 친 값을 쓰지 않았습니다'

/** 초안 하나를 노드 하나에 쓰는 연산 — 노드마다 앞 연산을 적용한 문서 위에서 짓는다(`BulkProperties`의 `commitEach`와 같다). */
type BuildOps = (running: PageDocument, nodeId: string) => PatchOp[] | null

/**
 * **떠나기 전에 고른 것이 바뀐 초안**(설계서 「설계서 화면 구조」의 «여럿을 고른 판의 동작» — 일괄 속성). 칸에 친 글은 칸을 떠날 때(blur ·
 * Enter) 커밋된다. 그런데 사람이 칸을 떠나지 않았는데 **고른 것이 바뀌는 길**이 있다 — 일부 거절(`realtime/use-realtime.ts`의
 * `dropFromSelection`), 문서가 바뀔 때의 목록 정리(같은 사람의 다른 탭 · 복원이 고른 노드를 지우거나 옮김). 그때 위젯은 `key`로 내려가고
 * (아래 `PropControl` 머리말) 친 글은 위젯의 상태라 함께 사라진다 — 아직 쥔 노드에 갈 글까지 말없이 없어진다. 그래서 내려가는 위젯이
 * 넘긴 초안(`onLeave`)을 **칸을 떠날 때의 커밋과 같은 길**로 쓴다:
 *
 * | 앞 목록에서 | 하는 일 |
 * |---|---|
 * | 아직 문서에 있고 · 그때의 타입 그대로고 · 남이 안 쥔 노드가 있다 | 그 노드들에 쓴다 — 편집 하나(묶음). 하단 바는 치우지 않는다(일부 거절의 통지가 그 자리에 있다) |
 * | 그런 노드가 없다(전부 지워짐 · 타입이 갈림 · 남이 쥠 · 다른 페이지로 옮겨 갔다) | 버리고 하단 바에 `DROPPED_DRAFT_NOTICE` 한 줄(잃음 통지는 안 덮는다) |
 * | 쓸 노드는 있는데 편집이 큐에 못 들어갔다(`commitOps`가 `false` — 주소가 이미 다른 페이지다) | 버리고 같은 한 줄을 **떠남의 조각**으로(아래) |
 * | 고칠 수 없는 역할이다 | 아무것도 안 한다 — 위젯이 꺼진 까닭은 패널이 이미 말한다 |
 * | 패널이 선 세션이 끝났다(로그아웃 · 다른 탭의 로그아웃 · 다른 사람으로 바뀜 — 세션 세대가 올랐다) | 아무것도 안 한다 — 끝난 세션으로 쓰기를 내지 않는다. 버린 것은 그 로그아웃의 한 줄이 말하는 몫이다 |
 *
 * **«주소가 이미 다른 페이지»는 브라우저의 뒤로 · 앞으로다** — 칸에 포커스가 있어 blur 가 안 나고, 위젯의 정리가 돌 때 스토어는 아직 앞 페이지라
 * 대상이 서지만 `commitOps`는 지금 주소의 페이지가 아니라 거절한다(앞 페이지의 연산을 다음 페이지 경로로 내지 않는다). 그 한 줄은 `tellLoss`의
 * 떠남 조각(`sticky` — 그 페이지)이라 이어 오는 `clearPage`가 안 치우고, 그 페이지를 다시 열면 풀린다(`EditorStore.loadPage`). 사람의 클릭
 * (메뉴 링크)은 누름의 blur 가 먼저 앞 페이지에 쓴다.
 *
 * **새 목록에 쓰지 않는다** — 앞 목록에 친 글을 다른 노드의 값으로 커밋하지 않는다(`key`가 위젯을 가르는 까닭). 판정은 내려가는 순간의
 * 스토어로 한다(그려 둔 문서는 낡았다 — 지워진 노드 · 거절된 노드가 들어 있다). 재는 자리: `apps/web/build-test/multiselect.test.ts`의
 * «칸에 친 채 고른 것이 바뀐다» 절.
 */
function useLeftoverCommit(pageId: string | undefined, canEdit: boolean, commitOps: EditCommit['commitOps']) {
  const store = useEditorStoreInstance()
  // **패널이 선 세션 세대**(`session/session-context.tsx` «세션 세대»). 세션이 끝나면 셸이 내려가며 위젯의 정리가 여기를 부른다 — 그때 지금
  // 세대가 이것과 다르면 쓰지 않는다. 셸은 세션을 넘어 살지 않으므로(문지기가 로그인 · 목록으로 보낸다) 처음 그린 세대가 그 세션이다.
  const epochNow = useSessionEpochNowOrNull()
  const [bornIn] = useState(() => epochNow?.() ?? null)
  // 내려가는 위젯의 정리는 다시 그린 **뒤에** 돈다 — 그때의 `commitOps`(지금 열린 페이지)를 읽는다.
  const latest = useRef({ canEdit, commitOps })
  useLayoutEffect(() => {
    latest.current = { canEdit, commitOps }
  })
  return (at: { pageId: string | undefined; nodeIds: readonly string[]; type: string }, build: BuildOps): void => {
    if (!latest.current.canEdit) return
    if (epochNow !== null && epochNow() !== bornIn) return
    const state = store.getState()
    const document = at.pageId !== undefined && state.openPageId === at.pageId ? state.document : null
    const targets =
      document === null
        ? []
        : at.nodeIds.filter((id) => {
            const node = findNodeSafely(document.root, id)
            return node !== undefined && nodeType(node) === at.type && store.lockedBy(id) === null
          })
    if (document === null || targets.length === 0) {
      if (!store.showsLoss()) store.setEditFailure({ kind: 'message', message: DROPPED_DRAFT_NOTICE })
      return
    }
    const ops: PatchOp[] = []
    let running = document
    for (const id of targets) {
      const step = build(running, id)
      if (step === null || step.length === 0) continue
      const next = applyOps(running, step)
      // 이미 그 값인 노드에는 안 쓴다 — 칸을 떠나며 낸 커밋이 이미 쓴 초안이 위젯의 정리로 한 번 더 오는 판(복사로 옮겨 간 칸)이다.
      if (JSON.stringify(findNodeSafely(next.root, id)) === JSON.stringify(findNodeSafely(running.root, id))) continue
      ops.push(...step)
      running = next
    }
    if (ops.length === 0) return
    const blocker = store.editBlockedBy(ops)
    if (blocker !== null) {
      store.setEditFailure({ kind: 'message', message: lockedNotice(blocker.userName) })
      return
    }
    if (latest.current.commitOps(ops, { keepNotice: true })) return
    store.tellLoss({
      key: 'dropped-draft',
      rank: LOSS_RANK.cancelled,
      counts: [],
      render: () => DROPPED_DRAFT_NOTICE,
      sticky: { pages: [at.pageId!] },
    })
  }
}

export function PropertyPanel(props: {
  projectId: string
  pageId: string | undefined
  /** 고칠 수 있는가 — 셸의 `canEdit`(`projectAbilities(role).editDesign`). `false`면 위젯이 꺼지고 이유가 선다. */
  canEdit: boolean
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  const selectedZone = useEditorStore(store, (s) => s.selectedZone)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를 주는데,
  // 그 값은 어느 페이지 id와도 같지 않아 `useOpenPage('')`가 `null`을 내고 `commitProp`이
  // 그 자리에서 돌아온다 — 즉 페이지가 없을 때 편집이 나갈 길이 없다. (그 상태에서는 아래
  // `node === undefined` 분기가 먼저 걸려 위젯 자체가 그려지지 않는다.)
  const { commitProp, commitVariant, commitOps } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })
  const commitLeftover = useLeftoverCommit(props.pageId, props.canEdit, commitOps)
  // **판정은 스토어가 한다**(`test/lock/one-verdict.test.ts`). 여기서 하는 것은 목록이
  // 바뀔 때 다시 그리는 것과 그 답을 위젯에 잇는 것뿐이고, 목록을 손에 쥐는 자리는
  // `store/use-locked-by.ts` 하나다.
  const lockOf = useLockedBy()
  // 캔버스가 그리는 그 바인딩의 manifest(`theme/project-theme.tsx`). 아직 못 읽었으면 테마 없음 — variant 칸은 카탈로그 기본이다.
  const manifest = useProjectTheme().manifest ?? NO_THEME.manifest
  /** 지금 상태 · 그 상태에서 숨은 노드 — «상태 보임» 칸이 «없음»에서 옮길 첫 상태와 «숨어 있다» 한 줄을 읽는다(`./visibility-field.tsx`). */
  const viewState = useViewState(props.pageId)
  const hiddenNodes = useHiddenNodes(props.pageId)
  const placeImage = usePlaceImage({ doc, pageId: props.pageId, canEdit: props.canEdit, lockOf, commitProp })

  // 선택은 id 하나이고 노드는 문서에서 찾는다. 노드 객체를 스토어에 두면 낙관적
  // 패치가 문서를 갈아 끼울 때 패널만 옛 노드를 들고 있게 된다.
  const node = doc !== null && selectedNodeId !== null ? findNodeSafely(doc.root, selectedNodeId) : undefined

  /**
   * **이 패널의 판정 단위는 «고른 노드»다.**
   *
   * 잠금 판정의 단위는 *"그 조작의 단위에 맞춘다"*이고, 되돌리기의 단위가
   * `inverse` ops인 것은 **그 조작에 선택이 없기 때문**이다. 이 패널은 반대다 — 존재
   * 자체가 *"고른 노드의 속성"*이고, 위의 `findNodeSafely(doc.root, selectedNodeId)`가 그
   * 단위를 그대로 적고 있다. 그래서 구조 트리가 쓰는 그 값(`store.lockedBy`)을 쓴다.
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
   * 로 이미 못박은 자리다. **속성 패널도 선택을 요구하므로 같은 대가를 진다.** 반대로 가면
   * 툴바에서 반증된 모양이 그대로 돌아온다 — *"고를 수 없는 줄 위에 켜진 위젯"*이고,
   * 그때 트리의 꺼진 항목이 드는 *"바꿀 수도 없습니다"*가 이 패널에 대해 거짓인 채로 남는다.
   *
   * **과소차단은 0이다.** 잠금이 이 노드의 조상이거나 자신이어야 `…/props/…`가 그 잠긴
   * 서브트리 안에 들어가므로, 서버가 423을 낼 갈래는 전부 `lockedBy`가 먼저 낸다.
   */
  const lock = node === undefined ? null : lockOf(node.id)
  // **잠긴 동안 들어온 커밋은 요청을 만들지 않는다.** 위젯을 끄는 것과 **같은 값**에서
  // 나오는 가드다. 끄는 것만으로 안 되는 것은 blur 때문이다 — 포커스가 있는 입력이
  // `disabled`가 되면 실브라우저는 포커스를 놓고 blur를 내는데(**Chrome 실측**: 치던 중에
  // 잠금이 오면 `focusout INPUT → null`, `activeElement`는 `BODY`), 그 blur가 곧
  // `TextControl`·`ListControl`의 커밋이다. **jsdom은 안 놓는다(실측: `disabled`로 바꿔도
  // `activeElement`가 그대로이고 blur 이벤트 0건).** 어느 쪽이든 *"잠긴 동안 도착한 blur는
  // 커밋이 아니다"*가 이 줄이 잠그는 것이고, 케이스는 그 blur를 직접 낸다. **그 blur가
  // 친 글자를 지워서도 안 된다** — 이 가드는 요청만 막으므로, 초안을 드는 위젯이 스스로
  // 지킨다(`controls/list-control.tsx`의 `commitDraft` — 그것이 없으면 Chrome 에서 목록 칸이
  // 그 blur에 초안을 잃는다).
  //
  // **고칠 수 없는 역할도 같은 값을 지난다** — 끄는 것과 커밋을 막는 것이 한 값이라 blur 커밋도 요청을 안 만든다.
  const blocked = lock !== null || !props.canEdit
  const notice = blockedNotice(props.canEdit, lock)

  // **여럿을 고른 판은 일괄 편집이다**(`BulkProperties`). 하나 고른 판은 아래 그대로다.
  if (doc !== null && selectedNodeIds.length > 1) {
    return (
      <BulkProperties
        document={doc}
        nodeIds={selectedNodeIds}
        anchorId={selectedNodeId}
        canEdit={props.canEdit}
        lockOf={lockOf}
        manifest={manifest}
        commit={(ops) => {
          // 보내기 전에 서버의 2차 방어와 같은 물음을 한 번 더 — 고른 뒤 도착한 남의 잠금(`editBlockedBy` — 묶음째).
          const blocker = store.editBlockedBy(ops)
          if (blocker !== null) {
            store.setEditFailure({ kind: 'message', message: lockedNotice(blocker.userName) })
            return false
          }
          return commitOps(ops)
        }}
        leave={(nodeIds, type, build) => commitLeftover({ pageId: props.pageId, nodeIds, type }, build)}
        onRemoved={() => store.selectNode(null)}
      />
    )
  }

  // **구역 줄을 고른 판** — 구역은 속성 칸이 아니다(설계 spec `2026-10-23-node-slots-design.md` 「5. 에디터」 «속성 패널»). 구역 이름과 넣는 길 한 줄을 보인다.
  if (node === undefined && selectedZone !== null && doc !== null) {
    const parent = findNodeSafely(doc.root, selectedZone.parentId)
    if (parent !== undefined) {
      return (
        <>
          <h2 className="wb-shell-panel-title">{zoneHeading(parent, selectedZone.zone)}</h2>
          <p className="wb-shell-panel-notice">{props.canEdit ? ZONE_SELECTED_NOTICE : ZONE_SELECTED_READONLY}</p>
        </>
      )
    }
  }

  if (node === undefined) {
    return <p className="wb-shell-panel-notice">{NO_SELECTION}</p>
  }

  // **타입부터 모양을 본다.** 검증 전 문서에는 `type`이 문자열이 아닌 노드가 들어올
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
        {/* 제목은 다른 판과 같은 이름이다(`nodeHeading` — 별칭을 지었으면 «타입 (별칭)»). 타입만 쓰면 별칭을 지은 사람이 제 노드를 못 찾는다. */}
        <h2 className="wb-shell-panel-title">{nodeHeading(node)}</h2>
        {/* 캔버스는 이 노드를 폴백으로 그리고 배너로 알린다. 패널이 잠자코 비어 있으면
            사용자는 "왜 속성이 안 나오지"를 묻게 된다. */}
        <p className="wb-shell-panel-notice">카탈로그에 없는 컴포넌트입니다: {type}</p>
      </>
    )
  }

  // **캔버스가 그리는 그 테마의 manifest 로 가른다** — 따로 읽으면 캔버스와 판정이 두 벌이 된다.
  const fields = visibleFields(def, node, readProps(node), manifest)
  const variantField = variantFieldOf(def, manifest)

  // **props 검증 실패는 이 패널이 말하지 않는다.** 캔버스는 그리지 못한 이유 둘(알 수 없는
  // 타입 / props 검증 실패)을 폴백과 배너로 알리는데, 여기는 앞의 하나만 안내하고 검증에
  // 실패한 노드에는 원본 값을 평범하게 보여 준다. 닫지 않는 이유는 둘이다 —
  // 패널이 스스로 검증하면 렌더러의 판정과 갈라질 수 있고(같은 위험을 `visibleFields`의
  // 주석이 variant 판정에 대해 적고 있다), 편집이 필요로 하는 것은 노드 단위 성패가
  // 아니라 **필드 단위** 결과라 노드 단위로 말하는 모양은 편집과 맞지 않는다.
  return (
    <>
      <h2 className="wb-shell-panel-title">{nodeHeading(node)}</h2>
      {/* **꺼진 위젯의 이유를 이 패널이 자기 자리에서 말한다.** 별칭 칸은 어느 컴포넌트에나 서므로 위젯이 없는 판이 없다 —
          편집할 속성이 없는 컴포넌트(`Page`·`Slot`)도 꺼진 별칭 칸의 이유를 여기서 말한다. */}
      {notice !== null && <p className="wb-shell-panel-notice">{notice}</p>}
      {fields.length === 0 && variantField === null ? (
        // `Page`·`Slot`처럼 `editor`가 빈 컴포넌트가 있다. 아무것도 그리지 않으면
        // "아직 고르지 않았다"와 구분되지 않는다.
        <p className="wb-shell-panel-notice">이 컴포넌트에는 편집할 속성이 없습니다</p>
      ) : (
        <>
          <dl className="wb-shell-props">
            {/* **변형이 맨 앞이다.** 개별 prop이 아니라 이 노드가 어떤 표현인가를 정하는
                것이라 상위다. */}
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
                    // **노드가 바뀌면 위젯을 다시 만든다.** 로컬 초안(타이핑 중인 값)을 새 노드로
                    // 옮기지 않는 장치이고, 아래 `PropControl`의 주석에 그 선택의 근거와 잰 값이 있다.
                    key={node.id}
                    field={field}
                    value={readProp(node, field.prop)}
                    disabled={blocked}
                    clearable={clearableProp(def, field.prop)}
                    image={{ projectId: props.projectId, place: (assetId) => placeImage(props.pageId, node.id, field.prop, assetId) }}
                    onCommit={(value) => {
                      if (!blocked) commitProp(node.id, field.prop, value)
                    }}
                    // 떠나기 전에 고른 것이 바뀐 초안은 이 노드에 쓴다(`useLeftoverCommit`).
                    onLeave={(value) =>
                      commitLeftover({ pageId: props.pageId, nodeIds: [node.id], type }, (running, nodeId) =>
                        propOps(running, nodeId, field.prop, value),
                      )
                    }
                  />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <dl className="wb-shell-props">
        {/* **몫은 컴포넌트 속성 칸들 바로 아래다** — 별칭처럼 노드 봉투의 필드이고, 부모가 몫을 읽을 때만 선다(`weightRoom` — 렌더러가 몫을 싣는 판정과 같다). */}
        {doc !== null && weightRoom(...weightParentOf(doc, node.id)) !== undefined && (
          <WeightField
            // 형제 칸(상태 보임)과 키가 겹치면 React 가 둘의 짝을 잘못 지어 초안 · 까닭을 엉뚱한 칸에 남긴다 — 칸 이름을 붙여 가른다.
            key={`${node.id}:weight`}
            value={node.weight}
            disabled={blocked}
            onCommit={(weight) => {
              if (blocked || doc === null) return
              const ops = weightOps(doc, node.id, weight)
              if (ops !== null) commitOps(ops)
            }}
            onLeave={(weight) =>
              commitLeftover({ pageId: props.pageId, nodeIds: [node.id], type }, (running, nodeId) => weightOps(running, nodeId, weight))
            }
          />
        )}
        {/* **상태 보임은 몫 아래다** — 같은 층(노드 봉투의 필드)이고 뿌리 말고는 어느 노드에나 선다(`./visibility-field.tsx`). */}
        {doc !== null && doc.root?.id !== node.id && (
          <VisibilityField
            key={`${node.id}:visibility`}
            value={node.visibility}
            viewStates={viewState.viewStates}
            current={viewState.state}
            hiddenNow={hiddenNodes.has(node.id)}
            disabled={blocked}
            onCommit={(visibility) => {
              if (blocked || doc === null) return
              const ops = visibilityOps(doc, node.id, visibility)
              if (ops !== null) commitOps(ops)
            }}
          />
        )}
        {/* **별칭이 맨 아래다**(설계서 「설계서 화면 구조」의 노드 별칭) — props 가 아니라 노드 봉투의 필드이고 어느 컴포넌트에나 선다. 칸을
            떠날 때 커밋하는 길은 글 칸과 같다(`TextControl`) — 편집은 `aliasOps` 하나. */}
        <div className="wb-shell-prop" key={ALIAS_FIELD.prop} data-wb-node-alias="">
          <dt className="wb-shell-prop-label">
            <label id={`${controlId(ALIAS_FIELD.prop)}-label`} htmlFor={controlId(ALIAS_FIELD.prop)}>
              {ALIAS_FIELD.label}
            </label>
          </dt>
          <dd className="wb-shell-prop-value">
            <TextControl
              key={node.id}
              field={ALIAS_FIELD}
              value={nodeAlias(node) ?? ''}
              id={controlId(ALIAS_FIELD.prop)}
              // 61자째부터는 칸이 받지 않는다 — 안 막으면 떠날 때 `tidyAlias` 가 60자에서 말없이 잘라 저장했다.
              maxLength={NODE_ALIAS_MAX}
              placeholder={`${NODE_ALIAS_MAX}자까지`}
              disabled={blocked}
              onCommit={(value) => {
                if (blocked || doc === null) return
                const ops = aliasOps(doc, node.id, String(value))
                if (ops !== null) commitOps(ops)
              }}
              onLeave={(value) =>
                commitLeftover({ pageId: props.pageId, nodeIds: [node.id], type }, (running, nodeId) =>
                  aliasOps(running, nodeId, String(value)),
                )
              }
            />
          </dd>
        </div>
      </dl>
    </>
  )
}

/** «몫» 칸의 까닭 — 1 ~ 12 정수 밖을 친 채 떠났다. 보내지 않는다(서버가 422 로 거절할 값이다). */
export const WEIGHT_RANGE_NOTICE = `몫은 ${WEIGHT_MIN} ~ ${WEIGHT_MAX} 의 정수입니다 — 보내지 않았습니다`

/**
 * «몫» 칸. 카탈로그의 `editor` 가 아니라 패널이 정한다 — 몫은 props 가 아니라 노드 봉투의 필드다(별칭과 같은 층). `prop` 값은 입력의 id 를 짓는 데만
 * 쓴다. 글 칸(`text`)인 까닭: 수 칸은 비운 것을 커밋하지 않는데 몫은 비우면 지운다.
 */
const WEIGHT_FIELD: EditorField = { prop: 'node-weight', control: 'text', label: '몫' }

/** 친 글 → 몫. 빈 글이면 `null`(지운다), 1 ~ 12 정수가 아니면 `undefined`(안 보낸다). `1e1` · `+3` · `3.0` 같은 수 표기는 받지 않는다. */
function parseWeight(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= WEIGHT_MIN && value <= WEIGHT_MAX ? value : undefined
}

/**
 * 몫을 읽는 부모 — 렌더러가 몫을 싣는 판정(`weightRoom`)의 입력. 부모가 없으면(뿌리 · 문서에 없음) 아무 자리도 아닌 입력을 낸다.
 */
function weightParentOf(doc: PageDocument, nodeId: string): [string, WbNode['props']] {
  const chain: WbNode[] = []
  for (const visit of walkSafely(doc.root)) {
    while (chain.length > 0 && chain.at(-1) !== visit.parent) chain.pop()
    if (visit.node.id === nodeId) {
      const parent = chain.at(-1)
      return parent === undefined ? ['', undefined] : [String(parent.type), parent.props]
    }
    chain.push(visit.node)
  }
  return ['', undefined]
}

/** 여럿을 고른 판의 그림 칸 — 올리기의 편집 자리가 노드 하나라 일괄로 고르지 않는다. */
const IMAGE_BULK_NOTE = '그림은 하나씩 골라 정합니다'

/**
 * **올린 그림을 그 순간의 판으로 넣는다**(`controls/image-control.tsx` 머리말 «올리기와 편집은 따로다»). 올리는 동안 노드를 바꿔 위젯이 내려가도
 * 누른 때의 노드에 낸다 — 그래서 위젯이 아니라 패널이 쥐고, 렌더마다 지금 판(`latest`)을 적어 둔다. 페이지를 옮겼거나 패널이 내려갔으면 안 낸다
 * (`left`), 노드가 문서에 없으면 `gone`, 남이 잡았거나 고칠 수 없는 역할이면 `locked`.
 */
function usePlaceImage(now: {
  doc: PageDocument | null
  pageId: string | undefined
  canEdit: boolean
  lockOf: (nodeId: string) => unknown
  commitProp: (nodeId: string, prop: string, value: unknown) => void
}): (pageId: string | undefined, nodeId: string, prop: string, assetId: string) => PlaceOutcome {
  const latest = useRef({ ...now, alive: true })
  useLayoutEffect(() => {
    latest.current = { ...now, alive: true }
  })
  useLayoutEffect(
    () => () => {
      latest.current.alive = false
    },
    [],
  )
  return useCallback((pageId, nodeId, prop, assetId) => {
    const state = latest.current
    if (!state.alive || state.pageId !== pageId || state.doc === null) return 'left'
    if (findNodeSafely(state.doc.root, nodeId) === undefined) return 'gone'
    if (!state.canEdit || state.lockOf(nodeId) !== null) return 'locked'
    state.commitProp(nodeId, prop, assetId)
    return 'ok'
  }, [])
}

/** 기본값이 없는 prop 인가 — 안 적으면 파싱한 값에도 없다. 그 prop 의 수 칸은 비워 «안 정한» 판으로 되돌릴 수 있다. */
function clearableProp(def: ComponentDef, prop: string): boolean {
  const schema = (def.props as unknown as { shape?: Record<string, { safeParse(value: unknown): { success: boolean; data?: unknown } }> })
    .shape?.[prop]
  if (schema === undefined) return false
  const parsed = schema.safeParse(undefined)
  return parsed.success && parsed.data === undefined
}

/** «몫» 칸 한 줄. 범위 밖을 친 채 떠나면 안 보내고 칸 아래에 까닭을 말한다 — 바른 값을 보내거나 노드가 바뀌면(`key`) 걷힌다. */
function WeightField(props: {
  value: unknown
  disabled: boolean
  onCommit: (weight: number | null) => void
  onLeave: (weight: number | null) => void
}): ReactElement {
  const [invalid, setInvalid] = useState(false)
  const id = controlId(WEIGHT_FIELD.prop)
  return (
    <div className="wb-shell-prop" data-wb-node-weight="">
      <dt className="wb-shell-prop-label">
        <label id={`${id}-label`} htmlFor={id}>
          {WEIGHT_FIELD.label}
        </label>
      </dt>
      <dd className="wb-shell-prop-value">
        <TextControl
          field={WEIGHT_FIELD}
          value={typeof props.value === 'number' ? props.value : ''}
          id={id}
          placeholder={`${WEIGHT_MIN} ~ ${WEIGHT_MAX}`}
          disabled={props.disabled}
          onCommit={(text) => {
            const weight = parseWeight(String(text))
            setInvalid(weight === undefined)
            if (weight !== undefined) props.onCommit(weight)
          }}
          onLeave={(text) => {
            const weight = parseWeight(String(text))
            if (weight !== undefined) props.onLeave(weight)
          }}
        />
        {invalid && <p className="wb-shell-prop-why">{WEIGHT_RANGE_NOTICE}</p>}
      </dd>
    </div>
  )
}

/** 타입이 섞인 여럿을 골랐을 때의 안내(설계서 «여럿을 고른 판의 동작»). */
export const MIXED_TYPES_NOTICE = '일괄 속성 편집은 같은 타입끼리만 됩니다'

/**
 * **여럿을 고른 판의 속성 패널**(설계서 「설계서 화면 구조」의 «여럿을 고른 판의 동작» — 일괄 속성).
 *
 * | 고른 것 | 그리는 것 |
 * |---|---|
 * | 같은 타입 | 기준 노드의 패널(같은 칸 · 같은 위젯). 칸마다 «모두 같은 값인가» — 같으면 그 값, 갈리면 «여러 값»(빈 칸 + 자리표 · 고르개의 «여러 값» 칸 · 켬/끔의 반쯤 켬). 목록 칸은 갈리면 고치지 않는다(«여러 값» 글자만) |
 * | 타입이 섞였다 · 타입을 못 읽는 노드가 있다 | «N개 고름» · `MIXED_TYPES_NOTICE` · 고른 노드 삭제 단추 |
 *
 * **바꾼 칸만 모두에 쓴다** — 칸 하나의 커밋이 고른 노드마다 `propOps` · `variantOps`를 **앞 연산을 적용한 문서 위에서** 차례로 지어 묶음
 * 하나로 보낸다(편집 하나 · 되돌리기 하나 · 남의 화면에 한 번에). 다른 칸은 노드마다 제 값 그대로다.
 *
 * **고른 것 가운데 하나라도 남이 잡았으면 위젯이 다 꺼진다**(하나 고른 판의 `blocked`와 같은 값 — 묶음째 423 을 받을 편집을 만들지 않는다).
 * 위젯은 고른 목록이 바뀌면 새로 선다(`key` — 하나 고른 판의 `key={node.id}`와 같은 까닭: 앞 목록에 친 초안을 다른 목록에 커밋하지 않는다).
 * 칸을 떠나지 않은 채 목록이 바뀌면 그 초안은 앞 목록 가운데 남은 노드에 간다(`useLeftoverCommit`).
 */
function BulkProperties(props: {
  document: PageDocument
  nodeIds: readonly string[]
  anchorId: string | null
  canEdit: boolean
  lockOf: (nodeId: string) => NodeLock | null
  manifest: ThemeManifest
  /** 묶음 하나를 보낸다 — 남의 잠금에 막히면 말하고 `false`. */
  commit: (ops: PatchOp[]) => boolean
  /** 떠나기 전에 고른 것이 바뀐 초안 — 이 목록(앞 목록) 가운데 남은 노드에 쓴다(`useLeftoverCommit`). */
  leave: (nodeIds: readonly string[], type: string, build: BuildOps) => void
  onRemoved: () => void
}): ReactElement {
  const { document } = props
  const nodes = props.nodeIds.map((id) => findNodeSafely(document.root, id)).filter((node): node is WbNode => node !== undefined)
  const lock = nodes.map((node) => props.lockOf(node.id)).find((found) => found !== null) ?? null
  const blocked = lock !== null || !props.canEdit
  const notice = blockedNotice(props.canEdit, lock)
  const widgetKey = props.nodeIds.join(',')

  /** 노드마다 지은 연산을 앞 연산을 적용한 문서 위에서 이어 묶는다. 지을 것이 없으면 안 보낸다. */
  const commitEach = (build: (running: PageDocument, nodeId: string) => PatchOp[] | null): void => {
    if (blocked) return
    const ops: PatchOp[] = []
    let running = document
    for (const node of nodes) {
      const step = build(running, node.id)
      if (step === null || step.length === 0) continue
      ops.push(...step)
      running = applyOps(running, step)
    }
    if (ops.length > 0) props.commit(ops)
  }

  const types = new Set(nodes.map((node) => nodeType(node)))
  const type = types.size === 1 ? [...types][0]! : null
  const def = type === null ? undefined : getComponent(type)

  if (type === null || def === undefined) {
    const removeOps = removeManyOps(document, props.nodeIds)
    return (
      <>
        <h2 className="wb-shell-panel-title">{props.nodeIds.length}개 고름</h2>
        <p className="wb-shell-panel-notice">{type === null ? MIXED_TYPES_NOTICE : `카탈로그에 없는 컴포넌트입니다: ${type}`}</p>
        {notice !== null && <p className="wb-shell-panel-notice">{notice}</p>}
        <button
          type="button"
          className="wb-shell-panel-action"
          disabled={blocked || removeOps === null}
          onClick={() => {
            if (!blocked && removeOps !== null && props.commit(removeOps)) props.onRemoved()
          }}
        >
          고른 노드 삭제
        </button>
      </>
    )
  }

  const anchor = nodes.find((node) => node.id === props.anchorId) ?? nodes[nodes.length - 1]!
  const fields = visibleFields(def, anchor, readProps(anchor), props.manifest)
  const variantField = variantFieldOf(def, props.manifest)
  /** 칸의 값 — 모두 같으면 그 값, 갈리면 `mixed`. JSON 값이라 글자로 견준다. */
  const shared = (read: (node: WbNode) => unknown): { value: unknown; mixed: boolean } => {
    const first = read(nodes[0]!)
    const mixed = nodes.some((node) => JSON.stringify(read(node)) !== JSON.stringify(first))
    return { value: mixed ? undefined : first, mixed }
  }

  return (
    <>
      <h2 className="wb-shell-panel-title">
        {type} {nodes.length}개
      </h2>
      {fields.length === 0 && variantField === null ? (
        <p className="wb-shell-panel-notice">이 컴포넌트에는 편집할 속성이 없습니다</p>
      ) : (
        <>
          {notice !== null && <p className="wb-shell-panel-notice">{notice}</p>}
          <dl className="wb-shell-props">
            {variantField !== null &&
              (() => {
                const { value, mixed } = shared((node) => node.variant)
                return (
                  <div className="wb-shell-prop" key={VARIANT_FIELD}>
                    <dt className="wb-shell-prop-label">
                      <label id={`${controlId(VARIANT_FIELD)}-label`} htmlFor={controlId(VARIANT_FIELD)}>
                        {variantField.label}
                      </label>
                    </dt>
                    <dd className="wb-shell-prop-value">
                      <VariantControl
                        key={widgetKey}
                        options={variantField.options}
                        value={value}
                        mixed={mixed}
                        id={controlId(VARIANT_FIELD)}
                        disabled={blocked}
                        onCommit={(variant) => commitEach((running, nodeId) => variantOps(running, nodeId, variant))}
                      />
                    </dd>
                  </div>
                )
              })()}
            {fields.map((field) => {
              const { value, mixed } = shared((node) => readProp(node, field.prop))
              const list = field.control === 'stringList' || field.control === 'pairList' || field.control === 'optionList'
              return (
                <div className="wb-shell-prop" key={field.prop}>
                  <dt className="wb-shell-prop-label">
                    <label id={`${controlId(field.prop)}-label`} htmlFor={controlId(field.prop)}>
                      {field.label}
                    </label>
                  </dt>
                  <dd className="wb-shell-prop-value">
                    {/* 목록 칸은 값이 갈리면 고치지 않는다 — 한 줄을 고친 목록을 모두에 쓰면 노드마다 다른 나머지 줄이 사라진다. */}
                    {list && mixed ? (
                      <>{MIXED_PLACEHOLDER}</>
                    ) : (
                      <PropControl
                        key={widgetKey}
                        field={field}
                        value={value}
                        mixed={mixed}
                        disabled={blocked}
                        onCommit={(next) => commitEach((running, nodeId) => propOps(running, nodeId, field.prop, next))}
                        onLeave={(next) =>
                          props.leave(props.nodeIds, type, (running, nodeId) => propOps(running, nodeId, field.prop, next))
                        }
                      />
                    )}
                  </dd>
                </div>
              )
            })}
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

/**
 * 별칭 칸. 카탈로그의 `editor`가 아니라 패널이 정한다 — 별칭은 props 가 아니라 노드 봉투의 필드다(`variant`와 같은 층). `prop` 값은
 * 입력의 id 를 짓는 데만 쓴다 — 카탈로그 prop 이름과 안 겹치게 `node-` 를 붙였다.
 */
const ALIAS_FIELD: EditorField = { prop: 'node-alias', control: 'text', label: '별칭' }

/** 변형 컨트롤의 라벨. 패널이 정한다 — 카탈로그에 그 자리가 없다(아래 머리말). */
const VARIANT_LABEL = '변형'

/**
 * **이 노드에 변형 컨트롤을 낼 것인가, 낸다면 무엇을 고르게 할 것인가.**
 *
 * `EditorField.prop`은 **props의 키**를 가리키는데 `variant`는 **노드 봉투의 필드**다(설계서
 * 「페이지 스키마 노드」). 그래서 `editor`에 적을 수 없고 — 적으면 `defineComponent`가 던진다 —
 * 패널이 따로 다룬다.
 *
 * **선택지는 테마의 manifest 가 준다** — variant 는 테마가 선언한다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「manifest」). 그 컴포넌트를 선언하지 않았으면 칸이 없다. 라벨을 보이고 id 를 적는다. «(기본)»(`VariantControl`)은
 * `variant` 를 지운다 — 그 노드는 `defaultVariant` 로 그려진다.
 *
 * **`variantFrom`이 있으면 내지 않는다.** 그쪽은 prop이 변형을 정하고 `node.variant`는
 * 버려진다 — 컨트롤을 내면 `ignored-variant` 경고를 **UI가 유도하는 셈**이다.
 * 그 컴포넌트의 변형은 이미 그 prop의 `select`로 도달한다(Text의 `역할`, Field의 `입력 종류`,
 * Divider의 `방향`).
 */
export function variantFieldOf(
  def: ComponentDef,
  manifest: ThemeManifest,
): { label: string; options: readonly { id: string; label: string }[] } | null {
  if (def.variantFrom !== undefined) return null
  const decl = manifest.components?.[def.type]
  if (decl === undefined) return null
  return { label: VARIANT_LABEL, options: decl.variants.map((v) => ({ id: v.id, label: v.label })) }
}

/**
 * 필드 하나를 그린다. **control 종류가 위젯을 고른다.**
 *
 * 위젯으로 그리지 못하는 자리(`options`가 없는 `select`, 위젯이 없는 control)는 `formatValue`가
 * 그린 글자로 남는다 — `formatValue`를 남겨 둔 이유가 그것이고, 카탈로그 밖 값(검증을 통과하지
 * 못한 문서)을 그리는 데도 쓴다. 덮은 것과 남은 것은 `test/panels/property-panel.test.tsx`의
 * `카탈로그의 control 일곱에 전부 대응하는 위젯이 있다`가 카탈로그를 세어 대조한다.
 *
 * **노드가 바뀔 때 로컬 초안을 앞 노드에 묶어 두는 일은 부르는 쪽의 `key`가 한다** — 위젯이 새로 서고, 내려가는 위젯이 커밋하지 않은
 * 초안을 `onLeave`로 넘기면 앞 노드에 쓴다(`useLeftoverCommit`). 이펙트로 동기화하는 대신 `key`를 고른 근거와, **그 장치가 실제로 언제
 * 일하는가**:
 *
 * - **실브라우저에서는 클릭으로 옮겨도 초안이 안 사라진다 — 먼저 커밋된다**(실측:
 *   Chrome · 실제 서버·DB · 편집은 WS `patch` 프레임으로 셌다). `mousedown`이 입력의 포커스를
 *   거두고(버튼이면 `focusout INPUT → BUTTON`, 캔버스의 `<div>`면 `→ null`) 그 blur가
 *   **원래 노드**로 커밋한 **뒤에** `click`이 선택을 바꾼다. 위젯 다섯(text·textarea·number·
 *   stringList·pairList)이 전부 같은 값이다:
 *
 *   | 치던 중에 | 나간 편집 | 돌아와 본 칸 · 서버 |
 *   |---|---|---|
 *   | 다른 탭을 클릭 → 복귀 | 1건 — 원래 노드 | 새 값 · 새 값 |
 *   | 모드 왕복 | 1건 — 원래 노드 | 새 값 · 새 값 |
 *   | 트리로 다른 노드 → 복귀 | 1건 — **원래 노드**의 경로 | 새 값 · 새 값 |
 *   | 캔버스로 다른 노드 → 복귀 | 1건 — 원래 노드 | 새 값 · 새 값 |
 *   | 메뉴로 다른 페이지 → 복귀 | 1건 — **원래 페이지** | 새 값 · 새 값 |
 *   | Enter · Tab 키 | 1건 (textarea 의 Enter 는 줄바꿈이라 0건) | 새 값 · 새 값 |
 *   | Esc 키 | 0건 — Esc 에는 아무것도 걸려 있지 않아 칸에 초안이 남는다 | 새 값 · 옛 값 |
 *   | 창 닫기 · 새로고침 · 뒤로 가기 | 0건, **경고 없음** | — · 옛 값 |
 *
 *   마지막 줄은 이 저장소가 `beforeunload`를 안 거는 판단의 결과다 — 그것은 **탭을 닫는 것만** 잡고 앱 안 이동은 못
 *   잡는다(앱 안 이동을 막는 react-router 의 `useBlocker`는 데이터 라우터에서만 돌고 이 앱은 `<BrowserRouter>` + `<Routes>`다 —
 *   `main.tsx`). **반만 막는 것이 안 막는 것보다 나쁘다** — 사용자가 막힌다고 믿게 된다. 뒤로 가기는 CDP 로 낸
 *   것이라 **브라우저의 뒤로 버튼**이 포커스를 옮기는지는 재지 않았다. **Chrome 만 쟀다** —
 *   Safari 는 클릭에 버튼을 포커스하지 않는다고 알려져 있지만, 그때도 포커스는 `BODY`로
 *   가 blur 가 나야 한다. 그것은 잰 값이 아니다.
 * - **jsdom 에서는 blur 없이 선택이 바뀐다.** `fireEvent.click`은 포커스를 옮기지 않아 blur 가 안 나고
 *   (`activeElement`는 `BODY`), 선택이 먼저 바뀌어 `key`가 위젯을 갈아 끼운다 — 내려가는 위젯의 초안은 `onLeave`로 **앞 노드에**
 *   커밋된다. 케이스 둘이 그 **장치**를 고정한다(`test/edit/undo-redo.test.tsx`의 트리 판 · `test/panels/
 *   property-panel.test.tsx`의 캔버스 판). **그 둘은 사용자가 겪는 일이 아니라 «포커스가
 *   안 옮겨 간 채 선택이 바뀌면»의 값이다.** **위 표의 행동은 `test/click-as-browser.ts`의 `clickAsBrowser`로 잰다** — 그
 *   흉내는 표의 클릭 갈래 다섯 × 위젯 다섯, 25칸에서 Chrome 과 같은 값을 냈다
 *   (`test/panels/property-panel.test.tsx`의 «실브라우저의 클릭은 …» 절).
 * - **`focus()`로 옮기면 커밋된다.** 같은 하네스에서 트리 버튼에 `focus()`를 부르면
 *   `activeElement`가 `BUTTON`이 되고 `blur`가 나 요청이 1건 나간다. **이 값은 "구조 트리로
 *   고르면 손실이 없다"의 근거가 못 된다 — 잰 것은 `focus()`이고 사용자가 하는 것은
 *   클릭이다.** 그 결론의 근거는 위 실브라우저 표다.
 * - **그래서 `key`는 뒷받침이다.** 실브라우저의 클릭은 선택이 바뀌기 전에 이미 커밋하므로,
 *   `key`가 갈아 끼울 때 초안이 남는 것은 **blur 없이 선택이 바뀌는 길**뿐이다 — 사람의 클릭이 아니라 남의 일(일부 거절 · 같은 사람의
 *   다른 탭이 고른 노드를 지움 · 옮김)이 고른 것을 바꾼 판이다. 그 길에서 초안을 새 노드로 옮겨 가지 않는 것이 `key`의 일이고(옮겨
 *   가면 앞 노드에 친 글이 **다른 노드의 값**으로 커밋된다), 앞 노드가 남았으면 거기 쓰고 없으면 하단 바에 말하는 것이
 *   `useLeftoverCommit`의 일이다.
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
  /** 고른 노드들의 값이 갈린다(일괄 편집 — `BulkProperties`). 글 · 수 · 켬/끔 · 고르개가 «여러 값»을 보인다. */
  mixed?: boolean
  /** 초안을 든 위젯(글 · 수 · 목록)이 칸을 떠나지 않은 채 내려간다 — `useLeftoverCommit`. 바로 커밋하는 위젯(켬/끔 · 고르개)은 초안이 없다. */
  onLeave?: (value: unknown) => void
  /** 기본값이 없는 수 prop 인가(`clearableProp`) — 비우면 `undefined` 를 커밋한다(`propOps` 가 그 prop 을 지운다). */
  clearable?: boolean
  /** 그림 칸의 문맥 — 하나 고른 판만 준다. 없으면(일괄 편집) 그림 칸은 글로만 선다(그림은 하나씩 고른다). */
  image?: { projectId: string; place: (assetId: string) => PlaceOutcome }
}): ReactElement {
  const { field, value, disabled, onLeave } = props
  const id = controlId(field.prop)
  const mixed = props.mixed === true
  // 비운 수 칸(`''`)은 «그 prop 을 지운다»(`undefined`)로 옮긴다 — `clearable` 인 칸만 빈 글을 낸다.
  const onCommit = (next: unknown) => props.onCommit(next === '' ? undefined : next)

  if (field.control === 'text' || field.control === 'textarea' || field.control === 'number') {
    return (
      <TextControl
        field={field}
        value={value}
        id={id}
        disabled={disabled}
        onCommit={onCommit}
        mixed={mixed}
        clearable={props.clearable === true && field.control === 'number'}
        onLeave={onLeave === undefined ? undefined : (next) => onLeave(next === '' ? undefined : next)}
      />
    )
  }

  if (field.control === 'switch') {
    return <SwitchControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} mixed={mixed} />
  }

  if (field.control === 'stringList' || field.control === 'pairList' || field.control === 'optionList') {
    return <ListControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} onLeave={onLeave} />
  }

  if (field.control === 'image') {
    if (props.image === undefined) return <>{IMAGE_BULK_NOTE}</>
    return (
      <ImageControl
        field={field}
        value={value}
        id={id}
        projectId={props.image.projectId}
        disabled={disabled}
        onCommit={onCommit}
        place={props.image.place}
      />
    )
  }

  if (field.control === 'color') {
    return (
      <ColorControl
        field={field}
        value={value}
        id={id}
        disabled={disabled}
        onCommit={onCommit}
        mixed={mixed}
        onLeave={onLeave === undefined ? undefined : (next) => onLeave(next === '' ? undefined : next)}
      />
    )
  }

  // `options`가 없거나 비면 `<select>`를 그리지 않는다(`SelectControl`이 `null`을 낸다).
  // 그 판정을 여기서 한 번 더 하는 것은, 그때 **아래 글자로 되돌아가야** 하기 때문이다 —
  // 위젯도 글자도 없으면 그 줄이 통째로 비어 사용자가 값을 볼 수 없다.
  if (field.control === 'select' && field.options !== undefined && field.options.length > 0) {
    return <SelectControl field={field} value={value} id={id} disabled={disabled} onCommit={onCommit} mixed={mixed} />
  }

  return <>{formatValue(value)}</>
}

/**
 * 노드의 variant 에서 보이는 필드만 남긴다 — 그 variant 선언의 `hideProps` 칸을 감춘다(spec 「manifest」의 `components`).
 * 카드 그리드처럼 컬럼이 뜻 없는 표현에서 컬럼을 편집할 수 있는 것처럼 보이면 안 된다.
 *
 * **variant 는 렌더러가 그리는 그 함수로 구한다**(`resolveVariant`) — 선언 밖이거나 없으면 `defaultVariant` 다. 패널이 따로
 * 판정하면 캔버스와 갈려, 캔버스에 없는 속성을 내민다.
 */
export function visibleFields(def: ComponentDef, node: WbNode, props: Record<string, unknown>, manifest: ThemeManifest): EditorField[] {
  const variant = resolveVariant(def, node, props, manifest)
  const hidden = new Set(manifest.components?.[def.type]?.variants.find((v) => v.id === variant)?.hideProps ?? [])
  return def.editor.filter((field) => !hidden.has(field.prop))
}

/** 노드의 props. 객체가 아니면 빈 것이다 — `readProp`과 같은 판단이다. */
function readProps(node: WbNode): Record<string, unknown> {
  const props = (node as { props?: unknown }).props
  return typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {}
}

/** 노드의 props에서 값 하나. 없으면 `undefined`다 — 기본값을 대신 채우지 않는다(아래). */
function readProp(node: WbNode, prop: string): unknown {
  return node.props?.[prop]
}

/**
 * 값을 사람이 읽는 한 줄로 만든다.
 *
 * **없는 값은 빈 문자열이다.** 카탈로그의 기본값을 대신 채우지 않는 것은 의도다 — 문서에
 * 실제로 있는 값과 스키마의 기본값은 다른 것이고, 편집에서는 "비어 있음"과
 * "기본값과 같은 값을 넣어 둠"이 서로 다른 편집 결과다.
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
  // 못한 문서가 스토어에 실리면 들어올 수 있다. 마지막 수단으로 원문을 보인다.
  return stringify(value)
}

/**
 * 마지막 수단의 서식. **`JSON.stringify`는 던진다** — 순환 참조와 `BigInt`가 그렇다.
 *
 * 이 패널은 오류 경계 **밖**이다(`apps/web/src`의 경계는 캔버스의 `CanvasBoundary`
 * 하나다). 그래서 여기서 예외가 새면 캔버스만 무너지는 것이 아니라 셸 전체가
 * 흰 화면이 된다. 위쪽의 `nodeType` 가드가 같은 이유로 있다(`./node-shape.ts`).
 *
 * **지금은 던질 수 없다.** 스토어에 문서를 싣는 것은 `store.loadPage(…)` **하나이고**,
 * 그것을 부르는 자리는 여럿이지만 **전부 `getPage` 응답을 싣는다**(페이지를 여는 경로 ·
 * 재연결 재조회 · 실패 복구). JSON에서 나온 값에는 순환도 `BigInt`도 없다.
 *
 * **논지는 부르는 자리 수가 아니라 값의 출처다** — 자리는 늘 수 있다.
 *
 * **이 `try`는 하중이 없다.** 걷어내도 죽는 케이스가 없다. `값을 문자열로 만들 수 없어도
 * 셸은 살아 있다`는 이 자리가 아니라 다른 자리를 지난다 — `Card.title`이 `text` control이라 `TextControl`이 그리고, 그쪽은 객체 값을 빈
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
