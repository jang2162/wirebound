// @vitest-environment jsdom
/**
 * **번들 · PPTX 의 코멘트 토큰**(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` «이동»). 번들은 코멘트 칸의 본문에서 잰다
 * (`.wb-export-entry-body` — 페이지 데이터 JSON 은 원문을 싣기에 몸 전체로 재면 원문 글자로 맞는다). 산 토큰은 `<a href>`(페이지 장 · 번호 닻 ·
 * «공통코드» 장 닻)이고 끊김은 링크가 없다. PPTX 는 풀린 글만 싣는다.
 */
import { formatCommentToken, installCatalog, type CodeTable, type PageDocument } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { codeAnchor, markerAnchor } from '../src/bundle/comments'
import { bundleHref } from '../src/bundle/filename'
import { exportBundle, type BundlePage } from '../src/bundle/index'
import { exportPptx } from '../src/pptx/index'

beforeAll(() => {
  installCatalog()
})

const LIST = '11111111-1111-4111-8111-111111111111'
const DETAIL = '22222222-2222-4222-8222-222222222222'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

const listDoc: PageDocument = { version: 5, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_a', type: 'Text', marker: 1 }] } }
const detailDoc: PageDocument = { version: 5, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_f', type: 'Text', marker: 2 }] } }
const CODES: CodeTable = [{ key: 'STATUS', name: '회원 상태', items: [{ value: 'A B/C', name: '활성', active: true }] }]

const t = formatCommentToken
const BODY = [
  `페이지 ${t('옛', { kind: 'page', pageId: DETAIL })}`,
  `번호 ${t('옛', { kind: 'comment', pageId: DETAIL, nodeId: 'n_f' })}`,
  `같은 번호 ${t('옛', { kind: 'comment', pageId: LIST, nodeId: 'n_a' })}`,
  `코드 ${t('옛', { kind: 'code', group: 'STATUS', item: 'A B/C' })}`,
  `남의 것 ${t('남의 페이지', { kind: 'page', pageId: FOREIGN })}`,
].join(' / ')

const pages = (): BundlePage[] => [
  { id: LIST, title: '회원 목록', menuPath: ['회원'], document: listDoc, comments: [{ nodeId: 'n_a', body: BODY }] },
  { id: DETAIL, title: '회원 상세', menuPath: ['회원'], document: detailDoc, comments: [{ nodeId: 'n_f', body: '상세 말' }] },
]

function bundleFile(path: string, codes: CodeTable | null = CODES): Document {
  const bundle = exportBundle({ pages: pages(), runtimeJs: '', ...(codes === null ? {} : { codes }) })
  const file = bundle.files.find((item) => item.path === path)
  if (file === undefined) throw new Error(`번들에 없다: ${path} — ${bundle.files.map((f) => f.path).join(', ')}`)
  return new DOMParser().parseFromString(String(file.content), 'text/html')
}

/** 첫 페이지 장의 경로(`pages/…html`). */
function listPath(): string {
  return exportBundle({ pages: pages(), runtimeJs: '' }).pagePaths[0]!
}

describe('번들의 코멘트 토큰', () => {
  it('산 토큰은 링크 · 날 id 없는 풀린 글이다', () => {
    const doc = bundleFile(listPath())
    const body = doc.querySelector('[data-wb-marker-for="n_a"] .wb-export-entry-body')!
    expect(body.textContent).toBe('페이지 회원 상세 / 번호 회원 상세 #2 / 같은 번호 #1 / 코드 활성 / 남의 것 남의 페이지 찾을 수 없음')
    const links = [...body.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])
    const [at, detail] = exportBundle({ pages: pages(), runtimeJs: '' }).pagePaths as [string, string]
    expect(links).toEqual([
      ['회원 상세', bundleHref(at, detail)],
      ['회원 상세 #2', `${bundleHref(at, detail)}#${markerAnchor('n_f')}`],
      ['#1', `${bundleHref(at, at)}#${markerAnchor('n_a')}`],
      ['활성', `../codes.html#${codeAnchor('STATUS', 'A B/C')}`],
    ])
  })

  it('끊김은 링크가 없다 — 남의 id', () => {
    const doc = bundleFile(listPath())
    const broken = doc.querySelector('.wb-export-token-broken')!
    expect(broken.textContent).toBe('남의 페이지 찾을 수 없음')
    expect(broken.closest('a')).toBeNull()
    expect(broken.querySelector('a')).toBeNull()
  })

  it('닻이 선다 — 번호 줄 · 공통코드 그룹 · 항목', () => {
    const detailPath = exportBundle({ pages: pages(), runtimeJs: '' }).pagePaths[1]!
    expect(bundleFile(detailPath).getElementById(markerAnchor('n_f'))?.getAttribute('data-wb-marker-for')).toBe('n_f')
    const codes = bundleFile('codes.html')
    expect(codes.getElementById(codeAnchor('STATUS'))?.getAttribute('aria-label')).toBe('회원 상태')
    expect(codes.getElementById(codeAnchor('STATUS', 'A B/C'))?.textContent).toContain('활성')
    // 닻 글자는 공백 · 빗금이 없는 안전한 글자다.
    expect(codeAnchor('STATUS', 'A B/C')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('표가 없는 번들의 코드 토큰은 끊김이다', () => {
    const doc = bundleFile(listPath(), null)
    expect([...doc.querySelectorAll('.wb-export-token-broken')].map((el) => el.textContent)).toEqual([
      '옛 찾을 수 없음',
      '남의 페이지 찾을 수 없음',
    ])
  })
})

describe('PPTX 의 코멘트 토큰', () => {
  it('풀린 글만 싣는다 — 날 id · 토큰 원문이 없다', () => {
    const { parts } = exportPptx({ pages: pages(), codes: CODES })
    const slide = String(parts.find((part) => part.path === 'ppt/slides/slide1.xml')!.content)
    expect(slide).toContain('페이지 회원 상세 / 번호 회원 상세 #2 / 같은 번호 #1 / 코드 활성 / 남의 것 남의 페이지 (찾을 수 없음)')
    for (const raw of ['wb:', DETAIL, FOREIGN]) expect(slide).not.toContain(raw)
  })
})
