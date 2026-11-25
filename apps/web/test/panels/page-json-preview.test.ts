/**
 * 미리보기 판정 함수만 **화면 없이** 잰다.
 *
 * # 왜 파일을 따로 두나
 *
 * `page-json.test.tsx`는 `<App />`을 렌더한다. 그러면 캔버스·속성 패널이 함께 마운트되고
 * **그쪽이 `catalog-setup`을 import하므로 카탈로그가 이미 실려 있다.** 그래서 미리보기 모듈
 * (`src/panels/page-json-preview.ts`)의 `import '../catalog-setup'`을 지워도 그 파일에서는 **아무 케이스도 죽지 않는다**.
 * 즉 그 파일로는 *"미리보기가 스스로 카탈로그를 싣는가"*를 **잴 수 없다.**
 *
 * **이 파일은 미리보기 모듈 하나만 import한다.** 그 모듈 그래프에 캔버스가 없으므로, 그 모듈이
 * 스스로 싣지 않으면 카탈로그가 비고 `validatePage`가 **모든 타입을 모르는 타입**으로 보아
 * 멀쩡한 파일이 막힌다. 그 변이가 여기서 죽는다.
 *
 * > **왜 그 import가 필요한가.** 셸에서는 캔버스가 늘 함께 뜨지만 그것은 **셸의 배치**이지
 * > 이 미리보기의 계약이 아니다. 판정 함수가 export되어 있어 화면 없이도 불릴 수 있고
 * > (이 파일이 그 증거다), 그때 카탈로그가 비어 있으면 **미리보기가 멀쩡한 파일을 전부
 * > 막는다** — 화면이 서버보다 엄격해지는 부류 중 가장 나쁜 모양이다.
 */
import { describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION, WIREBOUND_PAGE_VERSION, type PageJson } from '@wirebound/schema'
import { previewPageJson } from '../../src/panels/page-json-preview'

function file(patch: Partial<PageJson> = {}): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: { title: '가져온 목록', description: null },
    schema: {
      version: CURRENT_DOCUMENT_VERSION,
      layout: 'blank',
      root: { id: 'file_root', type: 'Page', children: [{ id: 'file_list', type: 'DataGrid' }] },
    },
    comments: [{ nodeId: 'file_list', body: '가' }],
    ...patch,
  }
}

const text = (value: PageJson | Record<string, unknown>): string => JSON.stringify(value)

describe('미리보기 판정 (화면 없이)', () => {
  it('미리보기 모듈만 import해도 카탈로그가 실려 있다 — 멀쩡한 파일이 ready다', () => {
    // **이 케이스가 `import '../catalog-setup'` 한 줄의 구분력이다.** 그 줄이 없으면
    // `List`가 *"모르는 타입"*이 되어 아래가 `failed`로 뒤집힌다.
    const preview = previewPageJson(text(file()))

    expect(preview.kind).toBe('ready')
  })

  it('빈 글자는 아무 판정도 하지 않는다', () => {
    expect(previewPageJson('   ').kind).toBe('none')
  })

  it('봉투가 아니면 막는다', () => {
    expect(previewPageJson(text({ hello: 1 })).kind).toBe('failed')
  })

  it('문서 버전·카탈로그·중복 id 셋을 막는다 — 서버가 거절하는 그 셋이다', () => {
    const badVersion = previewPageJson(text(file({ schema: { version: 999, root: { id: 'file_root', type: 'Page' } } })))
    const badType = previewPageJson(
      text(
        file({
          schema: {
            version: CURRENT_DOCUMENT_VERSION,
            layout: 'blank',
            root: { id: 'file_root', type: 'Page', children: [{ id: 'file_odd', type: '없는타입' }] },
          },
          comments: [],
        }),
      ),
    )
    const duplicated = previewPageJson(
      text(
        file({
          schema: {
            version: CURRENT_DOCUMENT_VERSION,
            layout: 'blank',
            root: {
              id: 'file_root',
              type: 'Page',
              children: [
                { id: 'same', type: 'DataGrid' },
                { id: 'same', type: 'DataGrid' },
              ],
            },
          },
          comments: [],
        }),
      ),
    )

    expect([badVersion.kind, badType.kind, duplicated.kind]).toEqual(['failed', 'failed', 'failed'])
  })

  it('경고만 있으면 ready이고 경고를 실어 낸다', () => {
    const preview = previewPageJson(
      text(
        file({
          schema: {
            version: CURRENT_DOCUMENT_VERSION,
            layout: 'blank',
            root: {
              id: 'file_root',
              type: 'Page',
              children: [{ id: 'file_text', type: 'Text', props: { content: '이름' }, variant: 'x' }],
            },
          },
          comments: [],
        }),
      ),
    )

    expect(preview.kind).toBe('ready')
    if (preview.kind !== 'ready') return
    expect(preview.warnings.length).toBeGreaterThan(0)
  })
})
