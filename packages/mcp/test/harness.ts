/**
 * **케이스가 프로젝트를 세우는 자리 하나.** 가짜 `io`와 스냅샷 픽스처는
 * `@wirebound/cli/test-support`에서 온다 — 두 벌을 만들면 *"어느 하네스에서 잰 값인가"*가
 * 매번 물음이 된다.
 *
 * **`wireb`의 케이스와 같은 픽스처를 본다.** 그것이 *"CLI와 MCP가 같은 함수를 부른다"*를
 * 케이스 층에서도 참으로 만든다 — 같은 입력에 두 도구가 다른 값을 내면 그 자리에서 드러난다.
 */
import { createFakeIo, snapshotPayload, stub, type FakeIo } from '@wirebound/cli/test-support'
import type { SnapshotPayload } from '@wirebound/cli/embed'
import { callTool } from '../src/server'

export const SERVER = 'https://wb.example.com'
export const PROJECT = '90000000-0000-4000-8000-000000000001'
export const TOKEN = 'wb_test_token'

export interface HarnessOptions {
  /** `.wirebound.json`을 심을지. `false`면 *"바인딩이 없다"*를 재는 상태다. */
  binding?: boolean | Record<string, unknown>
  /** 자격을 심을지. `false`면 *"자격이 없다"*를 재는 상태다. */
  token?: boolean
  /** 스냅샷 응답. 안 주면 픽스처 그대로. */
  payload?: SnapshotPayload
  /** 스냅샷 라우트를 아예 안 걸거나 오류를 내게 한다. */
  snapshot?: 'ok' | 'refused' | 'unreachable' | 'none'
  cwd?: string
}

export function harness(options: HarnessOptions = {}): FakeIo {
  const cwd = options.cwd ?? '/repo/apps/web'
  const files: Record<string, string> = {}

  if (options.binding !== false) {
    const raw =
      typeof options.binding === 'object'
        ? options.binding
        : { server: SERVER, projectId: PROJECT }
    files['/repo/.wirebound.json'] = `${JSON.stringify(raw, null, 2)}\n`
  }
  if (options.token !== false) {
    files['/home/tester/.wirebound/credentials.json'] = `${JSON.stringify({
      version: 1,
      credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
    })}\n`
  }

  const io = createFakeIo({ cwd, files })

  const mode = options.snapshot ?? 'ok'
  const path = `/api/projects/${PROJECT}/snapshot`
  if (mode === 'ok') {
    stub(io, 'GET', path, { status: 200, body: options.payload ?? snapshotPayload() })
  } else if (mode === 'refused') {
    stub(io, 'GET', path, {
      status: 403,
      body: { error: { code: 'forbidden', message: '이 프로젝트에 대한 권한이 없습니다' } },
    })
  } else if (mode === 'unreachable') {
    stub(io, 'GET', path, () => new Error('connect ECONNREFUSED 127.0.0.1:443'))
  }
  return io
}

/** 도구를 부르고 JSON을 되읽는다. **`isError`가 서 있으면 던진다** — 케이스가 갈래를 섞지 않게. */
export async function callJson(io: FakeIo, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const outcome = await callTool(io, name, args)
  if (outcome.isError) throw new Error(`도구가 실패로 답했다: ${outcome.text}`)
  return JSON.parse(outcome.text)
}
