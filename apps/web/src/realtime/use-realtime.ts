/**
 * 프레임을 스토어로 옮기는 자리. **보내는 쪽도 이 연결이다** — 편집이 이 연결로 나가고
 * (`realtime/edit-channel.ts`) 그 답이 `patch-ack`/`patch-error`로 돌아온다.
 *
 * # 무엇을 하는가
 *
 * | 프레임 | 하는 일 |
 * |---|---|
 * | `joined` | 연결 id를 홀더에 넣는다 — REST로 나가는 편집이 그것을 헤더로 실어 **자기 편집을 되받지 않는다**(설계서 「LLM 편집 경로」의 MCP 경로가 남는다) |
 * | `page-changed` | `store.applyRemoteChange` — 얹거나, **내 pending 위에 리베이스하거나**, 갈라졌다고 말한다 |
 * | `page-stale` | `store.markPageStale` — 그 페이지가 서버에서 바뀌었는데 번호 프레임은 안 온다. 얹을 `ops`가 없다. `seq` 는 힌트라 비교에만 쓴다 |
 * | `restored` | `store.markRestored` — 판이 통째로 갈렸다. 얹을 `ops`가 없다 |
 * | `patch-ack`·`patch-error` | 채널에 넘긴다 — 내가 낸 편집의 답이다 |
 * | `locks` | `store.setLocks` — 설계서 「소프트 잠금」의 배지와 선택 차단이 이 목록 위에 선다. **잠금 통로는 이 목록을 안 본다** — 내 `lock`이 섰는지는 서버가 거절로 말한다(아래 줄) |
 * | `lock-denied` | 잠금 통로의 `denied` — 서버가 내 `lock`을 받지 않았다. 그 자리는 «잡지 않은 선택»이 된다(`lock-channel.ts`) |
 * | `membership-changed` | `onMembership('changed')` — 셸이 프로젝트를 다시 읽는다(역할이 바뀌었거나 멤버에서 빠졌다) |
 * | `menu-changed` | `onMenuChanged(rev)` — 셸이 본 가장 큰 번호를 메뉴 트리 칸에 넘긴다(`tree/use-tree-commands.tsx`의 `remoteRev`) |
 * | `joined` | 연결 id 를 홀더에 · `onMembership('joined')` — 아래 «룸에 든 순간이 경계다» |
 * | `presence`·`pong` | 아무것도 안 한다 |
 *
 * **`projectId`가 룸이다.** 페이지를 옮겨도 연결은 그대로다 — 페이지마다 다시 붙으면
 * 페이지를 옮기는 동안 남의 변경을 놓친다.
 *
 * # 다시 붙은 것 자체가 재조회 신호다
 *
 * `onResync`는 **두 번째 이후의 `'open'`**에 불린다. 근거: 끊긴 동안의 프레임은 어차피
 * 사라졌으므로 갭을 기다리는 것보다 빠르다. **그리고
 * 갭은 편집을 내야만 수렴한다** — 아무것도 안 내고 보고만 있는 사람의 화면은 스스로
 * 맞춰지지 않는다. 다시 읽는 **자리**는 여기가 아니라 `routes/editor.tsx`다(`loadPage`를
 * 부르는 경로를 둘로 만들지 않는다).
 *
 * # 쿠키가 바뀌면 다시 붙는다
 *
 * 다른 탭이 **같은 사람으로 다시 들어오면**(옛 세션은 산다) 이 탭의 HTTP 는 새 세션, WS 는 옛 세션이다. 서버의 방송은
 * 요청과 같은 세션의 연결만 빼므로(`apps/api/src/ws/broadcast.ts`의 `sentBy`) **자기 방송을 되받는다** — 복원이면
 * 본인의 복원에 복원 배너가 선다(Chrome). 세션이 그것을 알리면(`useSessionRenewal` —
 * `session/session-context.tsx`의 «탭 사이») 옛 소켓을 버리고 곧바로 다시 붙는다(`connection.ts`의 `reconnect`). 끊긴
 * 것과 같은 길이라 **두 번째 `'open'`이 다시 읽는다** — 버린 소켓과 새 소켓 사이의 프레임은 사라진다. **대가도
 * 끊긴 것과 같다** — 다시 읽기가 되돌리기 이력을 비우면 그렇다고 말한다(`routes/editor.tsx`의 `resyncNotice`).
 *
 * **옛 소켓으로 답을 기다리던 편집은 «답을 못 받았다»로 끝난다.** 그 소켓은 열려 있었으므로 편집은 **이미 서버에
 * 닿았다** — «취소됐다»고 하면 서버는 그것을 커밋하고 새 연결이 방송해 화면에도 선다(Chrome — 행 잠금으로 답을
 * 붙잡아 재현한다). 믿고 다시 하면 두 번 선다. 끊긴 연결(`failInFlight`)도 같은 판정이고 까닭만 다르다 — 그래서 버리기
 * 전에 `abandonInFlight`로 끝내 까닭(«다른 탭에서 다시 로그인해»)을 싣고, 편집 경로가 «반영됐는지 모른다»를 말한다
 * (`edit/use-edit-commit.tsx`의 `unknownNotice` — 꼬리는 그때 새 연결이 열려 있는지로 갈린다). 새 연결이 붙으면 화면은 저절로 맞춰진다: 붙은 뒤의 커밋은
 * 방송으로 오고(방송이 빼는 것은 보낸 연결 하나다 — 새 연결은 id 가 달라 안 빠진다, `apps/api/src/ws/broadcast.ts`의
 * `sentBy`), 그 전의 커밋은 두 번째 `'open'`의 다시 읽기가 가져온다.
 *
 * **새 소켓을 먼저 붙이고 옛 것은 답을 받은 뒤 닫는 겹침은 짓지 않는다.** 겹치면 답은 받지만 그것으로 끝나지 않는다 —
 * 새 소켓의 두 번째 `'open'`이 다시 읽기(`loadPage`)로 기다리던 편집을 큐째 버리므로 늦게 온 답은 모르는 편집의
 * 답이 되고(`ackEdit`의 가드), 그것을 피하려면 다시 읽기를 옛 소켓이 정리될 때까지 미뤄야 한다. 옛 소켓의
 * 하트비트·잠금·프레임 중복도 따로 다뤄야 하고, 답이 끝내 안 오는 판(시간 제한)은 결국 «모른다»로 끝난다 — 겹침은
 * 이 문장을 없애지 못하고 그 위에 얹힐 뿐이다. 방아쇠도 드물다(다른 탭이 로그인 화면을 거쳐 같은 사람으로 다시
 * 들어오는 그 순간 이 탭에 답을 기다리는 편집이 있다).
 */
import { useEffect, useRef } from 'react'
import { openRealtime } from './connection'
import { useRealtimeSetup } from './context'
import { realtimeUrl, type ServerFrame } from './protocol'
import { useKnownUserHolder } from '../api/known-user'
import { deniedSelectionNotice } from '../panels/toolbar-status'
import { useSessionRenewal } from '../session/session-context'
import { LOSS_RANK } from '../store/loss-notice'
import { useEditorStoreInstance } from '../store/use-editor-store'

/**
 * 리베이스가 얹지 못해 버린 편집을 말하는 문장(설계서 「개인 undo/redo」의 *"적용 불가"*와 같은 성질).
 *
 * **에러가 아니다 — 그래도 말한다.** 남이 그 자리를 지웠으면 내 편집이 얹히지 않는 것이
 * 당연하지만, 사용자가 친 값이 사라졌다는 사실은 남는다. 자리는 편집 실패와 같은 통지
 * 하나를 쓴다 — 사용자가 낸 편집의 운명이라는 점이 같다.
 */
function droppedNotice(dropped: number): string {
  return `다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 ${dropped}개를 버렸습니다.`
}

/**
 * 프로젝트 룸에 붙어 있는다. **Provider가 없으면 아무것도 안 한다**(`context.tsx`의 머리말).
 *
 * 정리 함수가 `close()`를 부르는 것이 계약이다 — 안 부르면 프로젝트를 옮길 때마다 연결이
 * 하나씩 쌓이고, 그 연결들이 각자 재연결을 건다.
 */
/**
 * 셸이 역할을 **다시 읽어야 하는** 순간. 다시 읽는 **자리**는 여기가 아니라 셸이다(`routes/editor.tsx` — 역할을 읽는
 * 곳이 거기 하나다).
 *
 * | 값 | 언제 | 왜 |
 * |---|---|---|
 * | `changed` | `membership-changed`를 받았다 | 서버가 «네 멤버십이 바뀌었다»고 말했다 |
 * | `joined` | 룸에 들었다(`joined` — 처음이든 다시 붙은 것이든) | **이 순간부터의 변경만 신호로 온다**(서버의 `notifyMembershipChanged`는 룸에 든 연결에만 보낸다). 첫 조회의 답과 이 순간 사이에 커밋된 변경은 누구도 안 알린다 — 여기서 한 번 읽어야 닿는다 |
 * | `refused` | 연결이 **열리지 못하고** 닫혔다(핸드셰이크 거절 — 멤버에서 빠졌으면 가드가 404 다) | 제거가 위 창에 끼면 `joined`가 영영 안 온다 — 재연결만 되풀이된다(Chrome). 브라우저는 거절의 HTTP 상태를 안 보여 주므로(닫힘 코드 1006) 셸이 조회로 묻는다 |
 */
export type MembershipCause = 'changed' | 'joined' | 'refused'

export function useRealtime(
  projectId: string | undefined,
  onResync?: () => void,
  /** 역할을 다시 읽을 순간(`MembershipCause`). `onResync`와 같은 배치다. */
  onMembership?: (cause: MembershipCause) => void,
  /** 테마 바인딩 · 토큰이 바뀌었다(`theme-changed`). 받는 것은 셸의 프로젝트 테마다(`theme/project-theme.tsx` 의 `applyFrame`). */
  onThemeChanged?: (frame: Extract<ServerFrame, { type: 'theme-changed' }>) => void,
  /** 메뉴 · 페이지 트리가 그 번호의 판으로 바뀌었다(`menu-changed`). `onThemeChanged`와 같은 배치다(ref 로 쥔다). */
  onMenuChanged?: (rev: number) => void,
  /** 공통코드 표를 다시 읽을 때(`codes-changed` · 다시 붙음 — 끊긴 동안의 프레임은 사라졌다). 받는 것은 셸의 표다(`codes/project-codes.tsx`). */
  onCodesChanged?: () => void,
): void {
  const store = useEditorStoreInstance()
  const setup = useRealtimeSetup()
  const onRenewal = useSessionRenewal()
  // **이 탭이 아는 사용자를 핸드셰이크에 싣는다**(`api/known-user.tsx`). 없으면(화면 테스트) 싣지 않는다.
  const knownUser = useKnownUserHolder()
  // 테마 프레임의 받는 쪽은 ref 로 쥔다 — 연결의 의존에 넣으면 받는 쪽이 새로 설 때마다 룸을 다시 연다.
  const themeChanged = useRef(onThemeChanged)
  themeChanged.current = onThemeChanged
  const menuChanged = useRef(onMenuChanged)
  menuChanged.current = onMenuChanged
  const codesChanged = useRef(onCodesChanged)
  codesChanged.current = onCodesChanged

  useEffect(() => {
    if (!setup || !projectId) return

    /**
     * 이 이펙트가 붙은 뒤 `open`을 한 번이라도 지났는가. `onStatus`가 두 번째 `'open'`인지는
     * 알 수 있다: 상태 콜백은 이 클로저 안이고,
     * 클로저는 연결과 수명이 같다(정리 함수가 `close()`를 부른다).
     *
     * **첫 `'open'`에 다시 읽지 않는 것이 요점이다.** 그때는 `loadPage`가 방금 서버 문서를
     * 놓았으므로 읽을 것이 없다. (**역할은 다르다** — 첫 조회와 룸 참가 사이의 변경은 신호가 없어 `joined`에서 한 번
     * 읽는다. `MembershipCause`.)
     */
    let opened = false
    /**
     * 지금 시도 중인 연결이 `open`을 지났는가. **`opened`와 다르다** — 저쪽은 이 이펙트 동안 한 번이라도, 이쪽은 **이번
     * 시도가.** 열리지 못하고 닫혔으면 핸드셰이크가 거절됐거나 닿지 못했다(`MembershipCause`의 `refused`).
     */
    let attemptOpened = false

    const origin = setup.origin ?? globalThis.location?.origin ?? ''
    const connection = openRealtime({
      ...setup.connection,
      url: realtimeUrl(origin, projectId, knownUser?.get()),
      onFrame: (frame) => {
        switch (frame.type) {
          case 'joined':
            setup.holder.set(frame.connectionId)
            // **룸에 든 순간이 경계다**(`MembershipCause`의 `joined`). `frame.role`은 읽지 않는다 — 역할의 출처는
            // 셸의 `getProject` 하나다(`protocol.ts`의 `joined` 주석).
            onMembership?.('joined')
            break
          case 'page-changed': {
            const change = store.applyRemoteChange(frame.pageId, {
              seq: frame.seq,
              ops: frame.ops,
              warnings: frame.warnings,
              ...(frame.clientOpId === undefined ? {} : { clientOpId: frame.clientOpId }),
            })
            // **리베이스가 버린 편집을 말한다**(「개인 undo/redo」의 *"적용 불가"*와 같은 성질).
            // 스토어는 무엇이 버려졌는지만 돌려주고 문안은 여기서 만든다 — `startUndo`의
            // `skipped`를 화면이 문장으로 바꾸는 것과 같은 배치다.
            // 앞 잃음을 덮지 않고 잇는다(`EditorStore.tellLoss`) — 버림이 거듭되면 수를 더한다.
            if (change.dropped.length > 0) {
              store.tellLoss({
                key: 'dropped',
                rank: LOSS_RANK.cancelled,
                counts: [change.dropped.length],
                render: ([count]) => droppedNotice(count ?? 0),
              })
            }
            break
          }
          case 'page-stale':
            store.markPageStale(frame.pageId, frame.seq)
            // 늦게 커밋된 쓰기가 코멘트 게시 · 삭제였을 수 있다 — 목록에는 따로 오는 신호가 없다(서버 `routes/comments.ts`의 `runWrite`).
            setup.comments?.emit(frame.pageId)
            break
          case 'comments-changed':
            setup.comments?.emit(frame.pageId)
            break
          case 'restored':
            store.markRestored(frame)
            break
          case 'membership-changed':
            onMembership?.('changed')
            break
          case 'theme-changed':
            themeChanged.current?.(frame)
            break
          case 'menu-changed':
            menuChanged.current?.(frame.rev)
            break
          case 'codes-changed':
            codesChanged.current?.()
            break
          case 'locks':
            // **프로젝트 전체의 목록이다.** 어느 페이지의 것인지는 스토어가 `openPageId`로
            // 거른다(`lockedBy`) — 여기서 거르면 페이지를 옮길 때 목록이 낡는다.
            store.setLocks(frame.locks)
            break
          case 'lock-denied': {
            // **서버가 판정했다.** 목록으로 «내 것이 섰나»를 추정하지 않는다 — 목록은 거꾸로 닿을 수 있어 추정하면
            // 거짓 잃음을 낸다(`lock-channel.ts`의 머리말).
            // 거절은 그 `lock` 프레임과 짝짓는다(`lockId` — `lock-channel.ts`의 그 절).
            const refused = setup.lockChannel?.denied(frame.pageId, frame.nodeIds, frame.lockId) ?? []
            if (refused.length > 0) {
              // **일부 거절 — 그 노드만 선택에서 뺀다**(`lock-channel.ts`의 표). 누가 쥐었는지는 `locks` 목록에서 읽는다(이 프레임은
              // 이름을 안 싣는다 — 출처 하나). 목록이 아직 안 닿았으면 이름 없이 말한다. 잃음 통지는 덮지 않는다.
              const names = [...new Set(refused.map((id) => store.lockedBy(id)?.userName).filter((name) => name !== undefined))]
              store.dropFromSelection(refused)
              if (!store.showsLoss()) store.setEditFailure({ kind: 'message', message: deniedSelectionNotice(names) })
            }
            break
          }
          case 'patch-ack':
          case 'patch-error':
            // **내가 낸 편집의 답이다.** 짝짓는 것은 채널이 한다 — 여기서 하면 *"어느 ack가
            // 내 것인가"*가 이 파일과 전송 경로 두 곳에 생긴다.
            setup.channel?.deliver(frame)
            break
          default:
            break
        }
      },
      onStatus: (status) => {
        if (status === 'connecting') {
          attemptOpened = false
          return
        }
        if (status === 'open') {
          attemptOpened = true
          // **잡고 있던 자리를 다시 알린다**(「소프트 잠금」). 끊기면 서버가 놓았고, 화면의 선택은 그
          // 사이 바뀌지 않았으므로 *"선택이 바뀔 때 보낸다"*만으로는 아무것도 안 나간다 —
          // 사용자는 노드를 고른 채인데 남의 화면에서 배지가 사라진다. 첫 `'open'`에서는
          // 잡은 것이 없어 아무 일도 안 일어난다. 그 사이 남이 잡았으면 서버가 거절한다(`lock-denied`). **잡지 않은 선택은
          // 잡지 않는다**(`reannounce`).
          setup.lockChannel?.reannounce()
          // **다시 붙은 것이 두 번째 이상이면 페이지를 다시 읽어야 한다.** 끊긴 동안 남이
          // 낸 편집의 프레임은 사라졌고, 그것을 갭으로 알아채려면 **누군가 다음 편집을 내야
          // 한다** — 보고만 있는 사람은 스스로 수렴하지 않는다.
          if (opened) {
            onResync?.()
            // 끊긴 동안의 `comments-changed`도 사라졌다 — 열린 목록을 다시 읽힌다.
            setup.comments?.emit()
            // `codes-changed`도 — 표를 다시 읽는다.
            codesChanged.current?.()
          }
          opened = true
          return
        }
        // **열리지 못하고 닫혔다** — 핸드셰이크 거절일 수 있다(`MembershipCause`의 `refused`). 서버가 죽은 판도 여기 오므로
        // 재연결마다(백오프 — 끝 값 10초) 조회가 하나씩 는다. 그 실패는 셸이 조용히 넘긴다.
        if (!attemptOpened) onMembership?.('refused')
        // **끊긴 연결의 id를 홀더에 남기지 않는다.** 다시 붙어 새 id를 받기 전까지 **낡은 값**을
        // 싣는 것은 *"내가 그 연결이다"*라는 거짓말이다.
        //
        // **게시의 재전송은 일부러 그 거짓말을 한다** — 첫 보내기의 id 를 잡아 두고 싣는다
        // (`panels/comment-panel.tsx`의 `submit` — 같은 요청이라서). 그 낡은 id 가 **남을** 빼지 않는
        // 것은 홀더가 아니라 서버가 막는다: id 는 무작위라 재기동을 넘어 안 겹치고
        // (`apps/api/src/ws/connection-id.ts`), 방송은 요청과 같은 세션의 연결만 뺀다(`ws/broadcast.ts`의
        // `sentBy`). *"서버가 그 id로 아무도 못 찾으면 무해하다"*는 **같은 프로세스 안에서만**
        // 참이다 — id 가 재기동을 넘어 겹치면 재기동 뒤 옛 id 를 받은 남의 연결이 빠진다.
        setup.holder.set(undefined)
        // 답을 기다리던 편집은 이 연결과 함께 끝났다. 안 끝내면 펌프가 거기 매달려 **다음
        // 편집도 안 나간다**(`realtime/edit-channel.ts`).
        setup.channel?.failInFlight()
      },
    })

    setup.channel?.attach(connection)
    setup.lockChannel?.attach(connection)
    // **쿠키가 바뀌면 다시 붙는다**(위 머리말 «쿠키가 바뀌면»). 답을 기다리던 편집은 **소켓을 버리기 전에**
    // 까닭(`'renewed'`)을 실어 끝낸다 — 버린 뒤의 `'closed'`가 부르는 `failInFlight`는 끊김의 까닭을 싣으므로, 먼저 비워
    // 두지 않으면 그것이 이긴다.
    const stopRenewal = onRenewal?.(() => {
      setup.channel?.abandonInFlight()
      connection.reconnect()
    })

    return () => {
      stopRenewal?.()
      connection.close()
      setup.channel?.detach()
      setup.lockChannel?.detach()
      setup.holder.set(undefined)
    }
  }, [projectId, setup, store, onResync, onRenewal, onMembership])
}
