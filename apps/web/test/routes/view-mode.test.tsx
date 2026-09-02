/**
 * **뷰 모드가 셸을 바꾼다** (설계 §9, P5-3 T3).
 *
 * §9의 표:
 *
 * | 무엇 | 편집 모드 | 뷰 모드 |
 * |---|---|---|
 * | 좌측 하단 구조 트리 | 보인다 | **접힌다** |
 * | 우측 탭 | 속성 / 코멘트 / 상호작용 | **페이지 설명** / 코멘트 / 상호작용 |
 *
 * 구조 트리 쪽은 P2b가 이미 닫았고 `routes/editor-shell.test.tsx`가 잰다. **여기가 재는
 * 것은 우측 탭이다** — P5-1 이월 §5가 지목하고 P5-2가 안 고친 자리다(`RightPanel`이
 * `mode`를 안 읽었다).
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  deselect,
  openPage,
  pageDetail,
  pageDoc,
  PROJECT_NAME,
  PROJECT_ROUTE,
  renderEditor,
} from '../editor-harness'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-list', type: 'List', props: {} }],
})

function tabs(): string[] {
  return screen.getAllByRole('tab').map((tab) => tab.textContent ?? '')
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

function toEdit(): void {
  fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
}

/** 설명을 실은 페이지 응답을 내는 가짜. */
function withDescription(description: string | null): { getPage: () => Promise<never> } {
  return {
    getPage: (async (_projectId: string, pageId: string) => ({
      ...pageDetail(pageId, DOC),
      description,
    })) as never,
  }
}

describe('§9 — 우측 탭 구성이 모드로 갈린다', () => {
  it('편집 모드는 속성 / 코멘트 / 상호작용이다', async () => {
    await openPage(DOC)

    expect(tabs()).toEqual(['속성', '코멘트', '상호작용'])
  })

  it('뷰 모드는 페이지 설명 / 코멘트 / 상호작용이다', async () => {
    await openPage(DOC)

    toView()

    expect(tabs()).toEqual(['페이지 설명', '코멘트', '상호작용'])
  })

  it('편집 모드로 돌아오면 속성이 돌아온다', async () => {
    // 한 방향만 보면 "뷰 모드를 지나면 영영 페이지 설명"인 구현도 위를 통과한다.
    await openPage(DOC)
    toView()

    toEdit()

    expect(tabs()).toEqual(['속성', '코멘트', '상호작용'])
  })

  it('뷰 모드에서 속성 탭의 본문이 사라진다 — 탭만 바뀌는 것이 아니다', async () => {
    await openPage(DOC)
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()
    expect(screen.queryByText('노드를 고르면 속성이 보입니다')).not.toBeNull()

    toView()

    expect(screen.queryByText('노드를 고르면 속성이 보입니다')).toBeNull()
  })
})

describe('§9 — 모드를 바꿀 때 보던 탭', () => {
  it('그 모드에도 있는 탭이면 그대로 둔다', async () => {
    await openPage(DOC, { apiOverrides: { listComments: async () => [] } })
    fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
    expect(screen.getByRole('tab', { name: '상호작용' }).getAttribute('aria-selected')).toBe('true')

    toView()

    expect(screen.getByRole('tab', { name: '상호작용' }).getAttribute('aria-selected')).toBe('true')
  })

  it('없는 탭이면 그 모드의 첫 탭으로 간다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('회원을 찾고 고치는 화면') })
    // 편집 모드의 첫 탭(속성)을 보고 있다.
    expect(screen.getByRole('tab', { name: '속성' }).getAttribute('aria-selected')).toBe('true')

    toView()

    expect(screen.getByRole('tab', { name: '페이지 설명' }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  it('되돌아오면 앞서 보던 탭이 되살아난다', async () => {
    // **고른 탭을 고치지 않는 것이 판정이다** — 뷰 모드가 속성을 못 보인다고 해서
    // "속성을 보고 있었다"는 사실까지 지우지 않는다.
    await openPage(DOC, { apiOverrides: withDescription(null) })
    toView()
    expect(screen.getByRole('tab', { name: '페이지 설명' }).getAttribute('aria-selected')).toBe(
      'true',
    )

    toEdit()

    expect(screen.getByRole('tab', { name: '속성' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('§9 — 편집 도구는 편집 모드에 있다 (리뷰 ②-4)', () => {
  it('뷰 모드에서는 되돌리기·다시 실행이 없다', async () => {
    await openPage(DOC)
    // 양성 대조: 편집 모드에는 있다. 이것이 없으면 아예 안 그리는 구현도 아래를 통과한다.
    expect(screen.getByRole('group', { name: '편집 이력' })).toBeTruthy()

    toView()

    expect(screen.queryByRole('group', { name: '편집 이력' })).toBeNull()
  })

  it('편집 모드로 돌아오면 되살아난다', async () => {
    await openPage(DOC)
    toView()

    toEdit()

    expect(screen.getByRole('group', { name: '편집 이력' })).toBeTruthy()
  })
})

describe('§9 — 페이지 설명 탭', () => {
  it('서버가 준 제목과 설명을 보인다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('회원을 찾고 고치는 화면') })

    toView()

    expect(await screen.findByText('회원을 찾고 고치는 화면')).toBeTruthy()
    // 제목도 함께 온다 — 어느 페이지의 설명인지가 보여야 한다.
    expect(screen.getByRole('heading', { name: '회원 목록' })).toBeTruthy()
  })

  it('설명이 없으면 그렇다고 말한다 — 빈 자리로 두지 않는다', async () => {
    await openPage(DOC, { apiOverrides: withDescription(null) })

    toView()

    expect(await screen.findByText('이 페이지에는 아직 설명이 없습니다')).toBeTruthy()
  })

  it('공백뿐인 설명도 없는 것으로 다룬다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('   ') })

    toView()

    expect(await screen.findByText('이 페이지에는 아직 설명이 없습니다')).toBeTruthy()
  })

  it('조회가 실패하면 그 자리에 이유를 그린다 — 셸은 살아 있다', async () => {
    let calls = 0
    await openPage(DOC, {
      apiOverrides: {
        // 첫 호출(셸의 문서 조회)은 성공해야 페이지가 열린다. 그 뒤 이 탭의 조회만 깨뜨린다.
        getPage: (async (_projectId: string, pageId: string) => {
          calls += 1
          if (calls === 1) return pageDetail(pageId, DOC)
          throw new Error('boom')
        }) as never,
      },
    })

    toView()

    expect(await screen.findByText('페이지 설명을 불러오지 못했습니다')).toBeTruthy()
    // 셸이 남아 있어야 사용자가 다른 페이지로 옮겨 갈 수 있다.
    expect(screen.getByRole('navigation', { name: '메뉴와 구조' })).toBeTruthy()
  })

  it('페이지를 열지 않았으면 그렇다고 말한다 — 조회도 하지 않는다', async () => {
    let calls = 0
    renderEditor({
      route: PROJECT_ROUTE,
      apiOverrides: {
        getPage: (async () => {
          calls += 1
          throw new Error('페이지를 열지 않았는데 조회했습니다')
        }) as never,
      },
    })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    toView()

    expect(await screen.findByText('페이지를 열면 설명이 보입니다')).toBeTruthy()
    expect(calls).toBe(0)
  })
})
