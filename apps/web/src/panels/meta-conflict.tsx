/**
 * **«다른 사람이 바꿨습니다» 화면 — 페이지 메타(제목 · 설명)에 하나.** 판정은
 * `api/page-meta.ts`가 하고, 이 컴포넌트는 그 결과(`'other'`)를 보이고 둘 중 하나를 고르게 한다:
 *
 * - **«내 글로 덮기»** — 그 사람의 값을 **새 바탕**으로 내 글을 다시 보낸다. 덮는 것은 **지금 보고 있는 값**뿐이다 —
 *   그 사이 또 바뀌었으면 서버가 또 409 를 내고 이 화면이 새 값으로 다시 선다.
 * - **«내 글 버리기»** — 그 사람의 값을 받는다. 초안이 사라진다.
 *
 * **그 사람의 값을 글 그대로 보인다** — 무엇을 덮는지 모르고 덮게 하지 않는다. 비었으면(`null`) 비었다고 적는다.
 * `role="alert"`인 것은 사용자가 방금 누른 저장이 **안 된** 것이라서다(실패 통지와 같은 자리).
 *
 * **판정이 `'late'`면(지금 값이 앞서 보낸 내 글과 같다) 같은 화면이 «다른 사람이 바꿨다»고 말하지 않는다.**
 * 권하는 것은 **덮기**다 — 지금 값은 이 창에서 앞서 보낸 글과 **같은 글자**이고 상자의 글은 그 뒤에 더 친 것이라, 덮어도
 * 잃는 글이 없다. 그래서 덮기가 먼저이고 단추 이름이 «지금 글로 덮기»다. 버리기는 «앞서 보낸 글로 두기»다(그 뒤 더 친
 * 글을 버린다). 덮기가 나가는 바탕은 같다 — 보이는 그 값이다(그 사이 남이 또 바꿨으면 409).
 *
 * **누가 썼는지는 말하지 않는다.** «앞서 보낸 설명이 늦게 저장됐습니다 — 다른 사람이 바꾼 것이 아닙니다»라고 말하면
 * 거짓이 되는 판이 있다 — 다른 사람이 우연히 같은 글을 쓴 판도 같은 값이다(다른 쪽이 같은 글을 커밋하고 내 매달린
 * PATCH 는 409 · 커밋 안 함 → 화면은 «다른 사람이 바꾼 것이 아닙니다»). 이 화면이 아는 것은 **값이 같다**는 것뿐이다 —
 * `'mine'`의 «이미 같습니다»와 같은 한계이고, 같은 방식으로 말한다: «지금 저장된 설명이 앞서 보낸 글과 같습니다».
 *
 * **덮을 내 글이 없으면 덮기를 안 보인다**(`onOverwrite`를 안 준다). 저장을 내 둔 채 옆 페이지를 다녀오면 보낸 글은
 * 떠날 때 버려진다. 결말이 **돌아온 뒤에** 오면 이 화면이 서는데, 거기 «내 글로 덮기»를 두면 눌러도 아무 일이 없다
 * (요청 0 · 통지 변화 0). 그때는 **«확인» 하나**다 — 결말이 **떠나 있는 동안** 온 판(아래 `metaConflictSentence` ·
 * «확인»뿐)과 같은 말이다: 다른 사람이 바꿨다 · 지금 저장된 값 · 확인.
 */
import type { ReactElement } from 'react'

/** 무엇이 바뀌었나 — 문장의 자리 하나. 둘 다 받침으로 끝나 조사가 같다(«…을»). */
export type MetaWhat = '제목' | '설명'

/** 지금 저장된 값을 글 그대로 — 비었으면(`null` · `''`) 비었다고 적는다. 화면과 아래 문장이 같이 쓴다. */
function shown(what: MetaWhat, theirs: string | null): string {
  return theirs === null || theirs === '' ? `(${what} 없음)` : theirs
}

/**
 * **떠나 있는 동안 선 충돌을 한 문장으로.** 쓰기가 끝난 순간 그 페이지를 보는 방문이
 * 없으면 이 화면은 그릴 곳이 없다 — 장부가 이 문장을 남기고 돌아온 방문이 «이 페이지를 떠나 있는 동안 저장하지
 * 못했습니다 — …» 뒤에 붙여 말한다(`panels/pending-notice.tsx`). **뜻은 화면과 같다**(`late`면 «다른 사람»이라 말하지
 * 않는다) · 그 값을 글 그대로 보인다. **단추는 없다** — 보낸 글은 대개 페이지를 옮길 때 이미 버려졌고, 남아
 * 있으면(사이에 연 페이지가 없던 판) 다시 저장할 때 이 화면이 다시 선다.
 */
export function metaConflictSentence(what: MetaWhat, theirs: string | null, late: boolean): string {
  const value = shown(what, theirs)
  return late
    ? `지금 저장된 ${what}이 앞서 보낸 글과 같습니다 · 지금 저장된 ${what}: ${value}`
    : `다른 사람이 이 ${what}을 바꿨습니다 · 지금 저장된 ${what}: ${value}`
}

export function MetaConflict(props: {
  what: MetaWhat
  /** 서버가 견준 그 사람의 값. */
  theirs: string | null
  /** 그 값이 **앞서 보낸 내 글과 같다**(`judgeMeta`의 `'late'`) — «다른 사람이 바꿨다»고 말하지 않는다(누가 썼는지도). */
  late?: boolean
  /** 덮을 내 글이 있을 때만 준다 — 없으면 덮기 · 버리기 대신 «확인» 하나다(머리말). */
  onOverwrite?: () => void
  /** 버리기 — 덮을 글이 없으면 «확인»이 이것을 부른다(통지를 닫는다). */
  onDiscard: () => void
  /** 덮기가 나가 있는 동안 둘 다 끈다. */
  disabled?: boolean
  /** 끈 동안 단추가 드는 이유(`title` · `aria-description`) — 메뉴 트리는 조작이 나가 있는 동안이다(`panels/toolbar-status.ts`의 `BUSY_REASON`). */
  disabledReason?: string
}): ReactElement {
  const { what, theirs } = props
  const late = props.late ?? false
  const off = props.disabled === true
  const reason = off ? props.disabledReason : undefined
  // 꺼진 동안도 포커스는 받는다 — 이유(`aria-description`)에 키보드로 닿는 자리다(`shell/action-menu.tsx` 머리말 «끈 항목은 …»).
  const unless = (run: () => void) => () => {
    if (!off) run()
  }
  return (
    <div className="wb-shell-meta-conflict" role="alert">
      <p className="wb-shell-meta-conflict-lead">
        {late ? `지금 저장된 ${what}이 앞서 보낸 글과 같습니다` : `다른 사람이 이 ${what}을 바꿨습니다`}
      </p>
      <p className="wb-shell-meta-conflict-label">지금 저장된 {what}</p>
      <p className="wb-shell-meta-conflict-theirs">{shown(what, theirs)}</p>
      <div className="wb-shell-meta-conflict-actions">
        {props.onOverwrite === undefined ? (
          <button
            type="button"
            className="wb-shell-meta-conflict-button"
            aria-disabled={off || undefined}
            title={reason}
            aria-description={reason}
            onClick={unless(props.onDiscard)}
          >
            확인
          </button>
        ) : (
          <>
            <button
              type="button"
              className="wb-shell-meta-conflict-button"
              aria-disabled={off || undefined}
              title={reason}
              aria-description={reason}
              onClick={unless(props.onOverwrite)}
            >
              {late ? '지금 글로 덮기' : '내 글로 덮기'}
            </button>
            <button
              type="button"
              className="wb-shell-meta-conflict-button"
              aria-disabled={off || undefined}
              title={reason}
              aria-description={reason}
              onClick={unless(props.onDiscard)}
            >
              {late ? '앞서 보낸 글로 두기' : '내 글 버리기'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
