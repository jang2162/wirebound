/**
 * 우측 패널 실브라우저 판의 픽스처 — 관리자 목록 화면 하나(검색폼 · 그리드 셋 · 화면 상태 하나 · 상호작용 여섯 · 공통코드에 묶인 Select).
 * `right-panel.test.ts` 와 그 후 캡처가 같은 판을 쓴다.
 *
 * | 노드 | 무엇 |
 * |---|---|
 * | `n_sf` SearchForm › `n_f1` Field «과목분류» › `n_sel` Select | 공통코드 `CD_402`(항목 열) 에 묶였고 `402101` 을 골랐다 |
 * | `n_f2` Field «교수법» › `n_sel2` Select | 안 묶인 선택지 셋 |
 * | `n_g1` DataGrid «과목 목록» | 행 고름 → 상태 «등록·수정 폼 열림» · 머리 오른쪽에 `n_reg` «등록» → 같은 상태 |
 * | `n_form` Card «등록·수정 폼»(그 상태에서만) | 안에 `n_g2` «설문» · `n_g3` «교재»(둘 다 행 고름 → 같은 상태) · `n_cancel` «취소» → 기본 상태 |
 */
import type { EditorStack, Session } from './editor-stack'

export const CODE_GROUP = 'CD_402'
export const CODE_ITEMS = Array.from({ length: 10 }, (_, at) => ({
  value: `4021${String(at + 1).padStart(2, '0')}`,
  name: `분류${String(at + 1).padStart(2, '0')}`,
}))
export const FORM_STATE = { id: 's_form', name: '등록·수정 폼 열림' }

const toForm = [{ on: 'select', actions: [{ type: 'setViewState', target: FORM_STATE.id }] }]

function grid(id: string, alias: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'DataGrid',
    alias,
    interactions: toForm,
    zones: { rows: [{ id: `${id}_row`, type: 'GridRow', props: { repeat: 3 } }] },
    children: [
      { id: `${id}_c1`, type: 'GridColumn', props: { label: '이름' } },
      { id: `${id}_c2`, type: 'GridColumn', props: { label: '분류' } },
    ],
    ...extra,
  }
}

function button(id: string, label: string, target: string) {
  return { id, type: 'Button', props: { label }, interactions: [{ on: 'click', actions: [{ type: 'setViewState', target }] }] }
}

export interface RightPanelFixture {
  projectId: string
  pageId: string
  /** 에디터 경로 `/projects/…/pages/…`. */
  path: string
}

/** 프로젝트 · 공통코드 · 페이지를 세운다 — 단계가 실패하면 그 응답을 실어 던진다. */
export async function seedRightPanel(stack: EditorStack, owner: Session, slug: string): Promise<RightPanelFixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string) => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(await call('POST', '/projects', { name: 'SKALA LMS 관리자', slug: `${slug}-${Date.now().toString(36)}` }), '프로젝트')
  const base = `/projects/${project.id}`
  ok(await call('POST', `${base}/codes`, { key: CODE_GROUP, name: '과목 분류' }), '코드 그룹')
  for (const item of CODE_ITEMS) ok(await call('POST', `${base}/codes/${CODE_GROUP}/items`, item), `코드 ${item.value}`)
  const menu = ok(await call('POST', `${base}/menu`, { parentId: null, title: '과목관리' }), '메뉴')
  const page = ok(await call('POST', `${base}/pages`, { menuNodeId: menu.id, title: '과목 목록', kind: 'page' }), '페이지')
  const searchForm = {
    id: 'n_sf',
    type: 'SearchForm',
    children: [
      {
        id: 'n_f1',
        type: 'Field',
        props: { label: '과목분류' },
        children: [
          {
            id: 'n_sel',
            type: 'Select',
            props: {
              placeholder: '== 전체 ==',
              options: CODE_ITEMS.map((item, at) => ({ label: item.name, ...(at === 0 ? { selected: true } : {}) })),
            },
            code: { group: CODE_GROUP, selected: [CODE_ITEMS[0]!.value] },
          },
        ],
      },
      {
        id: 'n_f2',
        type: 'Field',
        props: { label: '교수법' },
        children: [{ id: 'n_sel2', type: 'Select', props: { options: [{ label: '강의' }, { label: '실습' }, { label: '토론' }] } }],
      },
    ],
  }
  const ops = [
    { op: 'add', path: '/viewStates', value: [FORM_STATE] },
    { op: 'add', path: '/root/children/0', value: searchForm },
    {
      op: 'add',
      path: '/root/children/1',
      value: grid('n_g1', '과목 목록', {
        zones: { headEnd: [button('n_reg', '등록', FORM_STATE.id)], rows: [{ id: 'n_g1_row', type: 'GridRow', props: { repeat: 3 } }] },
      }),
    },
    {
      op: 'add',
      path: '/root/children/2',
      value: {
        id: 'n_form',
        type: 'Card',
        props: { title: '등록·수정 폼' },
        visibility: { mode: 'only', states: [FORM_STATE.id] },
        children: [grid('n_g2', '설문'), grid('n_g3', '교재'), button('n_cancel', '취소', 'default')],
      },
    },
  ]
  ok(await call('PATCH', `${base}/pages/${page.id}/ops`, { baseSeq: 0, ops }), '문서')
  return { projectId: project.id, pageId: page.id, path: `${base}/pages/${page.id}` }
}
