/**
 * **새 `wireb` 가 옛 서버의 덤프를 읽는다** — 판 2 · 3 · 4 payload(`layouts` 키를 든 것).
 *
 * 앞 판까지 payload 규격은 키를 더하기만 해(`theme` · `codes` 는 선택) 새 CLI 가 옛 서버의 덤프를 그대로 읽었다. 판 5 가 `layouts` 를
 * 걷으면서 그 방향이 처음 끊길 자리라, 판 4 이하의 `layouts` 는 받고 걷는다(`@wirebound/themes` 의 `snapshot/payload.ts`
 * 「레이아웃 표를 담지 않는다 — 판 5」). 판 5 의 `layouts` 는 여전히 모르는 키다 — 마지막 케이스가 그 반대편이다.
 *
 * 공용 픽스처(`snapshot-fixture.ts`)는 판 3 이라 적고 `layouts` 가 없다 — 옛 서버가 실제로 낸 꼴이 아니라 여기서 따로 짓는다.
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { projectThemeResponse, snapshotPayload } from './snapshot-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'

/** 옛 서버의 레이아웃 문서 하나(`Page > Slot` — 판 6). */
const OLD_LAYOUTS = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    name: '기본 레이아웃',
    schema: { version: 6, root: { id: 'l_root', type: 'Page', children: [{ id: 'l_slot', type: 'Slot' }] } },
  },
]

/** 옛 서버가 낸 꼴 — 판 2 에는 `theme` · `codes` 가 없고, 판 3 에는 `codes` 가 없다. 셋 다 `layouts` 를 든다. */
function oldDump(payloadVersion: 2 | 3 | 4 | 5): Record<string, unknown> {
  const { theme, codes: _codes, ...base } = snapshotPayload() as unknown as Record<string, unknown>
  return {
    ...base,
    payloadVersion,
    layouts: OLD_LAYOUTS,
    ...(payloadVersion >= 3 ? { theme } : {}),
    ...(payloadVersion >= 4 ? { codes: [] } : {}),
  }
}

function 준비(body: unknown): FakeIo {
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
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body })
  stub(io, 'GET', `/api/projects/${PROJECT}/theme`, { status: 200, body: projectThemeResponse() })
  return io
}

describe('옛 서버의 덤프(판 2 · 3 · 4 — layouts 키)', () => {
  for (const version of [2, 3, 4] as const) {
    it(`판 ${version}: wireb lint 가 선다`, async () => {
      const io = 준비(oldDump(version))
      const code = await run(['lint'], io)
      expect([code, io.stderr.join('\n')]).toEqual([EXIT.ok, ''])
      expect(io.stdout.join('\n')).toContain('결함 없음')
    })

    it(`판 ${version}: wireb page get 이 선다`, async () => {
      const io = 준비(oldDump(version))
      const code = await run(['page', 'get', '관리자/회원/목록', '--json'], io)
      expect([code, io.stderr.join('\n')]).toEqual([EXIT.ok, ''])
      expect(io.stdout.join('\n')).not.toContain('l_slot')
    })
  }

  it('판 5 의 layouts 는 여전히 모르는 키다 — 규격과 다르다(코드 3)', async () => {
    const io = 준비(oldDump(5))
    const code = await run(['lint'], io)
    expect(code).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('프로젝트 덤프 응답이 규격과 다릅니다')
  })
})
