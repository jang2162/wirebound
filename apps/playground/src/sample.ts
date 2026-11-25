import type { PageDocument } from '@wirebound/schema'

export const samplePage: PageDocument = {
  version: 1,
  root: {
    id: 'n_pag000000001',
    type: 'Page',
    children: [
      { id: 'n_pag000000002', type: 'Text', props: { content: '회원 목록', role: 'h1' } },
      {
        id: 'n_pag000000003',
        type: 'SearchForm',
        marker: 1,
        children: [
          {
            id: 'n_pag000000004',
            type: 'Field',
            props: { label: '아이디' },
            children: [{ id: 'n_pag000000041', type: 'Input' }],
          },
          {
            id: 'n_pag000000005',
            type: 'Field',
            props: { label: '가입일' },
            children: [
              { id: 'n_pag000000051', type: 'DateInput' },
              { id: 'n_pag000000052', type: 'Affix', props: { text: '~' } },
              { id: 'n_pag000000053', type: 'DateInput' },
            ],
          },
        ],
      },
      {
        id: 'n_pag000000006',
        type: 'DataGrid',
        marker: 2,
        props: { select: 'check' },
        children: [
          { id: 'n_pag000000060', type: 'GridColumn', props: { label: 'No', numbering: 'desc', align: 'center', size: 'short' } },
          {
            id: 'n_pag000000061',
            type: 'GridColumn',
            props: { label: '아이디' },
            children: [{ id: 'n_pag000000065', type: 'Text', props: { content: 'hong01' } }],
          },
          {
            id: 'n_pag000000062',
            type: 'GridColumn',
            props: { label: '이름' },
            children: [{ id: 'n_pag000000066', type: 'Text', props: { content: '홍길동' } }],
          },
          {
            id: 'n_pag000000063',
            type: 'GridColumn',
            props: { label: '상태' },
            children: [{ id: 'n_pag000000067', type: 'Chip', props: {} }],
          },
        ],
        zones: {
          rows: [{ id: 'n_pag000000064', type: 'GridRow', props: { repeat: 5 } }],
          footer: [{ id: 'n_pag000000068', type: 'Pagination', props: { total: 48 } }],
        },
        interactions: [
          {
            on: 'select',
            actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }],
          },
        ],
      },
    ],
  },
}
