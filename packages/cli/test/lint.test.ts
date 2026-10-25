/**
 * `wireb lint [경로] [--fail-on]`.
 *
 * 재는 것: **카탈로그를 안 부르면 결과가 통째로 거짓이 되는 것** · **경로가 출력 거르개이지
 * 입력 좁히개가 아닌 것** · **종료 코드의 갈림** · **`.wirebound.json`의 `lint` 절**.
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import {
  LIST_VARIANTS,
  MENU_MEMBER,
  page,
  projectThemeResponse,
  snapshotPayload,
  경고가_있는_프로젝트,
  상태가_있는_프로젝트,
  오류가_있는_프로젝트,
  테마에_없는_variant_프로젝트,
} from './snapshot-fixture'
import type { SnapshotPayload } from '@wirebound/themes'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'

function 준비(payload: SnapshotPayload = snapshotPayload(), binding: Record<string, unknown> = {}): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT, ...binding }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
      }),
    },
  })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: payload })
  stub(io, 'GET', `/api/projects/${PROJECT}/theme`, { status: 200, body: projectThemeResponse() })
  return io
}

describe('installCatalog 를 부른다 — 안 부르면 결과가 통째로 거짓이다', () => {
  /**
   * **실측**: 카탈로그 없이 `lintProject`를 돌리면 노드마다
   * `document-invalid:error 알 수 없는 컴포넌트 타입: Page`가 나온다. 조용히 통과하지는
   * 않지만 **전부 `error`라 종료 코드까지 뒤집힌다** — 결함이 없는 프로젝트가 10으로 끝난다.
   */
  it('멀쩡한 카탈로그 노드를 "알 수 없는 컴포넌트 타입"이라 하지 않는다', async () => {
    const io = 준비()
    await run(['lint'], io)

    expect(io.stdout.join('\n')).not.toContain('알 수 없는 컴포넌트 타입')
  })

  it('진짜로 없는 타입은 여전히 말한다 — 반대편', async () => {
    const io = 준비(오류가_있는_프로젝트())
    await run(['lint'], io)

    expect(io.stdout.join('\n')).toContain('알 수 없는 컴포넌트 타입: 없는컴포넌트')
  })
})

describe('종료 코드', () => {
  it('결함이 없으면 0이다', async () => {
    const io = 준비()
    expect(await run(['lint'], io), io.stdout.join('\n')).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('결함 없음')
  })

  /** 근거는 `src/exit.ts`의 `EXIT` 머리말(«무엇이 이 번호를 만드는가»)이다. */
  it('경고만 있으면 0이다', async () => {
    const io = 준비(경고가_있는_프로젝트())
    expect(await run(['lint'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('warning 1')
  })

  it('오류가 있으면 새 번호(10)다 — 1~4가 아니다', async () => {
    const io = 준비(오류가_있는_프로젝트())
    const code = await run(['lint'], io)

    expect(code).toBe(EXIT.findings)
    // *"명령이 서지 못했다"*의 번호와 섞이면 스크립트가 둘을 못 가른다.
    expect([EXIT.usage, EXIT.config, EXIT.server, EXIT.unreachable]).not.toContain(code)
  })

  it('--fail-on warning 이 그 선을 올린다 — 기본값은 그대로다', async () => {
    const io = 준비(경고가_있는_프로젝트())
    expect(await run(['lint', '--fail-on', 'warning'], io)).toBe(EXIT.findings)

    const 기본 = 준비(경고가_있는_프로젝트())
    expect(await run(['lint'], 기본)).toBe(EXIT.ok)
  })

  /** `info` 는 결함이 아니라 알림이다(설계서 「lint 규칙」 — 쓰이지 않는 화면 상태). 어떤 실패 선에도 안 든다. */
  it('정보(info)만 있으면 --fail-on warning 에서도 0이고, 요약이 따로 센다', async () => {
    const io = 준비(상태가_있는_프로젝트())
    expect(await run(['lint', '--fail-on', 'warning'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    const out = io.stdout.join('\n')
    expect(out).toContain('info\t관리자/회원/상태\tview-state-unused\t상태 "비로그인" 을 가리키는 보임이 없습니다')
    expect(out).toContain('결함 없음 (info 1건)')
    expect(out).not.toMatch(/결함 \d+건/)
  })

  it('경고와 정보가 섞이면 «결함 N건» 은 error · warning 합이고 info 는 밖에 따로 선다', async () => {
    const payload = 경고가_있는_프로젝트()
    payload.pages.push(상태가_있는_프로젝트().pages.at(-1)!)
    const io = 준비(payload)
    await run(['lint'], io)
    const out = io.stdout.join('\n')
    expect(out).toContain('결함 1건 (error 0 · warning 1) · info 1건')
    expect(out).not.toContain('결함 2건')
  })

  it('정보가 없으면 요약에 info 칸을 안 단다 — 옛 요약 그대로', async () => {
    const io = 준비(경고가_있는_프로젝트())
    await run(['lint'], io)
    expect(io.stdout.join('\n')).toContain('(error 0 · warning 1)')
  })

  it('모르는 --fail-on 값은 조용히 기본값이 되지 않는다', async () => {
    const io = 준비(오류가_있는_프로젝트())
    expect(await run(['lint', '--fail-on', 'info'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('--fail-on')
  })
})

describe('[경로]는 출력 거르개다 — 입력을 좁히지 않는다', () => {
  /**
   * **입력을 좁히면 프로젝트 단위 규칙이 거짓을 말한다.** 여기서는 그것을 반대로 잰다:
   * 경로를 줘도 **전체 개수**를 함께 말하는가.
   */
  it('전체를 검사하고 무엇을 보일지만 고른다', async () => {
    const io = 준비(경고가_있는_프로젝트())
    await run(['lint', '관리자/회원/경고'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('경로 필터: 관리자/회원/경고')
    expect(said).toContain('전체 1건 중 1건')
  })

  it('그 페이지의 것만 남는다', async () => {
    const 둘 = 경고가_있는_프로젝트()
    둘.pages.push(
      page(
        '20000000-0000-4000-8000-00000000000a',
        MENU_MEMBER,
        '경고둘',
        10,
        {
          version: 5,
          root: { id: 'root', type: 'Page', children: [{ id: 'lonely2', type: 'List' }] },
        },
        null,
      ),
    )

    const io = 준비(둘)
    await run(['lint', '관리자/회원/경고'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('전체 2건 중 1건')
    expect(said).toContain('\t관리자/회원/경고 (lonely)\t')
    expect(said).not.toContain('관리자/회원/경고둘')
  })

  it('없는 경로는 코드 1이다', async () => {
    const io = 준비()
    expect(await run(['lint', '관리자/없다'], io)).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('그 경로의 페이지가 없습니다')
  })
})

/**
 * **종료 코드도 함께 걸러진다 — 판정이다.**
 *
 * **근거: 출력과 종료 코드가 같은 것을 말해야 한다.** *"결함 없음"*을 찍고 10으로 끝나면
 * 스크립트가 듣는 말과 사람이 읽는 말이 갈린다. **경로를 준 사람은 그 범위를 물은 것이다.**
 *
 * **아래 첫 케이스가 이 판정을 못박는 자다** — 그것이 없으면 종료 코드를 걸러진 것이
 * 아니라 전체에서 세게 바꿔도 아무 케이스도 안 죽는다.
 */
describe('경로 필터와 종료 코드 (판정)', () => {
  it('다른 페이지에 error 가 있어도 경로를 주면 0이다', async () => {
    const io = 준비(오류가_있는_프로젝트())

    // 전체로 돌리면 10이다(아래 반대편). 경로를 주면 그 범위의 답을 낸다.
    expect(await run(['lint', '관리자/회원/목록'], io), io.stdout.join('\n')).toBe(EXIT.ok)
  })

  it('경로를 안 주면 같은 프로젝트가 10이다 — 반대편', async () => {
    const io = 준비(오류가_있는_프로젝트())
    expect(await run(['lint'], io)).toBe(EXIT.findings)
  })

  /**
   * **요약 줄이 앞 줄과 부딪히지 않아야 한다.** 앞 줄이 *"전체 2건"*이라고 했는데 뒤 줄이
   * 맨 *"결함 없음"*이면 **사람은 뒤 줄을 읽는다.**
   */
  it('요약 줄이 범위를 단다', async () => {
    const io = 준비(오류가_있는_프로젝트())
    await run(['lint', '관리자/회원/목록'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('결함 없음 — 경로 필터 안에서다 (전체 2건)')
  })

  it('경로 없이 돌면 범위를 안 단다 — 달 것이 없다', async () => {
    const io = 준비()
    await run(['lint'], io)

    expect(io.stdout.join('\n')).toContain('결함 없음')
    expect(io.stdout.join('\n')).not.toContain('경로 필터')
  })

  /**
   * **0으로 끝나면서 프로젝트에 `error`가 남아 있을 수 있다.** 그것을 아무 데서도 말하지
   * 않으면 CI에 이 명령을 건 팀이 *"설계서가 깨져도 초록"*을 본다. **코드는 안 바꾸고
   * 말만 한다** — 무엇을 물었는지는 사람이 정한 것이다.
   */
  it('경로 밖의 error 를 말한다 — 조용히 0으로 끝나지 않는다', async () => {
    const io = 준비(오류가_있는_프로젝트())
    await run(['lint', '관리자/회원/목록'], io)

    expect(io.stderr.join('\n')).toContain('경로 밖에 error 2건이 더 있습니다')
  })

  it('경로 밖이 깨끗하면 아무 말도 안 한다', async () => {
    const io = 준비(경고가_있는_프로젝트())
    await run(['lint', '관리자/회원/목록'], io)

    // 밖에 있는 것이 `warning`뿐이면 종료 코드가 안 바뀌므로 말할 것이 없다.
    expect(io.stderr.join('\n')).not.toContain('경로 밖에')
  })
})

describe('검사에서 빠진 것을 말한다 — 조용히 0건이 되지 않는다', () => {
  it('메뉴를 잃은 페이지를 말한다', async () => {
    const 고아 = snapshotPayload()
    고아.menu = []
    const io = 준비(고아)
    await run(['lint'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('검사에서 빠진 것:')
    expect(said).toContain('스냅샷에 없습니다')
  })

  it('빠진 것이 없으면 그 절을 아예 안 낸다', async () => {
    const io = 준비(snapshotPayload())
    await run(['lint'], io)

    expect(io.stdout.join('\n')).not.toContain('검사에서 빠진 것')
  })
})

describe('.wirebound.json 의 lint 절', () => {
  /** **기본값을 지어내지 않는다** — 안 주면 그 축이 안 돈다. */
  it('설정을 안 주면 명명 규칙이 안 돈다', async () => {
    const io = 준비()
    await run(['lint'], io)

    expect(io.stdout.join('\n')).not.toContain('명명 규칙')
  })

  it('lint.naming.page 를 주면 그 축이 돈다', async () => {
    const io = 준비(snapshotPayload(), { lint: { naming: { page: '^[A-Z]+$' } } })
    const code = await run(['lint'], io)

    const said = io.stdout.join('\n')
    expect(said).toContain('명명 규칙(^[A-Z]+$)에 어긋납니다')
    // ⑦은 `warning`이므로 코드가 뒤집히지 않는다.
    expect(code).toBe(EXIT.ok)
  })

  it('lint.naming.menu 도 같은 절에서 온다', async () => {
    const io = 준비(snapshotPayload(), { lint: { naming: { menu: '^[A-Z]+$' } } })
    await run(['lint'], io)

    expect(io.stdout.join('\n')).toContain('메뉴 이름이 명명 규칙')
  })

  /**
   * **정규식을 CLI가 컴파일하지 않는다.** 여기서 먼저 죽이면 *"규칙 하나가 잘못 적혔다"*가
   * *"명령이 서지 못했다"*가 되어 나머지 규칙의 결과까지 사라진다 — `lintDesign`이 이미
   * 그것을 이슈로 낸다.
   */
  it('정규식이 아니면 이슈로 낸다 — 명령을 죽이지 않는다', async () => {
    const io = 준비(snapshotPayload(), { lint: { naming: { page: '[' } } })
    const code = await run(['lint'], io)

    expect(code).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('명명 규칙이 정규식이 아닙니다')
  })

  it('lint 절의 모양이 어긋나면 코드 2다', async () => {
    const io = 준비(snapshotPayload(), { lint: { naming: { page: 42 } } })
    expect(await run(['lint'], io)).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('lint.naming.page')
  })

  it('lint 가 객체가 아니면 코드 2다', async () => {
    const io = 준비(snapshotPayload(), { lint: '켜기' })
    expect(await run(['lint'], io)).toBe(EXIT.config)
  })
})

describe('서버를 직접 부른다', () => {
  it('pull 이 쓴 파일이 있어도 그것을 읽지 않는다 — 낡을 수 있다', async () => {
    const io = 준비()
    // 낡은 산출물을 심는다. 이것을 읽으면 아래 대조가 죽는다.
    io.fs.set('/repo/wirebound-snapshot.json', JSON.stringify(오류가_있는_프로젝트()))

    expect(await run(['lint'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    expect(io.requests.map((request) => request.url)).toEqual([
      `${SERVER}/api/projects/${PROJECT}/snapshot`,
      `${SERVER}/api/projects/${PROJECT}/theme`,
    ])
  })
})

describe('테마 규칙 — 현재 테마에 없는 variant', () => {
  it('프로젝트가 고정한 테마가 선언하지 않은 variant 를 경고한다 — warning 이라 0 이다', async () => {
    const io = 준비(테마에_없는_variant_프로젝트())
    stub(io, 'GET', `/api/projects/${PROJECT}/theme`, { status: 200, body: projectThemeResponse(LIST_VARIANTS) })
    expect(await run(['lint'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    const line = io.stdout.find((row) => row.includes('theme-variant'))
    expect(line).toBe(
      'warning\t관리자/회원/그리드 (grid-list)\ttheme-variant\tList 의 variant "grid" 는 테마 system-admin@0.1.0 에 없습니다 — table(기본)으로 그려집니다',
    )
  })

  it('테마를 못 받아도(404) 나머지 lint 는 돌고, 빠진 것이 그렇다고 말한다', async () => {
    const io = 준비(오류가_있는_프로젝트())
    stub(io, 'GET', `/api/projects/${PROJECT}/theme`, {
      status: 404,
      body: { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } },
    })
    expect(await run(['lint'], io)).toBe(EXIT.findings)
    const out = io.stdout.join('\n')
    expect(out).toContain('검사에서 빠진 것:')
    expect(out).toContain('프로젝트의 테마를 못 받아 «현재 테마에 없는 variant» 를 검사하지 않았습니다')
    expect(out).toContain('알 수 없는 컴포넌트 타입: 없는컴포넌트')
  })

  it('테마를 아직 고정하지 않았으면 그렇다고 말한다', async () => {
    const io = 준비()
    stub(io, 'GET', `/api/projects/${PROJECT}/theme`, {
      status: 200,
      body: { ...projectThemeResponse(), themeId: null, version: null, manifest: null },
    })
    expect(await run(['lint'], io)).toBe(EXIT.ok)
    expect(io.stdout.join('\n')).toContain('프로젝트가 아직 테마를 고정하지 않았습니다')
  })

  it('서버가 준 manifest 가 규격 밖이면 테마 규칙을 안 돌리고 말한다', async () => {
    const io = 준비(테마에_없는_variant_프로젝트())
    const broken = projectThemeResponse(LIST_VARIANTS)
    stub(io, 'GET', `/api/projects/${PROJECT}/theme`, {
      status: 200,
      body: { ...broken, manifest: { ...(broken.manifest as object), version: '1.0' } },
    })
    await run(['lint'], io)
    const out = io.stdout.join('\n')
    expect(out).toContain('서버가 준 manifest 가 규격과 다릅니다')
    expect(out).not.toContain('theme-variant')
  })
})
