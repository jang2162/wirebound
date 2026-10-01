/**
 * 패턴 삽입의 화면 흐름. **`<App />`을 라우트째 렌더한다.**
 *
 * **자리 규칙 자체는 여기서 재지 않는다** — `../edit/pattern-insert.test.ts`가 문서로
 * 직접 잰다. 여기서 재는 것은 그 결과가 **기존 커밋 경로를 그대로 타는가**와
 * **실패 갈래마다 무엇이 되돌아가는가**다.
 *
 * **패턴의 출처는 셸이 쥔 바인딩의 manifest 다** — `pattern-picker.test.tsx` 와 같이 셸의 테마 읽기가 `manifest.patterns` 를 싣는다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyOps, invertOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { ADMIN_FIXTURE } from '../admin-theme'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { deselect, HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import { adminThemeView } from '../theme-loader'
import { treeTool } from './tree-row'

/** 옛 시스템 테마 `portal` 이 선언하던 패턴 — 원본은 지워졌으므로 이 파일이 값을 든다(`pattern-picker.test.tsx` 와 같은 값). */
const PORTAL_PATTERNS = {
  'content.noticeBoard': {
    name: '공지 목록',
    slots: { title: 'text', keyword: 'text' },
    schema: {
      type: 'Section',
      children: [
        { type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' },
        {
          type: 'SearchForm',
          props: { collapsed: true },
          children: [{ type: 'Field', props: { label: '검색어', control: 'text' }, slot: 'keyword' }],
        },
        { type: 'List', props: { items: 10, pagination: true } },
      ],
    },
  },
}

/** 가짜 바인딩의 `manifest.patterns` 가 읽는 자리. 케이스가 바꾼다. */
const holder = { patterns: undefined as unknown, themeReads: 0 }

beforeEach(() => {
  holder.patterns = PORTAL_PATTERNS
  holder.themeReads = 0
})

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

  // 셸의 테마 읽기 — 그 순간의 `holder.patterns` 를 실은 바인딩이다.
  const getProjectTheme: ApiClient['getProjectTheme'] = async () => {
    holder.themeReads += 1
    return { ...adminThemeView(), manifest: { ...ADMIN_FIXTURE.manifest, patterns: holder.patterns } as ThemeManifest }
  }

  return { calls, api: { patchOps, getPage, getProjectTheme } }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLElement {
  return treeTool(structureRegion(), name)
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

describe('패턴 삽입 — 기존 커밋 경로를 탄다', () => {
  it('셸의 테마 읽기가 닿는다 — 한 번 불린다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    expect(holder.themeReads).toBe(1)
  })

  it('편집 하나로 나가고 op은 꽂은 노드 수만큼이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

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
    await openPage(doc(), { apiOverrides: backend.api })

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
    await openPage(doc(), { apiOverrides: backend.api })

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
    await openPage(doc(), { apiOverrides: backend.api })

    select('Card')
    await insertPattern()
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })
})

describe('패턴 삽입 — 꽂는 자리', () => {
  it('자식을 받는 노드를 골랐으면 그 안에 들어간다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    select('Card')
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/1/children')
  })

  it('자식을 못 받는 노드를 골랐으면 그 뒤 형제가 된다 — 거부하지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    select('Text')
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/1')
  })

  it('선택이 없으면 root의 자식 끝이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()
    expect(selectedType()).toBeNull()
    await insertPattern()
    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children/2')
  })
})

describe('패턴 삽입 — 꽂은 뒤 선택', () => {
  it('첫 슬롯 노드로 선택이 옮겨진다 — 그것을 골라야 슬롯을 채운다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

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
    holder.patterns = { 'content.bad': { name: '깨진 패턴', schema: { type: '없는타입' } } }
    await openPage(doc(), { apiOverrides: backend.api })

    select('Card')
    await insertPattern()
    expect(backend.calls.length).toBe(0)
    expect(selectedType()).toBe('Card')
  })
})

describe('패턴 삽입 — 실패 갈래마다 무엇이 되돌아가는가', () => {
  it('카탈로그에 없는 타입을 담은 패턴은 편집을 만들지 않고 이유를 말한다', async () => {
    const backend = server()
    holder.patterns = { 'content.bad': { name: '깨진 패턴', schema: { type: '없는타입' } } }
    await openPage(doc(), { apiOverrides: backend.api })

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
    holder.patterns = {
        'content.bad': {
          name: '슬롯 오타',
          slots: { title: 'text' },
          schema: { type: 'Section', children: [{ type: 'Text', slot: 'titel' }] },
        },
      }
    await openPage(doc(), { apiOverrides: backend.api })

    select('Card')
    await insertPattern()

    await waitFor(() => {
      expect(alertText()).toContain('titel')
    })
    expect(backend.calls.length).toBe(0)
  })

  /**
   * **`'no-spot'` 문장을 재는 화면 케이스는 이것뿐이다.** 이것이 없으면 *"`no-spot`과
   * `invalid`를 같은 문장으로 합친다"*는 변이가 **0 사망**이다 — *"패턴이 잘못됐다"*와
   * *"내가 잘못 눌렀다"*의 구분 중 **뒤엣것이 케이스 밖**이 된다.
   *
   * 화면에서 그 갈래에 닿는 길: **`children`이 배열이 아닌 문서.** `insertNodeOps`가
   * 그 부모를 `null`로 막으므로(*"깨진 문서를 조용히 덮지 않는다"* — 그쪽 실측)
   * `patternInsert`가 `'no-spot'`을 낸다. 서버가 검증한 문서에는 오지 않지만 스토어에는
   * 실린다 — `structure-actions.ts`가 같은 부류를 값으로 다루는 이유와 같다.
   */
  it('꽂을 자리가 없으면 자리 문제라고 말한다 — 패턴 탓으로 돌리지 않는다', async () => {
    const backend = server()
    const brokenDoc = pageDoc({ id: 'n-root', type: 'Page', children: '배열이아니다' } as never)
    // **`backend.api`를 통째로 펼치지 않는다 — 펼치면 케이스가 거짓 초록이 된다.**
    // `server()`의 `getPage`는 자기 `held`(정상 문서)를 돌려주므로 여기서 준 깨진 문서를
    // 덮는다. 그러면 구조 트리에 패턴이 **정상적으로 꽂히고**(`Section`·`SearchForm`·`List`가
    // 보인다) 알림은 `null`이다.
    await openPage(brokenDoc, {
      apiOverrides: { patchOps: backend.api.patchOps!, getProjectTheme: backend.api.getProjectTheme! },
    })

    await insertPattern()

    await waitFor(() => {
      expect(alertText()).toContain('고른 자리에는')
    })
    // **패턴 쪽 문장이 아니다** — 이름도 테마도 말하지 않는다.
    expect(alertText()).not.toContain('공지 목록')
    expect(alertText()).not.toContain('테마')
    expect(backend.calls.length).toBe(0)
  })

  it('서버가 거절하면 문서가 서버 상태로 되돌아가고 알림이 남는다', async () => {
    const backend = server({ failPatch: true })
    await openPage(doc(), { apiOverrides: backend.api })

    select('Card')
    await insertPattern()

    // 낙관적으로 들어갔다가 재조회로 되돌아간다.
    await waitFor(() => {
      expect(alertText()).toContain('페이지가 이미 변경되었습니다')
    })
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card'])
    // 선택은 `loadPage`가 다시 정한다 — 꽂은 노드는 서버 문서에 없으므로 부모가 아니라
    // `null`이다(`store/editor-store.ts`의 `#selectionFor` «사라진 노드는 놓는다»).
    expect(selectedType()).toBeNull()
  })
})
