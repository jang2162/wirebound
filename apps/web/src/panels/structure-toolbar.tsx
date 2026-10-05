/**
 * 구조 트리의 **조작 묶음**(`useStructureCommands`)과 **고르개 자리**(`StructurePicker`). 조작의 입구는 트리 줄의 `+` · `…`
 * (`panels/tree-row-actions.tsx`) · 트리 제목 줄의 뿌리 `+` · 끌어 놓기 · 키보드 단축키(에디터 단축키 `shell/editor-keys.tsx` · 트리 상자의
 * 고르개 단축키 `panels/structure-tree.tsx`의 `TREE_SHORTCUTS`)다 —
 * 전부 이 파일의 명령을 부른다. 파일 이름의 «툴바»는 그 입구들이 한 줄 툴바였던 자리의 이름이다.
 *
 * **조작이 두 부류다.**
 *
 * | 부류 | 무엇 | 판정 |
 * |---|---|---|
 * | 선택 노드 하나에 작동하는 것 | 추가·삭제·순서·계층 | `structureAbilities`가 정하고 항목의 끔이 따라간다 |
 * | **선택이 없어도 되는 것** | `패턴 넣기` · `프리셋` | **판정이 없다** — 걸 `ability`가 없어 `patternLocked` · `presetLocked`만 본다 |
 *
 * 뒤 부류가 판정을 갖지 않는 까닭은 각각 — 패턴은 선택이 없으면 root의 자식 끝에 꽂고,
 * 프리셋은 페이지 통째라 자리를 아예 고르지 않는다. 단축키 쪽도 같은 성질을 지나므로
 * 그 표에서 둘은 `StructureAbilities`가 아니라 `patternLocked`·`presetLocked`를 본다
 * (`panels/structure-tree.tsx`의 `TREE_SHORTCUTS`).
 *
 * **판정은 여기 없다.** 무엇을 할 수 있는지는 `edit/structure-actions.ts`의
 * `structureAbilities`가 정하고, 이 파일은 그 결과를 줄 행동에 넘길 뿐이다.
 * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재지고, 단축키가
 * 자기 조건을 따로 갖게 된다.
 *
 * **고르개에는 타이핑하는 칸이 있다**(프리셋 이름). 고르개는 트리 줄 아래 · 키 핸들러가 붙은 상자 안에 서므로, 거기서 난 키가
 * 구조 조작으로 새지 않게 하는 규칙이 그 상자에 있다 — `structure-tree.tsx`의 `isTypingSurface`이고, 그것이 없으면 이름 칸의
 * `Backspace`가 노드를 지운다.
 *
 * **이 파일은 오류 경계 밖이다** — 구조 트리와 같은 자리다(`panels/node-shape.ts`
 * 머리말). 던지면 셸 전체가 흰 화면이므로, 여기서 부르는 것들은 값으로 답해야 한다.
 *
 * **"깨진 문서에도 던지지 않는다"의 전제는 이것이다:** `structureAbilities`·`nodeSpot`·`ops`
 * 생성기 넷이 전부 `walkSafely`(`edit/safe-walk.ts`)를 지나고, 그것이 노드가 아닌 값을
 * 순회에서 뺀다. `@wirebound/schema`의 `walkNodes`를 여기서 다시 쓰면 그 전제가 깨진다 —
 * `children` 배열 안의 `null` 원소 같은 것에서 던진다.
 *
 * **완전하다고는 적지 않는다** — 잰 것은 그 반례 부류(배열 원소가 노드가 아닌 경우)와
 * 몇 가지 깨진 형태까지다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { NodeLock, WbNode } from '@wirebound/schema'
import { expandPattern, type ThemePattern } from '@wirebound/themes'
import { useEditCommit } from '../edit/use-edit-commit'
import { createNode } from '../edit/create-node'
import { aliasOps, insertNodeOps, moveNodeOps, removeNodeOps } from '../edit/ops'
import { patternInsert } from '../edit/pattern-insert'
import { presetApply, presetFailureNotice } from '../edit/preset-apply'
import { findNodeSafely } from '../edit/safe-walk'
import { nodeSpot, selectionAbilities, type StructureAbilities } from '../edit/structure-actions'
import { removeManyOps } from '../edit/paste-ops'
import type { StructureDrop } from '../edit/structure-drop'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { PatternPicker } from './pattern-picker'
import { PresetPicker } from './preset-picker'
import { TypePicker } from './type-picker'
import { lockedNotice } from './property-panel'
import { structureWhy, type StructureReasonInput, type StructureWhy } from './toolbar-status'

/**
 * 줄 행동(`+` · `…`) · 끌어 놓기와 키보드 단축키가 **공유하는** 조작 묶음.
 *
 * **입구들이 같은 함수를 부르는 것이 계약이다.** 각자 자기 구현을 가지면 한쪽만
 * 고쳐지는 자리가 생긴다 — `structure-keyboard.test.tsx`의 `단축키와 버튼이 같은 op을
 * 만든다`가 그것을 고정한다.
 *
 * 훅을 **한 번만** 부르는 것도 의도다. 트리가 불러 줄 행동에 내려 주므로 `useEditCommit`
 * 인스턴스가 하나다 — 둘이어도 «in-flight는 항상 하나»는 지켜지지만(펌프 가드가 스토어에 있다) 같은 화면에서
 * 굳이 둘을 만들 이유가 없다.
 */
export interface StructureCommands {
  abilities: StructureAbilities
  /**
   * `패턴 넣기`가 남의 잠금에 막혔는가.
   *
   * **`abilities`에 키를 만들지 않는다**(`panels/structure-tree.tsx`의
   * `TREE_SHORTCUTS` 주석) — `structureAbilities`는 선택이 없으면 `NOTHING`을 내는데 패턴은
   * **선택이 없어도 되는 조작**이라, 그 표에 넣으면 정확히 그 상태에서만 죽는다.
   *
   * **대신 «꽂힐 자리»의 잠금을 지난다.** 패턴이 꽂히는 자리는 고른 노드가 정하고
   * (`edit/pattern-insert.ts`의 `insertSpot`), 고른 것이 없으면 **루트의 자식 끝**이다.
   * 그래서 이 값은 선택이 있으면 `selectedLock`, 없으면 `pageLock`이다 — **일곱과 같은
   * 규칙이다**(*"고를 수 없는 자리는 바꿀 수 없다"*). 잠금을 지나지 않으면 잠긴 노드를 고른 채
   * 누를 때 `add …/children/2`가 나가 **423**을 받고, 낙관적 적용이 붙었다 사라지며
   * *"편집 1개가 취소됐습니다"*가 뜬다(실측) — `structureAbilities`가 없애려는 바로 그 모양이다.
   */
  patternLocked: boolean
  /**
   * `프리셋`이 남의 잠금에 막혔는가. **잠금이 하나라도 있으면 참이다**(`pageLock`).
   *
   * 패턴과 갈리는 이유: 프리셋의 op은 `replace /root/children` **하나**이고
   * (`edit/preset-apply.ts`) 그 포인터는 문서 안 모든 노드의 조상이다. 그래서 이 페이지에
   * 남의 잠금이 하나라도 살아 있으면 **언제나** 부딪친다 — 과차단이 아니라 서버 판정과
   * 같은 값이다(실측: `replace /root/children` → **423**).
   */
  presetLocked: boolean
  /**
   * 꺼진 항목마다의 이유 — 줄 행동이 꺼진 항목의 `title` · `aria-description`으로 싣는다(`./tree-row-actions.tsx`). 켜진 항목은 `undefined`다.
   *
   * **줄 행동이 아니라 여기서 짓는다** — 이유가 `abilities` 말고도 **선택 자체의 성질**(잠금 · 루트 · 개수)을 보는데, 그것은 스토어와 문서에서
   * 나오고 그것을 이미 든 자리가 여기다. 문안 자체는 `./toolbar-status.ts`가 갖는다(순수 함수 — 상태마다 무엇이 나오는지가 화면을 지나지 않고
   * 재진다).
   */
  why: StructureWhy
  /**
   * 고른 노드를 지운다. 지운 뒤 무엇을 고르는지는 부르는 쪽이 정한다 — 줄 `…` «삭제»는 부모(`'parent'` — 기본), 키보드 삭제 · 잘라내기는
   * 선택을 비운다(`'none'` — `shell/editor-keys.tsx` 머리말 «키보드 삭제는 선택을 비운다»).
   */
  remove: (selectAfter?: 'parent' | 'none') => void
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
   * 고른 패턴을 전개해 꽂는다. **자리 규칙과 검증은 `edit/pattern-insert.ts`가 갖는다** —
   * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재진다(판정을 `structureAbilities`에 두는 것과 같은 이유).
   */
  pickPattern: (key: string, pattern: ThemePattern) => void
  /**
   * 고른 프리셋을 놓는다. **자리 규칙이 없다** — 페이지 통째라 답이
   * *"어디에 꽂나"*가 아니라 *"무엇을 치우고 놓나"*다. 판정과 op 만들기는
   * `edit/preset-apply.ts`가 갖는다(`pickPattern`과 같은 이유).
   */
  applyPreset: (nodes: WbNode[]) => void
  cancelAdd: () => void
  /**
   * **끌어 놓은 자리로 옮긴다**(`edit/structure-drop.ts`의 `structureDropTarget`이 준 자리). 선택이 아니라 끈 노드에 대해 돈다 —
   * 끌기는 줄을 고르지 않는다(`drag/use-pointer-drag.ts` «끈 뒤의 클릭을 삼킨다»). 편집은 `moveNodeOps` 하나 — 위로 · 들여쓰기가
   * 내는 것과 같은 종류다(spec 「드래그로 옮기기」 — 드래그만의 새 편집 종류를 만들지 않는다).
   */
  dropTo: (nodeId: string, target: StructureDrop) => void
  /**
   * 별칭을 고칠 수 없는가 — 하나를 고르지 않았거나(여럿 · 없음) · 고른 노드가 문서에 없거나 · 남이 잡았다(`selectedLock`). 줄 `…`
   * «별칭 바꾸기»의 끔 · 더블클릭 · F2 가 같은 값을 지난다. `abilities`에 키를 두지 않는 까닭은 `patternLocked`와 같다 — 그 표는
   * 구조(자리)의 판정이고 별칭은 자리와 무관하다.
   */
  aliasLocked: boolean
  /**
   * 그 노드의 별칭을 바꾼다(`aliasOps` — 빈 값은 지움). 보내기 전에 서버의 2차 방어와 같은 물음(`editBlockedBy`)을 한 번 더 —
   * 입력을 연 뒤 도착한 남의 잠금이면 말하고 안 보낸다.
   */
  renameAlias: (nodeId: string, alias: string) => void
}

/**
 * 열려 있는 고르개. **넷이 한 상태에 있는 것이 의도다** — 고르개 둘이 동시에 열리면 좁은
 * 좌측 패널에 목록이 쌓이고 어느 쪽 버튼을 눌렀는지가 흐려진다(`openAdd`의 주석과 같은
 * 근거).
 */
export type OpenPicker = 'inside' | 'after' | 'pattern' | 'preset'

/**
 * **지금 그려도 되는 고르개.** 닫혀 있거나 **그 조작이 지금 막혔으면** `null`이다.
 *
 * # 왜 «열려 있는가»와 «그려도 되는가»를 가르나
 *
 * 고르개를 연 **뒤에** 조건이 바뀔 수 있다 — 남이 그 자리를 잠그는 것이 그 창이다.
 * 목록을 그대로 남겨 두면 사용자가 그 안의 `추가`를 눌러 편집을 내고, **회색으로 만든
 * 버튼을 우회한다.** 실측(패턴): 잠긴 노드를 고른 채 목록을 열어 두고 잠금이 도착한 뒤
 * 꽂으면 `add …/children/2`가 나가 **423**을 받고 낙관적 적용이 붙었다 사라진다.
 * **타입 고르개도 같은 값이다** — `안에 추가`로 연 뒤 잠금이 오면 목록이 남고,
 * 거기서 고르면 같은 포인터로 같은 423을 받는다.
 *
 * # 셋이 한 자리에 있는 것이 요점이다
 *
 * 조건은 고르개마다 다르다(아래 표). 그것을 렌더에 흩어 두면 **닫아야 할 창이 셋인데
 * 닫힌 것은 둘**인 상태가 생긴다. 여기 한 자리에 두면
 * 고르개가 늘 때 그 자리가 보인다.
 *
 * | 고르개 | 그려도 되는 조건 | 그 조건이 잠금을 어떻게 보나 |
 * |---|---|---|
 * | `'inside'` | `abilities.addInside` | `structureAbilities`가 잠금을 지난다 |
 * | `'after'` | `abilities.addAfter` | 같음 |
 * | `'pattern'` | `!patternLocked` | 꽂힐 자리의 잠금(고른 노드 · 없으면 루트) |
 * | `'preset'` | `!presetLocked` | 페이지에 남의 잠금이 하나라도 |
 *
 * # `adding`은 비우지 않는다 — 그리고 고르개 «안»은 **한 칸만** 살아남는다
 *
 * 조건이 풀리면 **어느 고르개가 열려 있었는지**가 그대로 돌아온다(`adding`을 비우지
 * 않는 것이 그것이다). **그 안에서 고르던 것은 대부분 안 돌아온다** — 조건이 거짓인 동안
 * 컴포넌트가 DOM에서 빠지므로 그 `useState`가 함께 사라진다. **예외가 하나 있다:
 * 프리셋 이름칸의 글자는 `StructureTree`가 들어서 살아남는다**(아래 «두 축»).
 *
 * **«잠깐 잠긴 사이에 사용자가 고르던 것을 잃지 않는다»고 적지 않는다 — 거짓이다.** 셋을 열어
 * 놓고 잠금을 오갔다 오게 해 재면(`test/lock/toolbar-abilities.test.tsx`가 이 표를 케이스로 든다):
 *
 * | 고르개 | 잠금 전 | 잠금이 풀린 뒤 |
 * |---|---|---|
 * | 타입 | `Flex`를 골랐다 · 설명 줄도 그 타입 | **`Grid`**(목록 첫 항목) · 설명 줄도 함께 되돌아간다 |
 * | 프리셋 | 이름칸에 `회원 목록 기본`을 쳤다 · `builtin:detail`을 골랐다 | **이름칸은 그대로 있다** · 고른 것은 **`builtin:search-list`**(첫 항목) |
 * | 패턴 | — | 잰 테마의 패턴이 하나뿐이라 갈리는 값이 안 나온다 |
 *
 * **이름칸을 트리가 들지 않으면 표의 가운뎃줄이 *"이름칸이 빈다"*가 된다.** 사용자가 «친» 글자가
 * 사라지는 것이 셋 중 가장 나쁜 손실이다.
 *
 * # 두 축을 가른다 — **친 글자는 살리고, 고른 것은 되돌아간다**
 *
 * 1. **이름칸은 살린다.** 그 문자열 하나만 `StructureTree`가 들고 `PresetPicker`에
 *    내려 준다(고르개가 빠져 있는 동안에도 트리는 그대로 마운트돼 있다).
 *
 *    **근거: 친 글자는 사용자 자신의 것이고 문서와 무관해 낡을 수가 없다.** 아래 «쓰지
 *    않는 근거»가 말하는 «낡는다»가 이 축에는 아예 성립하지 않는다. 그리고 **비용이 없다** —
 *    뷰 컴포넌트가 문자열 하나를 드는 것이라 **명령 층은 폼을 안 들고**, 목록은 그대로
 *    DOM에서 빠지므로 **위 «왜 가르나»의 우회로(목록으로 회색 버튼을 우회)도 안 열린다.**
 *    실패 방향이 안 바뀐다(그 케이스의 `expect(view.calls).toEqual([])`가 그대로 참이다).
 * 2. **«타입»과 «고른 프리셋»은 되돌아간다 — 그대로 둔다.** 그 둘은 사용자가 친 것이
 *    아니라 **«지금 꽂을 수 있는 것»에서 고른 것**이고, 잠금이 오간 뒤 그 목록이 같다는
 *    보장이 없다. 초기값으로 돌아가는 것이 방어 가능한 실패다. 그리고 이쪽은 **싼 길이
 *    실증되지 않았다** — 살리려면 목록을 DOM에 남기거나(위 우회로) 고르개의
 *    상태를 더 들어야 한다. 값이 작고 위험이 크다.
 *
 * # 축 2를 살리지 않는 근거 — **길은 둘이 아니라 셋이다**
 *
 * *"상태를 살리는 길은 둘인데 하나는 위 우회로를 다시 열고 다른 하나는 명령 층이 폼을 들게
 * 된다"*는 틀은 **셋째 길**(위 1번)을 빠뜨린다. *"안전한 실패를 안전하지 않은 실패로 바꾼다"*는
 * 진단은 **그 길에는 해당하지 않는다.**
 *
 * 그래서 아래 근거는 **축 2에 대해서만** 선다:
 *
 * 1. **실패 방향을 바꾸게 된다.** 지금 잃는 것은 «고르던 자리»뿐이고 **틀린 편집은 한
 *    건도 안 나간다**(그것이 이 함수가 존재하는 이유다 — 위의 실측 423). 축 2를 살리는
 *    길은 목록을 DOM에 남기거나 고르개의 상태를 끌어올리는 것인데, 앞엣것은 위
 *    우회로를 다시 연다. **안전한 실패를 고치려다 안전하지 않은 실패가 가능한 설계로
 *    바꾸지 않는다.**
 * 2. 이 창은 **남이 내 편집 자리를 잡았다 놓는 동안**만 열린다.
 *
 * # 쓰지 않는 근거 — **«잠금이 풀렸으면 고르던 것이 낡는다»는 전제가 거짓이다**
 *
 * *"잠금이 풀렸다는 것은 남이 그 사이에 **편집을 끝냈다**는 뜻이라 프리셋의 덮어쓰기 확인 수와
 * 고른 자리의 카탈로그 제약이 낡는다"*는 잃는 것을 정당화하는 근거로 쓰지 않는다.
 *
 * **잠금은 «편집»이 아니라 «선택»으로 잡힌다.** `realtime/use-node-lock.ts`의 이펙트가
 * `selectedNodeId`가 바뀔 때마다 `channel.hold(pageId, holdId)`를 보낸다 — 남이 노드를
 * 눌러 보고 다른 데를 누르면 **편집 0건으로 잠금이 오갔다 온다.** 그 판에서는 낡는 것이
 * 하나도 없다. **`test/lock/toolbar-abilities.test.tsx`의 두 케이스가 정확히 그 판이다**
 * (`view.lock([foreign]) → view.lock([])`, 문서는 한 바이트도 안 바뀐다).
 *
 * 편집이 실제로 있었던 판에서 그 말이 참인 것은 맞지만, **잃는 것을 정당화하는 근거로는
 * 서지 않는다.** 낡을 수 있는 것은 «고른 자리»(카탈로그 제약)와 «확인 수»뿐인데 둘 다
 * 눈앞의 목록에서 다시 고르면 되고, 확인 수는 고르개가 다시 뜰 때 어차피 새로 조회된다.
 * 그리고 **가장 나쁜 손실인 «친 글자»는 문서와 무관해 어느 판에서도 안 낡는다.**
 *
 * 판단은 앞 절의 두 근거만으로 선다.
 *
 * `test/lock/toolbar-abilities.test.tsx`가 위 표를 케이스로 든다 — **축 둘이 각각 한
 * 케이스다.** 판단이 바뀌면 그 케이스와 이 절을 함께 고쳐야 한다.
 *
 * **판정을 새로 짓지 않는다** — 넷 다 `useStructureCommands`가 이미 낸 값을 읽을 뿐이다.
 */
export function visiblePicker(commands: StructureCommands): OpenPicker | null {
  switch (commands.adding) {
    case 'inside':
      return commands.abilities.addInside ? 'inside' : null
    case 'after':
      return commands.abilities.addAfter ? 'after' : null
    case 'pattern':
      return commands.patternLocked ? null : 'pattern'
    case 'preset':
      return commands.presetLocked ? null : 'preset'
    default:
      return null
  }
}

export function useStructureCommands(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 고른 노드를 막는 **남의** 잠금(`store.lockedBy`가 낸 것). 없으면 `null`이다.
   *
   * **두 곳이 이 값을 쓴다.** 판정이 이것으로 꺼지고(`structureAbilities`의 셋째 인자 —
   * 그쪽 머리말에 왜 «전부» 꺼지는지와 실측이 있다), 꺼진 항목의 이유가 차례 맨 위에서 그
   * 잠금을 말한다(`./toolbar-status.ts`). **판정을 끄는 자리가 여기인 것이 요점이다** — 툴바
   * 컴포넌트에서 `disabled`를 겹치면 단축키가 안 막힌다(에디터 단축키 `shell/editor-keys.tsx`는
   * `commands.abilities`를 지난다).
   *
   * **여기서 구독하지 않고 받는다.** 스토어의 잠금 목록을 손에 쥐는 자리는 화면에 **하나**여야
   * 하고(`test/lock/one-verdict.test.ts` — *"셋째 판정은 여기서 먼저 보인다"*), 그 하나는
   * `store/use-locked-by.ts`다(속성 패널도 잠금을 봐야 하므로 형제 둘 중 하나인 `StructureTree`에
   * 둘 수 없다 — 그 사정은 그 파일이 갖는다).
   * `StructureTree`가 그 훅으로 받은 값을 트리 줄의 배지·비활성과 여기에 함께 내려 주므로,
   * 같은 값을 여기서 또 구독하면 자리만 늘고 얻는 것이 없다. **판정은 어느 쪽도 하지
   * 않는다** — 양쪽 다 스토어의 `lockedBy`를 지난 값을 든다.
   *
   * **선택 인자가 아니다.** 빠뜨리면 잠긴 자리에서 도구가 다시 살아나는데, 그것은 조용히
   * 지나가는 부류의 누락이다.
   */
  selectedLock: NodeLock | null
  /**
   * **이 페이지에 남의 잠금이 하나라도 있는가** — `store.lockedBy(document.root.id)`가 낸
   * 값이다. 루트는 문서 안 모든 노드의 조상이므로 그 물음이 곧 *"살아 있는 남의 잠금이
   * 있나"*이고, **판정을 새로 짓지 않고** 같은 `lockedBy` 한 벌로 답한다.
   *
   * 이것을 쓰는 것은 판정 밖의 둘뿐이다 — `프리셋`은 언제나, `패턴 넣기`는 **고른 것이
   * 없을 때**(그때 꽂힐 자리의 부모가 루트다). 일곱은 `selectedLock`만 본다.
   */
  pageLock: NodeLock | null
}): StructureCommands {
  const store = useEditorStoreInstance()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 본다
  // (`store/use-editor-store.tsx`가 그 대조를 갖는 유일한 자리다).
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를
  // 주는데, 그 값은 어느 페이지 id와도 같지 않아 `commitOps`가 그 자리에서 돌아온다
  // (속성 패널과 같은 관례).
  //
  // **다만 이 갈래는 지금 도달하지 않는다 — 소스로 확인한다.**
  // `StructureTree`가 `doc === null`이면 툴바를 아예 그리지 않고, 문서가 있다는 것은
  // `useOpenDocument`가 주소와 대조를 통과했다는 뜻이라 `pageId`가 있다. 속성 패널은
  // 그 게이트가 없어 실제로 이 갈래를 지난다 — 관례를 맞춘 것이지 여기서 쓰이는 것이
  // 아니다.
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })

  /**
   * **여럿을 고른 판은 고른 것 전부를 본다**(`selectionAbilities`) — 기준 노드 밖의 잠금은 고른 노드마다 스토어의 `lockedBy`를 묻는다(판정은
   * 스토어가 한다 — 목록을 손에 쥐지 않는다). 다시 그리는 것은 부르는 쪽의 잠금 구독(`useLockedBy`)이 한다.
   */
  const many = selectedNodeIds.length > 1
  const otherLock = many ? (selectedNodeIds.map((id) => store.lockedBy(id)).find((lock) => lock !== null) ?? null) : null
  const removable = many && document !== null && removeManyOps(document, selectedNodeIds) !== null
  const abilities = selectionAbilities(document, selectedNodeIds, selectedNodeId, props.selectedLock, otherLock !== null, removable)
  // **판정 밖의 둘도 잠금을 지난다.** 어느 잠금을 지나는지는 각각의 필드 주석에 있다 —
  // 여기서 하는 것은 고르기뿐이고 판정은 스토어의 `lockedBy`가 이미 했다.
  const patternLock = selectedNodeId === null ? props.pageLock : props.selectedLock
  const patternLocked = patternLock !== null
  const presetLocked = props.pageLock !== null
  /** 고르개가 열려 있으면 무엇을 고르는 중인지. 닫혀 있으면 `null`이다. */
  const [adding, setAdding] = useState<OpenPicker | null>(null)

  /**
   * **선택이 비면 고른 노드 곁의 고르개(`'inside'` · `'after'`)를 걷는다.** 그 둘은 고른 노드에 매여(`visiblePicker` — `abilities` 가 선택을
   * 본다) 선택이 비면 감춰질 뿐이라, 걷지 않으면 다음에 고른 노드 곁에 다시 선다(Chrome — 트리 줄의 Escape · 키보드 삭제가 선택을 비운 판).
   * 잠금으로 꺼진 판은 걷지 않는다(위 `visiblePicker` 머리말 «`adding`은 비우지 않는다») — 그쪽은 같은 노드가 다시 풀리는 판이다. 패턴 ·
   * 프리셋은 고른 것 없이도 서므로 남긴다.
   */
  useEffect(() => {
    if (selectedNodeId === null) setAdding((open) => (open === 'inside' || open === 'after' ? null : open))
  }, [selectedNodeId])

  /**
   * 고른 타입으로 새 노드를 만들어 넣는다. 편집이 실제로 들어갔을 때만 선택을 옮긴다.
   *
   * **이 반환값 검사는 지워도 죽는 케이스가 없다.** 무조건 옮기도록 바꿔도 이 파일의 케이스가
   * 하나도 죽지 않는다. 앞의 가드들이 여전히 덮기 때문이다: `createNode`가 받는 타입은
   * **목록이 카탈로그에서 만든 것**이라 `null`이 될 수 없고, `insertNodeOps`가 받는
   * 부모·인덱스는 `structureAbilities`·`nodeSpot`을 지난 값이다.
   *
   * 그래도 남긴다. `routes/editor.tsx`의 `ready` 게이트와 같은 자리다 — **지금 통과하는
   * 이유가 "위의 성질이 지켜지고 있어서"이므로**, 그 성질이 깨지는 날 이것이 마지막
   * 방벽이다. **닫는 케이스를 만들 수 없다**: 화면에서 `commitOps`를 `false`로 만들려면
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
   * 고른 패턴을 전개해 꽂는다.
   *
   * **실패 갈래가 셋이고 각각 다른 것을 말한다** — *"패턴이 잘못됐다"*와
   * *"내가 잘못 눌렀다"*를 가른다. 어느 갈래에서도 **편집을 만들지 않으므로 되돌릴
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
   * 통지 규칙이 흩어진다(`use-edit-commit.tsx`의 `skippedNotice`가 같은 판단을 적는다).
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

    // **여기부터는 평범한 편집이다** — undo·낙관적 적용·경고 표시가 그대로 따라온다.
    if (commitOps(attempt.insert.ops)) store.selectNode(attempt.insert.selectId)
  }

  /**
   * 고른 프리셋을 놓는다.
   *
   * **`addPattern`과 갈리는 것 셋.** 자리를 고르지 않고(페이지 통째다), 판정을 결과 문서
   * 전체로 하며, **선택을 비울 수 있다** — 빈 프리셋은 놓을 노드가 없으므로 고를
   * 것도 없다(그때 선택을 그대로 두면 사라진 노드를 가리킨다).
   *
   * | 갈래 | 문장이 말하는 것 | 되돌리는 것 |
   * |---|---|---|
   * | `'no-root'` | 문서를 읽지 못했다 — 새로고침 | 없음(편집 0건) |
   * | `'invalid'` | 프리셋이 잘못됐다 — 프리셋을 고친다 | 없음(편집 0건) |
   * | 성공 | — | **undo 하나가 페이지 전체를 되돌린다** |
   *
   * **문장은 순수 함수가 만든다**(`presetFailureNotice`) — 컴포넌트 안에서 만들면
   * *"콜론 뒤가 빈 문장"* 같은 결함이 화면을 지나야만 도달해 케이스를 쓸 수 없다.
   */
  function applyPreset(nodes: WbNode[]): void {
    setAdding(null)
    if (document === null) return

    const attempt = presetApply(document, nodes)
    if (attempt.apply === null) {
      store.setEditFailure({ kind: 'message', message: presetFailureNotice(attempt) })
      return
    }

    // **여기부터는 평범한 편집이다** — undo·낙관적 적용·경고 표시가 그대로 따라온다.
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
   * 선택 노드를 지운다. **지운 뒤 선택을 부모로 옮긴다**(`selectAfter` 가 `'none'` 이면 비운다 — `StructureCommands.remove`).
   *
   * 옮기는 이유: `applyEdit`은 `selectedNodeId`를 건드리지 않으므로
   * 툴바가 옮기지 않으면 선택이 **사라진 노드를 가리킨 채** 남는다 — 사용자는 트리에서
   * 자기 위치를 잃고 속성 패널이 "노드를 고르면 속성이 보입니다"로 되돌아간다.
   * `삭제 뒤 선택이 부모로 옮겨진다`가 그것을 잡는다.
   *
   * **부모 자리를 편집 전 문서에서 먼저 읽는다.** 지운 뒤에는 그 노드가 없어 `nodeSpot`이
   * `null`이다.
   *
   * **`commitOps`의 반환값을 보는 검사는 지워도 죽는 케이스가 없다.** 무조건 옮기도록
   * 바꿔도 `--project web` 전량이 통과한다. 덮고 있는 것 둘:
   *
   * - **로컬 실패 경로에 닿지 못한다.** `commitOps`가 `false`를 내는 세 조건 중 열린
   *   페이지 대조는 위의 `document === null`이, 없는 노드는 `nodeSpot`이 먼저 잡는다.
   *   남는 것은 `applyEdit`이 던지는 경우인데 `removeNodeOps`가 만든 경로로는 던지지
   *   않는다.
   * - **서버 실패 경로에서는 두 구현이 같은 값을 낸다.** *"선택이 어차피 지워진다 —
   *   409 뒤 재조회의 `loadPage`가 선택까지 재설정하므로 그 시점의 선택은 부모가 아니라
   *   `null`이다"*가 아니다: `loadPage`는 같은
   *   페이지를 다시 싣는 경로에서 선택을 건드리지 않는다(`store/editor-store.ts`의
   *   `#selectionFor`). 그래서 실패 뒤 선택은 **부모 그대로**이고, 그것은 무조건 옮기는
   *   구현이 내는 값과 같다 — 가르지 못하는 것은 그대로다.
   *   `편집이 실패해도 툴바가 옮긴 선택은 남는다 — 두 경로가 갈리지 않는다`가 그 값을
   *   고정한다.
   *
   * `addNode`의 같은 검사도 지워도 죽는 케이스가 없다(이유는 그 주석). 남기는 근거는
   * `routes/editor.tsx`의 `ready` 게이트와 같은 것이다: 지금 통과하는 이유가 위의
   * 성질이 지켜지고 있어서이므로, 그것이 깨지는 날 이 검사가 마지막 방벽이다.
   */
  function removeSelected(selectAfter: 'parent' | 'none' = 'parent'): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    // **여럿이면 고른 것 전부를 묶음 하나로**(`removeManyOps` — 편집 하나 · 되돌리기 하나). 줄 `…` «삭제»는 기준 노드의 부모를 고른다.
    // 남의 잠금은 판정(`abilities.remove`)이 이미 껐다 — 그래도 보내기 전에 서버와 같은 물음을 한 번 더 묻는다(`editBlockedBy`).
    if (selectedNodeIds.length > 1) {
      const ops = removeManyOps(document, selectedNodeIds)
      if (ops === null || store.editBlockedBy(ops) !== null) return
      if (commitOps(ops)) store.selectNode(selectAfter === 'parent' ? spot.parentId : null)
      return
    }

    if (commitOps(removeNodeOps(document, selectedNodeId))) {
      store.selectNode(selectAfter === 'parent' ? spot.parentId : null)
    }
  }

  /**
   * 형제 사이에서 한 칸 옮긴다. `delta`가 -1이면 위로, +1이면 아래로다.
   *
   * **`index + delta`가 그대로 목적지인 것은 `moveNodeOps`의 계약 덕분이다** —
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
   * 한 단계 안으로 — **앞 형제의 마지막 자식**이 된다.
   *
   * 목적지 인덱스가 앞 형제의 `children` 길이인 것은 그 배열이 **소스를 빼는 것과
   * 무관하기 때문이다.** 노드는 부모의 배열에서 빠지고 앞 형제의 배열로 들어가므로,
   * `moveNodeOps`의 "값을 뺀 뒤 기준"이 여기서는 뺀 것과 같은 값을 낸다.
   *
   * **앞 형제에 `children` 키가 없으면 `moveNodeOps`가 배열을 먼저 만든다**(그 함수의
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
    // 따로 두지 않는 것은 그 검사를 지워도 죽는 케이스가 없기 때문이다.
    //
    // **다만 "이 줄이 덮는다"는 반쪽이다.** 논리로는 덮지만
    // **이 줄 자체도 지워도 죽는 케이스가 없다**: 첫 형제에서는 버튼이 비활성이라 클릭이 오지 않고,
    // 단축키는 `structureAbilities.indent`를 먼저 지난다. 둘 다 `disabled`/판정이 덮고
    // 있고, 여기 남은 것은 그 둘이 벗겨졌을 때의 `TypeError` 방벽이다.
    const previous = parent?.children?.[spot.index - 1]
    if (previous === undefined) return

    // **앞 형제의 `children`이 배열인지 여기서 보지 않는다.** `structureAbilities`의
    // `indent`가 `acceptsChildren`으로 이미 거르므로(배열도 `undefined`도 아니면 `false`)
    // 그런 앞 형제에서는 버튼이 비활성이다. 겹으로 두면 판정이 두 곳에 생기고(판정은
    // `structureAbilities` 한 곳이 한다), 그 겹만 지키는 케이스도 없다.
    commitOps(moveNodeOps(document, selectedNodeId, previous.id, previous.children?.length ?? 0))
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다.
   *
   * 부모의 자리를 `nodeSpot`으로 한 번 더 읽는다. 그것이 `null`이면 부모가 루트라
   * 나갈 곳이 없다 — `structureAbilities`의 `outdent`와 같은 판정이지만, 여기서는
   * 조부모 id와 부모 인덱스가 **필요해서** 부른다.
   *
   * **그 `null` 검사는 지워도 죽는 케이스가 없다.** 부모가 루트면 버튼이 이미 비활성이라
   * 클릭이 핸들러에 닿지 않고, 키보드 단축키도 `abilities.outdent`를 먼저 지난다
   * (`shell/editor-keys.tsx`). 남은 것은 그 둘이 벗겨졌을 때의 방벽이다.
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

  const aliasLocked =
    document === null ||
    selectedNodeId === null ||
    selectedNodeIds.length !== 1 ||
    props.selectedLock !== null ||
    findNodeSafely(document.root, selectedNodeId) === undefined
  const reasonInput: StructureReasonInput = {
    selectedNodeId,
    // **루트인지는 id로 본다.** 판정을 다시 하지 않는다 — `structureAbilities`가 이미
    // 지나간 순회를 한 벌 더 돌면 둘이 갈릴 수 있다(`./toolbar-status.ts` 머리말).
    isRoot: document !== null && selectedNodeId !== null && document.root?.id === selectedNodeId,
    lock: props.selectedLock,
    count: selectedNodeIds.length,
    anyLock: otherLock,
    // **`presetLocked`를 끄는 그 값 그대로다.** 고른 것이 없을 때 아홉이 다 회색인 이유가 이것뿐이라, 이유가 이 값을 못 보면
    // *"고르면 편집할 수 있습니다"*를 고를 줄이 없는 판에서도 말한다(`./toolbar-status.ts` 머리말 «안 골랐다 칸»).
    pageLock: props.pageLock,
    abilities,
  }

  return {
    abilities,
    patternLocked,
    presetLocked,
    why: structureWhy(reasonInput, { patternLock, presetLock: props.pageLock, aliasLocked }),
    remove: removeSelected,
    moveUp: () => moveSelected(-1),
    moveDown: () => moveSelected(1),
    dropTo: (nodeId, target) => {
      if (document === null) return
      commitOps(moveNodeOps(document, nodeId, target.parentId, target.index))
    },
    indent: indentSelected,
    outdent: outdentSelected,
    openAdd: setAdding,
    adding,
    pick: addNode,
    pickPattern: addPattern,
    applyPreset,
    cancelAdd: () => setAdding(null),
    aliasLocked,
    renameAlias: (nodeId, alias) => {
      if (document === null) return
      const ops = aliasOps(document, nodeId, alias)
      if (ops === null) return
      const blocker = store.editBlockedBy(ops)
      if (blocker !== null) {
        store.setEditFailure({ kind: 'message', message: lockedNotice(blocker.userName) })
        return
      }
      commitOps(ops)
    },
  }
}

/**
 * *"이 패턴을 못 쓴다"*의 머리말. **패턴 이름과 키를 둘 다 말한다** — 이름은 사용자가
 * 목록에서 본 것이고, 키는 테마의 manifest 에서 그 자리를 찾을 때 필요하다.
 *
 * **구분자를 두는 것은 뒤에 붙는 이슈 문장이 마침표로 끝나지 않기 때문이다** —
 * `use-edit-commit.tsx`가 서버 문장에 대해 잰 것과 같은 부류다.
 */
function brokenPattern(pattern: ThemePattern, key: string): string {
  return `패턴을 꽂지 못했습니다 — ${pattern.name}(${key}). 테마의 패턴을 고쳐야 합니다:`
}

/**
 * 자리를 못 찾은 갈래. **위 문장과 갈라 적는다** — 이쪽은 테마가 아니라 **고른
 * 자리**의 문제이므로 사용자가 할 일이 다르다.
 */
const NO_SPOT_NOTICE = '고른 자리에는 패턴을 꽂을 수 없습니다. 다른 노드를 고르세요.'

/**
 * **고르개 자리** — 지금 그려도 되는 고르개(`visiblePicker`) 하나를 그린다. 트리가 고른 줄 바로 아래에 이것을 세운다
 * (spec 「툴바 대신 노드별 `+` · `…`」 — 고르개가 그 줄 곁에 뜬다). 판정도 조작도 갖지 않는다.
 *
 * **닫혀 있을 때는 DOM에 없다** — 남겨 두면 Tab 순서에 정지점이 그대로 남는다. 프리셋 이름칸의 글자는 이 부품이 아니라 부르는 쪽
 * (`StructureTree`)이 든다 — 이것은 잠금이 오가는 동안 DOM 에서 빠진다(`visiblePicker` 머리말 «두 축»).
 *
 * **`projectId`를 받는 것은 프리셋 고르개 때문이다.** 프리셋은 프로젝트에 살고(설계서 「페이지 프리셋」), 그 조회는
 * 고르개가 열렸을 때만 일어난다 — `PresetPicker`가 닫혀 있을 때 DOM에 없기 때문이다.
 */
export function StructurePicker(props: {
  commands: StructureCommands
  projectId: string
  /** 코멘트 수를 세는 대상. 프리셋 고르개가 쓴다. */
  pageId: string | undefined
  /**
   * 지금 페이지의 root `children`. *"현재 페이지를 프리셋으로 저장"*이 담는 것이고,
   * **문서 봉투가 아니다**. 문서를 못 읽었으면 `null`이다.
   */
  currentNodes: readonly WbNode[] | null
  presetName: string
  onPresetNameChange: (name: string) => void
}): ReactElement | null {
  const { commands } = props
  /** 지금 그려도 되는 고르개. 열려 있어도 그 조작이 막혔으면 `null`이다. */
  const picker = visiblePicker(commands)
  if (picker === null) return null
  return (
    // 고르개는 자기 줄을 요구한다(`flex-basis: 100%` — `test/shell-css-picker.test.ts`) — 감싸는 flex 상자가 이것이다.
    // `data-wb-holds-keys` — 포커스가 고르개 안이면 화살표 · Escape 는 에디터 단축키가 안 받는다(`edit/editor-shortcuts.ts` 의 `keyHeldByWidget`).
    // **고르개 안의 Escape 는 고르개를 닫는다**(«취소»와 같다) — 단축키에 넘기면 선택을 풀어 고르개가 감춰질 뿐 `adding` 이 남았다. 조합 중의
    // Escape 는 조합의 키다(프리셋 이름 칸).
    <div
      className="wb-shell-tree-panel"
      data-wb-holds-keys=""
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing || event.defaultPrevented) return
        event.preventDefault()
        commands.cancelAdd()
      }}
    >
      {(picker === 'inside' || picker === 'after') && <TypePicker onPick={commands.pick} onCancel={commands.cancelAdd} />}
      {picker === 'pattern' && <PatternPicker onPick={commands.pickPattern} onCancel={commands.cancelAdd} />}
      {picker === 'preset' && (
        <PresetPicker
          projectId={props.projectId}
          pageId={props.pageId}
          currentNodes={props.currentNodes}
          name={props.presetName}
          onNameChange={props.onPresetNameChange}
          onApply={commands.applyPreset}
          onCancel={commands.cancelAdd}
        />
      )}
    </div>
  )
}
