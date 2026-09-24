/**
 * **우측 패널이 남의 잠금을 보는가**(설계서 「소프트 잠금」의 1차 방어) — 속성 탭과 상호작용 탭 둘 다.
 *
 * # 패널이 잠금을 안 보면 무엇이 깨지나
 *
 * 구조 툴바와 되돌리기가 잠금을 무는 것만으로는 **우측 패널이 그 둘을 다 비켜 간다.** 패널이
 * 잠금을 안 보는 판에서 잰 고장 방식이 아래다(진짜 api·진짜 WS 잠금은 서버 쪽에서, 화면은 이
 * 파일의 하네스로):
 *
 * | 무엇 | 패널이 잠금을 안 보면 |
 * |---|---|
 * | 잠긴 노드의 위젯 여덟(변형·text·textarea·number·switch·select·목록 칸·목록 버튼 둘) | **전부 살아 있다**(`disabled=false`) |
 * | 값을 치고 blur | 요청이 나가고 **423** |
 * | 그때 상태줄 | *"보라님이 편집 중이라 고를 수도 **바꿀** 수도 없습니다"* — **거짓이다** |
 * | 되돌리기 스택(「스택 몰살」 — 423의 재조회가 두 스택을 통째로 비운다) | 요청 3건 `200/200/`**`423`** · **2 → 0** |
 * | **상호작용 탭** — 같은 노드의 `interactions`를 통째로 `replace`한다 | 같은 값이다. **속성 탭만 닫으면 「스택 몰살」이 그리로 그대로 밟힌다** |
 *
 * # 판정의 단위 — «고른 노드»다
 *
 * 잠금을 무는 규칙은 *"그 조작의 단위에 맞춘다"*이고, 되돌리기가 ops를 단위로 삼는 것은
 * **그 조작에 선택이 없기 때문**이다. 이 패널은 반대다 — 존재 자체가 *"고른 노드의
 * 속성"*이라 구조 툴바가 쓰는 값(`store.lockedBy`)을 그대로 쓴다. 근거와 서버 실측 표는
 * `src/panels/property-panel.tsx`의 `lock` 선언이 갖는다 — **여기 두 벌로 적지 않는다.**
 *
 * 요지 하나만: **한 갈래에서 서버보다 엄격하다**(잠긴 노드의 **조상**을 골라 둔 판 —
 * 서버는 200을 낸다). 그것이 `packages/schema/test/lock.test.ts`의
 * `선택이 편집보다 엄격하다`가 *"구멍이 아니라 대가다"*로 이미 못박은 자리이고,
 * 아래 `조상을 골라 둔 판도 막는다`가 그 대가를 이름과 함께 고정한다.
 *
 * # 서버 대역이 진짜 판정을 든다
 *
 * `patchOps`가 `findLockConflict`를 **직접** 부른다 — `apps/api`의 `lock/check.ts`가 부르는
 * 그 함수다(`undo-locks.test.tsx`·`toolbar-abilities.test.tsx`와 같은 형태이고 같은 이유다).
 * 손으로 적은 200/423으로 대신하면 *"화면이 막아서 안 나갔다"*와 *"서버가 받아서 통과했다"*가
 * 같은 값으로 보인다.
 *
 * # 이 파일이 잠그는 것도 «누를 때 서 있던 잠금»까지다
 *
 * 1차 방어는 낙관적이다. **누름과 전송 사이에 오는 잠금은 이 패널이 못 막는다** — 그때는
 * 요청이 나가고 서버의 2차 방어가 423으로 받으며 「스택 몰살」이 그대로 밟힌다.
 * `undo-locks.test.tsx`가 같은 문장을 자기 자리에서 적고 있고, 그 창을 재는 케이스는
 * 양쪽 다 두지 않는다 — 두면 화면이 막지 않는 것을 잠근다.
 *
 * # 케이스마다 «혼자 죽는 변조»가 있나 — 재서 아래에 적는다
 *
 * 왼쪽 열이 **그 케이스만** 죽이는 변조다. «없음»인 줄은 지우지 않고 **그 축을 소유하는
 * 케이스를 이름으로 가리킨다** — 아무 변조에서도 안 죽는 줄은 하나도 없다.
 *
 * | 케이스 | 혼자 죽이는 변조 |
 * |---|---|
 * | 카탈로그가 쓰는 control을 다 짚는다 | 이 줄은 **분모 대조**다 — 카탈로그에 여덟째 control이 생기면 죽는다 |
 * | 위젯 일곱이 종류마다 꺼진다 | `number` 위젯만 안 끈다 |
 * | 변형 위젯도 함께 꺼진다 | **없음** — 변형만 안 끄면 «조상…»·«상태줄…»이 함께 죽는다(둘 다 `allWidgetsOff()`가 변형을 센다). **변형 축의 주인은 이 케이스다** |
 * | 목록 위젯은 …버튼도 꺼진다 | 추가·삭제 버튼 둘만 안 끈다 |
 * | 잠긴 서브트리 **안쪽**… | **없음** — 조상 잠금만 안 보면 «상태줄…»과 함께 죽는다 |
 * | 조상을 골라 둔 판도 막는다 | **없음** — 단위를 «op 포인터»로 바꾸면 «상태줄…»과 함께 죽는다. **단위 축의 주인은 이 케이스다** |
 * | 잠긴 동안 도착한 blur는… | **없음** — 커밋 가드를 빼면 «조상…»·«잠긴 노드의 속성을 쳐도…»와 함께 죽는다 |
 * | 친 글자는 잠금이 오가도 남는다 | 잠금이 오갈 때 위젯을 새로 만든다(`key`에 잠금을 섞는다) |
 * | 목록 칸에 친 글자도 잠금이 오가도 남는다 | **없음** — `ListControl`의 «꺼진 동안 온 blur는 무시» 줄을 빼면 아래 «풀린 뒤 같은 목록의 다른 칸…»과 함께 죽는다(그 케이스가 이 길 위에 선다). **«잠금 순간 목록 칸의 초안이 남는다» 축의 주인은 이 케이스다** |
 * | 잠금이 풀린 뒤 같은 목록의 다른 칸에 치면… | `ListControl`의 «다른 칸의 초안을 먼저 낸다» 줄을 뺀다 — 또는 그 줄이 `index`만 보고 `part`를 안 본다 |
 * | 안내 줄이 이름과 함께 뜨고… | 안내 줄을 뺀다 |
 * | 편집할 속성이 없는 컴포넌트에는… | 그 갈래에서도 안내를 낸다 |
 * | 잠금이 풀리면 위젯이 돌아온다 | **없음** — `setLocks`가 빈 목록을 무시하면 «친 글자…»·«안내 줄…»과 함께 죽는다 |
 * | 형제가 잠겨도 그대로 바꾼다 | **없음** — «페이지에 잠금이 하나라도»로 넓히면 «상태줄…»과 함께 죽는다 |
 * | 내 잠금에는 안 막힌다 | `viewerUserId`를 빈 값으로 넘긴다 |
 * | 다른 페이지의 잠금은 안 막는다 | 페이지 필터를 뺀다 |
 * | 잠긴 노드의 속성을 쳐도 …스택이 그대로다 | **없음** — 커밋 가드를 빼면 «조상…»·«blur…»와 함께 죽는다. **스택 축의 주인은 이 케이스다** |
 * | 상태줄이 이름을 말하는 판과… | 상태줄의 잠금 칸을 뺀다 |
 * | 잠긴 위젯마다 `:disabled` 규칙이… | 셋이 각각 혼자 죽인다(`.wb-shell-control` · 상호작용 버튼 · 목록 버튼의 `:disabled` 규칙을 지운다) |
 * | 상호작용 — 저작 위젯이 하나도 남지 않는다 | 넷이 각각 혼자 죽인다(「추가」 버튼만 · 값 칸만 · 대상 고르개만 · 안내 줄만) |
 * | 상호작용 — 잠긴 동안 도착한 blur | 그 탭의 커밋 가드를 뺀다 |
 * | 상호작용 — 스택이 살아 있다 | **없음** — 「추가」 버튼과 가드를 **함께** 빼야 죽는다(둘 다 빼면 그 탭이 잠금을 안 보는 판이다). 그 경로의 **스택 축 주인**이다 |
 * | 상호작용 — 대조 | «페이지에 잠금이 하나라도»로 넓힌다 |
 *
 * **넓게 죽는 변조 둘이 그 위에 겹친다** — 판정을 통째로 빼면(`blocked = false`) 속성 쪽
 * 열이, 훅이 언제나 «잠금 없음»을 답하면 열하나가 죽는다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  findLockConflict,
  listComponents,
  lockPointers,
  type EditorControl,
  type PageDocument,
  type PatchOp,
} from '@wirebound/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, OTHER_PAGE_ID, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { clickAsBrowser } from '../click-as-browser'
import '../../src/catalog-setup'
// `?raw`로 읽는다 — `shell-css-coverage.test.ts`가 이미 쓰는 기전이고, jsdom 환경에서는
// `import.meta.url`이 http URL이라 `node:fs`로 못 연다(실측: *"The URL must be of scheme file"*).
import shellCss from '../../src/shell.css?raw'

const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/** 하네스의 사용자 id. `editor-harness.tsx`의 `USER`와 같은 값이다. */
const ME = 'u-1'

/** 잠근 사람의 이름. **상태줄·패널 안내를 이 값으로 찾는다** — 문장을 글자로 베끼지 않는다. */
const HOLDER = '보라'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  send(): void {}

  close(): void {
    this.onclose?.()
  }
}

/**
 * ```
 * n-root  (Page)                     ← 편집할 속성이 없는 컴포넌트. 열면 이것이 자동 선택된다
 *   n-card  (Card)                   ← 변형 위젯이 있는 유일한 자리 · `n-text`의 **조상**
 *     n-text  (Text)                 ← 잠긴 서브트리 **안쪽**을 만드는 자리
 *   n-field (Field)                  ← text · switch · select 셋을 한 노드에서 낸다
 *   n-list  (List)                   ← number · stringList
 *   n-kv    (KeyValue)               ← pairList
 *   n-div   (Divider)                ← 대조군. 잠금과 무관한 **형제**
 * ```
 * **타입이 전부 다르다** — 트리 줄의 이름이 타입이라 그래야 노드를 이름으로 고른다.
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-card',
        type: 'Card',
        props: { title: '카드 제목', subtitle: '부제' },
        children: [{ id: 'n-text', type: 'Text', props: { content: '문단', role: 'body' } }],
      },
      {
        id: 'n-field',
        type: 'Field',
        props: { label: '이름', control: 'select', placeholder: '검색어', required: true },
        // **상호작용 탭의 저작 위젯을 다 띄우려고 규칙 하나를 얹는다.** 액션 셋이
        // `ActionRow`의 세 갈래(대상 고르개 · 페이지 경로 칸 · 속성 고르개와 값 칸)를
        // 각각 그린다 — 하나만 두면 나머지 갈래의 위젯이 화면에 없어 조용히 안 잰다.
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setVisible', target: 'n-div', value: false },
              { type: 'navigate', target: '/pages/other' },
              { type: 'setProp', target: 'n-field', prop: 'label', value: '바뀐 이름' },
            ],
          },
        ],
      },
      { id: 'n-list', type: 'List', props: { columns: ['이름'], items: 3 } },
      { id: 'n-kv', type: 'KeyValue', props: { pairs: [{ key: 'k', value: 'v' }], columns: 1 } },
      { id: 'n-div', type: 'Divider', props: { direction: 'horizontal' } },
    ],
  })
}

/**
 * control 종류마다 그것을 쓰는 자리 하나씩. **아래 `카탈로그가 쓰는 control을 다 짚는다`가
 * 이 표의 분모를 카탈로그에서 세어 맞춘다** — 여덟 번째 control이 생기면 거기서 죽는다.
 *
 * **«위젯이 있는가»는 이 파일이 재지 않는다.** 그 축은
 * `test/panels/property-panel.test.tsx`의 `카탈로그의 control 일곱에 전부 대응하는 위젯이
 * 있다`가 소유한다. 여기서 재는 것은 **그 위젯이 잠금에 꺼지는가**다.
 */
const CONTROL_SAMPLES: { control: EditorControl; type: string; nodeId: string; label: string }[] = [
  { control: 'text', type: 'Field', nodeId: 'n-field', label: '라벨' },
  { control: 'textarea', type: 'Text', nodeId: 'n-text', label: '내용' },
  { control: 'number', type: 'List', nodeId: 'n-list', label: '항목 수' },
  { control: 'switch', type: 'Field', nodeId: 'n-field', label: '필수' },
  { control: 'select', type: 'Field', nodeId: 'n-field', label: '입력 종류' },
  { control: 'stringList', type: 'List', nodeId: 'n-list', label: '컬럼' },
  { control: 'pairList', type: 'KeyValue', nodeId: 'n-kv', label: '키-값' },
]

interface Board {
  store: EditorStore
  /** 서버가 보낸 것처럼 잠금 목록을 밀어 넣는다. */
  lock: (locks: NodeLockView[]) => void
  /** 지금까지 서버가 **받은** 편집. 화면이 막았으면 늘지 않는다. */
  calls: { ops: PatchOp[] }[]
  /** 서버가 낸 상태 코드들. 화면의 막기를 빼면 여기 `423`이 선다. */
  status: number[]
}

async function board(): Promise<Board> {
  const sockets: FakeSocket[] = []
  const calls: { ops: PatchOp[] }[] = []
  const status: number[] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    // **서버의 2차 방어를 그대로 돈다**(`apps/api/src/lock/check.ts`와 같은 인자).
    const conflict = findLockConflict({
      root: held.root,
      locks: live.filter((entry) => entry.pageId === PAGE_ID),
      pointers: lockPointers(body.ops),
      viewerUserId: ME,
    })
    if (conflict !== null) {
      status.push(423)
      throw new ApiError(423, 'locked', `${conflict.userName}님이 편집 중인 영역입니다`)
    }
    status.push(200)
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }

  const setup: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
    lockChannel: createLockChannel(),
    origin: 'http://localhost:5173',
    connection: {
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      schedule: () => 1,
      cancel: () => {},
    },
  }

  // **`onopen`을 부르지 않는다** — WS가 붙어 있으면 편집이 그리로 나가 `patchOps` 대역이
  // 아무것도 못 본다. 잠금 프레임은 `onmessage`로 그대로 들어온다.
  await openPage(doc(), { realtime: setup, apiOverrides: { patchOps, getPage } })

  return {
    store: shellStore(),
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    calls,
    status,
  }
}

function foreign(nodeId: string, over: Partial<NodeLockView> = {}): NodeLockView {
  return { pageId: PAGE_ID, nodeId, userId: 'u-bora', userName: HOLDER, ...over }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

/** 구조 툴바 아래 상태줄의 글자. */
function statusLine(): string {
  return structureRegion().querySelector('.wb-shell-structure-status')?.textContent ?? ''
}

/**
 * 패널 안에서 **사람이 값을 넣을 수 있는 것 전부**. 목록 위젯의 칸과 버튼 둘까지 든다 —
 * 추가·삭제는 즉시 커밋이라 칸만 꺼도 그 둘로 값이 그대로 나간다.
 */
function widgets(): HTMLElement[] {
  return [...panel().querySelectorAll<HTMLElement>('input, textarea, select, .wb-shell-list button')]
}

function disabledOf(elements: HTMLElement[]): boolean[] {
  return elements.map((element) => (element as HTMLInputElement).disabled === true)
}

/**
 * 위젯이 하나라도 있고 **전부** 꺼져 있는가. 하나도 없으면 `false`다.
 *
 * # `found.length > 0`을 빼면 실패 방향이 바뀐다 — 재서 정한 값이다
 *
 * *"위젯 0개는 «전부 꺼짐»인가 «잴 것이 없음»인가"*를 물어 **«잴 것이 없음»으로 정한다.**
 * 근거는 취향이 아니라 값이다 — `widgets()`가 빈 배열을 내게 심고 두 판을 각각 돌리면
 * 이렇다:
 *
 * | 이 함수의 0-갈래 | 죽는 케이스 |
 * |---|---|
 * | **지금(0 → `false`)** | «잠긴 서브트리 **안쪽**의 노드도 막힌다» · «조상을 골라 둔 판도 막는다» · «잠금이 풀리면 위젯이 돌아온다» · 상태줄 대조 |
 * | 0 → `true` 로 바꾼 판 | «형제가 잠겨도 그대로 바꾼다» · «내 잠금에는 안 막힌다» · «다른 페이지의 잠금은 안 막는다» · 상태줄 대조 |
 *
 * **수는 넷으로 같은데 죽는 자리가 반대편으로 옮겨 간다.** 0 → `true`로 하면 이 파일이
 * 잠그려고 있는 «막는다» 셋이 **빈 패널에서 공허하게 통과한다** — 위젯을 못 찾게 만드는
 * 어떤 변조든 *"다 꺼졌다"*로 읽힌다. 거짓 빨강 하나를 지우려고 거짓 초록 셋을 얻는
 * 거래이고, 그 거래는 하지 않는다.
 *
 * # 그 대신 이 자가 **재는 범위**를 여기 적는다
 *
 * 위젯이 0개인 노드(이 픽스처에서는 `n-root` = `Page`)는 이 자의 범위 **밖**이다. 그런
 * 노드에서 남이 자손을 잠그면 상태줄은 이름을 말하는데 이 자는 `false`를 낸다 —
 * 실측이다(`says=true` · `widgets=0` · `off=false`). **그 갈래가 안 재지는 것은 아니다.**
 * 주인이 둘 있고, 둘 다 이 자와 **다른 것**을 본다:
 *
 * - **패널 쪽** — 이 파일의 «편집할 속성이 없는 컴포넌트에는 안내를 얹지 않는다»가 바로 그
 *   판(`n-root` 선택 + `n-text` 잠금)을 세우고, 패널이 *"이 컴포넌트에는 편집할 속성이
 *   없습니다"*를 내며 잠금 안내는 **안** 낸다는 것을 잰다.
 * - **툴바 쪽** — `lock/toolbar-abilities.test.tsx`의 «루트가 선택된 채 남이 자손을 잠그면
 *   하나 남았던 `안에 추가`까지 꺼진다»와 «페이지의 모든 자리가 잠기면 도구 아홉과 트리 줄이
 *   전부 꺼진다»가 그 노드에서 **정말 막히는가**를 잰다.
 *
 * 그래서 아래 `COMBOS`에 위젯 0개짜리 줄을 **넣지 않는다.** 넣으면 이 자의 `false` 때문에
 * 대조가 죽는데, 그것은 화면이 틀린 것이 아니라 **자가 그 노드를 못 재는 것**이다.
 */
function allWidgetsOff(): boolean {
  const found = disabledOf(widgets())
  return found.length > 0 && found.every((off) => off)
}

function textInput(label: string): HTMLInputElement {
  return within(panel()).getByLabelText<HTMLInputElement>(label)
}

function alertText(): string | null {
  return document.body.querySelector('.wb-shell-edit-alert')?.textContent ?? null
}

function stacks(view: Board): { undo: number; redo: number } {
  const state = view.store.getState()
  return { undo: state.undoStack.length, redo: state.redoStack.length }
}

/** 낙관적 적용·전송·재조회가 다 흐르도록 흘린다. */
async function settle(): Promise<void> {
  await act(async () => {})
  await act(async () => {})
  await act(async () => {})
}

/** 텍스트 컨트롤에 값을 넣고 blur로 커밋한다. */
function typeAndCommit(label: string, value: string): void {
  const input = textInput(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('막는다 — 잠긴 노드의 속성은 화면에서 바꿀 수 없다', () => {
  it('카탈로그가 쓰는 control을 다 짚는다 — 아래 표의 분모다', () => {
    // **손으로 적으면 낡는다.** 카탈로그에 여덟 번째 control이 생기면 여기서 죽고, 그때
    // 사람이 *"그 위젯도 잠금에 꺼지나"*를 본다.
    const used = new Set(listComponents().flatMap((def) => def.editor.map((field) => field.control)))

    expect(new Set(CONTROL_SAMPLES.map((sample) => sample.control))).toEqual(used)
  })

  it('위젯 일곱이 종류마다 꺼진다 — 잠긴 노드 자신을 골라 둔 판', async () => {
    const view = await board()

    for (const sample of CONTROL_SAMPLES) {
      // 앞 잠금을 풀어야 트리에서 다음 노드를 고를 수 있다(선택 자체가 1차 방어를 지난다).
      view.lock([])
      select(sample.type)
      await settle()
      view.lock([foreign(sample.nodeId)])
      await settle()

      const widget = within(panel()).getByLabelText<HTMLInputElement>(sample.label)
      // `stringList`·`pairList`는 라벨이 `role="group"`을 가리키므로 그 안의 칸을 본다.
      const inputs = widget.tagName === 'DIV' ? [...widget.querySelectorAll<HTMLInputElement>('input')] : [widget]

      expect(inputs.length, `${sample.control}: 잴 위젯이 있어야 한다`).toBeGreaterThan(0)
      expect(disabledOf(inputs), `${sample.control}이 꺼져야 한다`).toEqual(inputs.map(() => true))
    }
  })

  it('변형 위젯도 함께 꺼진다 — props의 키가 아니라 봉투의 필드다', async () => {
    const view = await board()
    select('Card')
    await settle()
    // 대조: 잠금 전에는 켜져 있다.
    expect(within(panel()).getByLabelText<HTMLSelectElement>('변형').disabled).toBe(false)

    view.lock([foreign('n-card')])
    await settle()

    expect(within(panel()).getByLabelText<HTMLSelectElement>('변형').disabled).toBe(true)
  })

  it('목록 위젯은 칸뿐 아니라 추가·삭제 버튼도 꺼진다 — 그 둘은 즉시 커밋이다', async () => {
    const view = await board()
    select('KeyValue')
    await settle()
    view.lock([foreign('n-kv')])
    await settle()

    const buttons = [...panel().querySelectorAll<HTMLButtonElement>('.wb-shell-list button')]

    expect(buttons.length).toBeGreaterThan(1)
    expect(disabledOf(buttons)).toEqual(buttons.map(() => true))
  })

  it('잠긴 서브트리 **안쪽**의 노드도 막힌다 — 잠긴 것은 노드가 아니라 서브트리다', async () => {
    const view = await board()
    select('Text')
    await settle()

    // 잠긴 것은 조상인 `n-card`이고 고른 것은 그 안의 `n-text`다.
    view.lock([foreign('n-card')])
    await settle()

    expect(allWidgetsOff()).toBe(true)
  })

  it('조상을 골라 둔 판도 막는다 — 서버는 200을 낼 자리이고, 그것이 이미 적힌 대가다', async () => {
    const view = await board()
    select('Card')
    await settle()

    // 잠긴 것은 자손인 `n-text`다. 나갈 포인터는 `…/n-card/props/title`이라 잠긴 서브트리
    // **밖**이고, 진짜 서버는 이 편집에 200을 낸다(스파이크로 쟀다 — 근거는
    // `src/panels/property-panel.tsx`의 표).
    view.lock([foreign('n-text')])
    await settle()

    // **그래도 막는다.** `packages/schema/test/lock.test.ts`의 `선택이 편집보다 엄격하다`가
    // *"구멍이 아니라 대가다 — 화면에서 그 자리를 고칠 길이 없어진다"*로 못박은 자리이고,
    // 이 패널도 툴바와 마찬가지로 선택을 요구한다. 반대로 가면 상태줄의 *"바꿀 수도
    // 없습니다"*가 이 갈래에서 거짓인 채로 남는다(아래 `상태줄이 …`가 그것을 잰다).
    expect(allWidgetsOff()).toBe(true)
    // 요청이 나가지 않는 것까지 본다 — 꺼진 위젯만으로는 «회색인데 나간다»와 안 갈린다.
    typeAndCommitBlocked(view, '제목')
    expect(view.calls).toHaveLength(0)
  })

  it('잠긴 동안 도착한 blur는 커밋이 아니다 — 위젯을 끄는 것만으로는 안 닫힌다', async () => {
    const view = await board()
    select('Card')
    await settle()

    // 잠금이 오기 **전에** 친다. 이 순간 입력에는 포커스가 있고 초안이 문서 값과 다르다.
    fireEvent.change(textInput('제목'), { target: { value: '치는 중' } })
    view.lock([foreign('n-card')])
    await settle()

    // **실브라우저는 `disabled`가 되는 순간 포커스를 놓고 blur를 낸다**(Chrome 실측 —
    // 치던 중에 잠금이 오면 `focusout INPUT → null`, `activeElement`는 `BODY`). **jsdom은
    // 안 놓는다**(실측: `activeElement`가 그대로이고 blur 이벤트 0건). 어느 쪽이든 *"잠긴 동안 도착한
    // blur"*가 커밋이 되면 안 되므로, 여기서 그 blur를 직접 낸다.
    fireEvent.blur(textInput('제목'))
    await settle()

    expect(view.calls).toHaveLength(0)
    expect(view.status).toEqual([])
  })

  it('친 글자는 잠금이 오가도 남는다 — 풀리면 그대로 낼 수 있다', async () => {
    const view = await board()
    select('Card')
    await settle()

    fireEvent.change(textInput('제목'), { target: { value: '새 제목' } })
    view.lock([foreign('n-card')])
    await settle()

    // **문서와 무관한 값이라 낡지 않는다**(잠금은 «선택»으로 잡히지 «편집»으로가 아니므로
    // *"풀렸다 = 남이 고쳤다"*가 아니다). 위젯을 지우지 않고 끄기만 하는 이유가 이것이다.
    expect(textInput('제목').value).toBe('새 제목')
    expect(textInput('제목').disabled).toBe(true)

    view.lock([])
    await settle()

    expect(textInput('제목').disabled).toBe(false)
    expect(textInput('제목').value).toBe('새 제목')
    fireEvent.blur(textInput('제목'))
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
    expect(view.calls[0]?.ops[0]).toMatchObject({ path: '/root/children/0/props/title', value: '새 제목' })
  })

  it('목록 칸에 친 글자도 잠금이 오가도 남는다 — 꺼질 때 온 blur가 초안을 비우지 않는다', async () => {
    // **위 케이스의 목록 판이다. 갈리는 것은 blur 하나다.** 실브라우저는 칸이 `disabled`가
    // 되는 순간 포커스를 거두며 blur를 낸다(Chrome 실측). `TextControl`은 그 blur에 커밋이
    // 막혀도 초안을 들고 있다. `ListControl`이 blur에서 초안을 **먼저 비우고** 커밋을 부르면
    // 커밋은 가드에 막히고 친 글자만 사라진다(Chrome 에서 잰 고장 방식: `"새 항목"` → `"옛 항목"`).
    // jsdom은 그 blur를 안 내므로(위 *"잠긴 동안 도착한 blur는…"*) 여기서 직접 낸다.
    const view = await board()
    select('List')
    await settle()

    const cell = (): HTMLInputElement =>
      within(panel()).getByRole<HTMLInputElement>('textbox', { name: '컬럼 1번째 항목' })
    fireEvent.change(cell(), { target: { value: '새 컬럼' } })
    view.lock([foreign('n-list')])
    await settle()
    fireEvent.blur(cell())
    await settle()

    expect(cell().disabled).toBe(true)
    expect(cell().value).toBe('새 컬럼')
    expect(view.calls).toHaveLength(0)

    view.lock([])
    await settle()

    // 풀리면 그 글자가 칸에 **남아 있다.** 나가는 것은 그 칸을 다시 눌렀다 떠날 때다 — Chrome
    // 실측: 풀린 뒤 커밋 0건 · 칸에 `"새 항목"`, 그 칸을 눌렀다 탭으로 떠나면 1건.
    // 아래의 blur 가 «눌렀다 떠난다»의 떠나는 쪽이다(jsdom 은 누르는 쪽의 포커스를 안 옮기므로
    // blur 만 낸다). **이것을 «풀리면 그 글자를 그대로 낸다»로 읽지 마라 — jsdom 지름길이다** —
    // 포커스 없는 칸에 blur 를 내면 «풀리면 곧 나간다»처럼 읽힌다.
    expect(cell().value).toBe('새 컬럼')
    expect(view.calls).toHaveLength(0)
    fireEvent.blur(cell())
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
    expect(view.calls[0]?.ops[0]).toMatchObject({ path: '/root/children/2/props/columns', value: ['새 컬럼'] })
  })

  it('잠금이 풀린 뒤 같은 목록의 다른 칸에 치면 앞 칸에 남은 글자가 먼저 나간다 — 커밋 없이 사라지지 않는다', async () => {
    // **위 케이스의 이어지는 길.** 잠금은 포커스 없는 초안을 남기고, `ListControl`의 초안은
    // 한 칸 몫이다. 다른 칸의 초안을 먼저 내지 않으면, 풀린 뒤 **같은 목록의 다른 칸**에 한 글자
    // 치는 순간 새 칸의 초안이 앞 칸의 것을 덮어 앞 칸의 글자가 커밋 없이 사라진다(Chrome 에서
    // 잰 고장 방식: 1번째 칸이 곧바로 `"옛 항목"`, 떠나면 `["옛 항목","항목 2x"]` 한 건). Chrome
    // 실측으로는 치는 순간 앞 칸이 먼저 1건, 떠나면 새 칸이 1건 — 서버 `["새 항목","항목 2x"]`.
    // 여기서는 키·값 두 칸으로 잰다(이 보드의 목록은 한 칸이다 — 같은 목록의 «다른 칸»은 `index`든 `part`든 같은 길이다).
    const view = await board()
    select('KeyValue')
    await settle()

    const key = (): HTMLInputElement => within(panel()).getByRole<HTMLInputElement>('textbox', { name: '키-값 1번째 키' })
    const value = (): HTMLInputElement => within(panel()).getByRole<HTMLInputElement>('textbox', { name: '키-값 1번째 값' })
    fireEvent.change(key(), { target: { value: '새 키' } })
    view.lock([foreign('n-kv')])
    await settle()
    // 실브라우저가 꺼질 때 내는 blur(위 케이스와 같다 — jsdom 은 안 낸다).
    fireEvent.blur(key())
    await settle()
    view.lock([])
    await settle()
    expect(key().value).toBe('새 키')
    expect(view.calls).toHaveLength(0)

    // 사용자는 다른 칸을 **눌러** 친다 — 꺼진 칸에는 칠 수 없으므로 풀린 것을 먼저 본다.
    expect(value().disabled).toBe(false)
    clickAsBrowser(value())
    fireEvent.change(value(), { target: { value: 'v2' } })

    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.calls[0]?.ops[0]).toMatchObject({ path: '/root/children/3/props/pairs', value: [{ key: '새 키', value: 'v' }] })
    expect(key().value).toBe('새 키')

    // 새 칸의 글자는 그 칸을 떠날 때 나간다 — 두 글자가 다 남는다.
    fireEvent.blur(value())
    await waitFor(() => expect(view.calls).toHaveLength(2))
    expect(view.calls[1]?.ops[0]).toMatchObject({ path: '/root/children/3/props/pairs', value: [{ key: '새 키', value: 'v2' }] })
    expect(view.status).toEqual([200, 200])
  })

  it('안내 줄이 이름과 함께 뜨고, 풀리면 사라진다', async () => {
    const view = await board()
    select('Card')
    await settle()
    expect(panelNotices()).toEqual([])

    view.lock([foreign('n-card')])
    await settle()
    // **패널이 자기 자리에서 이유를 말한다.** 좌측 상태줄은 사이드바를 접으면 화면에 없다.
    expect(panelNotices().some((text) => text.includes(HOLDER))).toBe(true)

    view.lock([])
    await settle()
    expect(panelNotices()).toEqual([])
  })

  it('편집할 속성이 없는 컴포넌트에는 안내를 얹지 않는다 — 설명할 회색이 없다', async () => {
    const view = await board()
    // 페이지를 열면 루트가 자동 선택된다. `Page`의 `editor`는 비어 있다.
    expect(view.store.getState().selectedNodeId).toBe('n-root')

    view.lock([foreign('n-text')])
    await settle()

    within(panel()).getByText('이 컴포넌트에는 편집할 속성이 없습니다')
    expect(panelNotices().some((text) => text.includes(HOLDER))).toBe(false)
  })

  it('잠금이 풀리면 위젯이 돌아온다', async () => {
    const view = await board()
    select('Field')
    await settle()
    view.lock([foreign('n-field')])
    await settle()
    expect(allWidgetsOff()).toBe(true)

    view.lock([])
    await settle()

    expect(disabledOf(widgets())).toEqual(widgets().map(() => false))
    typeAndCommit('라벨', '바뀐 라벨')
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
  })
})

describe('안 막는다 — 서버가 통과시킬 것은 그대로 나간다', () => {
  it('형제가 잠겨도 그대로 바꾼다 — 잠금 하나가 페이지를 얼리지 않는다', async () => {
    const view = await board()
    select('Divider')
    await settle()

    // 잠긴 것은 형제인 `n-field`다. 인덱스가 안 겹치므로 서버도 200이다.
    view.lock([foreign('n-field')])
    await settle()

    expect(allWidgetsOff()).toBe(false)
    fireEvent.change(within(panel()).getByLabelText<HTMLSelectElement>('방향'), {
      target: { value: 'vertical' },
    })
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
  })

  it('내 잠금에는 안 막힌다 (D3) — 소유자 판정도 스토어를 지난다', async () => {
    const view = await board()
    select('Card')
    await settle()

    view.lock([foreign('n-card', { userId: ME, userName: '나' })])
    await settle()

    expect(allWidgetsOff()).toBe(false)
    typeAndCommit('제목', '내 것')
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
  })

  it('다른 페이지의 잠금은 안 막는다 — 목록은 프로젝트 전체를 싣는다', async () => {
    const view = await board()
    select('Card')
    await settle()

    view.lock([foreign('n-card', { pageId: OTHER_PAGE_ID })])
    await settle()

    expect(allWidgetsOff()).toBe(false)
    typeAndCommit('제목', '다른 페이지')
    await waitFor(() => expect(view.calls).toHaveLength(1))
    expect(view.status).toEqual([200])
  })
})

describe('「스택 몰살」이 속성 패널로도 안 밟힌다', () => {
  it('잠긴 노드의 속성을 쳐도 되돌리기 스택이 그대로다', async () => {
    const view = await board()
    select('Card')
    await settle()

    typeAndCommit('제목', 'A')
    await waitFor(() => expect(view.calls).toHaveLength(1))
    typeAndCommit('제목', 'B')
    await waitFor(() => expect(view.calls).toHaveLength(2))
    await settle()
    expect(stacks(view)).toEqual({ undo: 2, redo: 0 })

    view.lock([foreign('n-card')])
    await settle()
    typeAndCommitBlocked(view, '제목')
    await settle()

    // **화면이 막지 않으면 요청 3건 `200/200/423` · 스택 2 → 0이 된다.** 423이 `recover`로 가고
    // 그 재조회의 `loadPage`가 두 스택을 통째로 비운다 — 설계서 「에러 처리」가 undo 실패에 대해
    // 적은 것(*"그 항목만 스택에서 버리고 나머지는 그대로 쓴다"*)과 어긋나는 값이다.
    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
    expect(stacks(view)).toEqual({ undo: 2, redo: 0 })
    // 알림도 뜨지 않는다 — 실패한 것이 없다.
    expect(alertText()).toBeNull()
  })
})

describe('막는 범위와 상태줄이 말하는 범위가 같다', () => {
  /**
   * **두 표면이 같은 것을 말하는가** — 이 파일에서 이 케이스만 그 축을 잰다.
   *
   * 상태줄의 잠금 칸은 *"…님이 편집 중이라 고를 수도 **바꿀** 수도 없습니다"*이다. 막는 것과
   * 말하는 것이 어긋나면 어느 방향이든 거짓이 된다 — 안 막는데 말하면 **그 문장이 거짓이
   * 되고**(패널 위젯이 살아 있는데 상태줄은 못 바꾼다고 말한다), 막는데 안 말하면 회색의
   * 이유가 화면에서 사라진다.
   *
   * **문장을 글자로 베끼지 않는다.** 잠근 사람의 이름이 그 줄에 실리는 것은 **잠금 칸뿐**이고
   * (다른 칸들은 이름을 싣지 않는다), 그래서 *"이름이 그 줄에 있나"*가 곧 *"잠금 칸이
   * 떴나"*다.
   *
   * **사각 둘.** ① 이름은 그대로 두고 *"바꿀 수도"*만 빼는 개작은 이 자가 못 본다.
   * ② **위젯이 0개인 노드는 이 표에 못 올린다** — 오른쪽 열의 자(`allWidgetsOff()`)가 그
   * 노드를 못 재기 때문이고, 왜 그 자를 그대로 두는지와 그 갈래의 주인이 어디인지는 그
   * 함수의 머리말이 갖는다. **여기 두 벌로 적지 않는다.**
   */
  const COMBOS: { name: string; select: string; lock: string | null }[] = [
    { name: '잠긴 노드 자신', select: 'Card', lock: 'n-card' },
    { name: '잠긴 서브트리 안쪽', select: 'Text', lock: 'n-card' },
    { name: '잠긴 노드의 조상', select: 'Card', lock: 'n-text' },
    { name: '잠긴 노드의 형제', select: 'Field', lock: 'n-div' },
    { name: '잠금 없음', select: 'Field', lock: null },
  ]

  it('상태줄이 이름을 말하는 판과 위젯이 다 꺼지는 판이 정확히 같다', async () => {
    const view = await board()
    const table: { name: string; says: boolean; off: boolean }[] = []

    for (const combo of COMBOS) {
      view.lock([])
      select(combo.select)
      await settle()
      view.lock(combo.lock === null ? [] : [foreign(combo.lock)])
      await settle()
      table.push({ name: combo.name, says: statusLine().includes(HOLDER), off: allWidgetsOff() })
    }

    // **표가 두 갈래를 다 태운다** — 한쪽으로 쏠리면 아래 단언이 공허해진다.
    expect(table.filter((row) => row.says).length).toBeGreaterThan(0)
    expect(table.filter((row) => !row.says).length).toBeGreaterThan(0)
    expect(table.filter((row) => row.says !== row.off)).toEqual([])
  })
})

/** 우측 패널의 탭 하나를 고른다. */
function openTab(name: string): void {
  fireEvent.click(within(panel()).getByRole('tab', { name }))
}

/**
 * 우측 패널 안에서 **사람이 조작할 수 있는 것 전부**. 탭 버튼은 뺀다 — 탭 전환은 편집이
 * 아니라 보기의 이동이고, 잠겼다고 다른 탭으로 못 가면 그것이 막다른 길이다.
 */
function panelControls(): HTMLElement[] {
  return [...panel().querySelectorAll<HTMLElement>('input, textarea, select, button')].filter(
    (element) => element.getAttribute('role') !== 'tab',
  )
}

/** 패널 안의 안내 줄들. */
function panelNotices(): string[] {
  return [...panel().querySelectorAll('.wb-shell-panel-notice')].map((node) => node.textContent ?? '')
}

/**
 * 막혀 있어야 하는 자리에 값을 넣어 본다. **`fireEvent.change`는 `disabled`를 지나간다** —
 * 사용자가 못 하는 일이지만, 그래야 *"위젯만 껐고 커밋은 그대로 나간다"*는 판이 관측된다.
 */
function typeAndCommitBlocked(view: Board, label: string): void {
  const before = view.calls.length
  const input = textInput(label)
  fireEvent.change(input, { target: { value: '막혀야 하는 값' } })
  fireEvent.blur(input)
  expect(view.calls.length, '막힌 자리에서 요청이 나갔다').toBe(before)
}

describe('꺼진 것이 화면에 보인다', () => {
  /**
   * **`disabled`만으로는 회색이 안 된다 — 이 셸에서는.** 위젯의 규칙들이 `background`와
   * `color`를 직접 놓으므로 브라우저가 disabled에 주는 기본 회색이 덮인다. 그러면 위젯은
   * 안 먹는데 **평소와 똑같이 보이고**, 그것은 «거짓 탈출구»와 같은 부류다(눌러도 아무
   * 일이 안 나는데 눌러도 될 것처럼 보인다).
   *
   * **«클래스마다»가 아니라 «요소마다»다.** 목록의 칸은 클래스를 둘 단다
   * (`wb-shell-control wb-shell-list-cell`) — 그중 하나에 규칙이 있으면 그 칸은 회색이
   * 된다. 클래스마다 요구하면 그것이 거짓 빨강이 된다.
   *
   * **주석을 먼저 걷는다 — 안 걷으면 자가 뚫린다.** `.wb-shell-list-add:disabled` 옆에
   * *"`.wb-shell-control:disabled`와 같은 값이다"* 같은 주석이 있으면, 진짜 규칙을 지워도
   * **주석의 그 글자가 대신 맞아** 이 케이스가 살아남는다. *"원문으로 재는 자는 뚫린다"*의
   * 그 부류다.
   *
   * # 사각 — 이 자는 **원문에 그 글자가 있나**만 본다
   *
   * jsdom은 이 스타일시트를 싣지 않으므로 계산된 색을 여기서 잴 수 없다. 그래서 남는 구멍은
   * 셋이고, **아래 셋 다 심어도 이 케이스는 안 죽는다**:
   *
   * - **규칙이 실제로 색을 죽이는지 안 본다.** 본문을 `letter-spacing: 0`으로 바꿔도 통과한다.
   * - **그 규칙이 걸리는 판인지 안 본다.** `@media (min-width: 99999px)`로 감싸도 통과한다.
   * - **주석은 걷지만 값은 안 걷는다.** 진짜 규칙을 지우고 같은 글자를 CSS **문자열 값**에
   *   (`content: ".wb-shell-control:disabled"`) 심으면 통과한다. 위 «주석을 먼저 걷는다»가
   *   막은 것은 주석뿐이고, `stripComments`의 형제가 값에는 없다.
   *
   * **셋째는 다른 자도 안 잡는다** — 그 글자를 심고 `:disabled` 규칙만 지우면 웹 전량에서
   * **아무것도 안 죽는다.** 그 글자를 심으면서 `.wb-shell-control`의 **기반 규칙까지** 지운
   * 판에서만 `shell-css-coverage`가 운다 — 그때는 그 클래스에 규칙이 아예 없어지기
   * 때문이고, 이 케이스가 지키려는 «꺼진 것이 회색이 되나»와는 다른 축이다.
   *
   * **그래도 자를 새로 짓지 않는다.** 더 좁히려면 원문을 파싱하는 자를 손으로 키우게 되고,
   * 그 거래는 거짓 빨강 대신 거짓 초록을 여럿 얻는다.
   * 지금 이 자의 실패 방향은 **거짓 초록**이지만 무게가 낮다 — 못 잡는 것을 여기 적어 두는
   * 것이 다음 사람에게 더 값싸다.
   */
  it('잠긴 위젯마다 `:disabled` 규칙이 하나는 걸린다', async () => {
    const view = await board()
    const locked: string[][] = []

    select('KeyValue')
    await settle()
    view.lock([foreign('n-kv')])
    await settle()
    locked.push(...lockedClassSets())

    view.lock([])
    select('Field')
    await settle()
    openTab('상호작용')
    await settle()
    view.lock([foreign('n-field')])
    await settle()
    locked.push(...lockedClassSets())

    // 모은 것이 실제로 여럿이어야 아래가 공허하지 않다.
    expect(locked.length).toBeGreaterThan(6)

    const rules = shellCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const bare = locked
      .filter((names) => !names.some((name) => new RegExp(`\\.${name}:disabled\\b`).test(rules)))
      .map((names) => names.join(' '))

    expect([...new Set(bare)]).toEqual([])
  })
})

describe('상호작용 탭도 같은 값으로 닫힌다 — 「스택 몰살」의 둘째 입구다', () => {
  /**
   * **속성 패널만 닫으면 「스택 몰살」이 안 닫힌다.** 우측 패널의 다른 탭이 같은 노드의
   * `interactions`를 통째로 `replace`하고, 그 포인터의 잠금 판정은 `…/props/…`와 **같은
   * 값**이다(스파이크: 잠긴 노드 423 · 조상 200). 속성 패널만 닫은 판에서는 요청 3건
   * `200/200/`**`423`** · 스택 **2 → 0**이 된다 — 「스택 몰살」 그대로다.
   */
  it('저작 위젯이 하나도 남지 않는다 — 탭 버튼만 살아 있다', async () => {
    const view = await board()
    select('Field')
    await settle()
    openTab('상호작용')
    await settle()

    // 대조: 잠기기 전에는 하나도 안 꺼져 있다.
    expect(disabledOf(panelControls())).toEqual(panelControls().map(() => false))

    view.lock([foreign('n-field')])
    await settle()

    const controls = panelControls()
    // 위젯이 여럿이라는 것부터 본다 — 하나뿐이면 아래 단언이 거의 공허하다.
    expect(controls.length).toBeGreaterThan(6)
    expect(disabledOf(controls)).toEqual(controls.map(() => true))
    expect(panelNotices().some((text) => text.includes(HOLDER))).toBe(true)

    // **막다른 길이 아니다.** 탭 전환은 편집이 아니라 보기의 이동이라 잠금과 무관하게
    // 살아 있어야 한다 — 여기까지 꺼지면 잠긴 동안 우측 패널에서 아무 데도 못 간다.
    // (셸 전체의 탈출구는 `toolbar-abilities.test.tsx`의
    // `그래도 뷰 모드와 다른 페이지는 남는다 …`가 소유한다.)
    const tabs = within(panel()).getAllByRole<HTMLButtonElement>('tab')
    expect(tabs.length).toBeGreaterThan(1)
    expect(disabledOf(tabs)).toEqual(tabs.map(() => false))
  })

  it('잠긴 동안 도착한 blur는 여기서도 커밋이 아니다', async () => {
    const view = await board()
    select('Field')
    await settle()
    openTab('상호작용')
    await settle()

    const valueInput = within(panel()).getByLabelText<HTMLInputElement>('값')
    fireEvent.change(valueInput, { target: { value: '치는 중' } })
    view.lock([foreign('n-field')])
    await settle()
    fireEvent.blur(within(panel()).getByLabelText<HTMLInputElement>('값'))
    await settle()

    expect(view.calls).toHaveLength(0)
    expect(view.status).toEqual([])
  })

  it('상호작용 탭으로도 스택이 살아 있다', async () => {
    const view = await board()
    select('Card')
    await settle()
    typeAndCommit('제목', 'A')
    await waitFor(() => expect(view.calls).toHaveLength(1))
    typeAndCommit('제목', 'B')
    await waitFor(() => expect(view.calls).toHaveLength(2))
    await settle()
    expect(stacks(view)).toEqual({ undo: 2, redo: 0 })

    view.lock([foreign('n-card')])
    await settle()
    openTab('상호작용')
    await settle()
    // `n-card`에는 규칙이 없으므로 `상호작용 추가` 하나가 그 탭의 유일한 입구다.
    fireEvent.click(within(panel()).getByRole('button', { name: '상호작용 추가' }))
    await settle()
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
    expect(stacks(view)).toEqual({ undo: 2, redo: 0 })
    expect(alertText()).toBeNull()
  })

  it('대조 — 잠기지 않은 노드에서는 같은 버튼이 편집을 낸다', async () => {
    const view = await board()
    select('Card')
    await settle()
    openTab('상호작용')
    await settle()

    // 형제가 잠겨 있어도 그대로다 — 서버도 200을 낼 자리다.
    view.lock([foreign('n-div')])
    await settle()
    fireEvent.click(within(panel()).getByRole('button', { name: '상호작용 추가' }))
    await waitFor(() => expect(view.calls).toHaveLength(1))

    expect(view.status).toEqual([200])
    expect(view.calls[0]?.ops[0]).toMatchObject({ path: '/root/children/0/interactions' })
  })
})

/** 지금 꺼져 있는 위젯마다 그것이 단 `wb-shell-*` 클래스들. */
function lockedClassSets(): string[][] {
  return panelControls()
    .filter((element) => (element as HTMLInputElement).disabled === true)
    .map((element) => element.className.split(/\s+/).filter((name) => name.startsWith('wb-shell-')))
}
