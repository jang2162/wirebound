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
 * | `presence`·`pong` | 아무것도 안 한다. §7.2의 잠금(P3-3)이 `presence` 위에 선다 |
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
          // **다시 붙은 것이 두 번째 이상이면 페이지를 다시 읽어야 한다**(D6). 끊긴 동안 남이
          // 낸 편집의 프레임은 사라졌고, 그것을 갭으로 알아채려면 **누군가 다음 편집을 내야
          // 한다** — 보고만 있는 사람은 스스로 수렴하지 않는다(P3-1 이월 §2.4).
          if (opened) onResync?.()
          opened = true
          return
        }
        // **끊긴 연결의 id를 계속 실으면 안 된다.** 서버가 그 id로 아무도 못 찾으면
        // 제외가 일어나지 않아 무해하지만, 다시 붙어 새 id를 받기 전까지 **낡은 값**을
        // 싣는 것은 *"내가 그 연결이다"*라는 거짓말이다.
        setup.holder.set(undefined)
        // 답을 기다리던 편집은 이 연결과 함께 끝났다. 안 끝내면 펌프가 거기 매달려 **다음
        // 편집도 안 나간다**(`realtime/edit-channel.ts`).
        setup.channel?.failInFlight()
      },
    })

    setup.channel?.attach(connection)

    return () => {
      connection.close()
      setup.channel?.detach()
      setup.holder.set(undefined)
    }
  }, [projectId, setup, store, onResync])
}
