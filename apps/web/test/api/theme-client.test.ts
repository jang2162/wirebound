/**
 * 테마 메서드의 계약(`api/http-client.ts`). 경로 · 메서드 · 모양은 `http-client.test.ts` 의 두 표가 재고, 여기는 그 표가 못 재는 것 —
 * 업로드의 JSON 아닌 본문, 저장 본문의 키, 409 의 `current`, 422 의 `manifestCode`, 템플릿의 형식 검사 — 을 잰다.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'

interface Call {
  url: string
  init: RequestInit | undefined
}

function stub(response: Response): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init })
    return Promise.resolve(response)
  }
  return { fetchImpl, calls }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const manifest = {
  id: 'system-admin',
  name: '관리자',
  version: '0.1.0',
  sdk: '^1.0.0',
  tokens: { items: { 'color.primary': { type: 'color', label: '주색', default: '#2563eb' } } },
}
const view = {
  themeId: 'system-admin',
  version: '0.1.0',
  tokens: { 'color.primary': '#ff0000' },
  rev: 4,
  manifest,
  latest: '0.2.0',
  latestName: manifest.name,
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e)
  if (!(error instanceof ApiError)) throw new Error(`ApiError 가 아니라 ${String(error)}`)
  return error
}

describe('테마 클라이언트', () => {
  it('업로드는 파일 바이트를 그대로 싣고 application/zip 으로 보낸다 — JSON 으로 굳히지 않는다', async () => {
    const file = new Blob([Uint8Array.from([0x50, 0x4b, 0x03, 0x04])])
    const s = stub(json(201, { themeId: 'acme', version: '1.0.0', name: 'Acme', sha256: 'ab', size: 4 }))
    const result = await createHttpClient(s.fetchImpl).uploadThemePackage(file)
    expect(result).toMatchObject({ themeId: 'acme', version: '1.0.0' })
    expect(s.calls[0]!.init!.body).toBe(file)
    expect((s.calls[0]!.init!.headers as Record<string, string>)['content-type']).toBe('application/zip')
    expect(s.calls[0]!.init!.credentials).toBe('same-origin')
  })

  it('업로드의 422 는 이슈마다 manifestCode 를 싣는다', async () => {
    const s = stub(
      json(422, {
        error: {
          code: 'validation-failed',
          message: '테마 패키지를 올리지 않았습니다',
          issues: [{ code: 'manifest', path: 'manifest.json:version', message: '판이 semver 가 아닙니다', manifestCode: 'bad-version' }],
        },
      }),
    )
    const error = await rejection(createHttpClient(s.fetchImpl).uploadThemePackage(new Blob([])))
    expect(error.code).toBe('validation-failed')
    expect(error.issues).toEqual([
      { code: 'manifest', path: 'manifest.json:version', message: '판이 semver 가 아닙니다', manifestCode: 'bad-version' },
    ])
  })

  it('저장은 선언된 네 키만 싣는다 — GET 응답을 고쳐 되보내도 manifest · latest 가 안 나간다', async () => {
    const s = stub(json(200, view))
    await createHttpClient(s.fetchImpl).putProjectTheme('p1', { ...view, themeId: 'system-admin', version: '0.1.0' })
    expect(JSON.parse(String(s.calls[0]!.init!.body))).toEqual({
      themeId: 'system-admin',
      version: '0.1.0',
      tokens: { 'color.primary': '#ff0000' },
      rev: 4,
    })
  })

  it('저장의 409 는 서버의 지금 값을 ApiError.current 에 싣는다', async () => {
    const current = { ...view, rev: 5, tokens: { 'color.primary': '#00ff00' } }
    const s = stub(json(409, { error: { code: 'conflict', message: '다른 곳에서 테마를 먼저 저장했습니다' }, current }))
    const error = await rejection(
      createHttpClient(s.fetchImpl).putProjectTheme('p1', { themeId: 'system-admin', version: '0.1.0', tokens: {}, rev: 4 }),
    )
    expect(error.code).toBe('conflict')
    expect(error.current).toEqual(current)
  })

  it('current 가 없는 실패는 undefined 다', async () => {
    const s = stub(json(404, { error: { code: 'not-found', message: '없습니다' } }))
    const error = await rejection(createHttpClient(s.fetchImpl).getProjectTheme('p1'))
    expect(error.current).toBeUndefined()
  })

  it('템플릿은 zip 이면 Blob 으로 받고 시간 제한을 안 건다', async () => {
    const s = stub(new Response(Uint8Array.from([0x50, 0x4b]), { status: 200, headers: { 'content-type': 'application/zip' } }))
    const blob = await createHttpClient(s.fetchImpl).downloadThemeTemplate()
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(2)
    expect(s.calls[0]!.init!.signal).toBeUndefined()
  })

  it('템플릿 자리에 zip 이 아닌 것이 오면 거절한다 — 개발 프록시가 빠진 index.html', async () => {
    const s = stub(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    const error = await rejection(createHttpClient(s.fetchImpl).downloadThemeTemplate())
    expect(error.message).toBe('서버 응답을 이해할 수 없습니다')
  })

  it('템플릿의 404 는 서버 문장 그대로다', async () => {
    const s = stub(json(404, { error: { code: 'not-found', message: '템플릿이 빌드되지 않았습니다 — `pnpm build:template`' } }))
    const error = await rejection(createHttpClient(s.fetchImpl).downloadThemeTemplate())
    expect(error.message).toBe('템플릿이 빌드되지 않았습니다 — `pnpm build:template`')
  })

  it('로그인 응답의 isInstanceAdmin 을 그대로 넘긴다', async () => {
    const s = stub(json(200, { id: 'u1', email: 'a@b.c', name: '가', isInstanceAdmin: true }))
    expect((await createHttpClient(s.fetchImpl).login('a@b.c', 'pw')).isInstanceAdmin).toBe(true)
  })
})
