/**
 * `wireb init` — D5·D6.
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
    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '')).toEqual({
      server: 'https://wb.example.com',
      projectId: 'prj_a1b2',
    })
  })

  it('네트워크를 타지 않는다 (D5)', async () => {
    const io = createFakeIo()
    await run(ARGS, io)

    expect(io.requests).toEqual([])
  })

  it('서버 주소 끝의 슬래시를 걷는다', async () => {
    const io = createFakeIo()
    await run(['init', '--server', 'https://wb.example.com/', '--project', 'prj_a1b2'], io)

    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '').server).toBe('https://wb.example.com')
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
    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '').projectId).toBe('old')
  })

  it('--force 면 덮지만 모르는 절은 보존한다 — P9-3의 lint 절이 그 자리다', async () => {
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
    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '')).toEqual({
      server: 'https://wb.example.com',
      projectId: 'prj_a1b2',
      lint: { naming: { page: '^[가-힣]+$' } },
    })
  })

  it('읽을 수 없는 파일도 --force 면 멀쩡한 선언 하나로 갈아 끼운다', async () => {
    const io = createFakeIo({ files: { '/repo/.wirebound.json': '{ 깨진' } })
    const code = await run([...ARGS, '--force'], io)

    expect(code).toBe(EXIT.ok)
    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '')).toEqual({
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
    expect(JSON.parse(io.fs.get('/repo/.wirebound.json') ?? '').projectId).toBe('old')
  })
})
