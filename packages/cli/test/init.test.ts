/**
 * `wireb init`.
 *
 * **네트워크를 안 탄다**는 것을 *"요청이 0건이다"*로 잰다. 가짜 `io`가 요청을 전부
 * 기록하므로 그 수가 곧 그 명제다.
 */
import { describe, expect, it } from 'vitest'
import { run } from '../src/run'
import { EXIT } from '../src/exit'
import { createFakeIo } from './fake-io'

const ARGS = ['init', '--server', 'https://wb.example.com', '--project', 'prj_a1b2']

describe('wireb init', () => {
  it('.wirebound.json을 지금 디렉터리에 쓴다', async () => {
    const io = createFakeIo({ cwd: '/repo' })
    const code = await run(ARGS, io)

    expect(code).toBe(EXIT.ok)
    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '')).toEqual({
      server: 'https://wb.example.com',
      projectId: 'prj_a1b2',
    })
  })

  it('네트워크를 타지 않는다', async () => {
    const io = createFakeIo()
    await run(ARGS, io)

    expect(io.requests).toEqual([])
  })

  it('서버 주소 끝의 슬래시를 걷는다', async () => {
    const io = createFakeIo()
    await run(['init', '--server', 'https://wb.example.com/', '--project', 'prj_a1b2'], io)

    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '').server).toBe('https://wb.example.com')
  })

  /**
   * **쓸 수 없는 서버 주소는 쓰기 전에 끊는다.** 안 끊으면 `server`가 스킴이 없거나 오타일 때
   * `fetch`가 던져 **코드 4**(*"서버에 연결할 수 없습니다"*)가 나간다 — 원인은 사용자의
   * 설정 한 줄인데. `client.ts`의 `assertSendableHeaders`와 같은 부류이고, 판정과 실측표는
   * `binding.ts`의 `normalizeServer` 머리말에 있다.
   *
   * **`htp://`·`ftp://`는 `new URL()`을 통과한다** — 그래서 스킴까지 본다.
   * **`https://`는 호스트가 비어** `fetch`가 경로 첫 마디를 호스트로 읽는다.
   */
  it('쓸 수 없는 서버 주소는 2이고 바인딩을 아예 안 쓴다', async () => {
    // **빈 문자열은 여기 없다** — 그것은 *"값을 안 줬다"*라 `runInit`이 먼저 1(사용법)로
    // 끊는다. 아래 *"--server 나 --project 가 없으면"*이 그 갈래를 든다.
    for (const server of ['wb.example.com', 'htp://wb.example.com', 'ftp://wb.example.com', 'https://']) {
      const io = createFakeIo()
      const code = await run(['init', '--server', server, '--project', 'prj_a1b2'], io)

      expect(code, server).toBe(EXIT.config)
      expect(io.stderr.join('\n'), server).toContain('http:// 또는 https://')
      // **파일이 안 써진다** — 검사를 보내는 자리에 두면 여기는 이미 써진 뒤다.
      expect(io.fs.has('/repo/.wirebound.json'), server).toBe(false)
    }
  })

  it('쓸 수 있는 주소는 그대로 지난다 — 반대편', async () => {
    for (const server of ['http://127.0.0.1:3055', 'https://wb.example.com', '  https://wb.example.com/  ']) {
      const io = createFakeIo()
      const code = await run(['init', '--server', server, '--project', 'prj_a1b2'], io)

      expect(code, server).toBe(EXIT.ok)
    }
  })

  it('낡은 바인딩의 server가 못 쓰는 값이어도 2다 — 읽는 쪽도 같은 자를 쓴다', async () => {
    const io = createFakeIo({
      files: { '/repo/.wirebound.json': JSON.stringify({ server: 'wb.example.com', projectId: 'p' }) },
    })
    const code = await run(['pull'], io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('http:// 또는 https://')
    expect(io.requests).toEqual([])
  })

  it('--server 나 --project 가 없으면 1이고 무엇이 없는지 말한다', async () => {
    for (const [args, missing] of [
      [['init', '--project', 'prj'], '--server'],
      [['init', '--server', 'https://x'], '--project'],
    ] as const) {
      const io = createFakeIo()
      const code = await run([...args], io)

      expect(code, missing).toBe(EXIT.usage)
      expect(io.stderr.join('\n'), missing).toContain(missing)
    }
  })

  it('이미 있으면 덮지 않고 2로 끝난다 — 커밋되는 파일이다', async () => {
    const io = createFakeIo({ files: { '/repo/.wirebound.json': '{"server":"https://old","projectId":"old"}' } })
    const code = await run(ARGS, io)

    expect(code).toBe(EXIT.config)
    expect(io.stderr.join('\n')).toContain('--force')
    // **원본이 그대로다.** 이 줄이 없으면 *"거절했다고 말하면서 덮은"* 판이 통과한다.
    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '').projectId).toBe('old')
  })

  it('--force 면 덮지만 모르는 절은 보존한다 — `lint` 절이 그 자리다', async () => {
    const io = createFakeIo({
      files: {
        '/repo/.wirebound.json': JSON.stringify({
          server: 'https://old',
          projectId: 'old',
          lint: { naming: { page: '^[가-힣]+$' } },
        }),
      },
    })
    const code = await run([...ARGS, '--force'], io)

    expect(code).toBe(EXIT.ok)
    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '')).toEqual({
      server: 'https://wb.example.com',
      projectId: 'prj_a1b2',
      lint: { naming: { page: '^[가-힣]+$' } },
    })
  })

  it('읽을 수 없는 파일도 --force 면 멀쩡한 선언 하나로 갈아 끼운다', async () => {
    const io = createFakeIo({ files: { '/repo/.wirebound.json': '{ 깨진' } })
    const code = await run([...ARGS, '--force'], io)

    expect(code).toBe(EXIT.ok)
    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '')).toEqual({
      server: 'https://wb.example.com',
      projectId: 'prj_a1b2',
    })
  })

  it('위에 있는 .wirebound.json을 고치지 않는다 — 여기를 뿌리로 선언하는 명령이다', async () => {
    const io = createFakeIo({
      cwd: '/repo/apps/web',
      files: { '/repo/.wirebound.json': JSON.stringify({ server: 'https://old', projectId: 'old' }) },
    })
    const code = await run(ARGS, io)

    expect(code).toBe(EXIT.ok)
    expect(io.fs.has('/repo/apps/web/.wirebound.json')).toBe(true)
    expect(JSON.parse(io.text('/repo/.wirebound.json') ?? '').projectId).toBe('old')
  })
})
