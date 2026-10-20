/**
 * **«모듈로 저장…»**(`src/panels/save-module-dialog.tsx` · 구조 트리 줄 `…`) — 설계 spec 「B3. 모듈」. **`<App />`을 라우트째 렌더한다.**
 *
 * | 판 | 담는 것 |
 * |---|---|
 * | 여럿을 고름 | 고른 것 전부 · 문서 차례 |
 * | 조상과 자손을 함께 고름 | 조상만(자손은 조상이 담는다) |
 * | 뿌리만 | 항목이 없다(뿌리 줄 `…` 에 «모듈로 저장…»이 없다) |
 *
 * 저장 본문은 `marker` 와 **묶음 밖을 가리키는 상호작용 동작**을 걷은 것이고, 뺀 수를 상자가 말한다(Review Focus 5 — 서버도 같은 함수로 다시
 * 걷는다: `apps/api/test/modules.test.ts`). 저장하면 하단 판 «모듈» 탭이 그 목록을 다시 읽어 그 카드가 선다.
 *
 * **저장할 곳**(설계 spec `2026-10-20-personal-modules-design.md` «저장») — 고르기 «개인 모듈» · «프로젝트 모듈», 기본값은 개인. viewer 의 트리는
 * 줄 `…` 에 «모듈로 저장…» 한 항목만 서고 고르기에 개인 하나뿐이다. 담는 것 · 이름 칸의 케이스는 저장할 곳과 무관해 기본값(개인)으로 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MODULE_NAME_MAX, countModuleNodes, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectModule } from '../../src/api/types'
import { moduleSelection, savedModuleNotice } from '../../src/panels/save-module-dialog'
import { PROJECT_ID, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { queryRowAction, rowAction, rowReasons, structureRowName } from './tree-row'

/**
 * ```
 * n-root (Page)
 * ├ n-open (Button)  marker 1 · click → setVisible n-box(안) · n-out(밖)
 * ├ n-box  (Card)
 * │  └ n-b  (Text)
 * └ n-out  (Divider)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-open',
        type: 'Button',
        marker: 1,
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setVisible', target: 'n-box', value: true },
              { type: 'setVisible', target: 'n-out', value: true },
            ],
          },
        ],
      },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-b', type: 'Text' }] },
      { id: 'n-out', type: 'Divider' },
    ],
  })
}

interface Fake {
  /** 저장된 본문 — 어느 쪽에 저장했든(케이스 대부분은 담는 것만 본다). */
  created: { name: string; nodes: WbNode[] }[]
  /** 저장한 곳 차례. */
  targets: ('personal' | 'project')[]
  lists: () => { project: number; personal: number }
  api: Partial<ApiClient>
}

function server(refuse?: ApiError): Fake {
  const created: Fake['created'] = []
  const targets: Fake['targets'] = []
  const stored = { project: [] as ProjectModule[], personal: [] as ProjectModule[] }
  const lists = { project: 0, personal: 0 }
  const make = (to: 'personal' | 'project', body: { name: string; nodes: WbNode[] }): ProjectModule => {
    if (refuse !== undefined) throw refuse
    created.push(structuredClone(body))
    targets.push(to)
    const made: ProjectModule = {
      id: `m-${created.length}`,
      name: body.name,
      nodes: body.nodes,
      nodeCount: countModuleNodes(body.nodes),
      createdBy: 'u-1',
      createdAt: '2026-10-19T00:00:00Z',
      updatedAt: '2026-10-19T00:00:00Z',
    }
    stored[to].unshift(made)
    return made
  }
  return {
    created,
    targets,
    lists: () => ({ ...lists }),
    api: {
      createModule: async (_projectId, body) => make('project', body),
      createMyModule: async (body) => make('personal', body),
      listModules: async () => {
        lists.project += 1
        return [...stored.project]
      },
      listMyModules: async () => {
        lists.personal += 1
        return [...stored.personal]
      },
    },
  }
}

const AS_VIEWER: Partial<ApiClient> = {
  getProject: async () => ({
    id: PROJECT_ID,
    name: '관리자 콘솔 설계서',
    slug: 'admin-console',
    description: '내부 운영 도구',
    role: 'viewer',
    themeRev: 0,
  }),
}

/** 고르기 «저장할 곳» 의 라디오 이름과 고른 것. */
function targetChoices(): [string, boolean][] {
  const group = within(dialog()).getByRole('group', { name: '저장할 곳' })
  return within(group)
    .getAllByRole<HTMLInputElement>('radio')
    .map((radio) => [radio.closest('label')?.textContent ?? '', radio.checked])
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function rowOf(type: string): HTMLElement {
  return within(region())
    .getByRole('button', { name: structureRowName(type) })
    .closest<HTMLElement>('[data-tree-row]')!
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: '모듈로 저장…' })
}

function nameInput(): HTMLInputElement {
  return within(dialog()).getByRole<HTMLInputElement>('textbox', { name: '모듈 이름' })
}

function saveButton(): HTMLElement {
  return within(dialog()).getByRole('button', { name: '저장' })
}

/** 그 줄의 `…` 에서 «모듈로 저장…» 을 고른다(여는 누름이 그 줄을 먼저 고른다 — 기준 노드의 줄이면 여럿 선택을 그대로 둔다). */
function openSave(type: string): void {
  fireEvent.click(rowAction(region(), '모듈로 저장…', rowOf(type)))
}

async function saveAs(name: string): Promise<void> {
  fireEvent.change(nameInput(), { target: { value: name } })
  fireEvent.click(saveButton())
  await act(async () => {})
  await act(async () => {})
}

describe('담는 노드', () => {
  it('여럿을 고르면 고른 것 전부를 문서 차례로 담는다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    fireEvent.click(within(rowOf('Divider')).getByRole('button', { name: structureRowName('Divider') }))
    fireEvent.click(within(rowOf('Card')).getByRole('button', { name: structureRowName('Card') }), { ctrlKey: true })

    // 여럿을 고른 판의 줄 행동은 기준 노드(마지막에 고른 줄)의 것이다 — 다른 줄의 `…` 를 열면 그 줄을 고른다(`./tree-row-actions.tsx` 머리말).
    openSave('Card')

    expect(within(dialog()).getByText('노드 3개를 모듈로 저장합니다.')).not.toBeNull()
    await saveAs('카드와 선')
    expect(fake.created.map((body) => body.nodes.map((node) => node.id))).toEqual([['n-box', 'n-out']])
  })

  it('조상과 자손을 함께 고르면 조상만 담는다 — 자손은 조상이 담는다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    fireEvent.click(within(rowOf('Card')).getByRole('button', { name: structureRowName('Card') }))
    fireEvent.click(within(rowOf('Text')).getByRole('button', { name: structureRowName('Text') }), { ctrlKey: true })

    openSave('Card')
    await saveAs('카드')

    expect(fake.created.map((body) => body.nodes.map((node) => node.id))).toEqual([['n-box']])
    expect(fake.created[0]!.nodes[0]!.children).toEqual([{ id: 'n-b', type: 'Text' }])
  })

  it('뿌리 줄의 `…` 에는 «모듈로 저장…»이 없다 — 다른 줄에는 있다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    expect(queryRowAction(region(), '모듈로 저장…', rowOf('Page'))).toBeNull()
    expect(queryRowAction(region(), '모듈로 저장…', rowOf('Card'))).not.toBeNull()
  })
})

/**
 * **스토어의 고르기가 이미 조상 · 자손을 바깥 것으로 접고 문서 차례로 둔다** — 그래서 위 화면 판은 이 함수의 정규화에 닿지 않는다(변조로 쟀다).
 * 이 함수는 선택이 어디서 왔든(다른 입구 · 다음 차수의 고르기) 담을 것을 스스로 정하는 마지막 자리라 순수 판으로 잰다.
 */
describe('moduleSelection — 담을 노드를 스스로 정한다', () => {
  it('문서 차례다 — 고른 차례가 아니다', () => {
    expect(moduleSelection(doc(), ['n-out', 'n-box']).map((node) => node.id)).toEqual(['n-box', 'n-out'])
  })

  it('조상과 자손을 함께 주면 조상만 · 자손이 먼저 와도 같다', () => {
    expect(moduleSelection(doc(), ['n-b', 'n-box']).map((node) => node.id)).toEqual(['n-box'])
  })

  it('뿌리 · 문서에 없는 id 는 뺀다 — 뿌리만이면 빈 목록', () => {
    expect(moduleSelection(doc(), ['n-root'])).toEqual([])
    expect(moduleSelection(doc(), ['n-root', 'n-gone', 'n-out']).map((node) => node.id)).toEqual(['n-out'])
  })
})

describe('저장 본문 — 밖을 가리키는 상호작용 · marker 를 걷는다 (Review Focus 5)', () => {
  it('묶음 밖을 가리키는 동작 수를 상자가 말하고 · 저장한 nodes 에 그 동작과 marker 가 없다 · 안을 가리키는 동작은 남는다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    fireEvent.click(within(rowOf('Button')).getByRole('button', { name: structureRowName('Button') }))
    fireEvent.click(within(rowOf('Card')).getByRole('button', { name: structureRowName('Card') }), { ctrlKey: true })

    openSave('Card')

    expect(
      within(dialog()).getByText('노드 3개를 모듈로 저장합니다. 모듈 밖을 가리키는 상호작용 동작 1개는 빼고 저장합니다.'),
    ).not.toBeNull()
    await saveAs('여닫기')
    const [opener] = fake.created[0]!.nodes
    expect('marker' in opener!).toBe(false)
    expect(opener!.interactions).toEqual([{ on: 'click', actions: [{ type: 'setVisible', target: 'n-box', value: true }] }])
  })

  it('뺄 것이 없으면 문장에 뺀 수가 없다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    openSave('Card')
    expect(within(dialog()).getByText('노드 2개를 모듈로 저장합니다.')).not.toBeNull()
  })
})

describe('이름 칸', () => {
  it('비면 저장이 꺼지고 아무것도 안 나간다 · 칸에 친 뒤 지우면 까닭을 말한다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    openSave('Card')

    expect(saveButton().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(saveButton())
    fireEvent.change(nameInput(), { target: { value: '   ' } })
    expect(within(dialog()).getByText('이름을 입력하세요')).not.toBeNull()
    fireEvent.submit(nameInput())
    await act(async () => {})
    expect(fake.created).toEqual([])
  })

  it(`${MODULE_NAME_MAX}자를 넘으면 까닭을 말하고 안 나간다 · ${MODULE_NAME_MAX}자는 나간다`, async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    openSave('Card')

    fireEvent.change(nameInput(), { target: { value: '가'.repeat(MODULE_NAME_MAX + 1) } })
    expect(within(dialog()).getByText(`이름은 ${MODULE_NAME_MAX}자 이하여야 합니다`)).not.toBeNull()
    fireEvent.click(saveButton())
    await act(async () => {})
    expect(fake.created).toEqual([])

    await saveAs('가'.repeat(MODULE_NAME_MAX))
    expect(fake.created.map((body) => body.name.length)).toEqual([MODULE_NAME_MAX])
  })

  it('앞뒤 공백을 떼고 보낸다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    openSave('Card')
    await saveAs('  카드 묶음  ')
    expect(fake.created.map((body) => body.name)).toEqual(['카드 묶음'])
  })
})

describe('저장할 곳', () => {
  it('고르기는 «개인 모듈» · «프로젝트 모듈» 이고 기본값은 개인 — 그대로 저장하면 개인, 프로젝트를 고르면 프로젝트로 간다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    openSave('Card')
    expect(targetChoices()).toEqual([
      ['개인 모듈', true],
      ['프로젝트 모듈', false],
    ])
    await saveAs('내 것')
    openSave('Card')
    fireEvent.click(within(dialog()).getByRole('radio', { name: '프로젝트 모듈' }))
    await saveAs('함께')
    expect({ targets: fake.targets, names: fake.created.map((body) => body.name) }).toEqual({
      targets: ['personal', 'project'],
      names: ['내 것', '함께'],
    })
    expect(savedModuleNotice('내 것', 'personal')).toBe("개인 모듈 '내 것'을(를) 저장했습니다. 하단 판의 «모듈» 탭에 섭니다.")
  })

  it('viewer — 줄 `…` 에 «모듈로 저장…» 한 항목만 서고, 고르기에 개인 하나 · 개인으로 저장된다 · 뿌리 줄에는 없다', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: { ...fake.api, ...AS_VIEWER } })
    await waitFor(() => expect(queryRowAction(region(), '모듈로 저장…', rowOf('Card'))).not.toBeNull())
    expect(queryRowAction(region(), '모듈로 저장…', rowOf('Page'))).toBeNull()
    expect(rowReasons(region(), rowOf('Card'))).toEqual({ '모듈로 저장…': null })
    openSave('Card')
    expect(targetChoices()).toEqual([['개인 모듈', true]])
    await saveAs('베라의 것')
    expect(fake.targets).toEqual(['personal'])
  })
})

describe('저장 뒤', () => {
  it('상자가 닫히고 하단 판 «모듈» 탭이 그 목록을 다시 읽어 그 카드가 선다 — 개인 · 프로젝트', async () => {
    const fake = server()
    await openPage(doc(), { apiOverrides: fake.api })
    fireEvent.click(within(screen.getByRole('contentinfo', { name: '하단 바' })).getByRole('button', { name: '컴포넌트' }))
    const palette = screen.getByRole('region', { name: '컴포넌트 목록' })
    fireEvent.click(within(within(palette).getByRole('tablist', { name: '목록 종류' })).getByRole('tab', { name: '모듈' }))
    await act(async () => {})
    const before = fake.lists()

    openSave('Card')
    await saveAs('카드 묶음')
    expect(screen.queryByRole('dialog', { name: '모듈로 저장…' })).toBeNull()
    await waitFor(() => expect(fake.lists()).toEqual({ project: before.project, personal: before.personal + 1 }))
    expect(within(within(palette).getByRole('region', { name: '개인 모듈' })).getByText('카드 묶음')).not.toBeNull()

    openSave('Card')
    fireEvent.click(within(dialog()).getByRole('radio', { name: '프로젝트 모듈' }))
    await saveAs('함께 쓸 묶음')
    await waitFor(() => expect(fake.lists()).toEqual({ project: before.project + 1, personal: before.personal + 1 }))
    expect(within(within(palette).getByRole('region', { name: '프로젝트 모듈' })).getByText('함께 쓸 묶음')).not.toBeNull()
  })

  it('서버가 거절하면 상자 안에 그 문장을 세우고 상자는 남는다', async () => {
    const fake = server(new ApiError(422, 'validation-failed', 'Page는 루트에만 둘 수 있습니다'))
    await openPage(doc(), { apiOverrides: fake.api })
    openSave('Card')
    await saveAs('카드')

    expect(within(dialog()).getByRole('alert').textContent).toBe('Page는 루트에만 둘 수 있습니다')
    expect(nameInput().value).toBe('카드')
  })
})
