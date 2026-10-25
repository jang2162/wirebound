/**
 * `wireb page get <경로> [--json]`.
 *
 * 재는 것 셋: **경로를 무엇으로 푸는가**, **못 찾았을 때·둘 이상일 때**, 그리고
 * **사람이 읽는 판과 `--json`이 같은 값에서 나오는가.**
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { MENU_ADMIN, PAGE_DETAIL, PAGE_LIST, page, snapshotPayload, 상태가_있는_프로젝트 } from './snapshot-fixture'
import type { SnapshotPayload } from '@wirebound/themes'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'

function 준비(payload: SnapshotPayload = snapshotPayload()): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
      }),
    },
  })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: payload })
  return io
}

describe('경로를 설계서 「모델」의 타겟으로 푼다', () => {
  it('조상 메뉴가 붙은 경로로 찾는다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stdout[0]).toBe('관리자/회원/목록')
  })

  it('`page:` 접두를 붙여도 같은 것을 찾는다 — 접두를 아는 자리가 하나다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', 'page:관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stdout[0]).toBe('관리자/회원/목록')
  })

  /** 제목만으로는 못 찾는다 — 그것이 조상을 붙이는 이유다. */
  it('제목만 주면 못 찾는다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '목록'], io)).toBe(EXIT.usage)
  })

  it('마디의 앞뒤 공백을 걷는다 — 타겟을 만드는 쪽과 같은 규칙이다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', ' 관리자 / 회원 / 목록 '], io), io.stderr.join('\n')).toBe(EXIT.ok)
  })
})

describe('못 찾았을 때·둘 이상일 때를 갈라 말한다', () => {
  it('없으면 코드 1이고 **있는 경로를 함께 낸다**', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/없는페이지'], io)).toBe(EXIT.usage)

    const said = io.stderr.join('\n')
    expect(said).toContain('그 경로의 페이지가 없습니다')
    // **접두를 벗긴 모양이다** — 사람이 그대로 다시 쳐야 하고 `wireb lint`의 출력도 그 모양이다.
    expect(said).toContain('- 관리자/회원/목록')
    expect(said).not.toContain('page:관리자')
    // 표준출력에 아무것도 안 나가야 파이프로 받는 쪽이 빈손인 것을 안다.
    expect(io.stdout).toEqual([])
  })

  /**
   * **겹치는 타겟은 실재한다** — 같은 메뉴 아래 같은 제목이면 조립 규칙이 같은 문자열을
   * 만든다(`duplicateTargets`가 그 판정을 든다). 하나를 골라 주면 **어느
   * 쪽인지 아무도 모른 채** 지나간다.
   */
  it('둘 이상이면 코드 1이고 **둘 다 이름으로 낸다**', async () => {
    const 겹침 = snapshotPayload()
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '9'), MENU_ADMIN, '목록', 5, { version: 5, root: { id: 'r', type: 'Page' } }, null))
    겹침.pages.push(page(PAGE_DETAIL.replace(/2$/, '8'), MENU_ADMIN, '목록', 6, { version: 5, root: { id: 'r', type: 'Page' } }, null))

    const io = 준비(겹침)
    expect(await run(['page', 'get', '관리자/목록'], io)).toBe(EXIT.usage)

    const said = io.stderr.join('\n')
    expect(said).toContain('그 경로의 페이지가 2개입니다')
    expect(said.match(/- 목록 \(/g)).toHaveLength(2)
  })

  it('경로를 안 주면 쓰임말 오류다', async () => {
    const io = 준비()
    expect(await run(['page', 'get'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('페이지 경로를 주세요')
  })
})

describe('무엇을 싣는가 — 스키마·코멘트·상호작용 문장 (설계서 「MCP 도구」)', () => {
  it('구조를 노드 이름으로 편다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/목록'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('① 검색 버튼')
    expect(said).toContain('② 그리드')
  })

  /**
   * **`installCatalog()`를 안 부르면 여기가 죽는다.** 라벨이 카탈로그의 `editor`에서 오므로
   * 설치 전에는 `로딩 상태`가 아니라 `loading`이 나온다(실측). 던지지 않으므로 **조용히
   * 나빠지는** 자리다 — 이 케이스가 그 침묵을 깬다.
   */
  it('상호작용 문장이 카탈로그의 라벨을 쓴다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/목록'], io)

    expect(io.stdout.join('\n')).toContain('① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다')
  })

  it('코멘트를 **어느 노드에 달렸는지**와 함께 낸다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/목록'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('② 그리드 · 장병현')
    expect(said).toContain('정렬 기준을 정해야 합니다')
  })

  it('다른 페이지의 코멘트를 섞지 않는다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/상세'], io)

    expect(io.stdout.join('\n')).toContain('코멘트 0개')
    expect(io.stdout.join('\n')).not.toContain('정렬 기준')
  })

  it('없는 것을 빈 화면으로 두지 않는다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/상세'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('상호작용 0개')
    expect(said).toContain('(없음)')
  })
})

describe('--json 은 같은 값을 낸다', () => {
  it('사람이 읽는 판과 같은 재료다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], io), io.stderr.join('\n')).toBe(EXIT.ok)

    const view = JSON.parse(io.stdout.join('\n')) as Record<string, unknown>
    expect(view.id).toBe(PAGE_LIST)
    expect(view.path).toBe('관리자/회원/목록')
    expect(view.target).toBe('page:관리자/회원/목록')
    expect(view.menuPath).toEqual(['관리자', '회원'])
    // 문서 전문이 실린다 — 사람이 읽는 판은 그것을 트리로 접어 보일 뿐이다.
    expect((view.document as { root: { id: string } }).root.id).toBe('root')
  })

  it('상호작용 문장이 사람이 읽는 판의 것과 **글자까지 같다**', async () => {
    const 사람 = 준비()
    await run(['page', 'get', '관리자/회원/목록'], 사람)
    const 기계 = 준비()
    await run(['page', 'get', '관리자/회원/목록', '--json'], 기계)

    const view = JSON.parse(기계.stdout.join('\n')) as { interactions: { text: string }[] }
    for (const sentence of view.interactions) {
      expect(사람.stdout.join('\n')).toContain(sentence.text)
    }
    // 분모가 0이면 위가 공허하다.
    expect(view.interactions).toHaveLength(1)
  })

  it('--json 은 표준출력만 쓴다 — 파이프에 섞일 것이 없다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/목록', '--json'], io)
    expect(io.stderr).toEqual([])
  })
})

describe('서버가 준 것을 규격으로 검사한다', () => {
  it('규격과 다르면 코드 3이다 — 서버 쪽 문제다', async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, {
      status: 200,
      body: { payloadVersion: 1, capturedAt: '2026-08-16T00:00:00.000Z', menu: [], pages: [] },
    })

    expect(await run(['page', 'get', '관리자/회원/목록'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('규격과 다릅니다')
  })

  /**
   * **모르는 형식을 막지 않는다**(`packages/themes/src/snapshot/payload.ts`의 `payloadVersion`
   * 절). 막으면 새 서버에 붙은 옛
   * CLI가 아무것도 못 읽는다. 대신 **stderr로 말한다.**
   */
  it('모르는 payload 형식은 경고하고 계속한다', async () => {
    const io = 준비(snapshotPayload({ payloadVersion: 99 }))
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stderr.join('\n')).toContain('이 wireb는 3까지 압니다')
  })

  it('판 3 payload(테마 바인딩)를 읽는다 — 경고 없음', async () => {
    const io = 준비(snapshotPayload())
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stderr).toEqual([])
  })

  it('판 2 payload(테마 절 없음)도 읽는다', async () => {
    const { theme: _theme, ...v2 } = snapshotPayload({ payloadVersion: 2 })
    const io = 준비(v2)
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stderr).toEqual([])
  })
})

describe('자격과 바인딩 (세 갈래는 client.ts가 가른다)', () => {
  it('자격이 없으면 코드 2다', async () => {
    const io = createFakeIo({
      cwd: '/repo',
      files: { '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }) },
    })
    expect(await run(['page', 'get', '관리자/회원/목록'], io)).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('wireb login')
  })

  it('바인딩이 없으면 코드 2다', async () => {
    const io = createFakeIo({ cwd: '/repo' })
    expect(await run(['page', 'get', '관리자/회원/목록'], io)).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('.wirebound.json')
  })
})

/**
 * **`migrateDocument`를 지난다 — `lint`와 같은 길이다.**
 *
 * 이 명령이 저장된 문서를 그대로 읽으면 `lint`와 같은 페이지를 다르게 읽는다.
 * `MIGRATIONS = []`이라 지금 올릴 것은 없지만 **못 올리는 문서는 지금도 만들 수 있고**, 그때
 * 두 명령이 같은 페이지를 다르게 읽으면 안 된다. 조립이 `read/page.ts` 하나이므로
 * 설계서 「MCP 도구」의 `get_page`도 같은 말을 한다.
 */
describe('못 올리는 문서 버전을 말한다', () => {
  function 미래문서(): SnapshotPayload {
    const payload = snapshotPayload()
    const 목록 = payload.pages.find((p) => p.id === PAGE_LIST)!
    ;(목록.schema as unknown as { version: number }).version = 99
    return payload
  }

  it('페이지를 여전히 내주고 stderr로 말한다 — 막지 않는다', async () => {
    const io = 준비(미래문서())
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stdout[0]).toBe('관리자/회원/목록')
    expect(io.stderr.join('\n')).toContain('올릴 수 없습니다')
  })

  /** **`out`이 아니라 `err`다** — `--json`을 파이프로 받는 쪽에 섞이면 JSON이 아니게 된다. */
  it('`--json`의 표준출력은 값 하나뿐이다', async () => {
    const io = 준비(미래문서())
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(JSON.parse(io.stdout.join('\n')).id).toBe(PAGE_LIST)
  })

  it('멀쩡한 문서에는 아무 말도 안 한다 — 반대편', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/회원/목록'], io)).toBe(EXIT.ok)
    expect(io.stderr.join('\n')).not.toContain('올릴 수 없습니다')
  })
})

describe('화면 상태', () => {
  it('상태 목록을 머리에 한 줄로 말하고, 구조의 노드 이름이 상태를 단다', async () => {
    const io = 준비(상태가_있는_프로젝트())
    expect(await run(['page', 'get', '관리자/회원/상태'], io)).toBe(EXIT.ok)
    const out = io.stdout.join('\n')
    expect(out).toContain('  화면 상태: 기본 · 관리자 · 비로그인')
    expect(out).toContain("'승인 버튼'(관리자 상태)")
  })

  /** 줄은 트리 차례다 — 하위 상태는 목록에서 뒤에 있어도 그 부모 바로 뒤에 «부모 > 하위» 로 선다(설계 spec «C5»). */
  it('하위 상태가 있으면 줄이 트리 차례 · «부모 > 하위» 꼴이다', async () => {
    const payload = 상태가_있는_프로젝트()
    const states = payload.pages.at(-1)!.schema as unknown as { viewStates: { id: string; name: string; parent?: string }[] }
    states.viewStates.push({ id: 's_ops', name: '운영', parent: 's_admin' })
    const io = 준비(payload)
    expect(await run(['page', 'get', '관리자/회원/상태'], io)).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('  화면 상태: 기본 · 관리자 · 관리자 > 운영 · 비로그인')
  })

  it('상태가 없는 페이지에는 그 줄이 없다', async () => {
    const io = 준비()
    await run(['page', 'get', '관리자/회원/목록'], io)
    expect(io.stdout.join('\n')).not.toContain('화면 상태')
  })
})
