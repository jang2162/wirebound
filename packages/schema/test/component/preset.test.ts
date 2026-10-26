/**
 * **프리셋과 파일첨부의 카탈로그 계약**(`src/component/define.ts` 의 `presets` · `src/component/preset.ts` · `src/component/catalog/index.ts` 의
 * `assertPresets` · `src/component/catalog/input.ts` 의 `FileAttachDef`) — 프리셋 템플릿이 노드로 지어지고 그 노드가 검증을 지나는지, 템플릿이 카탈로그의
 * 규칙을 어기면 실을 때 던지는지, 파일 목록 prop 의 모양과 상한.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CURRENT_DOCUMENT_VERSION } from '../../src/migrate'
import { BODY_ZONE, defineComponent, placementsOf, type ComponentDef, type NodeTemplate } from '../../src/component/define'
import {
  assertPresetLabels,
  assertPresets,
  CATALOG_DEFS,
  DataGridDef,
  FileAttachDef,
  FILES_MAX,
  installCatalog,
} from '../../src/component/catalog/index'
import { presetOf, templateNode } from '../../src/component/preset'
import { resetRegistry } from '../../src/component/registry'
import { validatePage } from '../../src/validate'
import type { WbNode } from '../../src/node'

const counter = () => {
  let made = 0
  return () => `n-${made++}`
}

describe('templateNode', () => {
  it('제 id 다음 몸통 → 구역 차례로 id 를 짓고 props 를 베낀다 — 템플릿과 값을 나누지 않는다', () => {
    const template: NodeTemplate = {
      type: 'DataGrid',
      children: [{ type: 'GridColumn', props: { label: '가' }, children: [{ type: 'Input' }] }],
      zones: { headEnd: [{ type: 'Button', props: { label: '추가' }, variant: 'primary' }] },
    }
    const node = templateNode(template, counter())
    expect(node).toEqual({
      id: 'n-0',
      type: 'DataGrid',
      children: [{ id: 'n-1', type: 'GridColumn', props: { label: '가' }, children: [{ id: 'n-2', type: 'Input' }] }],
      zones: { headEnd: [{ id: 'n-3', type: 'Button', props: { label: '추가' }, variant: 'primary' }] },
    })
    ;(node.children![0]!.props as { label: string }).label = '바뀜'
    expect(template.children![0]!.props).toEqual({ label: '가' })
  })
})

describe('프리셋 — 카탈로그', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('지금 프리셋은 그리드의 «반복 행 표» 하나다', () => {
    const presets = CATALOG_DEFS.flatMap((def) => (def.presets ?? []).map((preset) => `${def.type}.${preset.key} ${preset.label}`))
    expect(presets).toEqual(['DataGrid.repeatRows 반복 행 표'])
    expect(presetOf('DataGrid', 'repeatRows')?.label).toBe('반복 행 표')
    expect(presetOf('DataGrid', 'none')).toBeUndefined()
    expect(presetOf('Button', 'repeatRows')).toBeUndefined()
  })

  it('프리셋마다 지은 노드가 그 타입의 자리에 놓인 페이지에서 검증 이슈 0', () => {
    let checked = 0
    for (const def of CATALOG_DEFS) {
      for (const preset of def.presets ?? []) {
        let placed: WbNode = templateNode(preset.node, counter())
        const host = placementsOf(def)[0]
        if (host !== undefined) {
          placed = {
            id: 'host',
            type: host.type,
            ...(host.zone === BODY_ZONE ? { children: [placed] } : { zones: { [host.zone]: [placed] } }),
          }
        }
        expect(validatePage({ version: CURRENT_DOCUMENT_VERSION, root: { id: 'root', type: 'Page', children: [placed] } })).toEqual([])
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('«반복 행 표» — 열 셋(입력 · 입력 · 삭제 단추) · 행 하나 2 줄 · 머리 오른쪽 [추가] · 바 없음', () => {
    const node = templateNode(presetOf('DataGrid', 'repeatRows')!.node, counter())
    expect(node.children?.map((column) => [column.props?.label, column.children?.map((piece) => piece.type)])).toEqual([
      ['항목 1', ['Input']],
      ['항목 2', ['Input']],
      ['삭제', ['Button']],
    ])
    expect(node.zones?.rows?.map((row) => row.props)).toEqual([{ repeat: 2 }])
    expect(node.zones?.headEnd?.map((button) => button.props?.label)).toEqual(['추가'])
    expect(node.zones?.footer).toBeUndefined()
  })
})

describe('assertPresets — 템플릿이 카탈로그 규칙을 어기면 던진다', () => {
  const withPreset = (node: NodeTemplate): ComponentDef[] =>
    CATALOG_DEFS.map((def) =>
      def.type === 'DataGrid' ? { ...def, presets: [{ key: 'probe', label: '탐침', description: '탐침', node }] } : def,
    )

  it('지금 카탈로그는 지난다', () => {
    expect(() => assertPresets(CATALOG_DEFS)).not.toThrow()
  })

  it.each<[string, NodeTemplate, string]>([
    ['모르는 타입', { type: 'DataGrid', zones: { headEnd: [{ type: 'Nope' }] } }, '카탈로그에 없는 타입입니다: Nope'],
    ['props 규격 밖', { type: 'DataGrid', props: { select: 'many' } }, 'DataGrid의 props 가 규격에 맞지 않습니다'],
    ['받지 않는 타입', { type: 'DataGrid', children: [{ type: 'Button' }] }, 'DataGrid.body 이 Button을 받지 않습니다'],
    ['선언 밖 구역', { type: 'DataGrid', zones: { side: [{ type: 'Button' }] } }, 'DataGrid에 없는 구역입니다: side'],
    ['몸통을 구역 맵에', { type: 'DataGrid', zones: { body: [{ type: 'GridColumn' }] } }, 'DataGrid에 없는 구역입니다: body'],
    [
      '몸통 없는 타입의 몸통',
      { type: 'DataGrid', zones: { headEnd: [{ type: 'Button', children: [] }] } },
      'Button에 없는 구역입니다: body',
    ],
    [
      '설 자리 밖',
      { type: 'DataGrid', zones: { headEnd: [{ type: 'GridColumn' }] } },
      'GridColumn이 설 수 없는 자리입니다: DataGrid.headEnd',
    ],
    [
      '변형을 prop 에서 짓는 타입의 variant',
      { type: 'DataGrid', zones: { headEnd: [{ type: 'Text', variant: 'x' }] } },
      'Text은 variant 를 role prop 에서 파생합니다',
    ],
  ])('%s', (_, node, message) => {
    expect(() => assertPresets(withPreset(node))).toThrow(message)
  })
})

describe('assertPresetLabels — 카드 이름이 겹치면 던진다', () => {
  const named = (label: string): ComponentDef[] =>
    CATALOG_DEFS.map((def) =>
      def.type === 'DataGrid'
        ? { ...def, presets: [...(def.presets ?? []), { key: 'probe', label, description: '탐침', node: { type: 'DataGrid' } }] }
        : def,
    )

  it('지금 카탈로그는 지난다 · 컴포넌트 이름 · 다른 프리셋 이름과 겹치면 던진다', () => {
    expect(() => assertPresetLabels(CATALOG_DEFS)).not.toThrow()
    expect(() => assertPresetLabels(named('파일첨부'))).toThrow('프리셋 probe 의 이름이 이미 쓰입니다: 파일첨부 (FileAttach)')
    expect(() => assertPresetLabels(named('반복 행 표'))).toThrow('(DataGrid.repeatRows)')
  })
})

describe('defineComponent — 프리셋 선언', () => {
  const base = {
    type: 'Probe',
    label: '탐침',
    description: '탐침.',
    group: 'data' as const,
    props: z.strictObject({}),
    editor: [],
    states: [],
    zones: [],
  }
  const preset = (key: string, label = '탐침 하나', type = 'Probe') => ({ key, label, description: '설명.', node: { type } })

  it('키 꼴 · 겹침 · 이름 · 노드 타입을 본다', () => {
    expect(() => defineComponent({ ...base, presets: [preset('one')] })).not.toThrow()
    expect(() => defineComponent({ ...base, presets: [preset('One')] })).toThrow('프리셋 키의 꼴이 아닙니다')
    expect(() => defineComponent({ ...base, presets: [preset('one'), preset('one', '탐침 둘')] })).toThrow('presets에 중복')
    expect(() => defineComponent({ ...base, presets: [preset('one', '')] })).toThrow('presets.one.label가 비어 있습니다')
    expect(() => defineComponent({ ...base, presets: [preset('one', '탐침', 'Other')] })).toThrow('노드 타입이 Other')
  })
})

describe('FileAttach', () => {
  const file = (name: string, size = '1.0 MB') => ({ name, size })

  it('파일 목록은 { name, size } 배열이고 상한 · 칸 길이를 넘으면 거절한다', () => {
    const parse = (props: unknown) => FileAttachDef.props.safeParse(props).success
    expect(parse({})).toBe(true)
    expect(parse({ files: [file('a.pdf'), file('')] })).toBe(true)
    expect(parse({ files: Array.from({ length: FILES_MAX }, (_, i) => file(`${i}.pdf`)) })).toBe(true)
    expect(parse({ files: Array.from({ length: FILES_MAX + 1 }, (_, i) => file(`${i}.pdf`)) })).toBe(false)
    expect(parse({ files: [{ name: 'a.pdf' }] })).toBe(false)
    expect(parse({ files: [{ ...file('a.pdf'), selected: true }] })).toBe(false)
    expect(parse({ files: [file('a'.repeat(201))] })).toBe(false)
    expect(parse({ files: [file('a.pdf', '1'.repeat(21))] })).toBe(false)
    expect(parse({ maxFiles: 100 })).toBe(false)
    expect(parse({ maxSize: '1'.repeat(21) })).toBe(false)
  })

  it('기본값 — 빈 목록 · 최대 1개 · 100 MB · 안내 글 · «단추» 구역에 단추 셋', () => {
    expect(FileAttachDef.props.parse({})).toEqual({
      files: [],
      maxFiles: 1,
      maxSize: '100 MB',
      hint: '이곳을 더블클릭 또는 파일을 드래그 하세요',
      disabled: false,
    })
    expect(FileAttachDef.zones).toEqual([
      {
        name: 'actions',
        label: '단추',
        initial: [
          { type: 'Button', props: { label: '파일추가' } },
          { type: 'Button', props: { label: '항목 제거' } },
          { type: 'Button', props: { label: '전체 항목 제거' } },
        ],
      },
    ])
    expect(FileAttachDef.editor.find((field) => field.prop === 'files')?.control).toBe('fileList')
  })

  it('그리드와 같은 갈래가 아니다 — 입력 갈래', () => {
    expect(FileAttachDef.group).toBe('input')
    expect(DataGridDef.presets?.[0]?.node.type).toBe('DataGrid')
  })
})
