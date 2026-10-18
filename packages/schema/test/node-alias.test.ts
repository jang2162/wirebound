/**
 * 노드 별칭(`alias`)의 봉투 계약과, 노드를 옮기는 길(id 재발급 · 클립보드 봉투 · 프리셋/붙여넣기 복사)이 별칭을
 * 함께 옮기는가.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, resetRegistry } from '../src/index'
import { NODE_ALIAS_MAX, type WbNode } from '../src/node'
import { WbNodeSchema } from '../src/envelope'
import { prepareNodesForPaste, readNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { stripMarkers } from '../src/tree'
import { remapNodeIds } from '../src/tree'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const node = (alias: unknown) => ({ id: 'n_000000000001', type: 'Button', alias })

describe('WbNodeSchema — alias', () => {
  it('상한은 60자다', () => {
    expect(NODE_ALIAS_MAX).toBe(60)
  })

  it.each([
    ['한 글자', '저'],
    ['60자', '가'.repeat(60)],
    ['60자 — 서로게이트 쌍은 한 글자로 센다', '😀'.repeat(60)],
    ['안쪽 공백', '저장 버튼'],
    ['`<script>` 글', '<script>alert(1)</script>'],
    ['끊을 자리 없는 긴 한 낱말', 'a'.repeat(60)],
    ['RTL 글', 'زر الحفظ'],
  ])('%s를 받는다', (_label, alias) => {
    expect(WbNodeSchema.safeParse(node(alias)).success).toBe(true)
  })

  it('별칭이 없는 노드를 그대로 받는다 — 옛 문서는 마이그레이션 없이 읽힌다', () => {
    expect(WbNodeSchema.safeParse({ id: 'n_000000000001', type: 'Button' }).success).toBe(true)
  })

  it.each([
    ['빈 글', ''],
    ['공백만', '   '],
    ['61자', '가'.repeat(61)],
    ['61자 — 서로게이트 쌍', '😀'.repeat(61)],
    ['앞 공백', ' 저장'],
    ['뒤 공백', '저장 '],
    ['줄바꿈', '저장\n버튼'],
    ['캐리지 리턴', '저장\r버튼'],
    ['탭', '저장\t버튼'],
    ['줄 구분자(U+2028)', '저장 버튼'],
    ['숫자', 42],
    ['null', null],
  ])('%s를 거부한다', (_label, alias) => {
    expect(WbNodeSchema.safeParse(node(alias)).success).toBe(false)
  })
})

describe('별칭은 노드와 함께 간다', () => {
  const tree = (): WbNode => ({
    id: 'root',
    type: 'Page',
    children: [
      { id: 'a', type: 'Button', alias: '저장 버튼', marker: 3, props: { label: '저장' } },
      { id: 'b', type: 'Flex', alias: '머리 줄', children: [{ id: 'c', type: 'Text', alias: '제목' }] },
    ],
  })

  it('id 재발급(`remapNodeIds`)이 옮긴다 — 가져오기 · 프리셋 적용', () => {
    let n = 0
    const { root } = remapNodeIds(tree(), () => `n_${String(n++).padStart(12, '0')}`)
    expect(root.children![0]!.alias).toBe('저장 버튼')
    expect(root.children![1]!.alias).toBe('머리 줄')
    expect(root.children![1]!.children![0]!.alias).toBe('제목')
  })

  it('번호를 걷는 복사(`stripMarkers`)가 옮긴다 — 붙여넣기 · 복제 · 프리셋 저장', () => {
    const [button, flex] = stripMarkers(tree().children!)
    expect(button!.alias).toBe('저장 버튼')
    expect(button!.marker).toBeUndefined()
    expect(flex!.alias).toBe('머리 줄')
    expect(flex!.children![0]!.alias).toBe('제목')
  })

  it('클립보드 봉투를 오가며 남는다', () => {
    const text = writeNodesEnvelope(tree().children!, 1)
    const read = readNodesEnvelope(text)
    expect(read).not.toBeNull()
    expect(read!.nodes.map((item) => item.alias)).toEqual(['저장 버튼', '머리 줄'])
  })

  it('붙일 노드를 짓는 길(`prepareNodesForPaste`)이 옮긴다', () => {
    const keep = { node: () => true, page: () => true }
    const { nodes } = prepareNodesForPaste(tree().children!, keep)
    expect(nodes[0]!.alias).toBe('저장 버튼')
    expect(nodes[1]!.children![0]!.alias).toBe('제목')
  })

  it('클립보드 봉투는 모양이 틀린 별칭을 받지 않는다', () => {
    const text = JSON.stringify({
      wirebound: 'nodes',
      version: 1,
      nodes: [{ id: 'a', type: 'Button', alias: '가'.repeat(61) }],
    })
    expect(readNodesEnvelope(text)).toBeNull()
  })
})
