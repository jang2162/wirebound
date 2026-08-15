/**
 * 프레임을 스토어로 옮기는 자리. **이 슬라이스의 클라이언트는 받기만 한다**(P3-1 D6) —
 * 편집을 WebSocket으로 보내는 것·ack·리베이스는 P3-2다.
 *
 * # 무엇을 하는가
 *
 * | 프레임 | 하는 일 |
 * |---|---|
 * | `joined` | 연결 id를 홀더에 넣는다 — 편집 요청이 그것을 헤더로 실어 **자기 편집을 되받지 않는다** |
 * | `page-changed` | `store.applyRemoteChange` — 얹거나, 미루거나, 갈라졌다고 말한다 |
 * | `restored` | `store.markRestored` — 판이 통째로 갈렸다. 얹을 `ops`가 없다 |
 * | `presence`·`pong` | 아무것도 안 한다. §7.2의 잠금(P3-3)이 `presence` 위에 선다 |
 *
 * **`projectId`가 룸이다**(D2). 페이지를 옮겨도 연결은 그대로다 — 페이지마다 다시 붙으면
 * 페이지를 옮기는 동안 남의 변경을 놓친다.
 */
import { useEffect } from 'react'
import { openRealtime } from './connection'
import { useRealtimeSetup } from './context'
import { realtimeUrl } from './protocol'
import { useEditorStoreInstance } from '../store/use-editor-store'

/**
 * 프로젝트 룸에 붙어 있는다. **Provider가 없으면 아무것도 안 한다**(`context.tsx`의 머리말).
 *
 * 정리 함수가 `close()`를 부르는 것이 계약이다 — 안 부르면 프로젝트를 옮길 때마다 연결이
 * 하나씩 쌓이고, 그 연결들이 각자 재연결을 건다.
 */
export function useRealtime(projectId: string | undefined): void {
  const store = useEditorStoreInstance()
  const setup = useRealtimeSetup()

  useEffect(() => {
    if (!setup || !projectId) return

    const origin = setup.origin ?? globalThis.location?.origin ?? ''
    const connection = openRealtime({
      ...setup.connection,
      url: realtimeUrl(origin, projectId),
      onFrame: (frame) => {
        switch (frame.type) {
          case 'joined':
            setup.holder.set(frame.connectionId)
            break
          case 'page-changed':
            store.applyRemoteChange(frame.pageId, {
              seq: frame.seq,
              ops: frame.ops,
              warnings: frame.warnings,
            })
            break
          case 'restored':
            store.markRestored()
            break
          default:
            break
        }
      },
      onStatus: (status) => {
        // **끊긴 연결의 id를 계속 실으면 안 된다.** 서버가 그 id로 아무도 못 찾으면
        // 제외가 일어나지 않아 무해하지만, 다시 붙어 새 id를 받기 전까지 **낡은 값**을
        // 싣는 것은 *"내가 그 연결이다"*라는 거짓말이다.
        if (status !== 'open') setup.holder.set(undefined)
      },
    })

    return () => {
      connection.close()
      setup.holder.set(undefined)
    }
  }, [projectId, setup, store])
}
