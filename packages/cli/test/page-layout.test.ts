/**
 * `wireb page get` 의 레이아웃 — 사람이 읽는 줄은 이름 뒤에 레이아웃을 말하고(빈 레이아웃은 옛 줄 그대로), `--json` 은 `layout` 을 싣는다.
 * 판 7 문서는 `layout` 에서, 판 6 이하 문서는 뿌리에서 읽는다(`pageLayoutOf`). 팝업 줄 자체는 `page-get.test.ts` «팝업 페이지 — 종류» 가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { PAGE_DETAIL, PAGE_LIST, snapshotPayload } from './snapshot-fixture'
import type { SnapshotPayload } from '@wirebound/themes'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'

/** `목록` 을 판 7 서브페이지 문서로, `상세` 를 판 5 팝업 문서로 바꾼 판. `랜딩` 은 판 5 화면 문서 그대로(→ `blank`). */
function 레이아웃이_섞인_프로젝트(): SnapshotPayload {
  const payload = snapshotPayload()
  return {
    ...payload,
    pages: payload.pages.map((item) => {
      if (item.id === PAGE_LIST) {
        return {
          ...item,
          schemaVersion: 7,
          schema: { version: 7, layout: 'subpage', root: { id: 'root', type: 'Page', children: [] } } as never,
        }
      }
      if (item.id === PAGE_DETAIL) {
        return { ...item, schemaVersion: 5, schema: { version: 5, root: { id: 'pop', type: 'Popup', props: { title: '상세' } } } as never }
      }
      return item
    }),
  }
}

function 준비(): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq' }],
      }),
    },
  })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: 레이아웃이_섞인_프로젝트() })
  return io
}

describe('page get — 레이아웃', () => {
  it('사람이 읽는 줄은 서브페이지 · 팝업을 이름 뒤에 말하고 빈 레이아웃에는 아무것도 안 붙인다', async () => {
    const lines: Record<string, string | undefined> = {}
    for (const path of ['관리자/회원/목록', '관리자/회원/상세', '마케팅/랜딩']) {
      const io = 준비()
      expect(await run(['page', 'get', path], io), io.stderr.join('\n')).toBe(EXIT.ok)
      lines[path] = io.stdout[1]
    }
    expect(lines['관리자/회원/목록']).toBe(`  목록 · 서브페이지 · ${PAGE_LIST} · 노드 1개`)
    expect(lines['관리자/회원/상세']).toBe(`  상세 · 팝업 · ${PAGE_DETAIL} · 노드 1개`)
    expect(lines['마케팅/랜딩']).toMatch(/^ {2}랜딩 · [0-9a-f-]+ · 노드 \d+개$/)
  })

  it('--json 은 layout 을 싣는다 — 판 7 은 문서에서 · 판 5 는 뿌리에서', async () => {
    const said: Record<string, unknown> = {}
    for (const path of ['관리자/회원/목록', '관리자/회원/상세', '마케팅/랜딩']) {
      const io = 준비()
      expect(await run(['page', 'get', path, '--json'], io), io.stderr.join('\n')).toBe(EXIT.ok)
      const view = JSON.parse(io.stdout.join('\n')) as { layout: string; kind: string }
      said[path] = [view.layout, view.kind]
    }
    expect(said).toEqual({
      '관리자/회원/목록': ['subpage', 'page'],
      '관리자/회원/상세': ['popup', 'popup'],
      '마케팅/랜딩': ['blank', 'page'],
    })
  })
})
