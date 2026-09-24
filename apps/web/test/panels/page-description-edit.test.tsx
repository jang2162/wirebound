/**
 * **페이지 설명 편집**(설계서 「설계서 화면 구조」). 뷰 모드 «페이지 설명» 탭이 그 자리다.
 *
 * **그 탭의 읽기 쪽은 `test/routes/view-mode.test.tsx`의 *"설계서 「설계서 화면 구조」 — 페이지 설명 탭"*이
 * 소유한다** — 여기는 **고치는 쪽**만 잰다. 둘을 한 파일에 두면 같은 축을 두 자리가 재게 된다.
 *
 * **서버 계약도 여기서 재지 않는다** — 상한·`null`·빈 문자열·역할·잠금은 전부
 * `apps/api/test/pages.test.ts`와 `apps/api/test/permission-matrix.test.ts`가 갖는다.
 * 여기가 재는 것은 **화면이 무엇을 보내고 무엇을 말하는가**다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PAGE_DESCRIPTION_MAX_LENGTH } from '@wirebound/schema'
import { ApiError } from '../../src/api/client'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail } from '../../src/api/types'
import {
  openPage,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  pageDetail,
  pageDoc,
} from '../editor-harness'
import '../../src/catalog-setup'

const ROOT_ID = 'n-root'
const CHILD_ID = 'n-list'

const DOC = pageDoc({
  id: ROOT_ID,
  type: 'Page',
  children: [{ id: CHILD_ID, type: 'List', props: {} }],
})

/** 그 페이지의 설명을 실은 `getPage` 가짜. */
function withDescription(description: string | null): Partial<ApiClient> {
  return {
    getPage: (async (_projectId: string, pageId: string) => ({
      ...pageDetail(pageId, DOC),
      description,
    })) as never,
  }
}

/**
 * 페이지마다 다른 설명. **둘을 같게 두면 «앞 페이지의 초안이 따라왔다»와 «이 페이지의
 * 값을 제대로 읽었다»가 같은 글자가 되어 구별되지 않는다.**
 */
const DESCRIPTION_OF: Record<string, string> = {
  [PAGE_ID]: '회원 목록 화면이다',
  [OTHER_PAGE_ID]: '회원 상세 화면이다',
}

/** 페이지마다 자기 설명을 내는 `getPage` 가짜. */
const perPageDescription: Partial<ApiClient> = {
  getPage: (async (_projectId: string, pageId: string) => ({
    ...pageDetail(pageId, DOC),
    description: DESCRIPTION_OF[pageId] ?? null,
  })) as never,
}

/**
 * 편집기의 입력 상자. **`role` + 이름으로 잡는다** — 클래스로 잡으면 마크업을 바꾸는 순간
 * 거짓 빨강이고, `getByLabelText`만으로는 **뷰 모드의 탭 패널도 걸린다**(그쪽은
 * `aria-labelledby`가 «페이지 설명» 탭을 가리킨다).
 */
function box(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '페이지 설명' }) as HTMLTextAreaElement
}

/** 편집기가 서 있으면 그 상자, 아니면 `null`. */
function boxOrNull(): HTMLElement | null {
  return screen.queryByRole('textbox', { name: '페이지 설명' })
}

async function findBox(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: '페이지 설명' })
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '설명 저장' }) as HTMLButtonElement
}

/**
 * 상자에 친다. **꺼진 상자에는 안 친다 — 던진다.** jsdom 의 `fireEvent.change`는 `disabled`를 안
 * 봐서 꺼진 상자에도 값이 들어가고 `onChange`가 돈다 — 실브라우저에서는 없는 길이다. 그 길을 열어 두면
 * 옆 페이지로 넘어온 잠금을 케이스가 스스로 풀어, 잠금이 새는 변조에서 케이스가 산다(거짓 초록).
 */
function type(value: string): void {
  const target = box()
  if (target.disabled) throw new Error('꺼진 상자에는 칠 수 없다 — 실브라우저에서 없는 길이다')
  fireEvent.change(target, { target: { value } })
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

function toEdit(): void {
  fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
}

/** 우측 패널의 탭을 **누른다** — 사용자가 하듯. */
function toTab(label: string): void {
  fireEvent.click(screen.getByRole('tab', { name: label }))
}

/** 하네스의 첫 페이지(`PAGE_ID`)의 제목. */
const PAGE_TITLE = '회원 목록'

/** 메뉴 트리에서 그 페이지로 옮긴다 — **사용자가 하듯** 누른다. */
function toPage(title: string): void {
  fireEvent.click(
    within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }),
  )
}

function toOtherPage(): void {
  toPage(OTHER_PAGE_TITLE)
}

/**
 * `updatePage` 호출을 받아 적는 가짜. 응답의 `description`은 부르는 쪽이 정한다.
 *
 * **본문과 함께 «어느 페이지에 보냈나»도 적는다** — 본문만 보면 앞 페이지의 글이 이
 * 페이지로 나간 것과 이 페이지의 글이 나간 것이 같아 보인다(앞의 것을 «페이지가 바뀌면 버린다»가 막는다).
 */
function recordingApi(reply?: (description: string | null) => PageDetail): {
  overrides: Partial<ApiClient>
  bodies: { description?: string | null }[]
  pages: string[]
} {
  const bodies: { description?: string | null }[] = []
  const pages: string[] = []
  return {
    bodies,
    pages,
    overrides: {
      updatePage: (async (_projectId: string, pageId: string, body: { description?: string | null }) => {
        bodies.push(body)
        pages.push(pageId)
        const next = body.description ?? null
        return reply?.(next) ?? { ...pageDetail(pageId, DOC), description: next }
      }) as never,
    },
  }
}

describe('편집기는 뷰 모드 «페이지 설명» 탭에 있다', () => {
  // **혼자 죽지 않는다 — 늘 `test/routes/view-mode.test.tsx`의 *"뷰 모드에서 속성 탭의
  // 본문이 사라진다"*와 함께 죽는다**(`routes/editor.tsx`의 `PANEL_BODIES.props`를 이 패널로 바꾸면
  // 둘이 함께 죽는다). **그 축의 주인은 그쪽이다** — 탭과 본문의 짝을 재는 자리이고, 여기는
  // 그 위에 *"그 본문에 편집기가 있다"*를 얹는다.
  //
  // **수는 적지 않는다.** 그 변조를 글자 그대로 심으면 둘 말고도 많이 죽는다(속성 탭 자리를
  // 통째로 바꾸는 변조라 `getPage` 횟수를 재는 파일들이 함께 쓸린다). **주장하는 것은 «관계»뿐이다**
  // — 다시 잴 수 없는 수는 자에서 뺀다(`CLAUDE.md`).
  it('편집 모드에는 없고 뷰 모드로 가면 선다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('회원을 찾고 고치는 화면') })

    // **음성 대조가 이 케이스의 절반이다.** 없으면 "언제나 편집기를 그린다"도 통과한다 —
    // 편집 모드의 첫 탭은 속성이고 거기엔 설명이 없다.
    expect(boxOrNull()).toBeNull()

    toView()

    expect(await findBox()).toBeTruthy()
    expect(screen.getByRole('button', { name: '설명 저장' })).toBeTruthy()
  })

  // **«빈 설명일 때 무엇이 보이나»는 여기 없다** — `test/routes/view-mode.test.tsx`의
  // *"설명이 없으면 그렇다고 말한다"*가 그 축을 소유한다. 두 자리가 같은 것을 재면 갈린다.
})

describe('설명을 저장한다', () => {
  it('고쳐 저장하면 `updatePage`에 그 설명이 실리고, 화면은 서버가 준 값을 쓴다', async () => {
    // **서버가 다른 값을 준다.** 화면이 보낸 것을 그대로 그리면 이 케이스가 죽는다.
    const api = recordingApi(() => ({ ...pageDetail(PAGE_ID, DOC), description: '서버가 정한 값' }))
    await openPage(DOC, { apiOverrides: { ...withDescription('옛 설명'), ...api.overrides } })
    toView()
    await findBox()

    type('새 설명')
    fireEvent.click(saveButton())

    // **바탕도 실린다** — 첫 글자를 친 순간의 서버 값이다(판정 축은 `page-meta-conflict.test.tsx`).
    await waitFor(() => expect(api.bodies).toEqual([{ description: '새 설명', base: { description: '옛 설명' } }]))
    await waitFor(() => expect(box().value).toBe('서버가 정한 값'))
  })

  it('저장이 끝나면 그렇다고 말한다', async () => {
    const api = recordingApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('옛 설명'), ...api.overrides } })
    toView()
    await findBox()

    type('새 설명')
    fireEvent.click(saveButton())

    expect(await screen.findByRole('status')).toHaveProperty('textContent', '설명을 저장했습니다')
  })

  it('빈 칸으로 저장하면 `null`이 나간다 — 빈 문자열이 아니다', async () => {
    // 서버는 `''`를 `''`로 저장하고 `null`과 가른다(`apps/api/test/pages.test.ts`).
    // 화면에서 둘은 똑같이 보이므로 눈에 안 보이는 차이를 만들지 않는다.
    const api = recordingApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('지울 설명'), ...api.overrides } })
    toView()
    await findBox()

    type('')
    fireEvent.click(saveButton())

    await waitFor(() => expect(api.bodies).toEqual([{ description: null, base: { description: '지울 설명' } }]))
  })

  it('바꾼 것이 없으면 저장 버튼이 눌리지 않는다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('그대로 둘 설명') })
    toView()
    await findBox()

    expect(saveButton().disabled).toBe(true)

    // 양성 대조: 한 글자만 쳐도 열린다. 없으면 "언제나 막는다"도 통과한다.
    type('그대로 둘 설명!')
    expect(saveButton().disabled).toBe(false)
  })

  it('저장이 실패하면 서버 문장을 그 자리에 적는다 — 빈 자리로 두지 않는다', async () => {
    await openPage(DOC, {
      apiOverrides: {
        ...withDescription('옛 설명'),
        updatePage: (async () => {
          throw new ApiError(403, 'forbidden', '이 작업을 수행할 권한이 없습니다')
        }) as never,
      },
    })
    toView()
    await findBox()

    type('viewer가 친 글')
    fireEvent.click(saveButton())

    const alert = await screen.findByRole('alert')
    // **서버 문장 그대로다**(`api/failure.tsx`) — 화면이 문안을 다시 쓰면 서버가
    // 이유를 바꿔도 사용자는 옛 이유를 듣는다.
    expect(alert.textContent).toBe('이 작업을 수행할 권한이 없습니다')
    // 친 글이 남아 있어야 다시 시도할 수 있다.
    expect(box().value).toBe('viewer가 친 글')
  })

  it('다시 치면 앞의 통지가 사라진다 — 고치는 중에 «저장했습니다»가 떠 있지 않는다', async () => {
    const api = recordingApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('옛 설명'), ...api.overrides } })
    toView()
    await findBox()

    type('새 설명')
    fireEvent.click(saveButton())
    await screen.findByRole('status')

    type('더 친 설명')

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('상한은 `@wirebound/schema`가 소유한다', () => {
  it('입력 상자의 `maxLength`가 그 상수와 같다 — 화면이 수를 따로 갖지 않는다', async () => {
    await openPage(DOC, { apiOverrides: withDescription(null) })
    toView()

    // **값으로 잰다.** 원문에서 `2000`을 찾는 자는 라우트가 상수에서 떨어져 나가도 안 죽는다.
    //
    // **그리고 이 `maxLength`가 서버의 400을 타건으로 도달 불가하게 만든다** — 정확히
    // 막는다(실브라우저에서 1999자에서 한 자를 치면 2000이 되고 그다음 자는 안 들어간다).
    // 그래서 *"상한 초과 400을 브라우저에서 봤다"*는 보고는 **값을 프로그램으로 심어야만**
    // 재현된다. 그래도 400 갈래를 화면이 받는 것은 붙여넣기·미래의 상한 변경에 대한
    // 방어이고, 그 문장을 옮기는 규칙은 `api/failure.tsx`가 갖는다.
    expect((await findBox()).getAttribute('maxlength')).toBe(
      String(PAGE_DESCRIPTION_MAX_LENGTH),
    )
  })

  it('글자 수를 그 상수와 함께 보인다', async () => {
    await openPage(DOC, { apiOverrides: withDescription('네 글자') })
    toView()
    await findBox()

    expect(screen.getByText(`4 / ${PAGE_DESCRIPTION_MAX_LENGTH}`)).toBeTruthy()

    type('여섯 글자다')
    expect(screen.getByText(`6 / ${PAGE_DESCRIPTION_MAX_LENGTH}`)).toBeTruthy()
  })
})

/**
 * **페이지를 바꾸는 축.** 이 파일의 다른 케이스는 전부 페이지 하나 안에서 돌아
 * `pageId`가 바뀌는 갈래를 지나지 않는다. 이 절이 없으면 «앞 페이지의 초안이 남는다»를
 * 아무도 못 잡는다 — 그 결함에서는 A에서 안 저장한 글을 치고 B로 옮겨 저장하면 **A의 글이
 * B에 저장된다**(실브라우저 → DB 로 잰 고장 방식). **그 축의 주인이 이 절이다.**
 *
 * **버리는 자리는 `panels/panel-drafts.tsx`의 provider 하나다.** 페이지가 바뀌면 칸을 **전부** 버린다.
 *
 * **셋이 각각 혼자 죽는다** — 변조를 하나씩 심고 매번 복구해서 `--project web` 전체로 잰다.
 * 버리기가 «칸 전부»라 변조는 «그 칸 하나만 새 페이지로 넘긴다»의 꼴이다:
 *
 * | 변조 | 혼자 죽는 것 |
 * |---|---|
 * | provider 의 리셋이 초안 칸을 넘긴다 | *"앞 페이지에서 친 초안이 …"* |
 * | 그 리셋이 `'saved'`인 저장 칸을 넘긴다 | *"앞 페이지의 저장 통지가 …"* |
 * | 그 리셋이 `'failed'`인 저장 칸을 넘긴다 | *"앞 페이지의 실패 문장이 …"* |
 *
 * **리셋을 넓게 망가뜨리면 셋이 함께 죽는다**(web 전체로 잰다):
 *
 * - **페이지만 바꾸고 방문의 칸을 넘기면** 다섯 — 이 셋과 코멘트 탭의 *"페이지가 바뀌면 …"*·
 *   *"수정 중에 옆 페이지를 다녀와도 …"*(넘어온 편집 칸이 돌아와도 열려 있다). 아래 *"저장 중에 옆
 *   페이지로 옮기면 …"*은 **산다** — 그 케이스의 축은 쓰기 가드이고, 가드는 칸을 넘겨도 선다. 잠금도
 *   넘어가지 않는다(잠금은 방문의 칸이 아니다).
 * - **리셋 블록을 통째로 빼면** 일곱 — 위 다섯과 설명·코멘트의 «저장 · 게시 중에 옆 페이지로 …» 둘.
 *   기전은 «`held.pageId`가 안 바뀌어 쓰기 가드가 두 페이지를 못 가른다»다.
 *
 * 통지 둘을 둘로 두는 것은 **새는 것이 둘이고 사용자가 보는 것이 다르기 때문**이다(거짓
 * «저장했습니다» vs. 남의 페이지의 오류 문장).
 */
describe('페이지를 바꾸면 앞 페이지의 것을 버린다', () => {
  it('앞 페이지에서 친 초안이 따라오지 않는다', async () => {
    const api = recordingApi()
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...perPageDescription, ...api.overrides },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('저장하지 않은 초안 — 앞 페이지의 것')
    toOtherPage()

    // **제목이 바뀐 것을 먼저 기다린다** — 조회가 끝나기 전에 재면 아직 앞 페이지의
    // 화면이라 «초안이 사라졌다»가 우연히 참일 수 있다.
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })
    expect(box().value).toBe(DESCRIPTION_OF[OTHER_PAGE_ID])
    // **저장 버튼까지 본다.** 상자만 보면 «값은 갈아 끼웠는데 초안은 살아 있는» 판이
    // 통과한다 — 그 판에서 버튼을 누르면 앞 페이지의 글이 이 페이지에 저장된다.
    expect(saveButton().disabled).toBe(true)

    // **양성 대조**: 여기서 친 글은 이 페이지의 것이라 남는다. 없으면 "언제나 비운다"도
    // 통과한다.
    type('이 페이지에서 친 글')
    fireEvent.click(saveButton())
    await waitFor(() =>
      // 바탕도 **이 페이지의** 서버 값이다 — 앞 페이지의 바탕이 따라오면 여기서 죽는다.
      expect(api.bodies).toEqual([{ description: '이 페이지에서 친 글', base: { description: DESCRIPTION_OF[OTHER_PAGE_ID] } }]),
    )
    expect(api.pages).toEqual([OTHER_PAGE_ID])
  })

  it('앞 페이지의 저장 통지가 따라오지 않는다', async () => {
    const api = recordingApi()
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...perPageDescription, ...api.overrides },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('앞 페이지에 저장할 글')
    fireEvent.click(saveButton())
    await screen.findByText('설명을 저장했습니다')

    toOtherPage()
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })

    // 이 페이지에는 아무것도 저장한 적이 없다.
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()
  })

  it('앞 페이지의 실패 문장이 따라오지 않는다', async () => {
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: {
        ...perPageDescription,
        updatePage: (async () => {
          throw new ApiError(403, 'forbidden', '이 작업을 수행할 권한이 없습니다')
        }) as never,
      },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('막힐 글')
    fireEvent.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toBe(
      '이 작업을 수행할 권한이 없습니다',
    )

    toOtherPage()
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })

    // **남의 페이지의 오류 문장이 이 페이지에 붙지 않는다.** 조회 실패의 `role="alert"`와
    // 같은 자를 쓰므로 «둘 다 없다»를 재는 것이 맞다 — 이 페이지의 조회는 성공했다.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * **탭·모드를 오가는 축.** 이 파일의 다른 케이스는 전부 «페이지 설명» 탭에 **머문 채로**
 * 돌고, 위 «페이지를 바꾸면 …» 절은 **페이지**를 바꾼다. 그래서 *"탭을 한 번 눌렀다
 * 돌아온다"*를 지나는 케이스가 이 절 말고는 없다. 이 절이 없으면 **친 글이 경고 없이 사라지는
 * 결함**을 아무도 못 잡는다(`routes/editor.tsx`가 안 보이는 탭을 DOM에서 뺀다 +
 * 이 상자는 blur에 커밋하지 않는다 — 두 판단의 접점).
 *
 * **`test/routes/view-mode.test.tsx`와 갈리는 자리:** 그쪽은 *"탭이 되살아나는가"*
 * (어느 탭이 골라져 있나)를 재고, **여기는 그 탭 본문이 든 «친 글자»가 남는가**를 잰다.
 * 같은 왕복을 지나지만 재는 것이 다르다.
 *
 * **변조와 죽는 것** — 하나씩 심고 매번 복구해서 `--project web` 전체로 잰다:
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | provider(`PanelDraftsProvider`)에 `key={chosen}` (탭마다 새로 든다) | 여덟 — *"탭을 오갔다 돌아와도 …"*, 아래 «저장이 나가 있는 동안 …»의 탭 왕복 둘, 코멘트 탭의 탭 왕복 넷과 *"쓰던 코멘트는 쓴 노드에만 …"*(속성 탭을 다녀온다) |
 * | 그것에 `key={mode}` (모드마다 새로 든다) | *"모드를 오갔다 돌아와도 …"* — 혼자 |
 *
 * **탭 케이스는 혼자 죽지 않는다 — 늘 탭 왕복을 지나는 남과 함께 죽는다.** «탭마다 새로
 * 든다»는 칸을 **전부** 버리기 때문이다. **«탭을 오가도 칸이 산다» 축의 주인은 이 케이스다** —
 * 함께 죽는 일곱은 그 위에서 각자 다른 것을 재고, 각자 혼자 죽는 변조가 있다(그 절들의 표).
 */
describe('탭·모드를 오가도 저장하지 않은 초안이 남는다', () => {
  it('탭을 오갔다 돌아와도 친 글이 남는다 — 서버 값으로 되돌아가지 않는다', async () => {
    const api = recordingApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('서버에 있는 설명'), ...api.overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버에 있는 설명'))

    type('아직 저장 안 한 초안')
    toTab('코멘트')
    // **상자가 정말 사라지는 것을 먼저 잠근다.** 없으면 «탭을 눌러도 언마운트되지 않는»
    // 판에서도 이 케이스가 통과해, 재는 것이 없어진다.
    expect(boxOrNull()).toBeNull()

    toTab('페이지 설명')
    await findBox()

    expect(box().value).toBe('아직 저장 안 한 초안')
    // **상자의 글자만 보면 «값은 되살렸는데 초안으로는 안 든» 판이 통과한다** — 그 판에서
    // 저장 버튼은 꺼져 있고 누를 수가 없다. 보내지는 것까지 본다.
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(api.bodies).toEqual([{ description: '아직 저장 안 한 초안', base: { description: '서버에 있는 설명' } }]),
    )
    expect(api.pages).toEqual([PAGE_ID])
  })

  it('모드를 오갔다 돌아와도 친 글이 남는다 — 편집 모드에는 이 탭이 아예 없다', async () => {
    const api = recordingApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('서버에 있는 설명'), ...api.overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버에 있는 설명'))

    type('모드를 오갈 초안')
    toEdit()
    // **탭 왕복과 다른 사건이다.** 편집 모드의 탭 목록에 «페이지 설명»이 없어서
    // (`PANEL_TABS`) 눌러서 돌아올 탭조차 없다 — 그래서 케이스를 따로 둔다.
    expect(boxOrNull()).toBeNull()
    expect(screen.queryByRole('tab', { name: '페이지 설명' })).toBeNull()

    toView()
    await findBox()

    expect(box().value).toBe('모드를 오갈 초안')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(api.bodies).toEqual([{ description: '모드를 오갈 초안', base: { description: '서버에 있는 설명' } }]),
    )
    expect(api.pages).toEqual([PAGE_ID])
  })
})

/**
 * `updatePage`를 **붙잡아 두는** 가짜 — «저장이 나가 있는 동안»을 만든다. `release()`를 부를
 * 때까지 응답이 안 온다. 응답은 보낸 값을 그대로 돌려준다(서버가 정규화하지 않는 판).
 *
 * **`getPage`는 따로 준다** — 붙잡힌 동안 다시 조회하면 **옛 값**이 온다. 실브라우저에서 PATCH 를
 * 3초 늦추면 재마운트의 GET 이 먼저 끝난다 — 그 판이다.
 */
function heldApi(): {
  overrides: Partial<ApiClient>
  bodies: { description?: string | null }[]
  pages: string[]
  /** 붙잡은 응답 하나를 놓고, 그 응답을 받은 쪽의 뒷일까지 끝나기를 기다린다. */
  release: () => Promise<void>
} {
  const bodies: { description?: string | null }[] = []
  const pages: string[] = []
  const gates: (() => void)[] = []
  const replies: Promise<unknown>[] = []
  return {
    bodies,
    pages,
    overrides: {
      updatePage: ((_projectId: string, pageId: string, body: { description?: string | null }) => {
        bodies.push(body)
        pages.push(pageId)
        const reply = new Promise<PageDetail>((resolve) => {
          gates.push(() => resolve({ ...pageDetail(pageId, DOC), description: body.description ?? null }))
        })
        replies.push(reply)
        return reply
      }) as never,
    },
    release: async () => {
      const gate = gates.shift()
      const reply = replies.shift()
      if (gate === undefined || reply === undefined) throw new Error('붙잡힌 저장이 없다')
      // 받은 쪽이 먼저 `await`를 걸어 두었으므로, 여기서 그 약속을 기다리면 그쪽의 뒷일이
      // 먼저 돈다(마이크로태스크 순서).
      await act(async () => {
        gate()
        await reply
      })
    },
  }
}

/**
 * **저장이 나가 있는 동안의 축.** 위 절들은 저장이 **곧바로** 끝나는 가짜로 돌아 «응답이 오기
 * 전에 무엇을 했나»를 지나지 않는다 — 이 절이 없으면 탭을 오간 새 마운트가 저장 중 잠금을 잃는
 * 결함과 저장의 응답이 옆 페이지에 닿는 결함을 아무도 못 잡는다.
 *
 * 무엇을 막는지는 `panels/panel-drafts.tsx`의 머리말이 갖는다. 여기는 그 셋을 값으로 잠근다.
 *
 * **셋을 변조로 잰다** — 하나씩 심고 매번 복구해서 잰다:
 *
 * | 변조 | 혼자 죽는 것 |
 * |---|---|
 * | 잠금을 본문의 `useState`로 든다(마운트에 묶는다) | *"… 저장 중 잠금이 남는다 …"* · *"… 옆 페이지에 닿지 않는다 …"* · `write-ledger.test.tsx`의 *"설명 — 에디터를 떠났다 와도 잠금이 남는다 …"* |
 * | 조회 값을 칸이 아니라 본문의 `useState`로 든다 | *"… 떠 있는 본문에 닿는다 …"* · `write-ledger.test.tsx`의 *"설명 — 떠났다 온 방문에 응답이 닿는다 …"* |
 * | 칸의 쓰기 가드(`prev.pageId !== at.pageId`)가 설명 칸에만 안 걸린다 | *"… 옆 페이지에 닿지 않는다 …"* **혼자** |
 *
 * 잠금은 장부(`write-ledger.tsx`)에 들어 본문에는 잠금에 쓸 자리가 없다 — 그래서 첫 줄의 변조는
 * «잠금을 마운트에 묶는다»의 꼴이다. 첫째·둘째 줄이 **혼자가 아닌** 것은 `write-ledger.test.tsx`의
 * 케이스가 같은 축을 provider 째 내려가는 길에서 재기 때문이다(잠금 · 응답의 전달 — 그 파일의 머리말).
 * 축의 주인은 이 셋이고 저 둘은 그 축을 셸 밖까지 넓힌 것이다.
 *
 * **가드를 통째로 빼면 셋째가 코멘트의 *"게시 중에 옆 페이지로 …"*와 함께 죽는다** — 가드가 한
 * 벌이다. 셋째는 **꺼진 상자에 치지 않는다**(`type`) — 잠금이 옆 페이지로 새는 변조(«잠금이 페이지를
 * 안 가린다»)에서 이 케이스와 코멘트의 *"게시 중에 옆 페이지로 …"*가 죽는다. `type`이 꺼진 상자에도
 * 치게 두면 **둘 다 산다**(거짓 초록 — 위 `type`).
 *
 * **가 → 나 → 가 의 둘.** 위 셋은 페이지를 한 번 옮기고 **돌아오지 않아**, 잠금이 페이지 리셋에
 * 버려지는 것을 못 본다. 무엇을 막는지는 `panels/panel-drafts.tsx`의 머리말 «잠금만은 그 페이지에
 * 매단다»가 갖는다.
 *
 * | 변조 | 혼자 죽는 것 |
 * |---|---|
 * | 설명의 잠금(`SAVING`)을 방문 칸(`slot`)으로 든다 | *"저장 중에 옆 페이지를 다녀와도 …"* · `write-ledger.test.tsx`의 *"설명 — 에디터를 떠났다 와도 잠금이 남는다 …"* |
 *
 * 잠금은 칸이 아니라 장부의 항목이고, 장부의 `run`이 쓰기가 끝나면 **페이지를 안 보고** 곧바로
 * 푼다 — «잠금의 쓰기가 «지금 페이지» 가드를 지난다»는 심을 자리가 없다. 그래서
 * *"옆 페이지에 가 있는 동안 응답이 오면 …"*은 **혼자 죽는 변조가 없다** — 장부가 잠금을 안 풀게 하면
 * 잠금을 재는 케이스 열여섯과 함께 죽는다(축의 주인: `write-ledger.tsx`의 `run`). 지우지 않는 것은 그
 * 케이스가 재는 사용자의 값(«나에 있는 동안 끝난 가의 저장 — 돌아오면 풀려 있다»)이 참이어야
 * 하기 때문이다.
 *
 * provider 의 리셋이 잠금까지 버리면 첫째가 코멘트 탭의 가 → 나 → 가 둘과 함께 죽는다 — 잠금을
 * 넘기는 자리가 한 벌이다. 둘째는 잠금의 쓰기가 가드를 비켜 가는 갈래를 잠근다.
 */
describe('저장이 나가 있는 동안 탭·페이지를 옮겨도 그 저장이 제자리에 닿는다', () => {
  it('저장이 나가 있는 동안 탭을 오가도 저장 중 잠금이 남는다 — 한 번 더 보낼 수 없다', async () => {
    const api = heldApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('서버 값'), ...api.overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type('첫 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(1))
    expect(box().disabled).toBe(true)

    toTab('코멘트')
    expect(boxOrNull()).toBeNull()
    toTab('페이지 설명')
    await findBox()

    // **잠금이 마운트에 묶이면 여기서 상자와 버튼이 열린다**(새 마운트가 저장 상태를 `idle`로
    // 시작한다). 그러면 같은 글을 한 번 더 보내고, 이어 친 글은 첫 응답에 지워진다.
    expect(box().value).toBe('첫 저장 글')
    expect(box().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)

    await api.release()

    // **양성 대조** — 응답이 오면 풀린다. 없으면 «언제나 잠근다»도 통과한다.
    expect(box().disabled).toBe(false)
    expect(api.bodies).toEqual([{ description: '첫 저장 글', base: { description: '서버 값' } }])
  })

  it('저장이 나가 있는 동안 탭을 오가면 그 응답이 떠 있는 본문에 닿는다 — 낡은 서버 값을 보이지 않는다', async () => {
    const api = heldApi()
    await openPage(DOC, { apiOverrides: { ...withDescription('서버 값'), ...api.overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type('첫 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(1))

    toTab('코멘트')
    toTab('페이지 설명')
    await findBox()

    await api.release()

    // **조회 값을 본문의 `useState`로 들면 여기가 `"서버 값"`이다** — 새 마운트의 조회는 저장이
    // 끝나기 전의 값이고, 응답의 «서버 값 갈아 끼우기»는 죽은 옛 마운트에 닿는다. 초안 비우기만 공유
    // 칸에 닿아서 상자가 낡은 값으로 돌아가고 버튼도 꺼진다 — 저장이 됐는지 사용자가 알 수 없다.
    expect(box().value).toBe('첫 저장 글')
    expect(saveButton().disabled).toBe(true)
  })

  it('저장 중에 옆 페이지로 옮기면 그 응답이 옆 페이지에 닿지 않는다 — 앞 페이지의 글이 옆 페이지에 저장되지 않는다', async () => {
    const api = heldApi()
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...perPageDescription, ...api.overrides },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('앞 페이지에 저장할 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(1))

    toOtherPage()
    // **제목만 기다리고 상자의 값은 안 본다** — 그것은 위 «페이지를 바꾸면 …» 절(*"앞 페이지에서 친 초안이
    // 따라오지 않는다"*)의 축이다. 여기서 보면 그 축이 깨질 때 이 케이스도 함께 죽어 이
    // 케이스가 재는 것(응답이 어디에 닿는가)과 섞인다.
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })
    type('옆 페이지에서 친 글')

    await api.release()

    // **칸의 쓰기 가드가 없으면 여기가 `"앞 페이지에 저장할 글"`이다** — 앞 페이지의 응답이
    // 옆 페이지의 조회 값을 갈아 끼우고 초안을 비우고, 이 페이지에 저장한 적 없는 통지가 뜬다.
    expect(screen.getByRole('heading', { name: OTHER_PAGE_TITLE })).toBeTruthy()
    expect(box().value).toBe('옆 페이지에서 친 글')
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()

    // 끝까지 간다 — 이 페이지에 저장하면 이 페이지의 글이 이 페이지로 간다.
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(2))
    expect(api.bodies[1]).toEqual({ description: '옆 페이지에서 친 글', base: { description: DESCRIPTION_OF[OTHER_PAGE_ID] } })
    expect(api.pages).toEqual([PAGE_ID, OTHER_PAGE_ID])
    await api.release()
  })

  it('저장 중에 옆 페이지를 다녀와도(가 → 나 → 가) 잠금이 남는다 — 돌아와 친 글이 앞 응답에 지워질 수 없고 둘째 저장이 나갈 수 없다', async () => {
    const api = heldApi()
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...perPageDescription, ...api.overrides },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('첫 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(1))

    toOtherPage()
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })
    toPage(PAGE_TITLE)
    await screen.findByRole('heading', { name: PAGE_TITLE })

    // **잠금이 페이지 리셋에 함께 버려지면 여기서 상자와 버튼이 열린다.** 그러면 돌아와 친 글은
    // 앞 저장의 응답에 경고 없이 지워지고, 한 번 더 누르면 저장이 **둘 동시에** 나가 첫 응답이
    // 둘째가 나가 있는 동안 잠금을 푼다.
    expect(box().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)

    await api.release()

    // **양성 대조** — 응답이 돌아온 방문에 닿아 저장된 값이 서고 풀린다. 없으면 «한 번 잠기면
    // 안 풀린다»도 통과한다.
    expect(box().value).toBe('첫 저장 글')
    expect(box().disabled).toBe(false)
    expect(saveButton().disabled).toBe(true)
    expect(api.bodies).toEqual([{ description: '첫 저장 글', base: { description: DESCRIPTION_OF[PAGE_ID] } }])
    expect(api.pages).toEqual([PAGE_ID])
  })

  it('옆 페이지에 가 있는 동안 응답이 오면 앞 페이지의 잠금이 풀린다 — 돌아와 잠겨 있지 않다', async () => {
    const api = heldApi()
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...perPageDescription, ...api.overrides },
    })
    toView()
    await waitFor(() => expect(box().value).toBe(DESCRIPTION_OF[PAGE_ID]))

    type('앞 페이지에 저장할 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.bodies).toHaveLength(1))

    toOtherPage()
    await screen.findByRole('heading', { name: OTHER_PAGE_TITLE })
    await api.release()

    toPage(PAGE_TITLE)
    await screen.findByRole('heading', { name: PAGE_TITLE })

    // **잠금의 쓰기는 «지금 페이지»의 가드를 지나지 않는다**(`panel-drafts.tsx`의 머리말 «잠금만은 그 페이지에 매단다»).
    // 지나면 나에 있는 동안 온 응답이 가의 잠금을 못 풀어, 가로 돌아오면 **영영** 꺼져 있다.
    expect(box().disabled).toBe(false)
    type('돌아와 친 글')
    expect(saveButton().disabled).toBe(false)
  })
})
