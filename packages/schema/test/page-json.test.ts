/**
 * 페이지 JSON 봉투(§11.2 — P7-3 T1: D1·D2·D6). **읽기·쓰기·왕복을 화면 없이 잰다.**
 *
 * **수를 산문에 적지 않는다.** 실패 갈래가 몇인지도 아래 케이스가 목록에서 만든다 —
 * 계획서의 전역 제약이 요구한 것이다.
 */
import { describe, expect, it } from 'vitest'
import {
  PAGE_JSON_FILE_SUFFIX,
  WIREBOUND_PAGE_VERSION,
  pageJsonFileName,
  pageJsonText,
  readPageJson,
  toPageJson,
  type PageJson,
} from '../src/page-json/envelope'
import type { PageDocument } from '../src/node'

const DOCUMENT: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [{ id: 'n_7f3a', type: 'SearchForm', marker: 1 }],
  },
}

/** §11.2의 봉투를 **이 구현이 읽는 모양으로** 만든다. 갈리는 두 자리는 D2·D6이 근거다. */
function envelope(patch: Partial<PageJson> = {}): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: { title: '회원 목록', description: null },
    schema: DOCUMENT,
    comments: [{ nodeId: 'n_7f3a', body: '검색 조건은 AND 결합' }],
    ...patch,
  }
}

function read(value: unknown) {
  return readPageJson(JSON.stringify(value))
}

/** 실패 결과에서 이유만 꺼낸다. 성공이면 그것을 그대로 말해 실패 문장이 헷갈리지 않게 한다. */
function reasonOf(result: ReturnType<typeof readPageJson>): string {
  return result.status === 'failed' ? result.reason : 'read'
}

describe('페이지 JSON 봉투를 읽는다', () => {
  it('§11.2의 네 키를 그대로 읽는다', () => {
    const result = read(envelope())

    expect(result.status).toBe('read')
    if (result.status !== 'read') return
    expect(result.file.page.title).toBe('회원 목록')
    expect(result.file.schema.root.children?.[0]?.id).toBe('n_7f3a')
    expect(result.file.comments).toEqual([{ nodeId: 'n_7f3a', body: '검색 조건은 AND 결합' }])
  })

  it('빈 글자는 엔진 문장이 아니라 우리 문장으로 말한다', () => {
    const result = readPageJson('   ')

    expect(reasonOf(result)).toBe('unreadable')
    if (result.status !== 'failed') return
    // 엔진의 "Unexpected end of JSON input"은 사용자가 방금 한 일을 설명하지 못한다.
    expect(result.message).not.toMatch(/JSON input/)
  })

  it('JSON이 아니면 엔진 문장을 그대로 옮긴다', () => {
    const result = readPageJson('{ 이건 JSON이 아니다')

    expect(reasonOf(result)).toBe('unreadable')
  })

  it('wireboundVersion이 없으면 봉투가 아니다', () => {
    expect(reasonOf(read({ page: {}, schema: DOCUMENT, comments: [] }))).toBe('not-envelope')
  })

  it('wireboundVersion이 문자열이 아니어도 봉투가 아니다 — 값이 1이어도 그렇다', () => {
    expect(reasonOf(read({ ...envelope(), wireboundVersion: 1 }))).toBe('not-envelope')
  })

  it('테마 파일은 페이지 봉투가 아니다', () => {
    // `theme/theme-io.ts`가 내는 봉투. 두 파일이 둘 다 `.json`이라 이름 말고는 갈릴 것이 없다.
    const result = read({ wireboundVersion: '1', theme: { meta: { id: 'admin' } } })

    expect(reasonOf(result)).toBe('bad-shape')
  })

  it('모르는 버전은 거부하고 **그 값을 말한다**', () => {
    const result = read({ ...envelope(), wireboundVersion: '2' })

    expect(reasonOf(result)).toBe('unknown-version')
    if (result.status !== 'failed') return
    expect(result.message).toContain('2')
    expect(result.message).toContain(WIREBOUND_PAGE_VERSION)
  })

  it('선언되지 않은 키는 거부하고 그 자리를 말한다', () => {
    const result = read({ ...envelope(), 알수없는키: 1 })

    expect(reasonOf(result)).toBe('bad-shape')
    if (result.status !== 'failed') return
    expect(result.issues.map((issue) => issue.path)).toContain('알수없는키')
  })

  it('D6 — comments[]의 marker는 봉투가 받지 않고, 문장이 노드를 가리킨다', () => {
    // §11.2의 예시는 `{ marker: 1, nodeId, body }`인데 P5-1 D1이 번호를 노드로 옮겼다.
    const result = read({
      ...envelope(),
      comments: [{ marker: 1, nodeId: 'n_7f3a', body: '검색 조건은 AND 결합' }],
    })

    expect(reasonOf(result)).toBe('bad-shape')
    if (result.status !== 'failed') return
    expect(result.message).toContain('marker')
    // **어디로 가야 하는지까지 말한다** — 그냥 "인식할 수 없는 키"면 사용자가 번호를
    // 어디에 적어야 하는지 알 수 없다.
    expect(result.message).toContain('schema')
  })

  it('D2 — schema가 root 노드뿐이면 문서 버전 축이 없어 거부한다', () => {
    // §11.2의 예시가 `schema`에 노드를 싣는데, 그러면 `migrateDocument`가 걸 자리가 없다.
    const result = read({ ...envelope(), schema: DOCUMENT.root })

    expect(reasonOf(result)).toBe('bad-shape')
    if (result.status !== 'failed') return
    expect(result.issues.map((issue) => issue.path)).toContain('schema.version')
  })

  it('재라 #7 — 코멘트 본문 상한이 봉투에도 걸린다', () => {
    const long = read({ ...envelope(), comments: [{ nodeId: 'n_7f3a', body: 'ㄱ'.repeat(2001) }] })
    const empty = read({ ...envelope(), comments: [{ nodeId: 'n_7f3a', body: '' }] })

    expect(reasonOf(long)).toBe('bad-shape')
    expect(reasonOf(empty)).toBe('bad-shape')
    // 상한 바로 아래는 통과한다 — 경계가 어디인지까지 못박는다.
    expect(reasonOf(read({ ...envelope(), comments: [{ nodeId: 'n_7f3a', body: 'ㄱ'.repeat(2000) }] }))).toBe('read')
  })

  it('노드 id로 쓸 수 없는 nodeId는 받지 않는다', () => {
    // 어떤 문서에서도 노드를 가리킬 수 없는 값이다 — 남의 파일이라도 이것은 끊긴 참조가
    // 아니라 깨진 참조다.
    const result = read({ ...envelope(), comments: [{ nodeId: 'n/7f3a', body: '가' }] })

    expect(reasonOf(result)).toBe('bad-shape')
    if (result.status !== 'failed') return
    expect(result.issues.map((issue) => issue.path)).toContain('comments.0.nodeId')
  })

  it('comments 키가 없으면 봉투가 덜 온 것이다', () => {
    const { comments: _comments, ...rest } = envelope()

    expect(reasonOf(read(rest))).toBe('bad-shape')
  })

  it('D4 — layoutRef를 받아 그대로 싣는다(적용은 하지 않는다)', () => {
    const result = read({ ...envelope(), page: { title: '회원 목록', layoutRef: 'admin-lnb' } })

    expect(result.status).toBe('read')
    if (result.status !== 'read') return
    expect(result.file.page.layoutRef).toBe('admin-lnb')
  })
})

describe('페이지 JSON 봉투를 만든다', () => {
  it('네 키를 담고 문서를 그대로 싣는다', () => {
    const file = toPageJson({
      page: { title: '회원 목록', description: '설명' },
      document: DOCUMENT,
      comments: [{ nodeId: 'n_7f3a', body: '가' }],
    })

    expect(file.wireboundVersion).toBe(WIREBOUND_PAGE_VERSION)
    expect(file.schema).toBe(DOCUMENT)
    expect(Object.keys(file)).toEqual(['wireboundVersion', 'page', 'schema', 'comments'])
  })

  it('D4 — layoutRef를 만들어 내지 않는다', () => {
    const file = toPageJson({ page: { title: '회원 목록', description: null }, document: DOCUMENT, comments: [] })

    expect('layoutRef' in file.page).toBe(false)
  })

  it('글자는 들여쓰기 2칸이고 줄바꿈으로 끝난다', () => {
    const text = pageJsonText(toPageJson({ page: { title: '제목', description: null }, document: DOCUMENT, comments: [] }))

    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "page": {')
  })

  it('왕복 — 내보낸 글자를 그대로 다시 읽는다', () => {
    const file = toPageJson({
      page: { title: '회원 목록', description: null },
      document: DOCUMENT,
      comments: [{ nodeId: 'n_7f3a', body: '가' }],
    })
    const result = readPageJson(pageJsonText(file))

    expect(result.status).toBe('read')
    if (result.status !== 'read') return
    expect(result.file).toEqual(file)
  })
})

describe('내보낼 파일 이름', () => {
  it('제목을 쓰고 꼬리가 .json으로 끝난다', () => {
    expect(pageJsonFileName('회원 목록')).toBe(`회원-목록${PAGE_JSON_FILE_SUFFIX}`)
    expect(pageJsonFileName('회원 목록').endsWith('.json')).toBe(true)
  })

  it('경로가 될 수 있는 글자를 이름에 남기지 않는다', () => {
    // 브라우저가 `download` 값을 경로로 읽는다 — `theme-io.ts`의 `exportFileName`이 같은 이유로
    // 같은 검사를 한다.
    expect(pageJsonFileName('a/b')).not.toContain('/')
    expect(pageJsonFileName('a\\b')).not.toContain('\\')
  })

  it('쓸 글자가 없으면 기본 이름을 쓴다', () => {
    expect(pageJsonFileName('///')).toBe(`page${PAGE_JSON_FILE_SUFFIX}`)
    expect(pageJsonFileName('')).toBe(`page${PAGE_JSON_FILE_SUFFIX}`)
  })
})
