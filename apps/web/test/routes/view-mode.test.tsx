/**
 * **뷰 모드가 셸을 바꾼다** (설계서 「설계서 화면 구조」).
 *
 * 그 절의 표:
 *
 * | 무엇 | 편집 모드 | 뷰 모드 |
 * |---|---|---|
 * | 좌측 하단 구조 트리 | 보인다 | **접힌다** |
 * | 우측 탭 | 속성 / 코멘트 / 상호작용 | **페이지 설명** / 코멘트 / 상호작용 |
 *
 * 구조 트리 쪽은 `routes/editor-shell.test.tsx`가 잰다. **여기가 재는 것은 우측 탭이다** —
 * `RightPanel`이 `mode`를 안 읽으면 뷰 모드에서도 편집 모드의 탭이 남는다.
 *
 * ## 구조 트리만 빼면 뷰 모드가 반만 뷰 모드다
 *
 * 셸이 뷰 모드에서 DOM에서 빼는 것이 **구조 트리 하나**뿐이면, 좌측의 **메뉴 트리 줄 행동**
 * (줄의 `+` · `…` · 제목 줄의 뿌리 `+` — 하위 메뉴·페이지 추가·이름 변경·삭제·위로·아래로·들여쓰기·내어쓰기·옮기기)와
 * **페이지 JSON 의 입구**(줄 `+`의 «JSON 에서 가져오기…» · 줄 `…`의 «JSON 내보내기» · 가져오기 대화 상자)는 그대로 남아
 * **눌리는 상태**가 된다(브라우저에서 잰 고장 방식). 구조 트리를 접는 근거 — **편집 도구는
 * 편집 모드에 있다** — 는 그 둘에 똑같이 걸린다.
 *
 * **아래 셋이 그 자리다.** 방식도 구조 트리와 같다 — `hidden`이 아니라 DOM에서 제거이고,
 * 그 근거와 *"테스트가 둘을 구분하지 못한다"*는 사실은 `routes/editor.tsx`의 그 주석에 있다.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { deselect, openPage, pageDetail, pageDoc, PROJECT_NAME, PROJECT_ROUTE, renderEditor } from '../editor-harness'
import { chooseRowAction, rowAction, rowNamed } from '../panels/tree-row'

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

describe('설계서 「설계서 화면 구조」 — 우측 탭 구성이 모드로 갈린다', () => {
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

describe('설계서 「설계서 화면 구조」 — 모드를 바꿀 때 보던 탭', () => {
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

    expect(screen.getByRole('tab', { name: '페이지 설명' }).getAttribute('aria-selected')).toBe('true')
  })

  it('되돌아오면 앞서 보던 탭이 되살아난다', async () => {
    // **고른 탭을 고치지 않는 것이 판정이다** — 뷰 모드가 속성을 못 보인다고 해서
    // "속성을 보고 있었다"는 사실까지 지우지 않는다.
    await openPage(DOC, { apiOverrides: withDescription(null) })
    toView()
    expect(screen.getByRole('tab', { name: '페이지 설명' }).getAttribute('aria-selected')).toBe('true')

    toEdit()

    expect(screen.getByRole('tab', { name: '속성' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('설계서 「설계서 화면 구조」 — 편집 도구는 편집 모드에 있다', () => {
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

describe('설계서 「설계서 화면 구조」 — 페이지 설명 탭', () => {
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

    // **이 자리는 문장이 아니라 상자다.** 탭이 고칠 수 있으므로 *"아직 설명이 없습니다"*는
    // **어디에 쓰라는 안내**다 — 재는 것은: 빈 자리로 두지 않는다. (고치는 쪽의 다른
    // 갈래들은 `test/panels/page-description-edit.test.tsx`가 갖는다.)
    const box = await screen.findByRole('textbox', { name: '페이지 설명' })
    expect((box as HTMLTextAreaElement).value).toBe('')
    expect(box.getAttribute('placeholder')).toBe('이 페이지에는 아직 설명이 없습니다')
  })

  it('공백뿐인 설명은 서버에 있는 그대로 보인다 — 화면이 다듬지 않는다', async () => {
    // **공백뿐인 설명을 "없는 것"으로 다루지 않는다** — 탭이 고칠 수 있으므로 서버에 공백이
    // 들어 있다는 사실 자체가 사용자가 고쳐야 할 것이고, 화면이 그것을 감추면 지울 수가 없다.
    await openPage(DOC, { apiOverrides: withDescription('   ') })

    toView()

    const box = await screen.findByRole('textbox', { name: '페이지 설명' })
    expect((box as HTMLTextAreaElement).value).toBe('   ')
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

describe('설계서 「설계서 화면 구조」 — 좌측의 편집 도구도 편집 모드에 있다', () => {
  /** 좌측 상자. 툴바·JSON 패널을 여기 안에서 찾아 다른 자리의 같은 이름과 섞이지 않게 한다. */
  function treeRegion(): HTMLElement {
    return screen.getByRole('region', { name: '메뉴·페이지 트리' })
  }

  it('뷰 모드에서는 메뉴 트리의 줄 행동이 없다', async () => {
    await openPage(DOC)
    // 양성 대조: 편집 모드에는 있다. 이것이 없으면 줄 행동을 아예 안 그리는 구현도 통과한다.
    expect(within(treeRegion()).getByRole('button', { name: '회원관리 더 보기' })).toBeTruthy()
    expect(within(treeRegion()).getByRole('button', { name: '메뉴 트리에 추가' })).toBeTruthy()

    toView()

    // **줄마다 · 제목 줄까지 센다.** 한 줄의 행동만 지우고 다른 줄 · 뿌리 `+`를 남긴 판이 이름 하나로는 통과한다.
    expect(treeRegion().querySelectorAll('.wb-shell-tree-row-actions')).toHaveLength(0)
    expect(within(treeRegion()).queryByRole('button', { name: '메뉴 트리에 추가' })).toBeNull()
  })

  it('뷰 모드에서는 페이지 JSON 의 입구가 없다 — 열어 둔 가져오기 상자까지, 편집 모드로 돌아와도 상자가 되살아나지 않는다', async () => {
    await openPage(DOC)
    // 편집 모드에서는 두 입구가 있다. 아래 부재 단언의 분모다.
    expect(rowAction(treeRegion(), 'JSON 내보내기', rowNamed(treeRegion(), '회원 목록'))).toBeTruthy()
    // **상자를 열어 두고 모드를 바꾼다 — 이 한 걸음이 아래 상자 단언을 살린다.** 닫힌 채로 재면 상자가 편집 모드에서도 DOM 에 없어 부재가
    // 두 모드에 대해 똑같이 참이 된다. jsdom 의 모달은 `open` 속성이라 뒤 화면이 막히지 않아 모드 단추에 닿는다(실브라우저는 막힌다 —
    // 그 판에서 상자를 닫는 것은 역할 바뀜이다 — `panels/menu-tree.tsx`의 `editable` 이펙트).
    chooseRowAction(treeRegion(), 'JSON 에서 가져오기…', rowNamed(treeRegion(), '회원관리'))
    expect(screen.getByRole('dialog', { name: '페이지 가져오기 — 회원관리 메뉴로' })).toBeTruthy()

    toView()

    expect(screen.queryByRole('dialog')).toBeNull()
    // **«JSON 내보내기»도 함께 간다 — 판정이다.** 읽기 동작이지만 그 입구가 줄 행동(편집 도구) 안이고, 설계서를 **읽는** 사람의
    // 내려받기는 셸 `…`의 «프로젝트 내보내기»(설계서 「HTML 정적 번들」)가 두 모드 모두에서 낸다.
    expect(treeRegion().querySelectorAll('.wb-shell-tree-row-actions')).toHaveLength(0)
    expect(screen.queryByRole('menuitem', { name: 'JSON 내보내기' })).toBeNull()

    toEdit()

    // **편집 모드로 돌아와도 상자가 다시 서지 않는다** — 대상을 훅에 남겨 두면 아무도 열지 않은 상자가 선다.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('뷰 모드에서도 메뉴 트리 자체는 남는다', async () => {
    // **접히는 것은 편집 도구뿐이다.** 트리까지 사라지면 뷰 모드에서 다른 페이지로 옮겨
    // 갈 길이 없어진다 — 구조 트리를 접으면서 메뉴 트리를 남기는 것과 같은 선이다.
    await openPage(DOC)

    toView()

    expect(within(treeRegion()).getByText('회원관리')).toBeTruthy()
    expect(within(treeRegion()).getByRole('link', { name: '회원 목록' })).toBeTruthy()
  })

  it('편집 모드로 돌아오면 줄 행동과 페이지 JSON 의 입구가 되살아난다', async () => {
    // 한 방향만 보면 "뷰 모드를 한 번 지나면 영영 없다"는 구현도 위를 통과한다.
    await openPage(DOC)
    toView()

    toEdit()

    expect(within(treeRegion()).getByRole('button', { name: '회원관리 더 보기' })).toBeTruthy()
    expect(rowAction(treeRegion(), 'JSON 에서 가져오기…', rowNamed(treeRegion(), '회원관리'))).toBeTruthy()
  })
})
