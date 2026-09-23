/**
 * 룸 저장소. **룸은 프로젝트 단위 하나다(P3-1 D2).**
 *
 * §7.1은 *"룸 broadcast"*라고만 적었고 경계를 정하지 않았다. 페이지 단위로 가르면
 * 복원·스냅샷·메뉴 변경처럼 **프로젝트 사건**인 것들이 갈 자리가 없어져, 사건마다
 * *"어느 룸에"*가 다시 판정이 된다. 프로젝트 단위 하나면 모든 사건이 갈 자리가 하나이고
 * **권한 경계(§10도 프로젝트 단위다)와 룸 경계가 같아진다.** 페이지 사건은 프레임에
 * `pageId`를 실어 받는 쪽이 거른다.
 *
 * # 인터페이스를 가르는 이유 (D7)
 *
 * §7.2가 소프트 잠금에 대해 정한 것과 같다: *"MVP는 서버 인메모리 저장소를 쓰되
 * 인터페이스를 분리해, 다중 인스턴스 확장 시 Redis 구현으로 교체한다."* **다중 인스턴스는
 * 하지 않는다.** 다만 갈아 끼울 자리를 지금 만들어 둔다.
 *
 * # 단일 인스턴스 가정이 박히는 자리 (D7 — 나중에 그 목록이 교체 비용이다)
 *
 * | 자리 | 무엇을 가정하나 |
 * |---|---|
 * | `InMemoryRoomRegistry`의 `Map` | 룸의 참가자 전부가 **이 프로세스의 메모리**에 있다 |
 * | `RoomConnection.send` | 보낼 상대가 **이 프로세스가 들고 있는 소켓**이다 |
 * | `broadcast.ts`의 전송 직전 재확인 | 참가자 수만큼 DB를 때린다 — 인스턴스가 늘면 그 수도 인스턴스마다 곱해진다 |
 * | `connectionId` | **더는 가정이 아니다**(2026-09-22) — 무작위라(`connection-id.ts`) 재기동도 인스턴스도 넘어 안 겹친다. 앞 판은 카운터였고 이 줄은 *"인스턴스가 늘면"*만 적었는데 **재기동이 먼저 걸렸다**: 게시를 다시 보내는 웹이 재기동 전의 id 를 싣고, 새 프로세스가 같은 id 를 남의 연결에 줘서 그 연결이 방송에서 빠졌다(좁은 반증 3차 · Chrome) |
 * | `lock/store.ts`의 `Map` | **§7.2의 소프트 잠금이 이 프로세스의 메모리에 산다**(P3-3). 인스턴스가 늘면 남의 인스턴스가 든 잠금이 안 보여 1차·2차 방어가 둘 다 샌다. 키가 `connectionId`인 것은 넷째 줄이 풀려 더는 문제가 아니다 |
 *
 * **다섯 자리 전부 `RoomRegistry` 뒤에 있지는 않다.** 셋째·다섯째는 인터페이스
 * 밖이므로, Redis 구현을 끼우는 것만으로는 부족하다는 뜻이다 — 그것이 이 표를 적는 이유다.
 * (잠금 저장소는 자기 인터페이스(`LockStore`)를 갖는다 — §7.2가 그렇게 정했다. 다만 그
 * 인터페이스도 `RoomRegistry`와 마찬가지로 위 표의 전부를 덮지는 않는다.)
 */

/** 룸에 들어와 있는 연결 하나. 소켓 자체를 모른다 — `send`·`close` 두 함수로만 만난다. */
export interface RoomConnection {
  readonly id: string
  readonly projectId: string
  readonly userId: string
  readonly userName: string
  /**
   * `sessions.id` — **토큰 원문의 sha256 hex이지 토큰이 아니다**(`auth/session.ts`).
   *
   * 연결이 살아 있는 동안 §10의 회수를 다시 확인하려면 자기 세션을 가리킬 것이 필요한데,
   * 원문 토큰을 연결 수명만큼 프로세스 메모리에 두지 않으려고 해시를 든다. 그 값으로 할
   * 수 있는 것은 *"이 행이 아직 있나"*뿐이다 — 쿠키를 만들 수는 없다.
   */
  readonly sessionId: string
  /**
   * **이 사람의 멤버십이 이 연결이 붙은 뒤 몇 번 바뀌었나**(이월 5차 리뷰 R5) — `ws/notify.ts`의 `notifyMembershipChanged`가
   * 올린다. **역할 값이 아니라 세대다** — 역할은 여전히 DB 가 말한다(`broadcast.ts`의 `stillAllowed`).
   *
   * 프레임 경로(`ws/routes.ts`)는 자격을 보는 await **앞에서** 이 값을 읽고, 잠금을 잡기 직전에 다시 본다. 그 사이에 올랐으면
   * 읽은 자격은 바뀌기 전의 것이다 — 잡지 않는다. DB 를 다시 읽지 않는 것이 요점이다: 다시 읽어도 그 뒤에 또 await 가 생겨
   * 같은 창이 한 칸 뒤로 밀릴 뿐이고, 이 값은 알림과 같은 틱에 동기로 오른다.
   */
  membershipEpoch: number
  send(payload: string): void
  close(code: number, reason: string): void
}

export interface RoomRegistry {
  join(connection: RoomConnection): void
  /** 없는 id를 지워도 조용히 지난다 — 닫힘이 두 번 오는 경로가 있다. */
  leave(projectId: string, connectionId: string): void
  /** 그 프로젝트 룸의 참가자. **넣은 순서를 지킨다**(`Map`의 반복 순서). */
  membersOf(projectId: string): RoomConnection[]
  /** 참가자가 하나라도 있는 룸의 수. 빈 룸은 세지 않는다 — 지워지기 때문이다. */
  roomCount(): number
}

/**
 * 프로세스 메모리에 사는 구현.
 *
 * **빈 룸을 남기지 않는다.** 마지막 참가자가 나가면 프로젝트 키 자체를 지운다 — 안 지우면
 * 프로젝트를 한 번이라도 연 적이 있는 만큼 키가 쌓이고, 그것은 서버가 오래 뜨는 만큼
 * 자라는 누수다.
 */
export class InMemoryRoomRegistry implements RoomRegistry {
  readonly #rooms = new Map<string, Map<string, RoomConnection>>()

  join(connection: RoomConnection): void {
    let room = this.#rooms.get(connection.projectId)
    if (!room) {
      room = new Map()
      this.#rooms.set(connection.projectId, room)
    }
    room.set(connection.id, connection)
  }

  leave(projectId: string, connectionId: string): void {
    const room = this.#rooms.get(projectId)
    if (!room) return
    room.delete(connectionId)
    if (room.size === 0) {
      this.#rooms.delete(projectId)
    }
  }

  membersOf(projectId: string): RoomConnection[] {
    const room = this.#rooms.get(projectId)
    return room ? [...room.values()] : []
  }

  roomCount(): number {
    return this.#rooms.size
  }
}
