/**
 * 구조 트리 하단의 조작 툴바(D4).
 *
 * **조작이 두 부류다 — 앞 판의 머리말은 앞엣것만 말했고 그것이 낡았다**(P7-2 리뷰 (5)).
 *
 * | 부류 | 무엇 | 판정 |
 * |---|---|---|
 * | 선택 노드 하나에 작동하는 것 | 추가·삭제·순서·계층 | `structureAbilities`가 정하고 `disabled`가 따라간다 |
 * | **선택이 없어도 되는 것** | `패턴 넣기`(P7-1) · `프리셋`(P7-2) | **판정이 없다** — 걸 `ability`가 없어 `ToolButton`이 아니다 |
 *
 * 뒤 부류가 왜 판정을 갖지 않는지는 각각 P7-1 D5(선택이 없으면 root의 자식 끝)와
 * P7-2 D3(페이지 통째라 자리를 아예 고르지 않는다)에 있다. 단축키 쪽도 같은 성질을
 * 지나므로 그 표의 `ability`가 `null`이다(`panels/structure-tree.tsx`).
 *
 * 각 줄에 버튼을 흩지 않는 이유: 좁은 좌측 패널에서 트리가 읽히지 않고, 툴바여야
 * 키보드 단축키와 짝이 맞는다(D8 — Task 8).
 *
 * **판정은 여기 없다.** 무엇을 할 수 있는지는 `edit/structure-actions.ts`의
 * `structureAbilities`가 정하고(D3), 이 파일은 그 결과로 `disabled`를 걸 뿐이다.
 * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재지고, Task 8의 단축키가
 * 자기 조건을 따로 갖게 된다.
 *
 * **이 툴바 안에 고르개가 그려지고, 거기에는 타이핑하는 칸이 있다**(P7-2의 프리셋 이름).
 * 키 핸들러는 트리와 이 툴바를 **함께** 감싸는 상자에 붙어 있으므로, 거기서 난 키가
 * 구조 조작으로 새지 않게 하는 규칙이 그 상자에 있다 — `structure-tree.tsx`의
 * `fromTypingSurface`이고, 그것을 두기 전에 이름 칸의 `Backspace`가 노드를 지웠다.
 *
 * **이 파일은 오류 경계 밖이다** — 구조 트리와 같은 자리다(`panels/node-shape.ts`
 * 머리말). 던지면 셸 전체가 흰 화면이므로, 여기서 부르는 것들은 값으로 답해야 한다.
 *
 * **"깨진 문서에도 던지지 않는다"는 처음 적었을 때 거짓이었다** — 리뷰가 `children`
 * 배열 안의 `null` 원소로 반례를 찾았다. 웨이브 3의 정정(`edit/safe-walk.ts`)이 그것을
 * 닫았고 재현해 확인했다. **전제는 이것이다:** `structureAbilities`·`nodeSpot`·`ops`
 * 생성기 넷이 전부 `walkSafely`를 지나고, 그것이 노드가 아닌 값을 순회에서 뺀다.
 * `@wirebound/schema`의 `walkNodes`를 여기서 다시 쓰면 그 전제가 깨진다.
 *
 * **완전하다고는 적지 않는다** — 잰 것은 그 반례 부류(배열 원소가 노드가 아닌 경우)와
 * 웨이브 1이 잰 여섯 형태까지다.
 */
import { useId, useState, type ReactElement } from 'react'
import type { NodeLock, WbNode } from '@wirebound/schema'
import { expandPattern, type ThemePattern } from '@wirebound/themes'
import { useEditCommit } from '../edit/use-edit-commit'
import { createNode } from '../edit/create-node'
import { insertNodeOps, moveNodeOps, removeNodeOps } from '../edit/ops'
import { patternInsert } from '../edit/pattern-insert'
import { presetApply, presetFailureNotice } from '../edit/preset-apply'
import { findNodeSafely } from '../edit/safe-walk'
import { nodeSpot, structureAbilities, type StructureAbilities } from '../edit/structure-actions'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { PatternPicker } from './pattern-picker'
import { PresetPicker } from './preset-picker'
import { TypePicker } from './type-picker'
import { structureStatus } from './toolbar-status'

/**
 * 버튼이 비활성일 때 붙는 설명.
 *
 * **문안을 지어내지 않고 조건을 그대로 옮겼다.** 상태별로 다른 문장("루트라서" /
 * "고르지 않아서")을 만들지 않는 것은 그 갈래가 곧 판정의 두 번째 벌이 되기 때문이다 —
 * 판정은 `structureAbilities` 하나가 하고(D3), 여기 있는 것은 "그 버튼이 활성이려면
 * 무엇이 필요한가"뿐이다.
 *
 * **`title`의 한계는 이제 잰 것이다.** 비활성 버튼은 **탭 순서에서 빠지므로** 키보드
 * 사용자는 이 설명에 닿을 길이 없고(포커스가 안 가면 `title`도 `aria-describedby`도
 * 읽히지 않는다), 마우스는 1초 이상 머물러야 하며 터치에는 아예 뜨지 않는다.
 *
 * **그래서 이 표를 지우지 않고 상태줄을 더했다**(`./toolbar-status.ts`). 둘은 겹치는 것이
 * 아니라 결이 다르다 — 상태줄은 *"고른 것이 무엇이라서 그런가"*를 **대표 이유 하나**로
 * 말하고, 이 표는 *"그 버튼 하나가 활성이려면 무엇이 필요한가"*를 버튼마다 말한다.
 * 상태줄이 말하지 않은 나머지가 갈 곳은 오늘 여기뿐이다.
 */
const WHY_DISABLED: Record<keyof StructureAbilities, string> = {
  // **조건 둘을 다 말한다.** `acceptsChildren`은 카탈로그의 `many` 여부만이 아니라
  // 문서의 `children`이 배열인지도 본다 — 앞엣것만 적으면 `Card`인데 비활성인 자리에서
  // 사용자가 이유를 알 수 없다(리뷰 지적).
  addInside: '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
  addAfter: '루트가 아닌 노드를 고르세요',
  remove: '루트가 아닌 노드를 고르세요',
  moveUp: '앞에 형제가 있는 노드를 고르세요',
  moveDown: '뒤에 형제가 있는 노드를 고르세요',
  indent: '앞 형제가 자식을 담을 수 있어야 합니다',
  outdent: '부모가 루트가 아니어야 합니다',
}

/**
 * 툴바 버튼과 키보드 단축키가 **공유하는** 조작 묶음(D8).
 *
 * **두 경로가 같은 함수를 부르는 것이 계약이다.** 각자 자기 구현을 가지면 한쪽만
 * 고쳐지는 자리가 생긴다 — `structure-keyboard.test.tsx`의 `단축키와 버튼이 같은 op을
 * 만든다`가 그것을 고정한다.
 *
 * 훅을 **한 번만** 부르는 것도 의도다. 트리가 불러 툴바에 내려 주므로 `useEditCommit`
 * 인스턴스가 하나다 — 둘이어도 D6는 지켜지지만(펌프 가드가 스토어에 있다) 같은 화면에서
 * 굳이 둘을 만들 이유가 없다.
 */
export interface StructureCommands {
  abilities: StructureAbilities
  /**
   * 도구모음 아래 상태줄에 설 한 문장. 할 말이 없으면 `''`다.
   *
   * **툴바가 아니라 여기서 만든다** — 문안이 `abilities` 말고도 **선택 자체의 성질**
   * (잠금·루트)을 보는데, 그 둘은 스토어와 문서에서 나오고 그것을 이미 든 자리가 여기다.
   * 문안 자체는 `./toolbar-status.ts`가 갖는다(순수 함수 — 상태마다 무엇이 나오는지가
   * 화면을 지나지 않고 재진다).
   */
  status: string
  remove: () => void
  moveUp: () => void
  moveDown: () => void
  indent: () => void
  outdent: () => void
  /**
   * 고르개를 연다. 실제 추가는 `pick`(타입)·`pickPattern`(패턴)이 한다.
   *
   * **`'pattern'`이 `'inside'`·`'after'`와 같은 상태에 있는 것이 의도다** — 고르개 둘이
   * 동시에 열리면 좁은 좌측 패널에 목록 두 개가 쌓이고, 어느 쪽 `추가`를 눌렀는지가
   * 흐려진다. 상태가 하나면 그 경우가 성립하지 않는다.
   */
  openAdd: (where: OpenPicker) => void
  /** 고르개가 열려 있으면 무엇을 고르는 중인지. 닫혀 있으면 `null`. */
  adding: OpenPicker | null
  pick: (type: string) => void
  /**
   * 고른 패턴을 전개해 꽂는다(D5). **자리 규칙과 검증은 `edit/pattern-insert.ts`가 갖는다** —
   * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재진다(D3과 같은 이유).
   */
  pickPattern: (key: string, pattern: ThemePattern) => void
  /**
   * 고른 프리셋을 놓는다(P7-2 D3·D4·D5). **자리 규칙이 없다** — 페이지 통째라 답이
   * *"어디에 꽂나"*가 아니라 *"무엇을 치우고 놓나"*다. 판정과 op 만들기는
   * `edit/preset-apply.ts`가 갖는다(`pickPattern`과 같은 이유).
   */
  applyPreset: (nodes: WbNode[]) => void
  cancelAdd: () => void
}

/**
 * 열려 있는 고르개. **넷이 한 상태에 있는 것이 의도다** — 고르개 둘이 동시에 열리면 좁은
 * 좌측 패널에 목록이 쌓이고 어느 쪽 버튼을 눌렀는지가 흐려진다(P7-1이 `'pattern'`을
 * 더하며 적은 것과 같은 근거).
 */
export type OpenPicker = 'inside' | 'after' | 'pattern' | 'preset'

export function useStructureCommands(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 고른 노드를 막는 **남의** 잠금(`store.lockedBy`가 낸 것). 없으면 `null`이다.
   * 상태줄이 이것을 맨 위에서 본다(`./toolbar-status.ts`).
   *
   * **여기서 구독하지 않고 받는다.** 스토어의 잠금 목록을 손에 쥐는 자리는 화면에 **하나**여야
   * 하고(`test/lock/one-verdict.test.ts` — *"셋째 판정은 여기서 먼저 보인다"*), 그 하나가
   * 이 훅을 부르는 `StructureTree`다. 거기서 목록을 이미 구독해 트리 줄의 배지·비활성을
   * 그리므로, 같은 값을 여기서 또 구독하면 자리만 늘고 얻는 것이 없다. **판정은 어느 쪽도
   * 하지 않는다** — 양쪽 다 스토어의 `lockedBy`를 지난 값을 든다.
   */
  selectedLock?: NodeLock | null
}): StructureCommands {
  const store = useEditorStoreInstance()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 본다
  // (`store/use-editor-store.tsx`가 그 대조를 갖는 유일한 자리다).
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를
  // 주는데, 그 값은 어느 페이지 id와도 같지 않아 `commitOps`가 그 자리에서 돌아온다
  // (속성 패널과 같은 관례).
  //
  // **다만 이 갈래는 지금 도달하지 않는다 — 리뷰가 지적했고 소스로 확인했다.**
  // `StructureTree`가 `doc === null`이면 툴바를 아예 그리지 않고, 문서가 있다는 것은
  // `useOpenDocument`가 주소와 대조를 통과했다는 뜻이라 `pageId`가 있다. 속성 패널은
  // 그 게이트가 없어 실제로 이 갈래를 지난다 — 관례를 맞춘 것이지 여기서 쓰이는 것이
  // 아니다.
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })

  const abilities = structureAbilities(document, selectedNodeId)
  /** 고르개가 열려 있으면 무엇을 고르는 중인지. 닫혀 있으면 `null`이다. */
  const [adding, setAdding] = useState<OpenPicker | null>(null)

  /**
   * 고른 타입으로 새 노드를 만들어 넣는다. 편집이 실제로 들어갔을 때만 선택을 옮긴다.
   *
   * **웨이브 2에서 "Task 7이 이 반환값 검사에 하중을 준다"고 적었는데 그 예측은
   * 빗나갔다 — 여기서도 0 사망이다(재 봤다).** 무조건 옮기도록 바꿔도 이 파일의 케이스가
   * 하나도 죽지 않는다. 앞의 가드들이 여전히 덮기 때문이다: `createNode`가 받는 타입은
   * **목록이 카탈로그에서 만든 것**이라 `null`이 될 수 없고, `insertNodeOps`가 받는
   * 부모·인덱스는 `structureAbilities`·`nodeSpot`을 지난 값이다.
   *
   * 그래도 남긴다. `routes/editor.tsx`의 `ready` 게이트와 같은 자리다 — **지금 통과하는
   * 이유가 "위의 성질이 지켜지고 있어서"이므로**, 그 성질이 깨지는 날 이것이 마지막
   * 방벽이다. **닫는 케이스를 만들지 못했다**: 화면에서 `commitOps`를 `false`로 만들려면
   * 비활성인 버튼을 눌러야 하는데 그 경로가 없다.
   *
   * 목록은 **성패와 무관하게 닫는다.** 열어 둔 채로 두면 실패했을 때 같은 편집을 다시
   * 내게 되고, 그것도 같은 이유로 실패한다.
   */
  function addNode(type: string): void {
    setAdding(null)
    // **`adding`이 `'pattern'`이면 여기 오지 않는다** — 그때 그려지는 것은 `PatternPicker`
    // 이고 이 함수는 `TypePicker.onPick`에만 걸려 있다. 그래도 자리를 좁혀 두는 것은
    // 아래 두 갈래가 `'inside' | 'after'`를 전제하기 때문이다.
    if (document === null || selectedNodeId === null) return
    if (adding !== 'inside' && adding !== 'after') return

    const node = createNode(type)
    if (node === null) return

    const ops =
      adding === 'inside' ? insertInside(selectedNodeId, node) : insertAfter(selectedNodeId, node)

    if (commitOps(ops)) store.selectNode(node.id)
  }

  /**
   * 고른 패턴을 전개해 꽂는다(D4·D5·D9).
   *
   * **실패 갈래가 셋이고 각각 다른 것을 말한다** — D9가 요구한 *"패턴이 잘못됐다"*와
   * *"내가 잘못 눌렀다"*의 구분이다. 어느 갈래에서도 **편집을 만들지 않으므로 되돌릴
   * 문서가 없다**: 화면의 문서는 손대지 않은 그대로이고 알림만 남는다.
   *
   * | 갈래 | 문장이 말하는 것 | 되돌리는 것 |
   * |---|---|---|
   * | 전개 실패(선언 안 된 슬롯) | 패턴이 잘못됐다 — 테마를 고쳐야 한다 | 없음(편집 0건) |
   * | `'invalid'`·`'empty'` | 같음 | 없음 |
   * | `'no-spot'` | 고른 자리에 못 꽂는다 — 다른 노드를 고른다 | 없음 |
   *
   * **서버가 거절하는 갈래는 여기 없다.** 그것은 `commitOps`가 `true`를 낸 뒤의 일이고
   * (`use-edit-commit.tsx`의 `recover`), 그때는 재조회가 문서를 서버 상태로 놓고 선택도
   * `null`로 재설정한다 — 케이스가 그 값을 고정한다.
   *
   * **알림은 편집 실패와 같은 `role="alert"` 하나를 쓴다.** 자리를 나누면 그 하나뿐인
   * 통지 규칙이 흩어진다(`use-edit-commit.tsx`의 `skippedNotice`가 같은 판단을 적었다).
   */
  function addPattern(key: string, pattern: ThemePattern): void {
    setAdding(null)
    if (document === null) return

    const { expanded, issues } = expandPattern(pattern)
    if (expanded === null) {
      store.setEditFailure({
        kind: 'message',
        message: `${brokenPattern(pattern, key)} ${issues.map((entry) => entry.message).join(' / ')}`,
      })
      return
    }

    const attempt = patternInsert(document, selectedNodeId, expanded)
    if (attempt.insert === null) {
      store.setEditFailure({
        kind: 'message',
        message:
          attempt.reason === 'no-spot'
            ? NO_SPOT_NOTICE
            : `${brokenPattern(pattern, key)} ${attempt.issues
                .map((entry) => entry.message)
                .join(' / ')}`,
      })
      return
    }

    // **여기부터는 평범한 편집이다**(D4) — undo·낙관적 적용·경고 표시가 그대로 따라온다.
    if (commitOps(attempt.insert.ops)) store.selectNode(attempt.insert.selectId)
  }

  /**
   * 고른 프리셋을 놓는다(D3·D4·D5).
   *
   * **`addPattern`과 갈리는 것 셋.** 자리를 고르지 않고(페이지 통째다), 판정을 결과 문서
   * 전체로 하며(D5), **선택을 비울 수 있다** — 빈 프리셋은 놓을 노드가 없으므로 고를
   * 것도 없다(그때 선택을 그대로 두면 사라진 노드를 가리킨다).
   *
   * | 갈래 | 문장이 말하는 것 | 되돌리는 것 |
   * |---|---|---|
   * | `'no-root'` | 문서를 읽지 못했다 — 새로고침 | 없음(편집 0건) |
   * | `'invalid'` | 프리셋이 잘못됐다 — 프리셋을 고친다 | 없음(편집 0건) |
   * | 성공 | — | **undo 하나가 페이지 전체를 되돌린다** |
   *
   * **문장은 순수 함수가 만든다**(`presetFailureNotice`) — P7-1 이월 §3이 지목한
   * *"콜론 뒤가 빈 문장"*이 화면을 지나야만 도달해 케이스를 쓸 수 없었던 자리이고,
   * 그 이월이 제안한 방식이 이것이다.
   */
  function applyPreset(nodes: WbNode[]): void {
    setAdding(null)
    if (document === null) return

    const attempt = presetApply(document, nodes)
    if (attempt.apply === null) {
      store.setEditFailure({ kind: 'message', message: presetFailureNotice(attempt) })
      return
    }

    // **여기부터는 평범한 편집이다**(D3) — undo·낙관적 적용·경고 표시가 그대로 따라온다.
    if (commitOps(attempt.apply.ops)) store.selectNode(attempt.apply.selectId)
  }

  /** 선택 노드의 **마지막 자식**으로. `children`이 없으면 0이고 `insertNodeOps`가 배열째 만든다. */
  function insertInside(nodeId: string, node: ReturnType<typeof createNode>) {
    if (document === null || node === null) return null
    const parent = findNodeSafely(document.root, nodeId)
    return insertNodeOps(document, nodeId, parent?.children?.length ?? 0, node)
  }

  /** 선택 노드의 **다음 형제**로. `moveNodeOps`의 계약과 같은 자리 계산이다. */
  function insertAfter(nodeId: string, node: ReturnType<typeof createNode>) {
    if (document === null || node === null) return null
    const spot = nodeSpot(document, nodeId)
    if (spot === null) return null
    return insertNodeOps(document, spot.parentId, spot.index + 1, node)
  }

  /**
   * 선택 노드를 지운다. **지운 뒤 선택을 부모로 옮긴다**(D5).
   *
   * 옮기는 이유: `applyEdit`은 `selectedNodeId`를 건드리지 않으므로(P2b-2 이월 §4)
   * 툴바가 옮기지 않으면 선택이 **사라진 노드를 가리킨 채** 남는다 — 사용자는 트리에서
   * 자기 위치를 잃고 속성 패널이 "노드를 고르면 속성이 보입니다"로 되돌아간다.
   * `삭제 뒤 선택이 부모로 옮겨진다`가 그것을 잡는다.
   *
   * **부모 자리를 편집 전 문서에서 먼저 읽는다.** 지운 뒤에는 그 노드가 없어 `nodeSpot`이
   * `null`이다.
   *
   * **`commitOps`의 반환값을 보는 것은 지금 0 사망이다 — 재 봤다.** 무조건 옮기도록
   * 바꿔도 `--project web` 전량이 통과한다. 덮고 있는 것 둘:
   *
   * - **로컬 실패 경로에 닿지 못한다.** `commitOps`가 `false`를 내는 세 조건 중 열린
   *   페이지 대조는 위의 `document === null`이, 없는 노드는 `nodeSpot`이 먼저 잡는다.
   *   남는 것은 `applyEdit`이 던지는 경우인데 `removeNodeOps`가 만든 경로로는 던지지
   *   않는다.
   * - **서버 실패 경로에서는 두 구현이 같은 값을 낸다.** 앞 판은 여기에 *"선택이 어차피
   *   지워진다 — 409 뒤 재조회의 `loadPage`가 선택까지 재설정하므로 그 시점의 선택은
   *   부모가 아니라 `null`이다"*라고 적었는데, **그 문장이 낡았다:** `loadPage`는 같은
   *   페이지를 다시 싣는 경로에서 선택을 건드리지 않는다(`store/editor-store.ts`의
   *   `#selectionFor`). 그래서 실패 뒤 선택은 **부모 그대로**이고, 그것은 무조건 옮기는
   *   구현이 내는 값과 같다 — 가르지 못하는 것은 그대로다.
   *   `편집이 실패해도 툴바가 옮긴 선택은 남는다 — 두 경로가 갈리지 않는다`가 그 값을
   *   고정한다.
   *
   * **그때 적은 예측("Task 7이 하중을 준다")은 빗나갔다** — Task 7에서 재보니 그쪽도
   * 0 사망이다(`addNode`의 주석에 이유를 적었다). 남기는 근거는 예측이 아니라
   * `routes/editor.tsx`의 `ready` 게이트와 같은 것이다: 지금 통과하는 이유가 위의
   * 성질이 지켜지고 있어서이므로, 그것이 깨지는 날 이 검사가 마지막 방벽이다.
   */
  function removeSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    if (commitOps(removeNodeOps(document, selectedNodeId))) {
      store.selectNode(spot.parentId)
    }
  }

  /**
   * 형제 사이에서 한 칸 옮긴다. `delta`가 -1이면 위로, +1이면 아래로다.
   *
   * **`index + delta`가 그대로 목적지인 것은 웨이브 1이 잰 계약 덕분이다** —
   * `moveNodeOps`의 `index`는 *결과* 배열에서의 자리이고(`[A,B,C]`에서 A를 2로 주면
   * `[B,C,A]`), 그래서 방향에 따라 보정을 나눌 필요가 없다.
   *
   * **선택은 손대지 않는다.** 노드 id가 그대로라 선택이 저절로 따라간다.
   */
  function moveSelected(delta: number): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    commitOps(moveNodeOps(document, selectedNodeId, spot.parentId, spot.index + delta))
  }

  /**
   * 한 단계 안으로 — **앞 형제의 마지막 자식**이 된다(D3).
   *
   * 목적지 인덱스가 앞 형제의 `children` 길이인 것은 그 배열이 **소스를 빼는 것과
   * 무관하기 때문이다.** 노드는 부모의 배열에서 빠지고 앞 형제의 배열로 들어가므로,
   * 웨이브 1이 잰 "값을 뺀 뒤 기준"이 여기서는 뺀 것과 같은 값을 낸다.
   *
   * **앞 형제에 `children` 키가 없으면 `moveNodeOps`가 배열을 먼저 만든다**(웨이브 1의
   * 두 op 갈래). 여기서 그것을 다시 다루지 않는다 — 빈 컨테이너로 들여쓰는 흔한 경로가
   * 그 갈래를 탄다(`앞 형제에 children 키가 없으면 배열을 먼저 만든다`).
   */
  function indentSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    const parent = findNodeSafely(document.root, spot.parentId)
    // **첫 형제는 여기서 걸린다** — 인덱스 0의 앞은 `-1`이고 그 자리는 비어 있다
    // (`noUncheckedIndexedAccess`가 그것을 타입으로도 말해 준다). `spot.index === 0`을
    // 따로 두지 않는 것은 그 검사가 0 사망이었기 때문이다.
    //
    // **다만 "이 줄이 덮는다"는 반쪽이었다 — 리뷰가 잡았고 재현했다.** 논리로는 덮지만
    // **이 줄 자체도 0 사망**이다: 첫 형제에서는 버튼이 비활성이라 클릭이 오지 않고,
    // 단축키는 `structureAbilities.indent`를 먼저 지난다. 둘 다 `disabled`/판정이 덮고
    // 있고, 여기 남은 것은 그 둘이 벗겨졌을 때의 `TypeError` 방벽이다.
    const previous = parent?.children?.[spot.index - 1]
    if (previous === undefined) return

    // **앞 형제의 `children`이 배열인지 여기서 보지 않는다.** `structureAbilities`의
    // `indent`가 `acceptsChildren`으로 이미 거르므로(배열도 `undefined`도 아니면 `false`)
    // 그런 앞 형제에서는 버튼이 비활성이다. 겹으로 두면 판정이 두 곳에 생기고 — 그것이
    // D3이 막으려는 것이다 — 실제로 0 사망이었다(재 봤다).
    commitOps(moveNodeOps(document, selectedNodeId, previous.id, previous.children?.length ?? 0))
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다(D3).
   *
   * 부모의 자리를 `nodeSpot`으로 한 번 더 읽는다. 그것이 `null`이면 부모가 루트라
   * 나갈 곳이 없다 — `structureAbilities`의 `outdent`와 같은 판정이지만, 여기서는
   * 조부모 id와 부모 인덱스가 **필요해서** 부른다.
   *
   * **그 `null` 검사는 지금 0 사망이다 — 재 봤다.** 부모가 루트면 버튼이 이미 비활성이라
   * 클릭이 핸들러에 닿지 않는다. 벗겨지는 때가 온다: **Task 8의 키보드 단축키는 버튼을
   * 지나지 않으므로**(D8 케이스 5가 "단축키가 비활성 조작을 실행하지 않는다"를 요구한다)
   * 그때 이 검사가 마지막 방벽이다. **그것은 계획을 읽은 것이지 잰 것이 아니다.**
   *
   * 목적지가 `부모 인덱스 + 1`인 것도 소스를 빼는 것과 무관하다 — 노드는 부모의 배열
   * 안에 있으므로 조부모의 배열은 그대로다.
   */
  function outdentSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    const parentSpot = nodeSpot(document, spot.parentId)
    if (parentSpot === null) return

    commitOps(
      moveNodeOps(document, selectedNodeId, parentSpot.parentId, parentSpot.index + 1),
    )
  }

  return {
    abilities,
    // **루트인지는 id로 본다.** 판정을 다시 하지 않는다 — `structureAbilities`가 이미
    // 지나간 순회를 한 벌 더 돌면 둘이 갈릴 수 있다(`./toolbar-status.ts` 머리말).
    status: structureStatus({
      selectedNodeId,
      isRoot: document !== null && selectedNodeId !== null && document.root?.id === selectedNodeId,
      lock: props.selectedLock ?? null,
      abilities,
    }),
    remove: removeSelected,
    moveUp: () => moveSelected(-1),
    moveDown: () => moveSelected(1),
    indent: indentSelected,
    outdent: outdentSelected,
    openAdd: setAdding,
    adding,
    pick: addNode,
    pickPattern: addPattern,
    applyPreset,
    cancelAdd: () => setAdding(null),
  }
}

/**
 * *"이 패턴을 못 쓴다"*의 머리말. **패턴 이름과 키를 둘 다 말한다** — 이름은 사용자가
 * 목록에서 본 것이고, 키는 테마 JSON에서 그 자리를 찾을 때 필요하다(§6.10의 저작 화면).
 *
 * **구분자를 두는 것은 뒤에 붙는 이슈 문장이 마침표로 끝나지 않기 때문이다** —
 * `use-edit-commit.tsx`가 서버 문장에 대해 잰 것과 같은 부류다.
 */
function brokenPattern(pattern: ThemePattern, key: string): string {
  return `패턴을 꽂지 못했습니다 — ${pattern.name}(${key}). 테마의 패턴을 고쳐야 합니다:`
}

/**
 * 자리를 못 찾은 갈래. **위 문장과 갈라 적는 것이 D9다** — 이쪽은 테마가 아니라 **고른
 * 자리**의 문제이므로 사용자가 할 일이 다르다.
 */
const NO_SPOT_NOTICE = '고른 자리에는 패턴을 꽂을 수 없습니다. 다른 노드를 고르세요.'

/**
 * 툴바. **판정도 조작도 갖지 않는다** — `useStructureCommands`가 준 것을 그릴 뿐이다.
 *
 * **`projectId`를 받는 것은 패턴 고르개 때문이다**(D8). 패턴은 테마가 소유하므로
 * (§11.1) 목록을 만들려면 그 프로젝트의 테마를 읽어야 하고, 그 조회는 고르개가 열렸을
 * 때만 일어난다 — `PatternPicker`가 닫혀 있을 때 DOM에 없기 때문이다.
 */
export function StructureToolbar(props: {
  commands: StructureCommands
  projectId: string
  /** 코멘트 수를 세는 대상(D6). 프리셋 고르개가 쓴다. */
  pageId: string | undefined
  /**
   * 지금 페이지의 root `children`(D7). *"현재 페이지를 프리셋으로 저장"*이 담는 것이고,
   * **문서 봉투가 아니다**(D3). 문서를 못 읽었으면 `null`이다.
   *
   * **툴바가 문서를 다시 읽지 않고 받는다** — 트리가 이미 스토어에서 읽어 그리고 있고,
   * 여기서 또 읽으면 같은 값을 두 번 구독한다.
   */
  currentNodes: readonly WbNode[] | null
}): ReactElement {
  const { commands } = props
  const { abilities } = commands
  /**
   * 상태줄의 id. **`aria-describedby`가 그것을 가리킨다** — `useId`인 것은 이 툴바가 한
   * 화면에 둘 이상 그려져도 id가 겹치지 않게 하기 위해서다(React가 렌더 트리마다 다른
   * 값을 준다).
   */
  const statusId = useId()
  /**
   * **할 말이 없으면 가리키지 않는다.** 빈 요소를 가리키면 설명이 비어 있는 것이 아니라
   * *"설명이 있다"*는 관계만 남고, 그것을 읽는 도구마다 다르게 다룬다.
   */
  const describedBy = commands.status === '' ? undefined : statusId

  return (
    <div className="wb-shell-structure-toolbar" role="group" aria-label="구조 편집">
      <ToolButton
        label="안에 추가"
        ability="addInside"
        abilities={abilities}
        describedBy={describedBy}
        onClick={() => commands.openAdd('inside')}
      />
      <ToolButton
        label="아래 추가"
        ability="addAfter"
        abilities={abilities}
        describedBy={describedBy}
        onClick={() => commands.openAdd('after')}
      />
      <ToolButton
        label="삭제"
        ability="remove"
        abilities={abilities}
        describedBy={describedBy}
        onClick={commands.remove}
      />
      <ToolButton
        label="위로"
        ability="moveUp"
        abilities={abilities}
        describedBy={describedBy}
        onClick={commands.moveUp}
      />
      <ToolButton
        label="아래로"
        ability="moveDown"
        abilities={abilities}
        describedBy={describedBy}
        onClick={commands.moveDown}
      />
      <ToolButton
        label="들여쓰기"
        ability="indent"
        abilities={abilities}
        describedBy={describedBy}
        onClick={commands.indent}
      />
      <ToolButton
        label="내어쓰기"
        ability="outdent"
        abilities={abilities}
        describedBy={describedBy}
        onClick={commands.outdent}
      />
      {/* **패턴은 `ToolButton`이 아니다.** 그 버튼은 `StructureAbilities`의 키 하나에
          묶여 있는데(비활성 여부와 이유가 같은 곳에서 나온다), 패턴 넣기는 **선택이
          없어도 할 수 있다**(D5 — 선택이 없으면 root의 자식 끝). 판정이 없으므로 걸
          `ability`도 없다. 패턴이 0개인 테마에서도 활성인 것은 D7이다 — *"없다"*를
          보여 주는 것이 회색 버튼보다 낫다. */}
      <button
        type="button"
        className="wb-shell-structure-tool"
        onClick={() => commands.openAdd('pattern')}
      >
        패턴 넣기
      </button>
      {/* **프리셋도 `ToolButton`이 아니다 — 패턴과 같은 이유다.** 선택이 없어도 할 수
          있고(페이지 통째라 자리를 고르지 않는다) 판정이 없으므로 걸 `ability`가 없다.
          그 성질이 단축키 쪽에도 그대로 걸린다(`structure-tree.tsx`의 `ability: null`). */}
      <button
        type="button"
        className="wb-shell-structure-tool"
        onClick={() => commands.openAdd('preset')}
      >
        프리셋
      </button>
      {/* **상태줄.** 버튼 **뒤**에 있는 것이 의도다 — 훑어 읽는 순서가 화면 순서와 같아야
          하고(`role="group"` 안이라 보조 기술도 이 순서로 지난다), 눈으로는 이 줄이 방금
          본 회색 버튼들의 이유로 읽힌다.

          **`role="alert"`도 `aria-live`도 아니다.** 이 셸의 알림 자리는 `EditAlert` 하나이고
          (`shell/edit-alert.tsx`), 실패가 아닌 것에 그 채널을 쓰면 그 하나뿐인 규칙이 흩어진다.
          `aria-live`를 걸지 않은 것은 더 센 이유다 — **선택을 옮길 때마다 읽히면 트리 탐색이
          불가능해진다.** 대신 위 버튼들이 `aria-describedby`로 이 줄을 가리킨다: 그러면
          **포커스가 그 버튼에 닿을 때 한 번** 읽히고, 그 시점은 사용자가 그 조작을 하려는
          바로 그때다.

          **글자가 없어도 요소는 남는다** — 자리를 지키는 것은 CSS의 `min-height`이고
          (`shell.css`), 그러지 않으면 상태가 바뀔 때마다 툴바 높이가 달라져 트리가 튄다. */}
      <p className="wb-shell-structure-status" id={statusId}>
        {commands.status}
      </p>
      {/* 목록은 툴바 **안**에 있다 — 조작 묶음과 같은 자리라야 어느 노드에 붙는
          작업인지가 보인다. 닫혀 있을 때는 DOM에 없다: 남겨 두면 Tab 순서에 정지점이
          그대로 남는다. */}
      {(commands.adding === 'inside' || commands.adding === 'after') && (
        <TypePicker onPick={commands.pick} onCancel={commands.cancelAdd} />
      )}
      {commands.adding === 'pattern' && (
        <PatternPicker
          projectId={props.projectId}
          onPick={commands.pickPattern}
          onCancel={commands.cancelAdd}
        />
      )}
      {commands.adding === 'preset' && (
        <PresetPicker
          projectId={props.projectId}
          pageId={props.pageId}
          currentNodes={props.currentNodes}
          onApply={commands.applyPreset}
          onCancel={commands.cancelAdd}
        />
      )}
    </div>
  )
}

/**
 * 버튼 하나. **비활성 여부와 그 이유가 같은 하나(`ability`)에서 나온다** — 둘을 따로
 * 넘기면 어긋나는 자리가 생긴다(선택 표시가 `aria-current` 하나에서 갈라져 나오는 것과
 * 같은 방식).
 */
function ToolButton(props: {
  label: string
  ability: keyof StructureAbilities
  abilities: StructureAbilities
  /**
   * 상태줄의 id. **활성·비활성 가릴 것 없이 건다** — 비활성 버튼에 걸린 것은 포커스가
   * 가지 않아 조용하지만, 활성 버튼에 걸린 것이 **키보드 사용자가 그 문장에 닿는 유일한
   * 길**이다(비활성 버튼은 탭 순서에서 빠진다).
   *
   * 할 말이 없으면 `undefined`다 — 부르는 쪽이 정한다.
   */
  describedBy?: string
  onClick: () => void
}): ReactElement {
  const enabled = props.abilities[props.ability]

  return (
    <button
      type="button"
      className="wb-shell-structure-tool"
      disabled={!enabled}
      // 활성일 때 설명을 남기지 않는다 — 버튼 이름과 겹쳐 읽힌다.
      title={enabled ? '' : WHY_DISABLED[props.ability]}
      aria-describedby={props.describedBy}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}
