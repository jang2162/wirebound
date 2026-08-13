/**
 * 패턴 삽입의 화면 흐름(P7-1 T4 — D4·D5·D9). **`<App />`을 라우트째 렌더한다.**
 *
 * **자리 규칙 자체는 여기서 재지 않는다** — `../edit/pattern-insert.test.ts`가 문서로
 * 직접 잰다. 여기서 재는 것은 그 결과가 **기존 커밋 경로를 그대로 타는가**(D4)와
 * **실패 갈래마다 무엇이 되돌아가는가**다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { systemTheme, type Theme } from '@wirebound/themes'
import { applyOps, invertOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { SYSTEM_ADMIN_THEME_ID } from '../helpers'
import { HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'

/**
 * ```
 * n-root  (Page)      many
 * ├ n-a    (Text)     none — 자식을 못 받는다
 * └ n-box  (Card)     many · 자식 없음
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card' },
    ],
  })
}

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

/** 편집을 받아 문서를 진행시키는 대역. `structure-toolbar.test.tsx`의 것과 같은 형태다. */
function server(options: { failPatch?: boolean } = {}): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    if (options.failPatch === true) {
      throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 9)')
    }
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

  return { calls, api: { patchOps, getPage } }
}

function themeApi(theme: Theme | null): Partial<ApiClient> {
  return {
    getProjectTheme: async () => ({ themeId: SYSTEM_ADMIN_THEME_ID, theme, issues: [] }),
  }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole(
    'button',
    { name },
  )
}

function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

/** 지금 선택 표시가 붙은 줄의 이름. 표시가 없으면 `null`이다. */
function selectedType(): string | null {
  return structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')
    ?.textContent ?? null
}

function alertText(): string | null {
  return document.body.querySelector('[role="alert"]')?.textContent ?? null
}

/** 패턴 고르개를 열고 첫 패턴을 꽂는다. */
async function insertPattern(): Promise<void> {
  fireEvent.click(toolButton('패턴 넣기'))
  await screen.findByLabelText('패턴')
  fireEvent.click(screen.getByRole('button', { name: '패턴 추가' }))
}

describe('패턴 삽입 — D4: 기존 커밋 경로를 탄다', () => {
  it('편집 하나로 나가고 op은 꽂은 노드 수만큼이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()

    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    // `portal`의 `content.noticeBoard`는 노드 하나(`Section`)로 전개된다 —
    // 그 수는 `packages/themes`의 전개 케이스가 만든다.
    expect(backend.calls[0]!.ops.length).toBe(1)
    expect(backend.calls[0]!.ops[0]!.op).toBe('add')
    // 기존 경로 그대로이므로 `baseSeq`도 평범한 편집과 같다.
    expect(backend.calls[0]!.baseSeq).toBe(HEAD_SEQ)
  })

  it('전개된 트리가 통째로 화면에 들어온다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()

    // 패턴의 자식들이 구조 트리에 나타난다.
    await waitFor(() => {
      expect(structureTypes()).toContain('SearchForm')
    })
    expect(structureTypes()).toContain('List')
  })

  it('undo가 그대로 따라온다 — 새 계약을 만들지 않았다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()
    await waitFor(() => {
      expect(structureTypes()).toContain('SearchForm')
    })

    fireEvent.click(
      within(screen.getByRole('group', { name: '편집 이력' })).getByRole('button', {
        name: '되돌리기',
      }),
    )
    await waitFor(() => {
      expect(structureTypes()).not.toContain('SearchForm')
    })
  })

  it('꽂은 뒤 목록이 닫힌다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })
})

describe('패턴 삽입 — D5: 꽂는 자리', () => {
  it('자식을 받는 노드를 골랐으면 그 안에 들어간다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/1/children')
  })

  it('자식을 못 받는 노드를 골랐으면 그 뒤 형제가 된다 — 거부하지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Text')
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/1')
  })

  it('선택이 없으면 root의 자식 끝이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    // 아무것도 고르지 않은 채로 연다.
    expect(selectedType()).toBeNull()
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/2')
  })
})

describe('패턴 삽입 — 꽂은 뒤 선택 (D3의 흐름)', () => {
  it('첫 슬롯 노드로 선택이 옮겨진다 — 그것을 골라야 슬롯을 채운다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()
    // `content.noticeBoard`의 첫 슬롯은 `title`이고 그 노드는 `Text`다.
    await waitFor(() => {
      expect(selectedType()).toBe('Text')
    })
    // 속성 패널이 그 노드를 잡고 있다 — 채울 수 있는 상태다.
    expect(document.body.querySelector('.wb-shell-panel-title')?.textContent).toBe('Text')
  })

  it('편집이 큐에 들어가지 못하면 선택을 옮기지 않는다', async () => {
    // 다른 페이지를 들고 있는 상태를 만들 수 없으므로, 여기서는 **꽂히지 않는 갈래**로
    // 잰다 — 잘못된 패턴이면 편집 자체가 없고 선택도 그대로다.
    const backend = server()
    const broken: Theme = {
      ...systemTheme('portal')!,
      patterns: { 'content.bad': { name: '깨진 패턴', schema: { type: '없는타입' } } },
    }
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(broken) } })

    select('Card')
    await insertPattern()
    expect(backend.calls.length).toBe(0)
    expect(selectedType()).toBe('Card')
  })
})

describe('패턴 삽입 — D9: 실패 갈래마다 무엇이 되돌아가는가', () => {
  it('카탈로그에 없는 타입을 담은 패턴은 편집을 만들지 않고 이유를 말한다', async () => {
    const backend = server()
    const broken: Theme = {
      ...systemTheme('portal')!,
      patterns: { 'content.bad': { name: '깨진 패턴', schema: { type: '없는타입' } } },
    }
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(broken) } })

    select('Card')
    await insertPattern()

    await waitFor(() => {
      expect(alertText()).toContain('깨진 패턴')
    })
    // **테마 쪽 문제라고 말한다** — 사용자가 자기 조작을 의심하지 않게.
    expect(alertText()).toContain('패턴')
    expect(alertText()).toContain('없는타입')
    // 문서는 그대로다.
    expect(backend.calls.length).toBe(0)
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card'])
  })

  it('선언 안 된 슬롯을 쓰는 패턴도 막고 그 슬롯 이름을 말한다', async () => {
    const backend = server()
    const broken: Theme = {
      ...systemTheme('portal')!,
      patterns: {
        'content.bad': {
          name: '슬롯 오타',
          slots: { title: 'text' },
          schema: { type: 'Section', children: [{ type: 'Text', slot: 'titel' }] },
        },
      },
    }
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(broken) } })

    select('Card')
    await insertPattern()

    await waitFor(() => {
      expect(alertText()).toContain('titel')
    })
    expect(backend.calls.length).toBe(0)
  })

  it('서버가 거절하면 문서가 서버 상태로 되돌아가고 알림이 남는다', async () => {
    const backend = server({ failPatch: true })
    await openPage(doc(), { apiOverrides: { ...backend.api, ...themeApi(systemTheme('portal')!) } })

    select('Card')
    await insertPattern()

    // 낙관적으로 들어갔다가 재조회로 되돌아간다.
    await waitFor(() => {
      expect(alertText()).toContain('페이지가 이미 변경되었습니다')
    })
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card'])
    // 선택은 `loadPage`가 재설정한다(P2b-2 이월 §1) — 부모가 아니라 `null`이다.
    expect(selectedType()).toBeNull()
  })
})
