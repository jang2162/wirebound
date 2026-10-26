// @vitest-environment jsdom
/**
 * **SDK 기본 `FileAttachView`**(`packages/theme-sdk/src/default-views/input.tsx`)와 렌더러가 싣는 이름(`src/render.tsx` 의 `fieldNames`). 조각 이름은
 * `wb-theme check` 의 F1 ~ F4(`packages/theme-kit/src/check.ts` 의 `fileAttachProblems`)가 재는 계약이고, 여기서는 기본 뷰가 그 계약을 갈래마다 지키는지
 * 글로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 이름 | 값 칸 안 파일첨부가 필드 이름을 못 받는다 · 밖에서 «파일첨부» 가 아니다 |
 * | 빈 목록 · 줄 | 빈 목록에 안내 줄이 없다 · 찬 목록에 안내 줄이 선다 · 줄 수 · 칸 글이 다르다 |
 * | 한도 네 갈래 | 개수 0 · 빈 크기에서 조각이 남는다 · 둘 다 없는데 줄이 선다 · 글이 «최대 {n}개 {크기} 제한» 이 아니다 |
 * | 표 머리 · 체크 | 머리 칸이 `th scope=col` 셋이 아니다 · 체크가 포커스 받는 입력이다 |
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => installCatalog())
afterEach(() => cleanup())

const doc = (children: WbNode[]): PageDocument =>
  ({ version: 5, root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

function attach(props: Record<string, unknown>, id = 'fa'): WbNode {
  return { id, type: 'FileAttach', props, zones: { actions: [{ id: `${id}-b`, type: 'Button', props: { label: '파일추가' } }] } }
}

function drawn(nodes: WbNode[], id = 'fa'): HTMLElement {
  const { container } = render(<>{renderDocument(doc(nodes))}</>)
  const root = container.querySelector<HTMLElement>(`[data-wb-id="${id}"]`)
  if (root === null) throw new Error('파일첨부가 안 그려졌다')
  return root
}

const parts = (root: HTMLElement, part: string) => [...root.querySelectorAll(`[data-wb-part="${part}"]`)].map((el) => el.textContent ?? '')
const limitText = (root: HTMLElement) => root.querySelector('[data-wb-part="limit"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null

describe('FileAttach 기본 뷰', () => {
  it('값 칸 안이면 필드 이름 · 밖이면 «파일첨부» 가 묶음 이름이다', () => {
    const inField = drawn([{ id: 'f', type: 'Field', props: { label: '통장사본' }, children: [attach({})] }])
    expect([inField.getAttribute('role'), inField.getAttribute('aria-label')]).toEqual(['group', '통장사본'])
    cleanup()
    const alone = drawn([attach({})])
    expect(alone.getAttribute('aria-label')).toBe('파일첨부')
  })

  it('빈 목록은 안내 줄 하나 · 찬 목록은 파일마다 줄(이름 · 크기)이고 안내 줄이 없다', () => {
    const empty = drawn([attach({ hint: '끌어 놓으세요' })])
    expect([parts(empty, 'drop'), parts(empty, 'file').length]).toEqual([['끌어 놓으세요'], 0])
    cleanup()
    const full = drawn([
      attach({
        files: [
          { name: 'a.pdf', size: '1 MB' },
          { name: 'b.hwp', size: '2 MB' },
        ],
      }),
    ])
    expect([parts(full, 'drop'), parts(full, 'fileName'), parts(full, 'fileSize')]).toEqual([[], ['a.pdf', 'b.hwp'], ['1 MB', '2 MB']])
  })

  it.each<[string, Record<string, unknown>, string | null, string[], string[]]>([
    ['둘 다', { maxFiles: 3, maxSize: '10 MB' }, '최대 3개 10 MB 제한', ['3개'], ['10 MB']],
    ['개수만', { maxFiles: 3, maxSize: '' }, '최대 3개 제한', ['3개'], []],
    ['크기만', { maxFiles: 0, maxSize: '10 MB' }, '최대 10 MB 제한', [], ['10 MB']],
    ['없음', { maxFiles: 0, maxSize: '  ' }, null, [], []],
  ])('한도 %s', (_, props, text, count, size) => {
    const root = drawn([attach(props)])
    expect([limitText(root), parts(root, 'limitCount'), parts(root, 'limitSize')]).toEqual([text, count, size])
  })

  it('목록은 table 하나 · 머리 칸은 th scope=col 셋 · 체크는 그림(포커스 받는 요소가 단추 · 입력이 아니다)', () => {
    const root = drawn([attach({ files: [{ name: 'a.pdf', size: '1 MB' }] })])
    const lists = root.querySelectorAll('[data-wb-part="list"]')
    expect([lists.length, lists[0]?.tagName]).toEqual([1, 'TABLE'])
    expect([...lists[0]!.querySelectorAll('thead th')].map((th) => [th.getAttribute('scope'), th.textContent])).toEqual([
      ['col', ''],
      ['col', '파일이름'],
      ['col', '파일크기'],
    ])
    expect(root.querySelectorAll('input, select, textarea, [tabindex]').length).toBe(0)
    expect(root.querySelectorAll('[data-wb-part="checkbox"]').length).toBe(2)
  })
})
