/**
 * 봉투와 직렬화(P4c-3 T1). **DOM을 한 번도 안 쓴다** — `theme-io.ts`가 순수 함수라는 계약이
 * 이 파일이 `.ts`인 것으로 지켜진다(`render`도 `document`도 없다).
 *
 * **이 파일의 중심은 왕복이다**(계획서 *"계획이 재지 않은 것"* 1 — *"잴 수 있는 것은
 * '내보낸 것을 다시 가져오면 같다'까지다. 왕복 케이스를 반드시 만들어라"*).
 */
import { describe, expect, it } from 'vitest'
import { SYSTEM_THEME_IDS, systemTheme, type Theme } from '@wirebound/themes'
import {
  EXPORT_FILE_SUFFIX,
  THEME_EXPORT_VERSION,
  exportFileName,
  exportText,
  fromImport,
  toExport,
} from '../../src/theme/theme-io'

const META = { id: 'brand', name: '브랜드', version: '1.0.0' }

function theme(overrides: Partial<Theme> = {}): Theme {
  return { meta: { ...META }, ...overrides } as Theme
}

describe('봉투 (D1)', () => {
  it('키 둘을 든다 — wireboundVersion과 theme', () => {
    const source = theme()
    const envelope = toExport(source)

    expect(Object.keys(envelope)).toEqual(['wireboundVersion', 'theme'])
    expect(envelope.wireboundVersion).toBe('1')
    // **문서를 복사하지 않는다** — 복사하면 키 순서를 다시 만들 자리가 생긴다.
    expect(envelope.theme).toBe(source)
  })

  it('내보낸 글자가 봉투를 먼저 적는다', () => {
    // 사람이 파일을 열었을 때 첫 줄이 *"이게 무엇인가"*여야 한다.
    expect(exportText(theme()).startsWith('{\n  "wireboundVersion": "1",\n  "theme": {')).toBe(true)
  })

  it('끝에 줄바꿈이 있고 그것이 왕복을 안 깬다', () => {
    const text = exportText(theme())
    expect(text.endsWith('}\n')).toBe(true)
    expect(fromImport(text).status).toBe('read')
  })
})

describe('왕복 — 이 슬라이스의 중심 단언', () => {
  it.each([...SYSTEM_THEME_IDS])('시스템 테마 %s를 내보내고 다시 가져오면 같다', (id) => {
    const source = systemTheme(id) as Theme

    const back = fromImport(exportText(source))

    expect(back.status).toBe('read')
    if (back.status !== 'read') return
    // ㉠ **값이 같다**(깊은 비교).
    expect(back.theme).toEqual(source)
    // ㉡ **글자가 같다** — 다시 내보내면 첫 파일과 한 글자도 안 다르다. ㉠만으로는
    //    키 순서가 갈려도 통과한다(`toEqual`은 순서를 안 본다).
    expect(exportText(back.theme)).toBe(exportText(source))
  })

  it('파생 문서는 파생 그대로 나가고 그대로 돌아온다 (D2)', () => {
    const derived = theme({ meta: { ...META, extends: 'system:admin' } } as Partial<Theme>)

    const back = fromImport(exportText(derived))

    expect(back.status === 'read' && back.theme.meta.extends).toBe('system:admin')
    // **합치지 않는다** — base의 절이 실려 나가면 받는 쪽에서 파생이 아니게 된다.
    expect(back.status === 'read' && 'components' in back.theme).toBe(false)
  })

  it('meta.version을 이 슬라이스가 안 만든다 — 실려 나가고 그대로 들어온다 (D4)', () => {
    const back = fromImport(exportText(theme({ meta: { ...META, version: '7.7.7' } } as Partial<Theme>)))
    expect(back.status === 'read' && back.theme.meta.version).toBe('7.7.7')
  })
})

describe('키 순서가 계약이다', () => {
  /**
   * **P4a-3이 저장 쪽에서 이것을 지키려고 절 컬럼을 `json`으로 골랐다**(`jsonb`가 키를
   * (길이, 바이트)로 정규화하는 것을 P4a-3이 컨테이너에서 쟀다 — PostgreSQL 16.14).
   * 내보내기도 같은 계약 아래 있다.
   */
  const STATES = '{"selected":1,"disabled":2,"loading":3,"empty":4}'

  it('내보낸 글자가 문서에 적힌 순서를 그대로 쓴다', () => {
    const source = { meta: { ...META }, components: { Button: { states: JSON.parse(STATES) } } } as unknown as Theme

    const text = exportText(source)
    const order = [...text.matchAll(/"(selected|disabled|loading|empty)"/g)].map((m) => m[1])

    // `jsonb`였다면 `empty`·`loading`·`disabled`·`selected`가 됐을 순서다.
    expect(order).toEqual(['selected', 'disabled', 'loading', 'empty'])
  })

  it('왕복이 그 순서를 보존한다', () => {
    const first = exportText({
      meta: { ...META },
      components: { Button: { states: JSON.parse(STATES) } },
    } as unknown as Theme)

    const back = fromImport(first)

    expect(back.status === 'read' && exportText(back.theme)).toBe(first)
  })

  it('정수형 키만은 JS가 오름차순으로 정규화한다 — 이 파일이 만드는 손해가 아니다', () => {
    // **`theme-io.ts` 머리말이 적어 둔 사실을 실제로 잰다.** `JSON.parse`가 낸 객체부터
    // 이미 그 순서이므로 내보내기가 뒤집는 것이 아니다 — 서버·클라이언트 어느 쪽이든
    // 문서를 JS 객체로 만드는 순간 같은 일이 일어난다.
    expect(JSON.stringify(JSON.parse('{"500":1,"50":2}'))).toBe('{"50":2,"500":1}')
    // 순서가 뜻을 갖는 층(`states`)의 키는 정수형이 아니다 — 위 두 케이스가 그것을 보인다.
    expect(JSON.stringify(JSON.parse('{"b":1,"a":2}'))).toBe('{"b":1,"a":2}')
  })
})

describe('읽기 실패를 셋으로 가른다 (T1)', () => {
  it('JSON이 아니면 unreadable이고 엔진의 문장을 그대로 옮긴다', () => {
    const result = fromImport('{"wireboundVersion":')

    expect(result.status === 'failed' && result.reason).toBe('unreadable')
    // **문장을 우리가 만들지 않는다**(W2의 판정 — 줄·칸을 다시 세면 엔진과 갈린다).
    expect(result.status === 'failed' && result.message).toBe(
      (() => {
        try {
          JSON.parse('{"wireboundVersion":')
          return ''
        } catch (caught) {
          return (caught as Error).message
        }
      })(),
    )
  })

  it('빈 글자는 엔진의 문장 대신 무슨 일이 있었는지 말한다', () => {
    // `JSON.parse('')`는 *"Unexpected end of JSON input"*을 던지는데 그 문장은 사용자가
    // 방금 한 일(아무것도 안 넣었다)을 설명하지 못한다.
    const result = fromImport('   \n ')
    expect(result.status === 'failed' && result.reason).toBe('unreadable')
    expect(result.status === 'failed' && result.message).toBe('내용이 비어 있습니다.')
  })

  it('날 테마 문서는 봉투가 아니다', () => {
    // **봉투를 두기로 한 D1이 여기서 값을 한다** — 봉투가 없으면 이 물음 자체를 못 던진다.
    const result = fromImport(JSON.stringify(theme()))
    expect(result.status === 'failed' && result.reason).toBe('not-envelope')
  })

  it('배열·null·수는 봉투가 아니다', () => {
    for (const text of ['[]', 'null', '42', '"문자열"']) {
      expect(fromImport(text).status === 'failed').toBe(true)
    }
  })

  it('페이지 JSON은 봉투인데 테마가 없다 — 그렇게 말한다 (§11.2)', () => {
    const page = JSON.stringify({
      wireboundVersion: '1',
      page: { title: '회원 목록' },
      schema: { id: 'n_root', type: 'Page' },
      comments: [],
    })

    const result = fromImport(page)

    expect(result.status === 'failed' && result.reason).toBe('not-envelope')
    // **버전이 아니라 내용을 짚는다** — 페이지 JSON은 버전이 맞는 wirebound 파일이다.
    expect(result.status === 'failed' && result.message).toContain('페이지 JSON')
  })

  it('모르는 버전은 따로 가르고 찾은 값을 싣는다 (§13.1)', () => {
    const result = fromImport(JSON.stringify({ wireboundVersion: '2', theme: theme() }))

    expect(result.status === 'failed' && result.reason).toBe('unknown-version')
    expect(result.status === 'failed' && result.message).toContain('2')
  })

  it('모양이 어긋난 theme은 여기서 안 막는다 — 이슈가 path를 달고 나오게 둔다', () => {
    // **판정이다**(`theme-io.ts`의 머리말). `ThemeSchema`로 걸러 되돌리면 실패 문안이
    // *"규격이 아닙니다"* 하나로 뭉개져 어디를 고쳐야 하는지가 사라진다.
    const result = fromImport(JSON.stringify({ wireboundVersion: '1', theme: { components: 42 } }))
    expect(result.status).toBe('read')
  })
})

describe('파일 이름 (재라 #5)', () => {
  it('<meta.id>.wirebound-theme.json이다', () => {
    expect(exportFileName(theme())).toBe(`brand${EXPORT_FILE_SUFFIX}`)
    expect(exportFileName(theme())).toBe('brand.wirebound-theme.json')
  })

  it('.json이 마지막이다 — OS가 그것으로 종류를 정한다', () => {
    expect(exportFileName(theme()).endsWith('.json')).toBe(true)
  })

  it('id가 규격 밖이면 이름만 바꾼다 — 내보내기를 막지 않는다', () => {
    // 초안은 검증을 안 지난 문서를 담을 수 있다(D6의 계약). `/`가 이름에 들어가면
    // 브라우저가 그것을 경로로 읽는다.
    const broken = { meta: { id: '../../etc/passwd', name: 'x', version: '1' } } as unknown as Theme
    expect(exportFileName(broken)).toBe(`theme${EXPORT_FILE_SUFFIX}`)
  })

  it('meta 자체가 없어도 던지지 않는다', () => {
    expect(exportFileName({} as Theme)).toBe(`theme${EXPORT_FILE_SUFFIX}`)
  })
})

describe('봉투 버전 상수', () => {
  it('§11.2의 페이지 봉투와 같은 문자열이다', () => {
    // **값은 같고 뜻은 다르다**(재라 #1 — `theme-io.ts`의 머리말이 근거 셋을 든다).
    // 오늘 페이지 쪽 봉투를 만드는 코드가 없으므로 이 케이스가 대조하는 것은 §11.2의
    // 규격이 적은 값 하나다.
    expect(THEME_EXPORT_VERSION).toBe('1')
  })
})
