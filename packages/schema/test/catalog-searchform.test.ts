/**
 * `SearchForm.columns` 의 카탈로그 계약 — 1 ~ 4 · 기본값 없음(없으면 테마마다의 지금 배치) · 속성 패널의 «열 수» 칸. 열이 화면에서 무엇을 하는지는
 * 실브라우저 판 `apps/web/build-test/searchform-columns.test.ts` 가 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, requireComponent, resetRegistry } from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const parse = (props: Record<string, unknown>) => requireComponent('SearchForm').props.safeParse(props)

describe('SearchForm.columns', () => {
  it.each([1, 2, 3, 4])('%s 를 받는다', (columns) => {
    expect(parse({ columns }).success).toBe(true)
  })

  it.each([
    ['0', 0],
    ['5', 5],
    ['2.5', 2.5],
    ['글자 "3"', '3'],
    ['null', null],
  ])('%s 를 거부한다', (_label, columns) => {
    expect(parse({ columns }).success).toBe(false)
  })

  it('기본값이 없다 — 안 적으면 파싱한 값에도 키가 없다(테마마다의 지금 배치)', () => {
    const parsed = parse({})
    expect(parsed.success).toBe(true)
    expect('columns' in (parsed.data as object)).toBe(false)
  })

  it('속성 패널에 «열 수» 칸이 숫자로 선다', () => {
    expect(requireComponent('SearchForm').editor.find((field) => field.prop === 'columns')).toEqual({
      prop: 'columns',
      control: 'number',
      label: '열 수',
    })
  })
})
