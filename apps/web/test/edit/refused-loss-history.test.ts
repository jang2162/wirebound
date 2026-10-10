// @vitest-environment node
/**
 * **되돌리기가 409 로 거절된 수습의 문장**(L-096) — 남의 복원이 미루는 동안 와 내 되돌림이 낡은 `baseSeq` 로 나가 거절되면, 잃은 것은 «편집»
 * 이 아니라 «되돌리기» 다. `PendingEdit.kind` 로 가른다 — 편집만 있는 판의 문장은 옛 그대로다(`test/edit/` 의 기존 문장 케이스가 잰다).
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { refusedLoss } from '../../src/edit/use-edit-commit'
import type { PendingEdit } from '../../src/store/edit-queue'
import { lossMessage, mergeLoss } from '../../src/store/loss-notice'

const edit = (kind: PendingEdit['kind']): PendingEdit => ({ clientOpId: `op-${kind}`, ops: [], baseSeq: 2, kind })
const conflict = new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 2, 현재 3)')
const say = (lost: PendingEdit[]): string => lossMessage([refusedLoss(conflict, conflict.message, lost)])

describe('거절 수습의 문장은 잃은 것이 되돌리기인지 말한다', () => {
  it('편집만이면 옛 문장 그대로', () => {
    expect(say([edit('edit')])).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 2, 현재 3) — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.')
  })

  it('되돌리기만이면 «편집» 이라 말하지 않는다', () => {
    expect(say([edit('undo')])).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 2, 현재 3) — 페이지를 서버 상태로 다시 불러왔고, 되돌리기 · 다시 실행 1개가 취소됐습니다.')
    expect(say([edit('redo')])).toContain('되돌리기 · 다시 실행 1개')
  })

  it('둘이 섞이면 둘 다 센다', () => {
    expect(say([edit('undo'), edit('edit'), edit('edit')])).toContain('편집 2개 · 되돌리기 · 다시 실행 1개가 취소됐습니다')
  })

  it('같은 열쇠의 조각을 합치면 수를 자리마다 더한다', () => {
    const merged = mergeLoss([refusedLoss(conflict, conflict.message, [edit('edit')])], refusedLoss(conflict, conflict.message, [edit('undo')]))
    expect(lossMessage(merged)).toContain('편집 1개 · 되돌리기 · 다시 실행 1개가 취소됐습니다')
  })
})
