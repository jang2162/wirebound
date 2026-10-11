/**
 * 스냅샷 대화 상자(`src/shell/snapshots-panel.tsx`의 `SnapshotsBody` — 머리의 `…` 가 연다).
 *
 * **이 파일의 요점은 실패의 화면판이다.** *"실패했다고 말하는데 조작은 일어났다"*는 여러
 * 형태로 나는 부류이고, 아래 `저장이 실패했을 때 화면에 남는 것` 블록이 그 화면판을 셋으로
 * 나눠 잰다.
 *
 * ---
 *
 * # 진입은 `…` 의 «스냅샷»이다
 *
 * 스냅샷은 에디터 위의 대화 상자다(`src/shell/snapshots-panel.tsx` 머리말이 그 근거를 적고 있다).
 * 모든 케이스가 **셸을 열고 `…` 에서 `스냅샷`을 골라** 시작한다(`../editor-harness`의 `chooseFromShellMenu`) —
 * `openPage()`가 그 셸을 성공 대역까지 열어 준다.
 *
 * 셸 위에 떠서 갈리는 자리 둘:
 *
 * | 무엇 | 어떻게 |
 * |---|---|
 * | 조회 실패 두 갈래 | **`listSnapshots`가 던진다** — 셸이 `getProject`를 함께 쓰므로, 그것이 던지면 셸 자체가 안 뜬다(재려는 것은 상자의 조회다) |
 * | 버튼 훑기 | **상자 안만** 훑는다 — 셸 머리에 `되돌리기`(undo)가 있어 문서 전체를 훑으면 그것이 함께 걸린다 |
 *
 * **상자가 열려야 조회가 시작된다**(내보내기와 같은 판단) — 셸이 뜨는 것만으로
 * 스냅샷을 부르지 않는다. 아래 `누르기 전에는 아무것도 안 부른다`가 그 자리다.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import type { WbNode } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, ProjectView, ProjectRole, RestoreResult, SnapshotSummary } from '../../src/api/types'
import { currentPath, expiringSession } from '../helpers'
import {
  PAGE_ID,
  PAGE_ROUTE,
  PROJECT_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  canvasRootId,
  chooseFromShellMenu,
  nodeElement,
  openPage,
  pageDetail,
  pageDoc,
  renderEditor,
  structureTypes,
  waitForNode,
} from '../editor-harness'

/** 문지기(`RequireAuth`)를 지나려면 `me`가 있어야 한다. 셸도 그 아래에 산다. */
const user = { id: 'u1', email: 'a@example.com', name: '홍길동' }

/**
 * **이름은 하네스의 것을 쓴다.** `openPage()`가 그 이름을 기다려 *"셸이 성공 대역으로
 * 떴다"*를 확인하므로(`../editor-harness`), 다른 이름을 주면 거기서 멈춘다.
 */
function project(role: ProjectRole): ProjectView {
  return { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role, themeRev: 0 }
}

/**
 * 셸을 열고 `…` 에서 `스냅샷`을 고른다. **가짜는 하네스 것 위에 덮는 조각만 준다** —
 * `fakeApi`를 통째로 만들어 넘기면 스텁 안 된 메서드가 `notStubbed`가 되어 셸의 트리와
 * 캔버스가 함께 죽는다(그러면 단언이 *"상자가 무엇을 말하는가"*가 아니라 *"오류가
 * 떴는가"*를 보게 된다 — `editor-shell.test.tsx` 머리말의 그 사고다).
 */
async function openPanel(overrides: Partial<ApiClient>): Promise<void> {
  await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }), { apiOverrides: overrides })
  chooseFromShellMenu('스냅샷')
}

/**
 * 상자 안의 몸체. **단언을 여기로 좁히는 케이스가 있다** — 셸 머리에 `되돌리기`(undo)가 있어
 * 문서 전체에서 버튼을 훑으면 그것이 함께 걸린다.
 */
function panel(): HTMLElement {
  return screen.getByRole('group', { name: '스냅샷' })
}

/**
 * 주소를 옮기는 버튼. 셸에는 *"페이지 없는 주소 → 페이지"*로 가는 길이 트리밖에 없고,
 * 트리 클릭은 조회를 하나 더 태워 세는 것을 흐린다. `editor-shell.test.tsx`의 같은 장치다.
 */
function GoTo(props: { to: string }): ReactElement {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(props.to)}>
      이동
    </button>
  )
}

/** 이 파일이 덮는 조각만 든다. 이름을 `fakeApi`와 갈라 둔 근거는 `openPanel`에 있다. */
function panelApi(overrides: Partial<ApiClient>): Partial<ApiClient> {
  return overrides
}

/**
 * 서버가 낼 복원 결과. **두 블록이 쓴다** — 결과 셋을 재는 쪽(`복원`)과 셸이 다시 읽는지
 * 재는 쪽(`복원 뒤 재동기화`).
 */
function restoreResult(overrides: Partial<RestoreResult> = {}): RestoreResult {
  return {
    summary: {
      menu: { created: 0, updated: 1, deleted: 0 },
      pages: { created: 0, metaUpdated: 0, schemaChanged: 2, schemaUnchanged: 3, deleted: 1 },
      comments: { created: 0, updated: 0, deleted: 0 },
    },
    safetySnapshot: { id: 's9', tag: '복원 전 2026-08-12T09:24:30.443Z' },
    ...overrides,
  }
}

function snapshot(overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
  return {
    id: 's1',
    tag: 'v1',
    description: '첫 릴리스 직전',
    createdBy: 'u1',
    createdByName: '홍길동',
    createdAt: '2026-08-12T09:00:00.000Z',
    payloadBytes: 8123,
    ...overrides,
  }
}

/** 서버가 태그 중복으로 내는 409. **문장이 지문 불일치와 다르다**(서버 README). */
function duplicateTagError(): ApiError {
  return new ApiError(409, 'conflict', '같은 태그의 스냅샷이 이미 있습니다')
}

/** 서버가 지문 불일치로 내는 409. */
function fingerprintError(): ApiError {
  return new ApiError(409, 'conflict', '스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
}

/**
 * **`fireEvent`다 — `@testing-library/user-event`는 이 저장소의 의존이 아니다**(전역 제약:
 * *"`apps/web`에 새 런타임 의존을 더하지 않는다"*).
 */
function saveWith(tag: string, description?: string): void {
  fireEvent.change(screen.getByLabelText('태그'), { target: { value: tag } })
  if (description !== undefined) {
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: description } })
  }
  fireEvent.click(screen.getByRole('button', { name: '지금 상태를 태그로 저장' }))
}

describe('목록', () => {
  it('태그·설명·만든 사람·시각·바이트를 그린다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
    })

    await openPanel(client)

    expect(await screen.findByText('v1')).toBeTruthy()
    expect(screen.getByText('첫 릴리스 직전')).toBeTruthy()
    // **상자 안에서 찾는다.** `…` 메뉴 머리가 *지금 로그인한 사람*의 이름을
    // 그리는데(메뉴가 열려 있을 때 — `routes/editor.tsx`) 이 케이스에서는 그것이 스냅샷을 만든 사람과
    // 같은 값이다 — 화면 전체에서 찾으면 둘이 잡혀 `getByText`가 던진다. 여기서 재려는
    // 것은 **목록의 한 줄이 만든 사람을 그리는가**이므로 범위가 상자인 편이 맞다.
    expect(within(panel()).getByText('홍길동')).toBeTruthy()
    expect(screen.getByText('2026-08-12T09:00:00.000Z')).toBeTruthy()
    // **자릿수 구분만 하고 단위를 바꾸지 않는다** — KB로 접으면 작은 스냅샷이 전부 `0KB`가
    // 되어 설계서 「열린 질문 (구현 중 결정)」의 스냅샷 보관 정책을 닫을 관측이 사라진다.
    expect(screen.getByText('8,123B')).toBeTruthy()
  })

  it('비었으면 그렇게 말한다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
    })

    await openPanel(client)

    expect(await screen.findByText('아직 스냅샷이 없습니다.')).toBeTruthy()
  })

  /**
   * **owner가 아닌 사람에게는 복원 버튼이 없다 — 회색으로 비활성해 두지도 않는다.**
   * 지키는 명제는 *"쓸 수 없는 기능을 UI에 그려 두지 않는다"*이고, 이 케이스는 그것을
   * **비활성 버튼까지 포함해서** 잰다. owner에게는 버튼이 선다(아래
   * `owner에게는 줄마다 복원 버튼이 선다`).
   */
  for (const role of ['editor', 'viewer'] as const) {
    it(`${role}에게는 복원 버튼이 없다 — 비활성 상태로도 없다`, async () => {
      const client = panelApi({
        me: async () => user,
        getProject: async () => project(role),
        listSnapshots: async () => [snapshot()],
      })

      await openPanel(client)
      await screen.findByText('v1')

      // `hidden: true`로 훑어 `aria-hidden`이나 비활성 버튼까지 본다.
      // **`queryAllByRole`이다** — viewer에게는 저장 폼도 없어 버튼이 **0개**이고,
      // `getAllByRole`은 0개에서 던진다(그러면 이 케이스가 재려는 것과 무관하게 죽는다).
      //
      // **상자 안만 훑는다.** 문서 전체를 훑으면 셸 머리의 `되돌리기`(undo)가 아래
      // 패턴에 걸려, 역할과 무관하게 늘 실패한다 — 재려는 것은 *"이 줄에 복원 버튼이
      // 서는가"*이지 화면 어딘가에 그 낱말이 있는가가 아니다.
      const labels = within(panel())
        .queryAllByRole('button', { hidden: true })
        .map((button) => button.textContent)
      expect(labels.filter((label) => label !== null && /복원|되돌리/.test(label))).toEqual([])
    })
  }

  /**
   * **설명이 줄의 마지막 칸이다 — 이것이 레이아웃의 절반이다.**
   *
   * `shell.css`에서 설명만 `flex-basis: 100%`라 자기 줄을 통째로 쓰는데, 그 성질은 **맨
   * 뒤에 있을 때만** 뜻이 있다. 앞으로 옮기면 그 100%가 태그 **바로 뒤**에서 줄을 끊어
   * 태그 혼자 첫 줄에 남고 나머지가 셋째 줄로 밀린다.
   *
   * **CSS 쪽 짝은 `snapshots-layout.test.ts`가 잡는다** — 거기 머리말에 이 화면이 520px
   * 좁은 상자에서 무너지는 실측이 있다. 둘이 함께 있어야 이 레이아웃이 선다.
   */
  it('설명이 줄의 마지막 칸이다 — 자기 줄을 쓰려면 맨 뒤여야 한다', async () => {
    const client = panelApi({
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
    })

    await openPanel(client)
    await screen.findByText('v1')

    const row = panel().querySelector('.wb-shell-snapshots-row')
    expect(row).not.toBeNull()
    expect(row?.lastElementChild?.className).toBe('wb-shell-snapshots-desc')
    // 앞 칸들의 순서까지 함께 못박는다 — 하나가 뒤로 밀리면 설명이 마지막이 아니게 된다.
    expect([...(row?.children ?? [])].map((cell) => cell.className)).toEqual([
      'wb-shell-snapshots-tag',
      'wb-shell-snapshots-author',
      'wb-shell-snapshots-time',
      'wb-shell-snapshots-bytes',
      'wb-shell-snapshots-restore',
      'wb-shell-snapshots-desc',
    ])
  })

  /** 확인 단계가 열려도 설명은 마지막이다 — 확인 칸도 자기 줄을 쓴다(같은 근거). */
  it('확인 단계가 열려도 설명이 마지막 칸이다', async () => {
    const client = panelApi({
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
    })

    await openPanel(client)
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))

    const row = panel().querySelector('.wb-shell-snapshots-row')
    expect([...(row?.children ?? [])].map((cell) => cell.className)).toEqual([
      'wb-shell-snapshots-tag',
      'wb-shell-snapshots-author',
      'wb-shell-snapshots-time',
      'wb-shell-snapshots-bytes',
      'wb-shell-snapshots-confirm',
      'wb-shell-snapshots-desc',
    ])
  })

  it('owner에게는 줄마다 복원 버튼이 선다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot(), snapshot({ id: 's2', tag: 'v2' })],
    })

    await openPanel(client)
    await screen.findByText('v1')

    expect(screen.getAllByRole('button', { name: '이 상태로 되돌리기' })).toHaveLength(2)
  })
})

/**
 * 복원. **확인을 받고, 결과를 말한다.**
 *
 * 이 블록이 재는 것 넷: 확인 단계가 실제로 있는가 · 결과가 말할 넷을 말하는가 ·
 * 실패가 서버 문장 그대로 보이는가 · **성공 뒤 재조회가 실패해도 성공 알림이 남는가**
 * (아래 `저장은 됐는데 목록만 못 받았을 때`와 같은 부류이고, 복원은 그 부류가 더 위험하다).
 */
describe('복원', () => {
  /** owner로 목록을 그리고 첫 줄의 복원 버튼을 누른 상태까지 간다. */
  async function openConfirm(client: Partial<ApiClient>): Promise<void> {
    await openPanel(client)
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
  }

  it('버튼 한 번으로는 되돌리지 않는다 — 확인을 받는다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: restore,
    })

    await openConfirm(client)

    // **아직 아무것도 부르지 않았다.**
    expect(restore).not.toHaveBeenCalled()
    // 무엇을 되돌리는지 문장이 말한다 — 줄이 여럿인 목록에서 어느 줄에 답하는지 알 수 있어야 한다.
    expect(screen.getByRole('alert').textContent).toContain('v1')
    expect(screen.getByRole('alert').textContent).toContain('프로젝트 전체가 바뀝니다')
  })

  it('취소하면 부르지 않고 확인만 닫는다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: restore,
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(restore).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '이 상태로 되돌리기' })).toBeTruthy()
  })

  it('확인하면 그 스냅샷 id로 부른다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot({ id: 's7' })],
      restoreSnapshot: restore,
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    // 셋째 인자는 이 탭이 지은 복원 id 다(`RestoreOptions` — 신호를 알아보는 값).
    await waitFor(() => expect(restore).toHaveBeenCalledWith(PROJECT_ID, 's7', { clientRestoreId: expect.any(String) }))
  })

  /**
   * **바뀐 수와 그대로인 수를 따로 말한다.** 둘째가 빠지면 *"0개가 바뀌었습니다"*가
   * **아무 일도 안 일어난 것**과 **전부 그대로였던 것**을 구분하지 못한다.
   */
  it('결과가 셋을 말한다 — 바뀐 수·그대로인 수·안전망 태그', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('v1')
    expect(status.textContent).toContain('2개가 바뀌')
    expect(status.textContent).toContain('3개는 그대로')
    expect(status.textContent).toContain('복원 전 2026-08-12T09:24:30.443Z')
  })

  it('성공하면 목록을 다시 받는다 — 프로젝트가 바뀌었고 안전망이 하나 생겼다', async () => {
    const list = vi.fn(async () => [snapshot()])
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: list,
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    expect(list).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  /**
   * **서버 문장을 그대로 그린다.** 복원의 실패는 여덟 갈래인데 코드로는 넷으로만 갈린다 —
   * 화면이 문안을 다시 쓰면 사용자는 *"레이아웃이 다르다"*와 *"다시 시도하라"*를 구분하지 못한다.
   */
  it('실패하면 서버 문장을 그대로 보이고 목록을 다시 받지 않는다', async () => {
    const list = vi.fn(async () => [snapshot()])
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: list,
      restoreSnapshot: async () => {
        throw new ApiError(409, 'conflict', '레이아웃 구성이 스냅샷과 다릅니다 (스냅샷 1개, 현재 2개). 복원하지 않았습니다')
      },
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    const alert = await screen.findByText(/레이아웃 구성이 스냅샷과 다릅니다/)
    expect(alert).toBeTruthy()
    // **실패한 복원이 목록을 바꿀 수 없다.**
    expect(list).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  /**
   * **`저장은 됐는데 목록만 못 받았을 때`와 같은 부류이고, 복원은 그 부류가 더 위험하다.**
   * 사용자가 실패한 줄 알고 다시 누르면 이미 되돌아간 상태 위에 **안전망 스냅샷이 하나 더
   * 쌓이고, 스냅샷은 지울 수 없다**(설계서 「스냅샷」).
   */
  it('성공 뒤 목록 재조회가 실패해도 성공 알림이 남는다', async () => {
    let calls = 0
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        calls += 1
        if (calls > 1) throw new ApiError(500, 'internal', '서버 오류가 발생했습니다')
        return [snapshot()]
      },
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    // 성공 알림과 재조회 실패가 **나란히** 선다 — 하나가 다른 하나를 지우지 않는다.
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('되돌렸습니다')
    await waitFor(() => expect(screen.getByText(/저장은 됐지만 목록을 갱신하지 못했습니다/)).toBeTruthy())
    // 화면이 갈아엎히지 않았다 — 목록이 그대로 있다.
    expect(screen.getByText('v1')).toBeTruthy()
  })

  it('저장 성공 알림과 복원 성공 알림이 함께 보이지 않는다 — 알림은 하나다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => snapshot({ id: 's2', tag: 'v2' }),
      restoreSnapshot: async () => restoreResult(),
    })

    await openPanel(client)
    await screen.findByText('v1')
    saveWith('v2')
    await screen.findByText('v2 저장됨')

    fireEvent.click(screen.getAllByRole('button', { name: '이 상태로 되돌리기' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await screen.findByText(/되돌렸습니다/)
    expect(screen.queryByText('v2 저장됨')).toBeNull()
  })
})

describe('권한 (설계서 「권한 모델」 — 생성은 editor)', () => {
  it('editor는 저장 폼을 본다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('editor'),
      listSnapshots: async () => [],
    })

    await openPanel(client)

    expect(await screen.findByRole('button', { name: '지금 상태를 태그로 저장' })).toBeTruthy()
  })

  it('viewer는 목록만 본다 — 폼 자리에 이유가 있다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('viewer'),
      listSnapshots: async () => [snapshot()],
    })

    await openPanel(client)

    expect(await screen.findByText('v1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '지금 상태를 태그로 저장' })).toBeNull()
    expect(screen.getByText(/스냅샷을 만들 권한이 없습니다/)).toBeTruthy()
  })
})

describe('저장', () => {
  it('태그를 보내고 성공하면 목록을 다시 받는다', async () => {
    const createSnapshot = vi.fn(async () => snapshot({ tag: 'v2' }))
    const listSnapshots = vi
      .fn<() => Promise<SnapshotSummary[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([snapshot({ tag: 'v2' })])
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots,
      createSnapshot,
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    await waitFor(() => expect(createSnapshot).toHaveBeenCalledWith(PROJECT_ID, { tag: 'v2' }))
    expect(await screen.findByText('v2')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('v2 저장됨')
  })

  /**
   * **빈 설명은 키를 만들지 않는다.** `''`를 보내면 *"설명이 빈 문자열"*이 되고 `null`
   * (적지 않음)과 갈린다 — 서버가 둘을 다르게 저장한다(`description` 컬럼이 nullable이다).
   */
  it('설명을 적지 않으면 그 키를 보내지 않는다', async () => {
    // **`vi.fn(async () => …)`으로 두면 인자 튜플이 `[]`로 추론되어 `mock.calls[0][1]`이
    // 컴파일 오류다**(vitest는 타입을 안 보므로 테스트만으로는 안 드러난다).
    // `ApiClient['createSnapshot']`을 그대로 씌워 인자 모양을 준다.
    const createSnapshot = vi.fn<ApiClient['createSnapshot']>(async () => snapshot())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot,
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v1')

    await waitFor(() => expect(createSnapshot).toHaveBeenCalledTimes(1))
    expect(Object.hasOwn(createSnapshot.mock.calls[0]![1], 'description')).toBe(false)
  })

  it('설명을 적으면 함께 보낸다', async () => {
    const createSnapshot = vi.fn(async () => snapshot())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot,
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v1', '릴리스 직전')

    await waitFor(() => expect(createSnapshot).toHaveBeenCalledWith(PROJECT_ID, { tag: 'v1', description: '릴리스 직전' }))
  })
})

/**
 * # 두 409가 서로 다른 문장으로 보인다
 *
 * 사용자가 할 일이 다르다 — 태그 중복은 *"이름을 바꾼다"*이고 지문 불일치는 *"그대로 다시
 * 보낸다"*이다. **코드는 둘 다 `conflict`이라 화면이 코드로는 가를 수 없고**, 서버가 문장을
 * 갈라 준다. 그래서 화면은 문안을 다시 쓰지 않고 서버 문장을 그대로 그린다.
 */
describe('두 409를 가른다', () => {
  it('태그 중복이면 이름을 바꾸라는 문장이 보인다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => {
        throw duplicateTagError()
      },
    })

    await openPanel(client)
    await screen.findByText('v1')
    saveWith('v1')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('같은 태그의 스냅샷이 이미 있습니다')
    expect(alert.textContent).not.toContain('다시 시도')
  })

  it('지문 불일치면 다시 시도하라는 문장이 보인다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => {
        throw fingerprintError()
      },
    })

    await openPanel(client)
    await screen.findByText('v1')
    saveWith('v2')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('다시 시도')
    expect(alert.textContent).not.toContain('이미 있습니다')
  })
})

/**
 * # *"실패했다고 말하는데 조작은 일어났다"*의 화면판
 *
 * 셋을 각각 잰다. **셋째가 요점이다** — 성공과 실패 표시를 각각의 상태로 두면 *"저장됨"*과
 * 오류가 함께 보이는 조합이 생긴다.
 */
describe('저장이 실패했을 때 화면에 남는 것', () => {
  it('목록에 새 줄이 생기지 않는다 — 목록을 다시 받지 않는다', async () => {
    const listSnapshots = vi.fn(async () => [snapshot()])
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots,
      createSnapshot: async () => {
        throw duplicateTagError()
      },
    })

    await openPanel(client)
    await screen.findByText('v1')
    saveWith('v1')

    await screen.findByRole('alert')
    // 목록 조회가 한 번뿐이다 = 실패한 저장이 목록을 다시 받게 하지 않았다.
    expect(listSnapshots).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('v1')).toHaveLength(1)
  })

  it('폼이 비워지지 않는다 — 다시 시도할 때 사용자가 다시 타이핑하지 않는다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot: async () => {
        throw fingerprintError()
      },
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v9')

    await screen.findByRole('alert')
    expect((screen.getByLabelText('태그') as HTMLInputElement).value).toBe('v9')
  })

  it('앞의 "저장됨"이 오류와 함께 남지 않는다', async () => {
    const createSnapshot = vi
      .fn<() => Promise<SnapshotSummary>>()
      .mockResolvedValueOnce(snapshot({ tag: 'v1' }))
      .mockRejectedValue(duplicateTagError())
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot,
    })

    await openPanel(client)
    await screen.findByText('v1')

    saveWith('v1')
    expect((await screen.findByRole('status')).textContent).toContain('저장됨')

    saveWith('v1')
    await screen.findByRole('alert')
    // **성공 알림이 사라졌다.** 남아 있으면 "저장됨"과 오류가 함께 보인다.
    expect(screen.queryByRole('status')).toBeNull()
  })

  /**
   * **위 케이스는 `setNotice(null)`을 재지 못한다.**
   *
   * 그 줄을 지워도 위 케이스는 안 죽는다. `notice`가 판별 유니온 **하나**라서 실패 경로의
   * `setNotice({kind:'error'})`가 앞 값을 어차피 덮기 때문이다 — *"둘이 함께 보이지
   * 않는다"*를 떠받치는 것은 그 줄이 아니라 **상태를 하나로 둔 구조**다.
   *
   * `setNotice(null)`이 실제로 지키는 것은 **요청이 도는 동안**이다: 지우지 않으면 앞의
   * *"저장됨"*이 다음 요청 내내 화면에 남아, 사용자가 **아직 끝나지 않은 저장을 이미
   * 성공했다고 읽는다.** 이 케이스가 그 창을 잰다 — 응답을 붙들어 둔 채 화면을 본다.
   */
  it('요청이 도는 동안 앞의 "저장됨"이 남지 않는다', async () => {
    let release: (() => void) | undefined
    const createSnapshot = vi
      .fn<() => Promise<SnapshotSummary>>()
      .mockResolvedValueOnce(snapshot({ tag: 'v1' }))
      .mockImplementationOnce(
        () =>
          new Promise<SnapshotSummary>((resolve) => {
            release = () => resolve(snapshot({ tag: 'v2' }))
          }),
      )
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot,
    })

    await openPanel(client)
    await screen.findByText('v1')

    saveWith('v1')
    expect((await screen.findByRole('status')).textContent).toContain('저장됨')

    // 두 번째 저장은 응답이 오지 않는다 — 그 사이의 화면을 본다.
    saveWith('v2')
    await waitFor(() => expect(createSnapshot).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).toBeNull()

    // 붙들어 둔 응답을 풀어 준다 — 안 풀면 이 테스트가 끝난 뒤 상태 갱신이 새어 나간다.
    release?.()
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('v2 저장됨'))
  })
})

/**
 * # **저장은 성공했는데 목록 재조회가 실패하는** 갈래
 *
 * 위 셋은 *"저장이 실패했을 때"*를 다룬다. 이 블록은 그 반대편이다 — 성공했는데 실패만
 * 보이면 사용자는 같은 태그로 다시 시도해 409를 받고, 스냅샷은 지울 수 없으므로(설계서
 * 「스냅샷」) 그 태그는 영영 그 이름이다.
 *
 * 재조회 실패로 화면을 오류 화면으로 갈아엎으면 화면 전문이
 * `"스냅샷을 열지 못했습니다서버 오류가 발생했습니다…"`가 되고 `role=status`가 **빈 배열**이
 * 된다 — *"저장됨"*이 통째로 사라진다.
 */
describe('저장은 됐는데 목록만 못 받았을 때', () => {
  /** 두 번째 조회부터 실패하는 `listSnapshots`. 첫 조회(화면 진입)는 성공해야 한다. */
  function listThenFail(): ReturnType<typeof vi.fn<() => Promise<SnapshotSummary[]>>> {
    return vi
      .fn<() => Promise<SnapshotSummary[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValue(new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
  }

  function savedThenFailingReload() {
    return panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: listThenFail(),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })
  }

  it('"저장됨"이 그대로 남는다', async () => {
    await openPanel(savedThenFailingReload())
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    // 목록 갱신 실패가 화면에 뜬 **뒤에도** 성공 알림이 살아 있어야 한다.
    await screen.findByRole('alert')
    expect(screen.getByRole('status').textContent).toContain('v2 저장됨')
  })

  it('목록을 못 갱신했다는 것도 함께 보인다 — 서버 문장을 그대로 싣는다', async () => {
    await openPanel(savedThenFailingReload())
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('저장은 됐지만 목록을 갱신하지 못했습니다')
    expect(alert.textContent).toContain('서버 오류가 발생했습니다')
  })

  it('오류 화면으로 갈아엎지 않는다 — 목록이 그대로 있다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([snapshot({ tag: 'v1' })])
        .mockRejectedValue(new ApiError(500, 'internal', '서버 오류가 발생했습니다')),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })

    await openPanel(client)
    await screen.findByText('v1')
    saveWith('v2')

    await screen.findByRole('alert')
    // 앞서 받은 목록이 살아 있다. 갈아엎었다면 `FAILURE_TITLE` 화면만 남는다.
    expect(screen.getByText('v1')).toBeTruthy()
    expect(screen.queryByText('스냅샷을 열지 못했습니다')).toBeNull()
    // 폼도 살아 있어야 다시 시도할 수 있다.
    expect(screen.getByRole('button', { name: '지금 상태를 태그로 저장' })).toBeTruthy()
  })

  /**
   * **`signed-out`만 예외다.** 세션이 끊긴 것은 *"목록만 못 받았다"*가 아니다 — 낡은 목록을
   * 계속 보여 주면 사용자가 아직 로그인해 있다고 믿는다.
   */
  it('세션이 끊겼으면 목록을 붙들지 않고 로그인으로 보낸다', async () => {
    const client = panelApi({
      me: expiringSession(user),
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([])
        .mockRejectedValue(new ApiError(401, 'unauthenticated', '로그인이 필요합니다')),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  /** **첫 조회 실패는 그대로 오류 화면이다** — 붙들 화면이 아직 없다. 음성 대조. */
  it('첫 조회가 실패하면 여전히 오류 화면이다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        throw new ApiError(500, 'internal', '서버 오류가 발생했습니다')
      },
    })

    await openPanel(client)

    expect(await screen.findByText('스냅샷을 열지 못했습니다')).toBeTruthy()
  })

  /** 재조회가 성공하면 그 문장이 사라진다 — 남아 있으면 낫지 않은 실패를 계속 말한다. */
  it('다음 저장이 목록까지 성공하면 그 문장이 사라진다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
        .mockResolvedValue([snapshot({ tag: 'v3' })]),
      createSnapshot: async () => snapshot({ tag: 'v3' }),
    })

    await openPanel(client)
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')
    await screen.findByRole('alert')

    saveWith('v3')

    expect(await screen.findByText('v3')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('status').textContent).toContain('v3 저장됨')
  })
})

/**
 * # 상자의 조회가 실패했을 때
 *
 * **던지는 것은 `listSnapshots`다 — `getProject`가 아니다.** 셸이 같은 `getProject`로
 * 프로젝트를 받으므로, 그것이 던지면 **셸 자체가 안 뜬다** — 그러면 이 두 케이스가 재는
 * 것이 *"상자가 조회 실패를 어떻게 그리는가"*가 아니라 *"셸이 안 떴다"*가 된다.
 * 상자는 둘을 `Promise.all`로 함께 받으므로 어느 쪽이 던져도 같은 갈래를 지난다.
 */
describe('조회 실패', () => {
  it('세션이 끊겼으면 로그인으로 보낸다', async () => {
    // **문지기는 통과시키고 그다음 조회부터 401이다.** 재현하는 상황은 *"화면에 들어와
    // 있는 동안 서버가 세션을 지웠다"*이고, `expiringSession`이 그 형태를 만든다 —
    // 뒤 호출까지 성공하게 두면 로그인 화면이 다시 목록으로 돌려보내 두 주소를 오간다.
    const client = panelApi({
      me: expiringSession(user),
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
      },
    })

    await openPanel(client)

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  it('그 밖의 실패는 서버 문장을 그대로 그린다', async () => {
    const client = panelApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        throw new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다')
      },
    })

    await openPanel(client)

    expect((await within(panel()).findByRole('alert')).textContent).toContain('프로젝트를 찾을 수 없습니다')
    // **제목도 함께 있다** — *"목록을 통째로 못 받았다"*와 *"저장이 실패했다"*는 다른
    // 사실인데, 서버 문장만 있으면 둘이 같은 모양으로 보인다.
    expect(within(panel()).getByText('스냅샷을 열지 못했습니다')).toBeTruthy()
  })
})

/**
 * # 대화 상자로서의 동작 — 여는 것과 닫는 것
 *
 * 닫는 장치 자체(Escape · 닫기 단추 · 바깥 누름으로는 안 닫힘 · 포커스 돌려줌)는
 * `shell-dialog.test.tsx`가 잰다. 여기서는 **이 화면에 붙어 있는가**와, 이 화면에만
 * 있는 결과(**확인 단계가 함께 풀린다**)를 본다.
 */
describe('대화 상자', () => {
  it('누르기 전에는 아무것도 안 부른다', async () => {
    let calls = 0
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }), {
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => {
          calls += 1
          return [snapshot()]
        },
      },
    })

    // 셸이 뜨는 것만으로는 부르지 않는다 — 상자는 열려야 조회한다.
    expect(calls).toBe(0)

    chooseFromShellMenu('스냅샷')
    await waitFor(() => expect(calls).toBe(1))
  })

  it('다시 열면 목록을 다시 받는다 — 그 사이 남이 스냅샷을 떴을 수 있다', async () => {
    const listSnapshots = vi.fn(async () => [snapshot()])
    await openPanel(panelApi({ getProject: async () => project('owner'), listSnapshots }))
    await screen.findByText('v1')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    chooseFromShellMenu('스냅샷')

    await waitFor(() => expect(listSnapshots).toHaveBeenCalledTimes(2))
  })

  /** **바깥 누름으로는 닫지 않는다** — 폼에 친 태그 · 설명을 잘못 누른 한 번에 잃지 않게(`src/shell/shell-dialog.tsx` 머리말). */
  it('바깥을 눌러도 닫히지 않는다', async () => {
    await openPanel(panelApi({ getProject: async () => project('owner'), listSnapshots: async () => [snapshot()] }))
    await screen.findByText('v1')

    fireEvent.mouseDown(screen.getByRole('main', { name: '캔버스' }))

    expect(screen.getByRole('group', { name: '스냅샷' })).toBeTruthy()
  })

  it('Escape로 닫힌다', async () => {
    await openPanel(panelApi({ getProject: async () => project('owner'), listSnapshots: async () => [snapshot()] }))
    await screen.findByText('v1')

    fireEvent.keyDown(screen.getByRole('dialog', { name: '스냅샷' }), { key: 'Escape' })

    expect(screen.queryByRole('group', { name: '스냅샷' })).toBeNull()
  })

  /**
   * **복원 확인 중에도 특례가 없다.** 그냥 닫히고 확인이 풀린다 — 예외를 두면 *"언제
   * 닫히는가"*가 화면마다 달라지고 그 규칙을 사용자가 외워야 한다. 되돌릴 수 없는 조작을
   * 막는 장치인데 **닫히는 쪽이 안전한 방향**이기도 하다.
   */
  it('확인 중에 닫으면 확인이 풀린다 — 다시 열어도 물어보는 상태가 아니다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = panelApi({
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: restore,
    })
    await openPanel(client)
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
    expect(screen.getByRole('button', { name: '되돌린다' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')

    // 확인이 풀렸다. 남아 있으면 사용자가 **잊은 확인 위에서** `되돌린다`를 누르게 된다.
    expect(screen.queryByRole('button', { name: '되돌린다' })).toBeNull()
    expect(screen.getByRole('button', { name: '이 상태로 되돌리기' })).toBeTruthy()
    expect(restore).not.toHaveBeenCalled()
  })
})

/**
 * # 복원 뒤 재동기화 — **에디터 위에 떠서 지는 몫이다**
 *
 * 대화 상자는 에디터 **위에** 뜨므로 되돌린 뒤 셸이 통째로 다시 마운트돼 자연히 다시 읽히는
 * 길이 없다 — 안 알리면 **되돌렸는데 캔버스는 옛 문서를 그대로 보인다.**
 *
 * **문서만으로 부족하다.** 복원은 페이지를 지우고 만들므로 **트리도 바뀌고**, 지금 보고
 * 있던 페이지가 사라질 수도 있다. 아래 셋이 그 셋이다.
 */
describe('복원 뒤 재동기화', () => {
  const 옛뿌리: WbNode = { id: 'n-old', type: 'Page', children: [] }
  const 새뿌리: WbNode = { id: 'n-new', type: 'Page', children: [] }

  /** 복원 전후로 다른 것을 내는 `getPage`. 첫 응답이 `옛뿌리`여야 셸이 열린다. */
  function pageThen(second: () => Promise<PageDetail>): {
    getPage: ApiClient['getPage']
    calls: () => number
  } {
    let calls = 0
    return {
      calls: () => calls,
      getPage: async (_projectId, pageId) => {
        calls += 1
        return calls === 1 ? pageDetail(pageId, pageDoc(옛뿌리)) : second()
      },
    }
  }

  /** 셸을 열고 스냅샷 상자를 연 뒤 확인까지 간다. 남은 것은 `되돌린다` 한 번이다. */
  async function openConfirm(overrides: Partial<ApiClient>): Promise<void> {
    await openPage(pageDoc(옛뿌리), {
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => [snapshot()],
        restoreSnapshot: async () => restoreResult(),
        ...overrides,
      },
    })
    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
  }

  it('성공하면 캔버스가 새 문서를 읽는다', async () => {
    const { getPage } = pageThen(async () => pageDetail(PAGE_ID, pageDoc(새뿌리)))
    await openConfirm({ getPage })
    expect(canvasRootId()).toBe('n-old')

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await waitForNode('n-new')
    // 옛 문서가 남아 있지 않다 — 남으면 "되돌렸는데 화면은 그대로"의 그 고장이다.
    expect(nodeElement('n-old')).toBeNull()
  })

  /**
   * **트리는 `resyncToken`이 닿지 않는 자리다**(재연결은 이 페이지의 프레임만 잃는다).
   * 복원은 페이지 목록 자체를 바꾸므로 셸이 따로 신호를 내려보낸다.
   */
  it('성공하면 트리를 다시 받는다 — 페이지 목록 자체가 바뀐다', async () => {
    const { getPage } = pageThen(async () => pageDetail(PAGE_ID, pageDoc(새뿌리)))
    let trees = 0
    await openConfirm({
      getPage,
      getTree: async () => {
        trees += 1
        return trees === 1
          ? [{ id: 'mn-1', title: '회원관리', sortOrder: 1, pages: [{ id: PAGE_ID, title: '회원 목록', sortOrder: 1 }], children: [] }]
          : [
              {
                id: 'mn-1',
                title: '회원관리',
                sortOrder: 1,
                pages: [{ id: PAGE_ID, title: '되살아난 페이지', sortOrder: 1 }],
                children: [],
              },
            ]
      },
    })
    expect(screen.getByText('회원 목록')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    expect(await screen.findByText('되살아난 페이지')).toBeTruthy()
  })

  /**
   * **보고 있던 페이지가 복원으로 사라지면.** 서버가 404를 내고, 화면은 그 문장을 그린다.
   *
   * **재연결 재조회는 같은 자리에서 조용히 둔다** — 그쪽은 화면이 재연결 전과 같고 잃은
   * 것이 없다. 복원은 아니다: 프로젝트가 방금 통째로 바뀐 것을 이미 알고 있으므로 화면에
   * 남은 문서는 *"아직 확인 못 한 것"*이 아니라 **틀린 것**이다.
   *
   * **스토어까지 비운다.** 캔버스만 오류로 바꾸면 문서를 스토어에서 읽는 나머지 둘
   * (구조 트리·속성 패널)이 **사라진 페이지의 노드를 계속 그린다** — 셋이 같은 사실을
   * 말해야 한다.
   */
  it('보고 있던 페이지가 사라지면 캔버스가 그렇게 말하고 옛 노드가 남지 않는다', async () => {
    const { getPage } = pageThen(async () => {
      throw new ApiError(404, 'not-found', '페이지를 찾을 수 없습니다')
    })
    await openConfirm({ getPage })
    expect(structureTypes()).toEqual(['Page'])

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeTruthy()
    // 셋이 같은 사실을 말한다.
    await waitFor(() => expect(canvasRootId()).toBeNull())
    expect(structureTypes()).toEqual([])
    expect(nodeElement('n-old')).toBeNull()
  })

  /** **음성 대조 둘.** 신호를 아무 때나 올리면 이 둘이 죽는다. */
  it('실패한 복원은 다시 읽게 하지 않는다', async () => {
    const { getPage, calls } = pageThen(async () => pageDetail(PAGE_ID, pageDoc(새뿌리)))
    await openConfirm({
      getPage,
      restoreSnapshot: async () => {
        throw new ApiError(409, 'conflict', '레이아웃 구성이 스냅샷과 다릅니다')
      },
    })
    expect(calls()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
    await within(panel()).findByText(/레이아웃 구성이 스냅샷과 다릅니다/)

    expect(calls()).toBe(1)
    expect(canvasRootId()).toBe('n-old')
  })

  /**
   * **열린 페이지가 없을 때도 신호를 소비한다.** 재연결 쪽에 같은 케이스가
   * 있고(`edit/reconnect-resync.test.tsx`) 근거도 같다 — **두 이펙트가 같은 모양이라
   * 고장도 같다.**
   *
   * `pageId === undefined`일 때 `handledRestore`를 갱신하지 않고 빠지면, 나중에
   * 페이지를 열 때 그 페이지를 **두 번** 읽는다.
   */
  it('페이지를 안 연 채로 복원해도, 그 뒤에 연 페이지는 한 번만 읽는다', async () => {
    const getPage = vi.fn(async (_projectId: string, pageId: string) => pageDetail(pageId, pageDoc(옛뿌리)))
    renderEditor({
      route: PROJECT_ROUTE,
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => [snapshot()],
        restoreSnapshot: async () => restoreResult(),
        getPage,
      },
      children: <GoTo to={PAGE_ROUTE} />,
    })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
    await screen.findByText(/되돌렸습니다/)

    // 열린 페이지가 없으니 다시 읽을 것도 없다 — 여기까지는 신호를 안 소비하는 구현도 같다.
    expect(getPage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '이동' }))
    await waitForNode('n-old')
    await waitFor(() => expect(getPage).toHaveBeenCalled())

    // **두 번이면 신호를 안 소비한 것이다.**
    expect(getPage.mock.calls.map((call) => String(call[1]))).toEqual([PAGE_ID])
  })

  /**
   * **복원은 문서와 트리 말고도 코멘트 · 페이지 설명을 바꾼다**(`services/restore-plan.ts`의 단계 표).
   * 아래 둘은 그 둘을 떠 있는 채로 복원한 판이다 — 탭을 다녀와야 맞으면 안 된다.
   */
  it('코멘트 탭이 떠 있으면 목록을 다시 받는다 — 복원이 되살린 코멘트가 보인다', async () => {
    const withNode: WbNode = { id: 'n-old', type: 'Page', children: [{ id: 'n_a', type: 'Text', props: { content: '가' } }] }
    let lists = 0
    await openPage(pageDoc(withNode), {
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => [snapshot()],
        restoreSnapshot: async () => restoreResult(),
        listComments: async () => {
          lists += 1
          return lists === 1
            ? []
            : [
                {
                  id: 'c1',
                  nodeId: 'n_a',
                  body: '되살아난 코멘트',
                  authorId: user.id,
                  authorName: user.name,
                  createdAt: '2026-08-12T09:00:00.000Z',
                  updatedAt: '2026-08-12T09:00:00.000Z',
                },
              ]
        },
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    await waitFor(() => expect(lists).toBe(1))
    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    expect(await screen.findByText('되살아난 코멘트')).toBeTruthy()
    expect(lists).toBe(2)
  })

  it('페이지 설명 탭이 떠 있으면 설명을 다시 받는다', async () => {
    // 캔버스와 설명 탭이 **각자** `getPage`를 부르므로 부른 수가 아니라 복원 여부로 가른다.
    let restored = false
    await openPage(pageDoc(옛뿌리), {
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => [snapshot()],
        restoreSnapshot: async () => {
          restored = true
          return restoreResult()
        },
        getPage: async (_projectId, pageId) =>
          restored ? { ...pageDetail(pageId, pageDoc(새뿌리)), description: '스냅샷의 설명' } : pageDetail(pageId, pageDoc(옛뿌리)),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    fireEvent.click(screen.getByRole('tab', { name: '페이지 설명' }))
    const box = (await screen.findByRole('textbox', { name: '페이지 설명' })) as HTMLTextAreaElement
    expect(box.value).toBe('')
    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))

    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await waitFor(() => expect((screen.getByRole('textbox', { name: '페이지 설명' }) as HTMLTextAreaElement).value).toBe('스냅샷의 설명'))
  })

  it('스냅샷을 저장하는 것만으로는 다시 읽지 않는다 — 프로젝트가 안 바뀌었다', async () => {
    const { getPage, calls } = pageThen(async () => pageDetail(PAGE_ID, pageDoc(새뿌리)))
    await openPage(pageDoc(옛뿌리), {
      apiOverrides: {
        getProject: async () => project('owner'),
        listSnapshots: async () => [snapshot()],
        createSnapshot: async () => snapshot({ id: 's2', tag: 'v2' }),
        getPage,
      },
    })
    chooseFromShellMenu('스냅샷')
    await screen.findByText('v1')
    expect(calls()).toBe(1)

    fireEvent.change(screen.getByLabelText('태그'), { target: { value: 'v2' } })
    fireEvent.click(screen.getByRole('button', { name: '지금 상태를 태그로 저장' }))
    await screen.findByText('v2 저장됨')

    // 저장은 이 목록만 바꾼다. 한 신호로 접으면 스냅샷 하나마다 셸이 문서와 트리를 다시 읽는다.
    expect(calls()).toBe(1)
    expect(canvasRootId()).toBe('n-old')
  })
})
