/**
 * `list_pages` · `get_page`.
 *
 * 재는 것 넷: **목록이 다음 도구의 인자를 내는가**, **못 찾은 것·둘 이상을 갈라 내는가**,
 * **`pageView`가 정한 것을 빠짐없이 싣는가**, 그리고 **`wireb page get`과 같은 값을
 * 내는가**(조립이 하나라는 것의 관측이다).
 *
 * **하나짜리로 재지 않는다.** 픽스처가 메뉴 둘·깊이 둘·페이지 셋이고 서로 다른 메뉴에 같은
 * 제목이 하나 있다 — 조상을 안 붙이는 조립은 그 자리에서 드러난다.
 */
import { describe, expect, it } from 'vitest'
import { run } from '@wirebound/cli'
import { EXIT, lookupPage } from '@wirebound/cli/embed'
import { MENU_ADMIN, PAGE_DETAIL, page, snapshotPayload, stub, 상태가_있는_프로젝트 } from '@wirebound/cli/test-support'
import { callTool } from '../src/server'
import { PROJECT, SERVER, callJson, harness } from './harness'

describe('list_pages — 다음 도구의 인자를 낸다', () => {
  it('트리 순서로 페이지를 내고 각 줄이 페이지 경로를 든다', async () => {
    const listing = (await callJson(harness(), 'list_pages')) as {
      pages: { path: string; title: string; menuPath: string[] }[]
    }
    expect(listing.pages.map((p) => p.path)).toEqual([
      '관리자/회원/목록',
      '관리자/회원/상세',
      '마케팅/랜딩',
    ])
    // **접두를 벗긴 모양이다** — 그대로 `get_page`에 다시 넣을 수 있어야 한다.
    for (const p of listing.pages) expect(p.path.startsWith('page:')).toBe(false)
    expect(listing.pages[0]!.menuPath).toEqual(['관리자', '회원'])
  })

  it('메뉴를 평평하게 낸다 — `parentId`가 구조를 나른다', async () => {
    const listing = (await callJson(harness(), 'list_pages')) as {
      menu: { id: string; parentId: string | null; title: string; sortOrder: number }[]
    }
    expect(listing.menu.map((m) => m.title)).toEqual(['관리자', '회원', '마케팅'])
    expect(listing.menu.find((m) => m.title === '회원')!.parentId).toBe(MENU_ADMIN)
  })

  it('어느 프로젝트를 **언제 뜬 것**으로 답했는지 말한다', async () => {
    const listing = (await callJson(harness(), 'list_pages')) as Record<string, unknown>
    expect(listing.server).toBe(SERVER)
    expect(listing.projectId).toBe(PROJECT)
    expect(listing.capturedAt).toBe('2026-08-16T00:00:00.000Z')
  })

  /**
   * **겹치는 타겟은 실재한다** — 같은 메뉴 아래 같은 제목이면 조립 규칙이 같은 문자열을
   * 만든다(`duplicateTargets`가 그 판정을 갖고 있다). 그 경로로는 `get_page`가 하나를 못 고르므로 **부르기 전에**
   * 알아야 한다. `wireb lint`는 이 상태를 아직 규칙으로 안 본다.
   */
  it('겹치는 경로를 말한다 — 안 겹치면 빈 배열이다', async () => {
    expect(((await callJson(harness(), 'list_pages')) as { duplicatePaths: string[] }).duplicatePaths).toEqual([])

    const 겹침 = snapshotPayload()
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '9'), MENU_ADMIN, '목록', 5, { version: 1, root: { id: 'r', type: 'Page' } }, null))
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '8'), MENU_ADMIN, '목록', 6, { version: 1, root: { id: 'r', type: 'Page' } }, null))
    const said = (await callJson(harness({ payload: 겹침 }), 'list_pages')) as { duplicatePaths: string[] }
    expect(said.duplicatePaths).toEqual(['관리자/목록'])
  })

  it('페이지가 없는 프로젝트도 결과다 — 빈 목록이 오류가 아니다', async () => {
    const 빈 = snapshotPayload({ pages: [], comments: [] })
    const listing = (await callJson(harness({ payload: 빈 }), 'list_pages')) as { pages: unknown[] }
    expect(listing.pages).toEqual([])
  })
})

describe('get_page — 무엇을 싣나', () => {
  it('`pageView`가 정한 것을 빠짐없이 싣는다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '관리자/회원/목록' })) as {
      found: boolean
      page: Record<string, unknown>
    }
    expect(said.found).toBe(true)
    // **문서 전문을 뺀 판을 만들지 않는다** — 설계서 「스킬」의 흐름이 스키마를 읽으라고 적었다.
    expect(Object.keys(said.page).sort()).toEqual(
      [
        'comments',
        'description',
        'document',
        'id',
        'interactions',
        'menuPath',
        'nodeCount',
        'nodes',
        'path',
        'target',
        'title',
        'viewStates',
      ].sort(),
    )
  })

  /**
   * **카탈로그가 서 있어야 문장이 온전하다** — 안 서면 `로딩 상태`가 `loading`이 되고 이
   * 케이스가 죽는다.
   * 설치하는 자리는 `read/catalog.ts` 하나이고 도구는 그것을 모른다.
   */
  it('상호작용 문장이 카탈로그의 라벨을 쓴다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '관리자/회원/목록' })) as {
      page: { interactions: { text: string }[] }
    }
    expect(said.page.interactions).toHaveLength(1)
    expect(said.page.interactions[0]!.text).toBe('① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다')
  })

  it('코멘트가 노드 이름과 함께 온다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '관리자/회원/목록' })) as {
      page: { comments: { nodeName: string; body: string; authorName: string }[] }
    }
    expect(said.page.comments).toEqual([
      {
        nodeId: 'list',
        nodeName: '② 목록',
        body: '정렬 기준을 정해야 합니다',
        authorName: '장병현',
        createdAt: '2026-08-16T01:00:00.000Z',
      },
    ])
  })

  it('`page:` 접두를 붙여도 같은 것을 찾고 마디의 공백을 걷는다', async () => {
    for (const path of ['page:관리자/회원/목록', ' 관리자 / 회원 / 목록 ']) {
      const said = (await callJson(harness(), 'get_page', { path })) as { found: boolean }
      expect(said.found, path).toBe(true)
    }
  })
})

describe('get_page — 못 찾은 것과 둘 이상을 갈라 낸다', () => {
  it('없으면 후보를 함께 내고 **오류가 아니다**', async () => {
    const outcome = await callTool(harness(), 'get_page', { path: '관리자/없는페이지' })
    // 경로가 틀린 것은 에이전트가 고칠 수 있는 상태다 — 후보를 읽어야 고친다.
    expect(outcome.isError).toBe(false)

    const said = JSON.parse(outcome.text) as { found: boolean; reason: string; candidates: string[] }
    expect(said.found).toBe(false)
    expect(said.reason).toBe('no-such-path')
    expect(said.candidates).toContain('관리자/회원/목록')
    expect(said.candidates.some((c) => c.startsWith('page:'))).toBe(false)
  })

  it('둘 이상이면 **둘 다 이름으로 낸다** — 하나를 고르지 않는다', async () => {
    const 겹침 = snapshotPayload()
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '9'), MENU_ADMIN, '목록', 5, { version: 1, root: { id: 'r', type: 'Page' } }, null))
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '8'), MENU_ADMIN, '목록', 6, { version: 1, root: { id: 'r', type: 'Page' } }, null))

    const said = (await callJson(harness({ payload: 겹침 }), 'get_page', { path: '관리자/목록' })) as {
      found: boolean
      reason: string
      matches: { id: string; title: string }[]
    }
    expect(said.found).toBe(false)
    expect(said.reason).toBe('ambiguous')
    expect(said.matches).toHaveLength(2)
    expect(said.matches.map((m) => m.id).sort()).toEqual(
      [PAGE_DETAIL.replace(/2$/, '9'), PAGE_DETAIL.replace(/2$/, '8')].sort(),
    )
  })

  it('제목만 주면 못 찾는다 — 그것이 조상을 붙이는 이유다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '목록' })) as { found: boolean }
    expect(said.found).toBe(false)
  })
})

/**
 * **`migrateDocument`를 지난다** — 부르는 자리는 `read/page.ts`이고, `wireb page get`과
 * `get_page`가 **같은 함수**를 부르므로 둘 다 지난다.
 *
 * `MIGRATIONS`가 비어 올릴 것이 없어도 **못 올리는 문서는 만들 수 있다** —
 * `migrateDocument`가 `version > CURRENT`에서 던진다.
 */
describe('못 올리는 문서 버전을 말한다 — 조용히 넘어가지 않는다', () => {
  function 미래문서() {
    const payload = snapshotPayload()
    const 목록 = payload.pages.find((p) => p.title === '목록')!
    ;(목록.schema as { version: number }).version = 99
    return payload
  }

  it('페이지를 여전히 내주고 **못 올렸다고 말한다**', async () => {
    const said = (await callJson(harness({ payload: 미래문서() }), 'get_page', { path: '관리자/회원/목록' })) as {
      found: boolean
      notes: string[]
    }
    // **막지 않는다** — 막으면 새 서버에 붙은 옛 판이 아무것도 못 읽는다.
    expect(said.found).toBe(true)
    expect(said.notes).toHaveLength(1)
    expect(said.notes[0]).toContain('99')
  })

  it('멀쩡한 문서에는 아무 말도 안 한다 — 반대편', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '관리자/회원/목록' })) as { notes: string[] }
    expect(said.notes).toEqual([])
  })

  it('`wireb page get`도 같은 것을 말한다 — 부르는 함수가 하나다', async () => {
    const lookup = lookupPage(미래문서(), '관리자/회원/목록')
    expect(lookup.kind).toBe('found')
    expect(lookup.kind === 'found' && lookup.notes).toHaveLength(1)
  })
})

/**
 * **CLI와 MCP가 같은 값을 낸다** — 조립이 하나라는 것의 직접 관측이다.
 *
 * 자(`assembly-census`)는 *"부르는 자리가 하나다"*를 지키고 이 케이스는 *"그래서 값이
 * 같다"*를 잰다. 둘 다 필요하다: 자만 있으면 읽기 층 안에서 갈래를 나눠도 안 걸린다.
 *
 * **명령을 실제로 돌린다** — `run(['page','get',…,'--json'])`의 **표준출력**을 읽어 도구의
 * 응답과 맞댄다. `lookupPage`를 직접 부르면 *"같은 함수가 같은 값을 낸다"*는 동어반복이 되어,
 * 명령 파일에 후처리가 생겨도 못 본다.
 */
describe('`wireb page get --json`과 `get_page`가 같은 값을 본다', () => {
  it('페이지 값이 글자 하나까지 같다', async () => {
    const 도구 = harness()
    const said = (await callJson(도구, 'get_page', { path: '관리자/회원/목록' })) as { page: unknown }

    const 명령 = harness()
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], 명령), 명령.stderr.join('\n')).toBe(EXIT.ok)
    // **표준출력이 값 하나뿐이어야 한다** — 섞이면 아래 `JSON.parse`가 먼저 죽는다.
    expect(said.page).toEqual(JSON.parse(명령.stdout.join('\n')))
  })

  it('없는 경로의 후보 목록도 같은 자리에서 나온다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: '없다' })) as { candidates: string[] }

    // CLI는 그것을 코드 1과 stderr의 줄들로 말한다 — **받는 쪽이 다르고 값은 같다**.
    const 명령 = harness()
    expect(await run(['page', 'get', '없다'], 명령)).toBe(EXIT.usage)
    const 후보 = 명령.stderr.filter((line) => line.startsWith('  - ')).map((line) => line.slice(4))
    expect(said.candidates).toEqual(후보)
  })

  it('겹치는 경로에서도 두 도구가 같은 것을 든다', async () => {
    const 겹침 = () => {
      const payload = snapshotPayload()
      payload.pages.push(page(PAGE_DETAIL.replace(/2$/, '9'), MENU_ADMIN, '목록', 5, { version: 1, root: { id: 'r', type: 'Page' } }, null))
      payload.pages.push(page(PAGE_DETAIL.replace(/2$/, '8'), MENU_ADMIN, '목록', 6, { version: 1, root: { id: 'r', type: 'Page' } }, null))
      return payload
    }
    const said = (await callJson(harness({ payload: 겹침() }), 'get_page', { path: '관리자/목록' })) as {
      matches: { id: string }[]
    }

    const 명령 = harness({ payload: 겹침() })
    expect(await run(['page', 'get', '관리자/목록'], 명령)).toBe(EXIT.usage)
    const ids = 명령.stderr.filter((line) => line.startsWith('  - ')).map((line) => /\(([^)]+)\)$/.exec(line)![1])
    expect(said.matches.map((match) => match.id)).toEqual(ids)
  })
})

/** 붙지 못한 갈래는 `attach.test.ts`가 든다. 여기서는 **경로 도구도 같은 길**인지만 본다. */
describe('get_page도 붙지 못하면 결과로 말한다', () => {
  it('바인딩이 없으면 isError이고 wireb 코드를 단다', async () => {
    const outcome = await callTool(harness({ binding: false }), 'get_page', { path: '관리자/회원/목록' })
    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.config}]`)
  })
})

/** `stub`을 쓰지 않는 파일이 되면 import가 죽는다 — 하네스가 그것을 쓴다는 것을 고정한다. */
it('하네스가 스냅샷 라우트를 실제로 건다', async () => {
  const io = harness({ snapshot: 'none' })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: snapshotPayload() })
  const said = (await callJson(io, 'list_pages')) as { pages: unknown[] }
  expect(said.pages).toHaveLength(3)
})

/**
 * **별칭이 트리 읽기에 실린다**(설계서 「설계서 화면 구조」의 노드 별칭 — MCP 의 트리 읽기). 노드마다 `alias`(있을 때) · `rowLabel`
 * (구조 트리 줄과 같은 글) · `name`(문장이 부르는 이름)이 별칭을 든다. 무엇을 싣는지는 `pageView` 가 정하고 그 칸마다의 값은
 * `packages/schema/test/alias-naming.test.ts` 가 잰다 — 여기는 도구가 그것을 그대로 내는가다.
 */
describe('get_page — 별칭', () => {
  it('노드의 `alias` · `rowLabel` · 별칭으로 부른 `name` 을 싣는다', async () => {
    const 문서 = {
      version: 1,
      root: {
        id: 'root',
        type: 'Page',
        children: [{ id: 'save', type: 'Button', alias: '머리 저장', props: { label: '저장' } }],
      },
    }
    const payload = snapshotPayload({ pages: [page(PAGE_DETAIL, MENU_ADMIN, '별칭', 0, 문서, null)], comments: [] })
    const said = (await callJson(harness({ payload }), 'get_page', { path: '관리자/별칭' })) as {
      found: boolean
      page: { nodes: { id: string; name: string; alias?: string; rowLabel: string }[] }
    }
    expect(said.found).toBe(true)
    expect(said.page.nodes.find((node) => node.id === 'save')).toMatchObject({
      name: '머리 저장',
      alias: '머리 저장',
      rowLabel: 'Button (머리 저장) 저장',
    })
    expect(said.page.nodes.find((node) => node.id === 'root')).not.toHaveProperty('alias')
  })
})

describe('get_page — 화면 상태', () => {
  /** 설계서 「MCP 도구」 — 트리 읽기가 상태 목록과 영역을 그대로 보이고, 가지마다 상태 이름을 붙인다. */
  it('상태 목록과 가지마다(그 안 노드까지) 상태 이름을 싣는다', async () => {
    const said = (await callJson(harness({ payload: 상태가_있는_프로젝트() }), 'get_page', { path: '관리자/회원/상태' })) as {
      found: boolean
      page: { viewStates: { id: string; name: string }[]; nodes: { id: string; type: string; viewState?: { id: string; name: string } }[] }
    }
    expect(said.found).toBe(true)
    expect(said.page.viewStates.map((state) => state.name)).toEqual(['관리자', '비로그인'])
    const byId = new Map(said.page.nodes.map((node) => [node.id, node]))
    expect(byId.get('st_switch')!.type).toBe('StateSwitch')
    expect(byId.get('st_case_a')!.viewState).toEqual({ id: 's_admin', name: '관리자' })
    expect(byId.get('st_approve')!.viewState).toEqual({ id: 's_admin', name: '관리자' })
    expect(byId.get('st_view')!.viewState).toEqual({ id: 'default', name: '기본' })
    expect(byId.get('st_title')!.viewState).toBeUndefined()
  })
})
