// @vitest-environment node
/**
 * **정보 통지 한 칸**(`EditorState.infoNotice`)과 **트리가 닫은 입력 · 상자의 한 줄**(`tellDropped`)의 스토어 규칙. 화면에 서는 것은
 * `shell/info-notice.tsx` 이고 말하는 쪽은 각자 제 테스트가 잰다 — 여기는 스토어가 지키는 것만이다. jsdom 값이 아니라 순수 상태다.
 */
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'

describe('정보 통지는 한 칸이다', () => {
  it('새 통지가 앞의 것을 바꿔 끼운다 — 쌓이지 않는다', () => {
    const store = new EditorStore()
    store.setInfoNotice('하나')
    store.setInfoNotice('둘')
    expect(store.getState().infoNotice).toBe('둘')
  })

  it('실패 자리(editFailure)와 갈라 있다 — 서로 안 치운다', () => {
    const store = new EditorStore()
    store.setEditFailure({ kind: 'message', message: '실패' })
    store.setInfoNotice('정보')
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '실패' })
    store.setEditFailure(null)
    expect(store.getState().infoNotice).toBe('정보')
  })

  it('판을 비우면(페이지를 옮김) 치운다', () => {
    const store = new EditorStore()
    store.setInfoNotice('정보')
    store.clearPage()
    expect(store.getState().infoNotice).toBeNull()
  })

  it('survivesLeave 로 세운 글은 다음 비움 한 번만 넘긴다(L-113 — 열린 페이지까지 지운 연쇄 삭제)', () => {
    const store = new EditorStore()
    store.setInfoNotice('지웠습니다', { survivesLeave: true })
    store.clearPage()
    expect(store.getState().infoNotice).toBe('지웠습니다')
    store.clearPage()
    expect(store.getState().infoNotice).toBeNull()
  })

  it('넘기기로 한 글을 다른 글이 바꿔 끼웠으면 넘기지 않는다', () => {
    const store = new EditorStore()
    store.setInfoNotice('지웠습니다', { survivesLeave: true })
    store.setInfoNotice('다른 정보')
    store.clearPage()
    expect(store.getState().infoNotice).toBeNull()
  })
})

describe('트리가 닫은 입력 · 상자의 한 줄(L-084)', () => {
  it('열린 페이지가 함께 사라져 판을 비워도 한 줄은 한 번 남고 그다음 비움이 치운다', () => {
    const store = new EditorStore()
    store.tellDropped('그 항목이 트리에서 사라져 친 이름을 쓰지 않았습니다')
    store.clearPage()
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '그 항목이 트리에서 사라져 친 이름을 쓰지 않았습니다' })
    store.clearPage()
    expect(store.getState().editFailure).toBeNull()
  })

  it('새 편집이 치운 뒤에는 남지 않는다', () => {
    const store = new EditorStore()
    store.tellDropped('한 줄')
    store.setEditFailure(null)
    store.clearPage()
    expect(store.getState().editFailure).toBeNull()
  })

  it('프로젝트를 옮기는 reset 은 넘기지 않는다', () => {
    const store = new EditorStore()
    store.tellDropped('한 줄')
    store.reset()
    expect(store.getState().editFailure).toBeNull()
  })
})
