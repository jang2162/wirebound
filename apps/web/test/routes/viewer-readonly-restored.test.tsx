/** 새로고침 뒤 되살아나는 초안 칸을 viewer 로 훑는 케이스. 도구는 `./viewer-readonly-harness` 가 갖는다(머리말 · 사각 · 대조의 뜻). */
import { cleanup } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openDraftStore } from '../../src/panels/draft-store'
import { fillDraftsAsEditor, MemoryStorage, RESTORED_SLOTS, storedSlots, sweepEditor } from './viewer-readonly-harness'

describe('viewer 는 에디터에서 쓰기를 내지 않는다', () => {
  /**
   * **새로고침 뒤 되살아나는 칸**(머리말 «사각»의 그 줄을 이 판이 소유한다). editor 때 칸 다섯을 채운 저장소
   * 위에서 viewer 로 다시 연다 — 강등된 사람이 새로고침한 판이다. 되살린 수정 상자가 viewer 에게 서면 «저장»이
   * `PATCH …/comments/:id`를 낸다.
   *
   * 죽는 변조: 코멘트 패널의 `editing`이 역할을 안 본다(`editing = editingId`) — `viewer-entries`의 «되살린 수정 상자»와
   * **함께** 죽는다(그 케이스가 **그리는** 축 — 본문 · 상자 없음 · 다시 editor 면 돌아옴 — 을 소유하고, 이 판은 **요청**을
   * 소유한다). 이 파일과 `viewer-entries`에서 이 판만 죽는 변조: 코멘트 패널이 마운트 때 되살린 멱등 키(`comments/post-keys`)로
   * 게시를 다시 보낸다(그 밖에서는 editor 의 기존 케이스 하나가 함께 죽는다 — `comment-panel.test.tsx`의 «탭·페이지를 오가도
   * 쓰던 말이 제자리에 있다» 묶음의 «… 잠금이 남는다»).
   */
  it('저장소에 editor 때의 초안 칸 다섯을 둔 채 viewer 로 다시 열어 훑어도 HTTP 쓰기 0 · WS 쓰기 프레임 0', async () => {
    const session = new MemoryStorage()
    const shared = new MemoryStorage()
    await fillDraftsAsEditor(
      openDraftStore(
        () => session,
        () => shared,
      ),
    )
    expect(storedSlots(session)).toEqual(RESTORED_SLOTS)
    cleanup()
    // 새로고침 — 같은 저장소 위에 새 문서. 칸은 그대로 있어야 이 판이 무언가를 잰다.
    expect(storedSlots(session)).toEqual(RESTORED_SLOTS)

    const wire = await sweepEditor(
      'viewer',
      openDraftStore(
        () => session,
        () => shared,
      ),
    )
    expect(wire.unrouted).toEqual([])
    expect({ http: [...new Set(wire.http)].sort(), frames: [...new Set(wire.frames)].sort() }).toEqual({
      http: [],
      frames: [],
    })
  }, 300_000)
})
