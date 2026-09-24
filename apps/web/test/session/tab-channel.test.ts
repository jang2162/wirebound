// @vitest-environment node
/**
 * **탭 사이의 통로**(`src/session/tab-channel.tsx`) — 진짜 `BroadcastChannel`로 잰다(Node 에도 있다). 이 파일만
 * 진짜를 쓰고 **이름을 케이스마다 새로 짓는다** — Node 의 채널은 같은 프로세스의 워커 사이로도 흐르므로, 이름이
 * 겹치면 병렬로 도는 다른 파일의 것을 받는다(그 파일의 머리말).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 받은 것을 읽지 않고 그대로 넘긴다(`readNews`를 안 지난다) | *"모양이 틀린 소식은 버린다 …"* **혼자** |
 * | `readNews`가 사용자 칸을 안 본다 | *"사용자가 모자란 로그인 소식은 …"* **혼자** |
 * | 떼어도 계속 듣는다 | *"떼면 그만 받는다"* **혼자** |
 * | `readNews`가 로그아웃의 번호 모양을 안 본다 | *"로그아웃 소식의 번호 …"* |
 */
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { openTabChannel, readNews, type SessionNews, type TabChannel } from '../../src/session/tab-channel'

const ALICE = { id: 'u-1', email: 'alice@example.com', name: '앨리스' }

const opened: { close(): void }[] = []

afterEach(() => {
  for (const channel of opened.splice(0)) channel.close()
})

/** 이 케이스만의 이름. */
function freshName(): string {
  return `wirebound-session-test-${randomUUID()}`
}

/** 다른 탭 — 같은 이름의 날 채널. 닫는 것은 `afterEach`가 한다. */
function rawTab(name: string): BroadcastChannel {
  const channel = new BroadcastChannel(name)
  opened.push(channel)
  return channel
}

/** 통로를 열고 받은 것을 쌓는다. 닫는 것은 `afterEach`가 한다. */
function listening(name: string): { tab: TabChannel; heard: SessionNews[]; stop: () => void } {
  const tab = openTabChannel(name)
  if (tab === null) throw new Error('이 Node 에 BroadcastChannel 이 없다')
  opened.push(tab)
  const heard: SessionNews[] = []
  const stop = tab.listen((news) => heard.push(news))
  return { tab, heard, stop }
}

/** 메시지 한 바퀴를 기다린다 — 채널은 다음 태스크에 건넨다. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('통로', () => {
  it('다른 탭이 낸 소식을 받는다 — 보낸 탭에는 안 온다', async () => {
    const name = freshName()
    const here = listening(name)
    const there = listening(name)

    here.tab.post({ kind: 'signed-in', user: ALICE })
    await settle()

    expect(there.heard).toEqual([{ kind: 'signed-in', user: ALICE }])
    expect(here.heard).toEqual([])
    here.stop()
    there.stop()
  })

  it('모양이 틀린 소식은 버린다 — 옛 판의 탭이 낸 것일 수 있다', async () => {
    const name = freshName()
    const here = listening(name)
    const other = rawTab(name)

    other.postMessage({ kind: 'signed-in' })
    other.postMessage('signed-out')
    other.postMessage({ kind: 'logged-out' })
    other.postMessage({ kind: 'signed-out' })
    await settle()

    expect(here.heard).toEqual([{ kind: 'signed-out' }])
    here.stop()
  })

  it('떼면 그만 받는다', async () => {
    const name = freshName()
    const here = listening(name)
    const other = rawTab(name)

    here.stop()
    other.postMessage({ kind: 'signed-out' })
    await settle()

    expect(here.heard).toEqual([])
  })
})

describe('readNews', () => {
  it('사용자가 모자란 로그인 소식은 소식이 아니다 — 누구인지 모르면 갈래를 못 고른다', () => {
    expect(readNews({ kind: 'signed-in', user: { id: 'u-1', email: 'a@example.com' } })).toBeNull()
    expect(readNews({ kind: 'signed-in', user: { id: 1, email: 'a@example.com', name: 'a' } })).toBeNull()
    expect(readNews({ kind: 'signed-in', user: null })).toBeNull()
  })

  it('로그아웃 소식의 번호 — 없으면 옛 판의 소식으로 받고, 있는데 세대의 모양이 아니면 버린다', () => {
    // 번호는 초안 사본의 로그아웃 세대다(`panels/draft-store.tsx`의 «표지는 세대 번호다»).
    expect(readNews({ kind: 'signed-out', era: 3, more: 1 })).toEqual({ kind: 'signed-out', era: 3 })
    expect(readNews({ kind: 'signed-out' })).toEqual({ kind: 'signed-out' })
    expect(readNews({ kind: 'signed-out', era: '3' })).toBeNull()
    expect(readNews({ kind: 'signed-out', era: -1 })).toBeNull()
    expect(readNews({ kind: 'signed-out', era: 1.5 })).toBeNull()
    expect(readNews({ kind: 'signed-out', era: 1_700_000_000_000_000_000 })).toBeNull()
  })

  it('모양이 맞으면 필요한 칸만 옮긴다', () => {
    expect(readNews({ kind: 'signed-in', user: { ...ALICE, extra: true }, more: 1 })).toEqual({
      kind: 'signed-in',
      user: ALICE,
    })
  })
})
