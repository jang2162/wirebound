/**
 * 화면 테스트가 쓰는 **가짜 실시간 연결** — 소켓을 손에 쥐고 서버 프레임을 넣고, 나간 프레임을 센다(이월 5차).
 *
 * 앞 판들은 파일마다 같은 모양의 가짜 소켓을 손으로 지었다(`routes/viewer-entries.test.tsx`의 «잠금» · `viewer-readonly`).
 * 역할이 실행 중에 바뀌는 판은 **서버가 보내는 프레임**(`membership-changed`)과 **끊겼다 다시 붙기**가 필요해 한 벌을 여기 둔다.
 *
 * **재연결은 손으로 돈다.** `schedule`에 맡긴 일을 쌓아 두고 `reconnect()`가 끊은 뒤 **마지막으로 맡긴 일**(재연결)을 돌린다 —
 * 하트비트도 같은 자리에 쌓이지만, 끊긴 뒤에 맡긴 것은 재연결 하나다(`realtime/connection.ts`의 `dropped`).
 */
import { act } from '@testing-library/react'
import type { RealtimeSocket } from '../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../src/realtime/context'
import { createEditChannel } from '../src/realtime/edit-channel'
import { createLockChannel } from '../src/realtime/lock-channel'

export interface FakeRealtime {
  realtime: RealtimeSetup
  /** 나간 프레임 전부(원문). */
  sent: string[]
  /** `ping`이 아닌 나간 프레임 — `type`(+ `nodeId`). */
  frames(): string[]
  /** 지금 소켓이 열렸다 — 서버가 `joined`로 답한 판까지. */
  open(): void
  /** 서버가 프레임 하나를 보낸다. */
  deliver(frame: Record<string, unknown>): void
  /** 연결이 끊겼다가 다시 붙는다(두 번째 `open` — 셸이 다시 읽는다). */
  reconnect(): void
  /**
   * 지금 시도 중인 연결이 **열리지 못하고 닫힌다** — 핸드셰이크 거절(멤버에서 빠졌으면 가드의 404 — 브라우저에는 1006 으로만
   * 보인다). 재연결은 맡겨진 채 돌리지 않는다.
   */
  refuse(): void
  /** 지금 소켓이 앱 쪽에서 닫혔는가(셸이 내려가면 `close()`가 불린다). */
  closed(): boolean
  /** 마지막으로 맡긴 일(끊긴 뒤면 재연결)이 아직 취소되지 않았는가 — 셸이 내려가면 `close()`가 취소한다. */
  reconnectPending(): boolean
}

export function fakeRealtime(projectId: string, userId: string): FakeRealtime {
  const sent: string[] = []
  const sockets: (RealtimeSocket & { closedByApp: boolean })[] = []
  const tasks: (() => void)[] = []
  const cancelled = new Set<unknown>()
  let joins = 0

  const realtime: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
    lockChannel: createLockChannel(),
    origin: 'http://localhost:5173',
    connection: {
      createSocket: () => {
        const socket = {
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          closedByApp: false,
          send: (data: string) => {
            sent.push(data)
          },
          close: () => {
            socket.closedByApp = true
          },
        } as RealtimeSocket & { closedByApp: boolean }
        sockets.push(socket)
        return socket
      },
      schedule: (run) => {
        tasks.push(run)
        return tasks.length
      },
      cancel: (handle) => {
        cancelled.add(handle)
      },
    },
  }

  const current = (): RealtimeSocket & { closedByApp: boolean } => {
    const socket = sockets.at(-1)
    if (socket === undefined) throw new Error('소켓이 아직 없다')
    return socket
  }

  const open = (): void => {
    const socket = current()
    joins += 1
    act(() => {
      socket.onopen?.()
      socket.onmessage?.({ data: JSON.stringify({ type: 'joined', projectId, connectionId: `conn-${joins}`, userId }) })
    })
  }

  return {
    realtime,
    sent,
    frames: () =>
      sent
        .map((raw) => JSON.parse(raw) as { type: string; nodeId?: string })
        .filter((frame) => frame.type !== 'ping')
        .map((frame) => (frame.nodeId === undefined ? frame.type : `${frame.type} ${frame.nodeId}`)),
    open,
    deliver: (frame) => {
      const socket = current()
      act(() => {
        socket.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    reconnect: () => {
      const socket = current()
      act(() => {
        socket.onclose?.()
      })
      const again = tasks.at(-1)
      if (again === undefined) throw new Error('재연결이 맡겨지지 않았다')
      act(() => {
        again()
      })
      open()
    },
    refuse: () => {
      const socket = current()
      act(() => {
        socket.onclose?.()
      })
    },
    closed: () => current().closedByApp,
    reconnectPending: () => tasks.length > 0 && !cancelled.has(tasks.length),
  }
}
