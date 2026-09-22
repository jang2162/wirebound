/**
 * 프레임을 스토어로 옮기는 자리. **P3-2가 보내는 쪽을 얹었다** — 편집이 이 연결로 나가고
 * (`realtime/edit-channel.ts`) 그 답이 `patch-ack`/`patch-error`로 돌아온다.
 *
 * # 무엇을 하는가
 *
 * | 프레임 | 하는 일 |
 * |---|---|
 * | `joined` | 연결 id를 홀더에 넣는다 — REST로 나가는 편집이 그것을 헤더로 실어 **자기 편집을 되받지 않는다**(§7.4의 MCP 경로가 남는다) |
 * | `page-changed` | `store.applyRemoteChange` — 얹거나, **내 pending 위에 리베이스하거나**, 갈라졌다고 말한다 |
 * | `restored` | `store.markRestored` — 판이 통째로 갈렸다. 얹을 `ops`가 없다 |
 * | `patch-ack`·`patch-error` | 채널에 넘긴다 — 내가 낸 편집의 답이다 |
 * | `locks` | `store.setLocks` — §7.2의 배지와 선택 차단이 이 목록 위에 선다 |
 * | `presence`·`pong` | 아무것도 안 한다 |
 *
 * **`projectId`가 룸이다**(D2). 페이지를 옮겨도 연결은 그대로다 — 페이지마다 다시 붙으면
 * 페이지를 옮기는 동안 남의 변경을 놓친다.
 *
 * # 다시 붙은 것 자체가 재조회 신호다 (D6)
 *
 * `onResync`는 **두 번째 이후의 `'open'`**에 불린다. 이월 §2.4가 그 판정을 제안했고 근거도
 * 적었다: 끊긴 동안의 프레임은 어차피 사라졌으므로 갭을 기다리는 것보다 빠르다. **그리고
 * 갭은 편집을 내야만 수렴한다** — 아무것도 안 내고 보고만 있는 사람의 화면은 스스로
 * 맞춰지지 않는다. 다시 읽는 **자리**는 여기가 아니라 `routes/editor.tsx`다(`loadPage`를
 * 부르는 경로를 둘로 만들지 않는다).
 */
import { useEffect } from 'react'
import { openRealtime } from './connection'
import { useRealtimeSetup } from './context'
import { realtimeUrl } from './protocol'
import { useEditorStoreInstance } from '../store/use-editor-store'

/**
 * 리베이스가 얹지 못해 버린 편집을 말하는 문장(설계 §7.3의 *"적용 불가"*와 같은 성질).
 *
 * **에러가 아니다 — 그래도 말한다.** 남이 그 자리를 지웠으면 내 편집이 얹히지 않는 것이
 * 당연하지만, 사용자가 친 값이 사라졌다는 사실은 남는다. 자리는 편집 실패와 같은 통지
 * 하나를 쓴다(D8) — 사용자가 낸 편집의 운명이라는 점이 같다.
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
export function useRealtime(projectId: string | undefined, onResync?: () => void): void {
  const store = useEditorStoreInstance()
  const setup = useRealtimeSetup()

  useEffect(() => {
    if (!setup || !projectId) return

    /**
     * 이 이펙트가 붙은 뒤 `open`을 한 번이라도 지났는가. **재라 #6이 물은 것이 이것이다** —
     * `onStatus`가 두 번째 `'open'`인지 알 수 있나. 알 수 있다: 상태 콜백은 이 클로저 안이고,
     * 클로저는 연결과 수명이 같다(정리 함수가 `close()`를 부른다).
     *
     * **첫 `'open'`에 다시 읽지 않는 것이 요점이다.** 그때는 `loadPage`가 방금 서버 문서를
     * 놓았으므로 읽을 것이 없다.
     */
    let opened = false

    const origin = setup.origin ?? globalThis.location?.origin ?? ''
    const connection = openRealtime({
      ...setup.connection,
      url: realtimeUrl(origin, projectId),
      onFrame: (frame) => {
        switch (frame.type) {
          case 'joined':
            setup.holder.set(frame.connectionId)
            break
          case 'page-changed': {
            const change = store.applyRemoteChange(frame.pageId, {
              seq: frame.seq,
              ops: frame.ops,
              warnings: frame.warnings,
              ...(frame.clientOpId === undefined ? {} : { clientOpId: frame.clientOpId }),
            })
            // **리베이스가 버린 편집을 말한다**(D3 · §7.3의 *"적용 불가"*와 같은 성질).
            // 스토어는 무엇이 버려졌는지만 돌려주고 문안은 여기서 만든다 — `startUndo`의
            // `skipped`를 화면이 문장으로 바꾸는 것과 같은 배치다.
            if (change.dropped.length > 0) {
              store.setEditFailure({ kind: 'message', message: droppedNotice(change.dropped.length) })
            }
            break
          }
          case 'restored':
            store.markRestored()
            break
          case 'locks':
            // **프로젝트 전체의 목록이다.** 어느 페이지의 것인지는 스토어가 `openPageId`로
            // 거른다(`lockedBy`) — 여기서 거르면 페이지를 옮길 때 목록이 낡는다.
            store.setLocks(frame.locks)
            break
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
        if (status === 'open') {
          // **잡고 있던 자리를 다시 알린다**(§7.2). 끊기면 서버가 놓았고, 화면의 선택은 그
          // 사이 바뀌지 않았으므로 *"선택이 바뀔 때 보낸다"*만으로는 아무것도 안 나간다 —
          // 사용자는 노드를 고른 채인데 남의 화면에서 배지가 사라진다. 첫 `'open'`에서는
          // 잡은 것이 없어 아무 일도 안 일어난다.
          setup.lockChannel?.refresh()
          // **다시 붙은 것이 두 번째 이상이면 페이지를 다시 읽어야 한다**(D6). 끊긴 동안 남이
          // 낸 편집의 프레임은 사라졌고, 그것을 갭으로 알아채려면 **누군가 다음 편집을 내야
          // 한다** — 보고만 있는 사람은 스스로 수렴하지 않는다(P3-1 이월 §2.4).
          if (opened) onResync?.()
          opened = true
          return
        }
        // **끊긴 연결의 id를 홀더에 남기지 않는다.** 다시 붙어 새 id를 받기 전까지 **낡은 값**을
        // 싣는 것은 *"내가 그 연결이다"*라는 거짓말이다.
        //
        // **게시의 재전송은 일부러 그 거짓말을 한다** — 첫 보내기의 id 를 잡아 두고 싣는다
        // (`panels/comment-panel.tsx`의 `submit` — 같은 요청이라서). 그 낡은 id 가 **남을** 빼지 않는
        // 것은 홀더가 아니라 서버가 막는다: id 는 무작위라 재기동을 넘어 안 겹치고
        // (`apps/api/src/ws/connection-id.ts`), 방송은 요청과 같은 세션의 연결만 뺀다(`ws/broadcast.ts`의
        // `sentBy`). 앞 판의 *"서버가 그 id로 아무도 못 찾으면 무해하다"*는 **같은 프로세스 안에서만**
        // 참이었다 — 재기동 뒤 옛 id 를 받은 남의 연결이 빠졌다(좁은 반증 3차 · Chrome).
        setup.holder.set(undefined)
        // 답을 기다리던 편집은 이 연결과 함께 끝났다. 안 끝내면 펌프가 거기 매달려 **다음
        // 편집도 안 나간다**(`realtime/edit-channel.ts`).
        setup.channel?.failInFlight()
      },
    })

    setup.channel?.attach(connection)
    setup.lockChannel?.attach(connection)

    return () => {
      connection.close()
      setup.channel?.detach()
      setup.lockChannel?.detach()
      setup.holder.set(undefined)
    }
  }, [projectId, setup, store, onResync])
}
