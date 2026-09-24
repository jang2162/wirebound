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
 * 셸이 뷰 모드에서 DOM에서 빼는 것이 **구조 트리 하나**뿐이면, 좌측의 **메뉴 편집
 * 툴바**(하위 메뉴·페이지 추가·이름 변경·삭제·위로·아래로·들여쓰기·내어쓰기·옮기기)와
 * **페이지 JSON 패널**(내보내기 + 파일 고르개 + JSON 입력 + 가져오기)은 그대로 남아
 * **눌리는 상태**가 된다(브라우저에서 잰 고장 방식). 구조 트리를 접는 근거 — **편집 도구는
 * 편집 모드에 있다** — 는 그 둘에 똑같이 걸린다.
 *
 * **아래 셋이 그 자리다.** 방식도 구조 트리와 같다 — `hidden`이 아니라 DOM에서 제거이고,
 * 그 근거와 *"테스트가 둘을 구분하지 못한다"*는 사실은 `routes/editor.tsx`의 그 주석에 있다.
 */
import { fireEvent, screen, within } from '@testing-library/react'
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

  it('뷰 모드에서는 메뉴 편집 툴바가 없다', async () => {
    await openPage(DOC)
    // 양성 대조: 편집 모드에는 있다. 이것이 없으면 툴바를 아예 안 그리는 구현도 통과한다.
    expect(within(treeRegion()).getByRole('group', { name: '메뉴 편집' })).toBeTruthy()

    toView()

    expect(within(treeRegion()).queryByRole('group', { name: '메뉴 편집' })).toBeNull()
    // **툴바 안의 조작 이름으로도 확인한다.** 상자만 지우고 버튼을 다른 데로 옮긴 판이
    // 위 단언 하나로는 통과한다 — 브라우저에서 실제로 눌리는 것을 본 둘을 이름으로 못박는다.
    expect(screen.queryByRole('button', { name: '이름 변경' })).toBeNull()
    expect(screen.queryByRole('button', { name: '옮기기' })).toBeNull()
  })

  /** 가져오기 폼의 토글. **접힌 채로도 늘 있다**(`panels/page-json-panel.tsx`). */
  function importToggle(): HTMLElement {
    return screen.getByRole('button', { name: '페이지 JSON 가져오기' })
  }

  it('뷰 모드에서는 페이지 JSON 패널이 없다 — 펴 둔 가져오기 폼까지', async () => {
    await openPage(DOC)
    expect(within(treeRegion()).getByRole('region', { name: '페이지 JSON' })).toBeTruthy()
    // 편집 모드에서는 가져오기의 **토글**이 있다. 아래 부재 단언의 분모다.
    expect(importToggle()).toBeTruthy()
    // **폼을 펴 두고 모드를 바꾼다 — 이 한 걸음이 아래 실행 버튼 단언을 살린다.**
    // 접힌 채로 재면 그 폼이 편집 모드에서도 DOM에 없어(기본이 접힘이다) 실행 버튼의 부재가
    // **두 모드에 대해 똑같이 참**이 되고, 그 줄은 통과하면서 아무것도 재지 않는다 — 패널의
    // 게이트(`panels/menu-tree.tsx`의 `props.editable &&`)를 죽이고 그 줄만 남기면 이 파일이
    // 전부 통과한다. 펴 두면 같은 변조에서 그 줄 하나로도 죽는다.
    if (importToggle().getAttribute('aria-expanded') === 'false') fireEvent.click(importToggle())
    expect(screen.getByRole('button', { name: '페이지 가져오기' })).toBeTruthy()

    toView()

    expect(within(treeRegion()).queryByRole('region', { name: '페이지 JSON' })).toBeNull()
    // 가져오기는 명백히 편집이다. 상자만 지우고 폼을 남긴 판을 가른다 — **토글도, 펴 두었던
    // 폼도 함께 간다**(모드를 오가면 패널이 통째로 마운트를 잃으므로 펼침도 접힘으로 돌아온다).
    expect(screen.queryByRole('button', { name: '페이지 JSON 가져오기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '페이지 가져오기' })).toBeNull()
    // **`페이지 내보내기`도 함께 간다 — 판정이다.** 읽기 동작이지만 이 상자의 축은
    // *"페이지를 JSON으로 주고받는다"*라는 저작 도구이고, 설계서를 **읽는** 사람의
    // 내려받기는 셸 머리의 `내보내기`(설계서 「HTML 정적 번들」)가 두 모드 모두에서 낸다.
    expect(screen.queryByRole('button', { name: '페이지 내보내기' })).toBeNull()
  })

  it('뷰 모드에서도 메뉴 트리 자체는 남는다', async () => {
    // **접히는 것은 편집 도구뿐이다.** 트리까지 사라지면 뷰 모드에서 다른 페이지로 옮겨
    // 갈 길이 없어진다 — 구조 트리를 접으면서 메뉴 트리를 남기는 것과 같은 선이다.
    await openPage(DOC)

    toView()

    expect(within(treeRegion()).getByText('회원관리')).toBeTruthy()
    expect(within(treeRegion()).getByRole('link', { name: '회원 목록' })).toBeTruthy()
  })

  it('편집 모드로 돌아오면 둘 다 되살아난다', async () => {
    // 한 방향만 보면 "뷰 모드를 한 번 지나면 영영 없다"는 구현도 위를 통과한다.
    await openPage(DOC)
    toView()

    toEdit()

    expect(within(treeRegion()).getByRole('group', { name: '메뉴 편집' })).toBeTruthy()
    expect(within(treeRegion()).getByRole('region', { name: '페이지 JSON' })).toBeTruthy()
  })
})
