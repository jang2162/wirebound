/**
 * **케이스가 프로젝트를 세우는 자리 하나.** 가짜 `io`와 스냅샷 픽스처는
 * `@wirebound/cli/test-support`에서 온다 — 두 벌을 만들면 *"어느 하네스에서 잰 값인가"*가
 * 매번 물음이 된다.
 *
 * **`wireb`의 케이스와 같은 픽스처를 본다.** 그것이 *"CLI와 MCP가 같은 함수를 부른다"*를
 * 케이스 층에서도 참으로 만든다 — 같은 입력에 두 도구가 다른 값을 내면 그 자리에서 드러난다.
 */
import { PAGE_LIST, createFakeIo, projectThemeResponse, snapshotPayload, stub, type FakeIo } from '@wirebound/cli/test-support'
import type { SnapshotPayload } from '@wirebound/cli/embed'
import { callTool } from '../src/server'

export const SERVER = 'https://wb.example.com'
export const PROJECT = '90000000-0000-4000-8000-000000000001'
export const TOKEN = 'wb_test_token'

/** 픽스처에서 쓰기가 닿는 페이지(`관리자/회원/목록`). */
export const WRITE_PAGE = PAGE_LIST

/**
 * 쓰기 라우트가 어떻게 답할지.
 *
 * **문장은 `apps/api`의 것을 옮긴다** — 진짜 서버가 쓰는 글자다. 서버 문장이 바뀌면 여기도
 * 함께 고친다. 가짜가 자기 문장을 지어내면 도구가 *"서버 문장을 그대로 옮긴다"*를
 * 지키는지 잴 수 없다.
 */
export type WriteMode = 'ok' | 'stale' | 'locked' | 'invalid' | 'forbidden' | 'no-node' | 'none'

export interface HarnessOptions {
  /** `.wirebound.json`을 심을지. `false`면 *"바인딩이 없다"*를 재는 상태다. */
  binding?: boolean | Record<string, unknown>
  /** 자격을 심을지. `false`면 *"자격이 없다"*를 재는 상태다. */
  token?: boolean
  /** 스냅샷 응답. 안 주면 픽스처 그대로. */
  payload?: SnapshotPayload
  /** 스냅샷 라우트를 아예 안 걸거나 오류를 내게 한다. */
  snapshot?: 'ok' | 'refused' | 'unreachable' | 'none'
  /** `GET .../theme` 의 본문. 안 주면 `components` 없는 manifest(테마 규칙이 아무것도 안 낸다). */
  theme?: Record<string, unknown>
  /** `PATCH .../ops`가 어떻게 답할지. */
  patch?: WriteMode
  /** `POST .../comments`가 어떻게 답할지. */
  comment?: WriteMode | 'existing-marker'
  /**
   * 두 번째 스냅샷 응답. **409 뒤의 재조회가 무엇을 보는지 재는 자리다** — 그
   * 요청만 다른 payload를 받아야 *"다시 읽었다"*와 *"처음 것을 재사용했다"*가 갈린다.
   */
  rereadPayload?: SnapshotPayload
  cwd?: string
}

/** 서버가 내는 오류 봉투 하나. */
function apiError(status: number, code: string, message: string): { status: number; body: unknown } {
  return { status, body: { error: { code, message } } }
}

export function harness(options: HarnessOptions = {}): FakeIo {
  const cwd = options.cwd ?? '/repo/apps/web'
  const files: Record<string, string> = {}

  if (options.binding !== false) {
    const raw = typeof options.binding === 'object' ? options.binding : { server: SERVER, projectId: PROJECT }
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
    // **두 번째부터 다른 payload를 낼 수 있다** — 409 뒤의 재조회를 재는 자리다.
    let seen = 0
    stub(io, 'GET', path, () => {
      seen += 1
      const body = seen > 1 ? (options.rereadPayload ?? options.payload ?? snapshotPayload()) : (options.payload ?? snapshotPayload())
      return { status: 200, body }
    })
  } else if (mode === 'refused') {
    stub(io, 'GET', path, apiError(403, 'forbidden', '이 프로젝트에 대한 권한이 없습니다'))
  } else if (mode === 'unreachable') {
    stub(io, 'GET', path, () => new Error('connect ECONNREFUSED 127.0.0.1:443'))
  }

  // `validate` 가 테마 규칙을 돌리려 프로젝트의 manifest 를 받는다(`fetchLintTheme`).
  stub(io, 'GET', `/api/projects/${PROJECT}/theme`, { status: 200, body: options.theme ?? projectThemeResponse() })

  stubWrite(io, 'PATCH', `/api/projects/${PROJECT}/pages/${WRITE_PAGE}/ops`, options.patch ?? 'ok', {
    status: 200,
    body: { seq: 1, revisionId: 'rev_0001', inverse: [], schemaVersion: 4 },
  })
  stubWrite(io, 'POST', `/api/projects/${PROJECT}/pages/${WRITE_PAGE}/comments`, options.comment ?? 'ok', {
    status: 201,
    body:
      options.comment === 'existing-marker'
        ? { comment: 코멘트행(), marker: 2, seq: 0, markerOps: [] }
        : {
            comment: 코멘트행(),
            marker: 3,
            seq: 1,
            markerOps: [{ op: 'add', path: '/root/children/0/marker', value: 3 }],
          },
  })
  return io
}

function 코멘트행(): unknown {
  return {
    id: '50000000-0000-4000-8000-0000000000aa',
    nodeId: 'list',
    body: '정렬 기준이 없습니다',
    authorId: '60000000-0000-4000-8000-000000000001',
    authorName: '장병현',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  }
}

/**
 * 쓰기 라우트 하나를 건다. **실패 문장은 `apps/api`가 실제로 내는 것을 옮긴다.**
 */
function stubWrite(
  io: FakeIo,
  method: string,
  path: string,
  mode: WriteMode | 'existing-marker',
  ok: { status: number; body: unknown },
): void {
  switch (mode) {
    case 'none':
      return
    case 'stale':
      stub(io, method, path, apiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 0, 현재 2)'))
      return
    case 'locked':
      stub(io, method, path, apiError(423, 'locked', '장병현님이 편집 중인 영역입니다'))
      return
    case 'invalid':
      stub(io, method, path, apiError(422, 'validation-failed', '스키마 검증에 실패했습니다'))
      return
    case 'forbidden':
      stub(io, method, path, apiError(403, 'forbidden', '권한이 없습니다'))
      return
    case 'no-node':
      stub(io, method, path, apiError(404, 'not-found', '그 노드가 이 페이지에 없습니다'))
      return
    default:
      stub(io, method, path, ok)
  }
}

/** 도구를 부르고 JSON을 되읽는다. **`isError`가 서 있으면 던진다** — 케이스가 갈래를 섞지 않게. */
export async function callJson(io: FakeIo, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const outcome = await callTool(io, name, args)
  if (outcome.isError) throw new Error(`도구가 실패로 답했다: ${outcome.text}`)
  return JSON.parse(outcome.text)
}
