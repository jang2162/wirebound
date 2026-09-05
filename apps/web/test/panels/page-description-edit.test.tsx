/**
 * **페이지 설명 편집**(설계 §9 — 점검 #10). 뷰 모드 «페이지 설명» 탭이 그 자리다.
 *
 * **그 탭의 읽기 쪽은 `test/routes/view-mode.test.tsx`의 *"§9 — 페이지 설명 탭"*이
 * 소유한다** — 여기는 **고치는 쪽**만 잰다. 둘을 한 파일에 두면 같은 축을 두 자리가 재게 된다.
 *
 * **서버 계약도 여기서 재지 않는다** — 상한·`null`·빈 문자열·역할·잠금은 전부
 * `apps/api/test/pages.test.ts`와 `apps/api/test/permission-matrix.test.ts`가 갖는다.
 * 여기가 재는 것은 **화면이 무엇을 보내고 무엇을 말하는가**다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PAGE_DESCRIPTION_MAX_LENGTH } from '@wirebound/schema'
import { ApiError } from '../../src/api/client'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail } from '../../src/api/types'
import { openPage, PAGE_ID, pageDetail, pageDoc } from '../editor-harness'
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
 * 편집기의 입력 상자. **`role` + 이름으로 잡는다** — 클래스로 잡으면 마크업을 바꾸는 순간
 * 거짓 빨강이고, `getByLabelText`만으로는 **뷰 모드의 탭 패널도 걸린다**(그쪽은
 * `aria-labelledby`가 «페이지 설명» 탭을 가리킨다. 실측 — 처음에 그 자로 짰다가 잡혔다).
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

function type(value: string): void {
  fireEvent.change(box(), { target: { value } })
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

/** `updatePage` 호출을 받아 적는 가짜. 응답의 `description`은 부르는 쪽이 정한다. */
function recordingApi(reply?: (description: string | null) => PageDetail): {
  overrides: Partial<ApiClient>
  bodies: { description?: string | null }[]
} {
  const bodies: { description?: string | null }[] = []
  return {
    bodies,
    overrides: {
      updatePage: (async (_projectId: string, pageId: string, body: { description?: string | null }) => {
        bodies.push(body)
        const next = body.description ?? null
        return reply?.(next) ?? { ...pageDetail(pageId, DOC), description: next }
      }) as never,
    },
  }
}

describe('§9 — 편집기는 뷰 모드 «페이지 설명» 탭에 있다', () => {
  // **혼자 죽지 않는다 — 늘 `test/routes/view-mode.test.tsx`의 *"뷰 모드에서 속성 탭의
  // 본문이 사라진다"*와 함께 죽는다**(실측: `PANEL_BODIES.props`를 이 패널로 바꾸면 둘이
  // 함께 2 사망). **그 축의 주인은 그쪽이다** — 탭과 본문의 짝을 재는 자리이고, 여기는
  // 그 위에 *"그 본문에 편집기가 있다"*를 얹는다.
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

describe('§9 — 설명을 저장한다', () => {
  it('고쳐 저장하면 `updatePage`에 그 설명이 실리고, 화면은 서버가 준 값을 쓴다', async () => {
    // **서버가 다른 값을 준다.** 화면이 보낸 것을 그대로 그리면 이 케이스가 죽는다.
    const api = recordingApi(() => ({ ...pageDetail(PAGE_ID, DOC), description: '서버가 정한 값' }))
    await openPage(DOC, { apiOverrides: { ...withDescription('옛 설명'), ...api.overrides } })
    toView()
    await findBox()

    type('새 설명')
    fireEvent.click(saveButton())

    await waitFor(() => expect(api.bodies).toEqual([{ description: '새 설명' }]))
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

    await waitFor(() => expect(api.bodies).toEqual([{ description: null }]))
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
    // **서버 문장 그대로다**(`api/failure.tsx`의 D5) — 화면이 문안을 다시 쓰면 서버가
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

describe('§9 — 상한은 `@wirebound/schema`가 소유한다', () => {
  it('입력 상자의 `maxLength`가 그 상수와 같다 — 화면이 수를 따로 갖지 않는다', async () => {
    await openPage(DOC, { apiOverrides: withDescription(null) })
    toView()

    // **값으로 잰다.** 원문에서 `2000`을 찾는 자는 라우트가 상수에서 떨어져 나가도 안 죽는다
    // (`COMMENT_BODY_MAX_LENGTH` 머리말이 겪은 그 사고).
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
