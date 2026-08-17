/**
 * **D6의 인구조사: 토큰 원문이 리포 안 어디에도 없다.**
 *
 * 계획서가 *"하나짜리로 재지 마라"*고 못박은 자리다. `.wirebound.json`만 보는 케이스는
 * **캐시 파일이 하나 늘어나는 날 조용히 통과한다** — 그래서 이 파일은 명령 셋을 전부
 * 돌린 뒤 **가짜 파일 시스템에서 리포 아래에 있는 것 전부**를 훑는다. 분모를 손으로
 * 적지 않으므로 새 파일이 생기면 여기가 먼저 말한다.
 *
 * `.wirebound.json`은 **커밋되는 파일이다**(§12.1 — *"개발 리포 루트에 둔다"*가 리포
 * 바인딩을 선언하는 것이 존재 이유다). 계획서 재라 #7이 그 추론을 다시 재라고 했다:
 * 아래 *"바인딩 파일은 커밋될 수 있는 내용만 담는다"*가 그 판정을 값으로 만든다 —
 * 담기는 키가 `server`·`projectId` 둘뿐이고 어느 쪽도 비밀이 아니다.
 */
import { describe, expect, it } from 'vitest'
import { COMMANDS, run } from '../src/run'
import { EXIT } from '../src/exit'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { bundleZip } from './bundle-fixture'
import { snapshotPayload } from './snapshot-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
/** 원문. **한 글자짜리로 재지 않는다** — 흔한 글자를 쓰면 어디서나 우연히 맞는다. */
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'
const REPO = '/repo'

function fullRun(): FakeIo {
  const io = createFakeIo({ cwd: REPO, env: { WIREB_PASSWORD: 'password1234' } })
  stub(io, 'POST', '/api/auth/login', {
    status: 200,
    body: { id: 'u1' },
    setCookie: ['wb_session=SESSIONVALUE; Path=/; HttpOnly'],
  })
  stub(io, 'POST', `/api/projects/${PROJECT}/tokens`, { status: 201, body: { value: TOKEN } })
  stub(io, 'POST', '/api/auth/logout', { status: 204 })
  // **빈 프로젝트로 재지 않는다.** `page get`은 페이지가 없으면 코드 1로 끝나고, 그러면
  // `runAllCommands`의 대조가 죽거나(그쪽이 먼저 말한다) 아무것도 안 훑는 census가 된다.
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: snapshotPayload() })
  stub(io, 'GET', `/api/projects/${PROJECT}/export?format=html`, { status: 200, bytes: bundleZip() })
  return io
}

/** 리포 아래에 있는 파일 전부. **목록을 손으로 적지 않는다.** */
function repoFiles(io: FakeIo): [string, string][] {
  return io.textEntries().filter(([path]) => path.startsWith(`${REPO}/`))
}

/**
 * 명령마다 그것을 실제로 돌릴 argv. **여기 적힌 순서대로 돈다** — `login`은 `init`이
 * 쓴 바인딩을 읽고 `pull`은 `login`이 쓴 자격을 읽는다.
 *
 * **분모는 이 표가 아니라 `COMMANDS`다.** 아래 *"표가 명령을 하나도 빠뜨리지 않는다"*가
 * 둘을 맞대므로, 명령을 더하고 여기 안 적으면 **그 케이스가 먼저 죽는다.**
 */
const ARGV: Record<string, string[]> = {
  init: ['init', '--server', SERVER, '--project', PROJECT],
  login: ['login', '--email', 'a@example.com'],
  pull: ['pull'],
  // **P9-3이 더한 셋.** 명령마다 *"리포에 무엇을 쓰는가"*를 보고 판정했다.
  //
  // | 명령 | 리포에 쓰는 것 |
  // |---|---|
  // | `page get` · `lint` | **없다.** 읽기만 한다 |
  // | `export` | **번들 전부.** `-o`가 리포 안을 가리키면 파일 여럿이 생긴다 |
  //
  // 마지막 줄이 이 census가 P9-3에서 값을 내는 자리다 — 그 파일들이 훑기의 분모에
  // 들어가고, 번들에 자격이 섞이면 여기가 말한다. `-o`를 리포 안으로 겨누는 것이
  // 요점이다: 바깥으로 겨누면 census가 **아무것도 안 훑는다.**
  'page get': ['page', 'get', '관리자/회원/목록'],
  lint: ['lint'],
  export: ['export', '--format', 'html', '-o', 'design-bundle'],
}

/**
 * 표의 명령을 **전부** 돌린다. 각각이 0으로 끝나는 것까지 본다 — 실패한 명령은 파일을
 * 안 남기므로, 성공을 확인하지 않으면 그 뒤의 훑기가 **아무것도 안 훑고** 통과한다.
 */
async function runAllCommands(io: FakeIo): Promise<void> {
  for (const [name, argv] of Object.entries(ARGV)) {
    expect(await run(argv, io), `${name}: ${io.stderr.join('\n')}`).toBe(EXIT.ok)
  }
}

describe('토큰은 리포에 남지 않는다 (D6)', () => {
  /**
   * **N5가 닫히는 자리.** 앞 판은 파일 목록은 스스로 만들면서 **어떤 명령을 돌릴지는 손으로
   * 적었다.** 리뷰가 실증했다(N5 — 리뷰어 실측): 이미 있는 명령이 리포에 캐시 파일을 쓰면
   * **1건이 죽지만**, **새 명령**(`wireb sync`)이 리포에 토큰을 쓰면 **71건 중 0건**이 죽었다.
   *
   * **P9-3이 명령 셋을 더한다**(`page get`·`lint`·`export` — §12.3). 그중 하나라도 리포에
   * 쓰면 앞 판의 census는 조용히 지나갔을 것이다.
   *
   * **실제로 먼저 죽었다**(P9-3 T4 실측): `page get`을 `COMMANDS`에 더하고 아래 표에 안
   * 적은 채 `pnpm vitest run packages/cli`를 돌리니 **84건 중 이 한 건**이 죽었다.
   * `test/args.test.ts`의 쓰임말 대조는 죽지 않았다 — 그쪽은 분모도 값도 `COMMANDS`에서
   * 만들어 명세에 `summary`가 있으면 스스로 맞는다.
   */
  it('표가 명령을 하나도 빠뜨리지 않는다 — 분모는 COMMANDS다', () => {
    expect(Object.keys(ARGV).sort()).toEqual(COMMANDS.map((command) => command.words.join(' ')).sort())
    // 분모가 0이면 위 줄이 공허하다.
    expect(COMMANDS.length).toBeGreaterThan(2)
  })

  it('명령을 전부 돌린 뒤 리포 안 어느 파일에도 원문이 없다', async () => {
    const io = fullRun()
    await runAllCommands(io)

    // 분모가 0이면 아래가 공허하게 통과한다. 명령들이 실제로 파일을 남겼는가.
    const files = repoFiles(io)
    expect(files.map(([path]) => path).sort()).toEqual([
      '/repo/.wirebound.json',
      '/repo/design-bundle/assets/theme.css',
      '/repo/design-bundle/index.html',
      '/repo/design-bundle/pages/관리자-회원-목록.html',
      '/repo/wirebound-snapshot.json',
    ])

    const leaked = files.filter(([, content]) => content.includes(TOKEN)).map(([path]) => path)
    expect(leaked).toEqual([])
  })

  it('자격은 홈 아래에 있다 — 그쪽에는 있어야 한다', async () => {
    const io = fullRun()
    await runAllCommands(io)

    // **이 대조가 없으면 위 케이스가 *"토큰을 아예 안 만들었다"*와 구분되지 않는다.**
    const stored = io.textEntries().filter(([, content]) => content.includes(TOKEN))
    expect(stored.map(([path]) => path)).toEqual(['/home/tester/.wirebound/credentials.json'])
  })

  it('바인딩 파일은 커밋될 수 있는 내용만 담는다 (재라 #7)', async () => {
    const io = fullRun()
    await runAllCommands(io)

    const binding = JSON.parse(io.text('/repo/.wirebound.json') ?? '')
    // 키를 통째로 단언한다 — 하나 늘면 사람이 *"이것이 커밋돼도 되나"*를 다시 판정한다.
    expect(Object.keys(binding)).toEqual(['server', 'projectId'])
  })

  it('세션 쿠키도 리포에 남지 않는다 — 토큰만 보면 놓친다', async () => {
    const io = fullRun()
    await runAllCommands(io)

    const leaked = repoFiles(io).filter(([, content]) => content.includes('SESSIONVALUE'))
    expect(leaked.map(([path]) => path)).toEqual([])
  })

  it('비밀번호도 어디에도 안 쓴다 — 홈 아래도 포함이다', async () => {
    const io = fullRun()
    await runAllCommands(io)

    const leaked = io.textEntries().filter(([, content]) => content.includes('password1234'))
    expect(leaked.map(([path]) => path)).toEqual([])
  })

  it('심으면 잡는다 — 구분력', () => {
    const io = createFakeIo()
    io.fs.set('/repo/cache.json', `{"token":"${TOKEN}"}`)
    const leaked = repoFiles(io).filter(([, content]) => content.includes(TOKEN))
    expect(leaked.map(([path]) => path)).toEqual(['/repo/cache.json'])
  })
})
