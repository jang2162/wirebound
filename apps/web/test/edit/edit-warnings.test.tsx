/**
 * **서버가 편집 응답에 실어 보낸 문서 경고를 화면이 읽는가.**
 *
 * ## 이 파일이 닫는 것
 *
 * `PatchResult`의 `warnings` 키와, 그것을 읽어 페이지 편집 경고로 그리는 화면. 저작 화면의
 * 자기 검증은 여기 범위가 아니다.
 *
 * **읽지 않으면 끊긴 타겟이 보이지 않는다.** 상호작용 이슈 셋이 전부 `warning`이라
 * (`error`면 타겟이 된 노드를 지우는 편집이 422가 된다) **끊긴 타겟이 문서에 남은 채
 * 저장되고, 화면이 `warnings`를 안 그리면 아무도 그것을 볼 수 없다.**
 *
 * ## 여기가 재지 않는 것
 *
 * **서버가 `warnings`를 싣는다는 사실**은 api 쪽이 잰다(`apps/api`의 `withWarnings`).
 * 이 파일은 **그것이 왔을 때 화면이 무엇을 하는가**만 본다 — 가짜 `patchOps`가 그 응답을
 * 흉내 낸다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ValidationIssue } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDoc, requireNode } from '../editor-harness'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-btn', type: 'Button', props: { label: '검색' } },
    { id: 'n-list', type: 'DataGrid', props: {} },
  ],
})

function issue(message: string, path = '/root/children/0/interactions/0/actions/0'): ValidationIssue {
  return { code: 'missing-interaction-target', severity: 'warning', nodeId: 'n-btn', path, message }
}

/** 편집 응답 하나. `warnings`를 주지 않으면 **키 자체가 없다**(서버의 관례). */
function patchResult(warnings?: ValidationIssue[]): PatchResult {
  return {
    seq: HEAD_SEQ + 1,
    revisionId: 'rev-1',
    inverse: [],
    schemaVersion: DOC.version,
    ...(warnings === undefined ? {} : { warnings }),
  }
}

/**
 * 노드를 골라 속성 하나를 고친다 — 편집 하나를 서버로 보내는 가장 짧은 길이다.
 *
 * **값을 인자로 받는 것이 중요하다.** 같은 값을 두 번 넣으면 `TextControl`이 커밋하지
 * 않아 두 번째 편집이 나가지 않는다(실측: 같은 값으로 두 번 부르면 `warnings`가 첫
 * 응답의 것에서 바뀌지 않는다).
 */
async function editSomething(value: string): Promise<void> {
  fireEvent.click(requireNode('n-btn'))
  const label = await screen.findByLabelText('라벨')
  fireEvent.change(label, { target: { value } })
  fireEvent.blur(label)
}

/** 화면에 뜬 경고 줄들. */
function warnings(): string[] {
  return [...document.body.querySelectorAll('.wb-shell-edit-warnings-item')].map((item) => item.textContent ?? '')
}

describe('편집 응답의 warnings', () => {
  it('경고가 오면 화면에 그린다 — 여기가 그 이슈들이 사람에게 닿는 첫 자리다', async () => {
    await openPage(DOC, {
      apiOverrides: {
        patchOps: async () => patchResult([issue('setProp의 타겟 노드가 문서에 없습니다: n-gone')]),
      },
    })

    await editSomething('조회')

    await waitFor(() => expect(warnings()).toEqual(['setProp의 타겟 노드가 문서에 없습니다: n-gone']))
    // 몇 개인지 먼저 말한다 — 목록만 있으면 그것이 무엇인지 알 수 없다.
    expect(screen.getByText('저장했지만 문서에 경고 1개가 있습니다')).toBeTruthy()
  })

  it('실패가 아니다 — role이 alert이 아니라 status다', async () => {
    await openPage(DOC, {
      apiOverrides: { patchOps: async () => patchResult([issue('경고 하나')]) },
    })

    await editSomething('조회')

    await waitFor(() => expect(warnings()).toHaveLength(1))
    const box = document.body.querySelector('.wb-shell-edit-warnings')
    expect(box?.getAttribute('role')).toBe('status')
    // 편집 실패 통지 자리는 비어 있다 — 저장은 성공했다.
    expect(document.body.querySelector('.wb-shell-edit-alert')).toBeNull()
  })

  it('경고가 없으면 아무것도 그리지 않는다', async () => {
    await openPage(DOC, { apiOverrides: { patchOps: async () => patchResult() } })

    await editSomething('조회')

    await waitFor(() => expect(document.body.querySelector('.wb-shell-edit-warnings')).toBeNull())
  })

  it('다음 편집이 경고를 갈아 끼운다 — 쌓지 않는다', async () => {
    let call = 0
    await openPage(DOC, {
      apiOverrides: {
        patchOps: async () => {
          call += 1
          return call === 1 ? patchResult([issue('첫 경고')]) : patchResult([issue('둘째 경고')])
        },
      },
    })

    await editSomething('조회')
    await waitFor(() => expect(warnings()).toEqual(['첫 경고']))
    await editSomething('찾기')

    // **누적하면 이미 고친 경고가 화면에 남는다.** 서버가 보내는 것은 *"이 편집 뒤 문서에
    // 남은 경고 전부"*다.
    await waitFor(() => expect(warnings()).toEqual(['둘째 경고']))
  })

  it('경고가 사라지면 화면에서도 사라진다 — 그것이 고쳤다는 신호다', async () => {
    let call = 0
    await openPage(DOC, {
      apiOverrides: {
        patchOps: async () => {
          call += 1
          return call === 1 ? patchResult([issue('첫 경고')]) : patchResult([])
        },
      },
    })

    await editSomething('조회')
    await waitFor(() => expect(warnings()).toEqual(['첫 경고']))

    await editSomething('찾기')

    await waitFor(() => expect(document.body.querySelector('.wb-shell-edit-warnings')).toBeNull())
  })

  /**
   * **배열이 아닌 `warnings`를 막는 것은 여기가 아니다.** 이 파일의 가짜 `ApiClient`는
   * `http-client`를 지나지 않으므로 응답 검사가 걸리지 않는다 — 심으면 그 값이 그대로
   * 스토어를 지나 `.map`에서 던진다(`TypeError: warnings.map is not a function`, 렌더 도중).
   * **그 가드를 재는 자리는 `test/api/http-client.test.ts`의
   * `warnings가 배열이 아니면 막는다`다.**
   */
})
