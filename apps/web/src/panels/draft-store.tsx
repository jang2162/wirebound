/**
 * **초안의 사본 — 셸이 죽어도 남는 자리.**
 *
 * 초안(페이지 설명 · 노드마다의 새 코멘트 · 고치던 코멘트)과 코멘트의 멱등 키는 `panel-drafts.tsx`의
 * provider 가 든다 — **진실은 거기다.** 그런데 그 provider 는 문서의 메모리에 살아, 새로고침 · 탭 닫기 ·
 * 세션 만료(401)에 함께 죽는다. 사본이 없으면 친 글이 사라지고, **키가 사라져서** 서버에 늦게 커밋된 앞 게시와
 * 다시 단 같은 글이 두 행이 된다(Chrome).
 *
 * 여기는 그 provider 를 **비추는** 자리다(한 방향). 쓰는 자리는 provider 의 레이아웃 이펙트 하나이고
 * (`panel-drafts.tsx`의 머리말 4), 읽는 자리는 provider 가 방문을 새로 세우는 함수 하나다(`fresh`).
 * 둘 다 이 모듈의 `keep`·`recall`만 지난다.
 *
 * ## 무엇에 드는가 — `sessionStorage`
 *
 * | 후보 | 판정 |
 * |---|---|
 * | **`sessionStorage`** | 고른다. **탭마다 하나** — provider 도 탭마다 하나라 사본이 진실과 1:1 이다. 새로고침에 살고, 닫은 탭을 다시 열면 되살아난다(Chromium 151 — 값은 `write-ledger.tsx`의 «이것이 막지 못하는 것») |
 * | `localStorage` | 안 고른다. 탭을 넘어 **한 칸을 여럿이 비춘다** — 같은 페이지를 연 두 탭이 서로의 초안을 덮고, 한 탭이 다른 페이지로 가며 비운 칸이 다른 탭의 초안이다(F1 의 버림이 남의 탭에 닿는다). «비추는 자리»가 아니게 된다 |
 *
 * **섞은 것이 하나 있다 — 명시적 로그아웃의 표지만 `localStorage`에 든다**(`FORGOTTEN_KEY`). 닫아 둔 탭은 로그아웃
 * 소식을 못 받는데, 나중에 다시 열면 브라우저가 그 탭의 `sessionStorage`를 되살린다 — 로그아웃한 사람의 글이 그
 * 브라우저에 돌아온다. 표지는 **세대 번호 하나**(사람도 글도 없다 — 아래 «표지는 세대 번호다»)이고, 그보다 앞선
 * 세대의 사본은 **두 자리에서 지운다**:
 *
 * - **문서가 설 때**(`openDraftStore` — 되살린 탭이 뜨는 순간) 이 탭의 사본을 다 훑는다. 읽을 때만 지우면 되살린 탭에
 *   **다른 사람이** 들어온 판에서 앞 사람의 칸을 아무도 안 읽어 그대로 남는다(Chromium 151 — 로그아웃 뒤 되살린
 *   탭의 `sessionStorage`에 앞 사람의 칸이 원문 그대로 남는다. 설 때 훑으면 뜨자마자 `{}`).
 * - **읽을 때**(`recall`) — 이 문서가 선 **뒤에** 다른 탭이 로그아웃했는데 소식이 안 닿은 판(`BroadcastChannel`이 없는
 *   브라우저)이다.
 *
 * ### 표지는 세대 번호다 — 시계로 하지 않는다
 *
 * 표지를 **시각**으로 두고 사본에 쓴 시각(`savedAt`)을 실어 `savedAt <= 표지`면 지우면, 두 길로 친 초안이 사라진다
 * (Chrome):
 *
 * - **«들은 시각» — 표지가 들은 시각으로 덮인다.** 소식을 듣는 탭도 표지를 **자기가 들은 시각**으로 적으면, 로그아웃 뒤
 *   같은 사람이 다시 들어와 친 사본이라도 다른 탭이 소식을 늦게 들으면 표지가 그보다 늦어져 새로고침에 `""`이 된다
 *   (수신 4000ms 지연 주입).
 * - **«벽시계» — 벽시계를 견준다.** 로그아웃 뒤 시계가 뒤로 가면(NTP 보정 · 수동 변경) 그 차이만큼 친 사본이 전부
 *   «로그아웃보다 앞선 것»이 된다(표지를 10분 앞당긴 흉내 — 새로고침 뒤 `""`).
 *
 * 그래서 표지는 **로그아웃이 몇 번 있었나**다. 탭마다 **자기가 아는 세대**(`era`)를 들고:
 *
 * | 일 | 세대 |
 * |---|---|
 * | 문서가 선다 | 표지를 읽어 그것이 이 탭의 세대다 |
 * | 이 탭에서 로그아웃(`forget`) | `max(표지, 이 탭의 세대) + 1` — **올리는 것은 로그아웃한 탭뿐이다.** 그 번호를 소식에 싣는다(`session-context.tsx`) |
 * | 다른 탭의 로그아웃 소식(`forgetHeard`) | 소식의 번호로 — 표지도 이 탭의 세대도 **`max`로만** 적는다. 듣는 탭은 번호를 짓지 않는다 |
 * | 사본을 쓴다(`keep`) | **이 탭의 세대**를 싣는다 — 표지를 다시 읽지 않는다 |
 * | 사본을 본다(`sweep` · `recall`) | 사본의 세대가 `max(표지, 이 탭의 세대)`보다 **작으면** 지운다 |
 *
 * 쓸 때 표지를 다시 읽지 않는 것이 요점이다 — 로그아웃 소식을 못 들은 탭(얼린 탭 · 소식 없는 브라우저)이 **로그아웃
 * 뒤에** 쓴 사본은 그 탭의 옛 세대를 실어 지워진다. 시각 표지라면 그 사본이 표지보다 늦은 시각이라 남는다.
 *
 * **번호가 없는 소식이 올 수 있다** — 배포가 바뀌는 창에 앞 배포의 탭이 보낸 것이다(`session/tab-channel.tsx`의
 * «받은 것은 믿지 않고 읽는다»). 그때 듣는 탭은 `이 탭의 세대 + 1`로 적는다 — 같은 세대를 아는 탭들이 같은 번호에
 * 닿는다(각자 표지를 읽어 +1 하면 들은 탭 수만큼 부풀어, 먼저 들은 탭이 다시 들어와 친 사본이 위 «들은 시각»처럼
 * 지워진다).
 *
 * ## 다른 사람이 들어오면 앞 사람의 칸을 지운다
 *
 * `admit` — 이 탭의 사람이 누구인지 알게 되는 자리에서 부른다(`session-context.tsx`: 마운트의 `me()` · 이 탭의 로그인 ·
 * 다른 탭의 로그인 소식). **그 사람이 아닌 칸을 전부 지운다** — 칸이 사람으로 갈려 안 보이기만 하면, 명시적
 * 로그아웃이 한 번 일어날 때까지 앞 사람의 원문이 그 탭(과 그 탭에서 복제한 탭)의 저장소에 남는다(공용 기기에서
 * 앨리스가 로그아웃 없이 떠나 세션이 만료되고 밥이 그 탭을 쓰는 판 — Chrome).
 *
 * - **같은 사람이면 지울 것이 없다** — 세션 만료 뒤 같은 사람이 돌아오면 이어 쓴다(아래 «언제 지우는가»).
 * - **대가: 앞 사람이 그 탭에 돌아와도 초안은 없다.** 앨리스 → (만료) → 밥 → (만료) → 앨리스면 앨리스의 초안은 밥이
 *   들어온 순간 지워진다.
 * - `admit` 뒤로는 **그 사람의 칸에만 쓴다** — 다른 탭의 소식으로 사람이 바뀐 뒤 앞 사람의 화면이 한 번 더 커밋돼도
 *   지운 칸을 다시 채우지 않는다(`forget`의 `generation`과 같은 까닭).
 * - 칸을 지울 때 **읽지 않는다**(`getItem` 없이 키만 본다).
 *
 * ## 칸 — 사람마다, 그리고 방문 하나
 *
 * 키는 `wirebound:drafts:<사용자 id>`다. **다른 사람의 칸을 화면에 싣지도, 그 칸에 쓰지도 않는다** — provider 가 지금
 * 사람의 id 로만 부른다(`panel-drafts.tsx`). **«읽지 않는다»는 아니다**: 문서가 설 때 `sweep`은 표지가 0 이
 * 아니면 이 탭의 **모든 사람의 칸을 `getItem`** 한다 — 사본의 세대를 보려고다(화면에는 안 싣는다). 그때는 아직 이 탭의
 * 사람을 모른다(`me()` 전). 사람을 안 뒤에 다른 사람의 칸을 지우는 `admit`은 읽지 않고 키만 본다 — 그래서 사람을 안
 * 뒤로 이 탭에 남는 칸은 그 사람의 것 하나다. 한 사람의 칸에는 **이 탭이 마지막으로 연 페이지의 방문 하나**가 든다 —
 * (프로젝트, 페이지)와 그 방문의 초안 칸들. 페이지 하나만 드는 것이 F1 을 지키는 방법이다(`panel-drafts.tsx`
 * 머리말 4 의 «F1 과 저장소»).
 *
 * ## 무엇을 드는가 — 초안과 키만
 *
 * 칸이 스스로 말한다(`slot`의 셋째 인자 — `panel-drafts.tsx`). 드는 것은 넷: 설명 초안 · 노드마다의 새 코멘트
 * 초안 · 그 멱등 키 · 고치던 코멘트(id 와 글). **들지 않는 것**: 조회 값 · 통지 · 잠금. 조회 값은 서버가 다시
 * 준다. 잠금과 «모름»(판정 중이던 쓰기)은 **요청의 수명**을 따르는데 요청은 문서와 함께 끊긴다 — 되살리면
 * 요청 없는 잠금이다. 판정은 같은 글을 다시 달면 된다: **같은 글 + 같은 키**라 서버가 앞 행을 돌려준다(재생 ·
 * 한 행 — Chrome 값은 `write-ledger.tsx`의 입구 표). 남는 틈(되살린 뒤 글을 고치면 새 키)은 `write-ledger.tsx`의 «이것이 막지
 * 못하는 것»이 소유한다.
 *
 * ## 언제 지우는가 — 명시적 로그아웃에만
 *
 * `forget` · `forgetHeard` — 이 탭의 초안 칸을 **사람을 가리지 않고** 전부 지우고 표지를 적는다. 부르는 자리는
 * `session/session-context.tsx`의 **로그아웃 두 신호** 그대로다(이 탭의 로그아웃 단추 · 다른 탭의 로그아웃
 * 소식) — 새 신호를 세우지 않는다. **401 은 지우지 않는다** — 원하지 않은 끝이고, 같은 사람이 다시 들어오면
 * 이어 쓴다. 다른 사람이 들어오면 **앞 사람의 칸만** 지운다(위 `admit`).
 *
 * `forget` 뒤로 **그 전에 선 provider 는 쓰지 못한다**(`generation`). 로그아웃 소식과 화면이 내려가는 렌더
 * 사이에 친 글자 하나가 커밋되면 그 이펙트가 지운 칸을 다시 채운다 — 로그아웃 뒤에 그 사람의 글이 남는다.
 *
 * ## 못 쓰면 사본 없이 돈다
 *
 * 비공개 창 · 사이트 데이터 차단에서는 `sessionStorage`를 **읽는 것만으로** 던지고(`SecurityError`), 용량이
 * 차면 `setItem`이 던진다. 읽기·쓰기·지우기를 전부 `try`로 감싸고 실패하면 **아무것도 안 든 것**으로 간다 —
 * 화면은 사본 없이 메모리의 초안만으로 돈다. **쓰기가 실패하면 그 사람의 칸을 지운다** — 낡은 방문이 남으면 다음 읽기가
 * 그것을 되살려 F1 을 뒤집는다(앞 페이지의 초안이 돌아온다). 지우기까지 던지는 판은 남는 틈이다.
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'

/** 사람마다의 칸 이름 앞머리. */
export const DRAFT_KEY_PREFIX = 'wirebound:drafts:'

/**
 * 명시적 로그아웃의 세대 번호(`localStorage` — 위 머리말 «표지는 세대 번호다»). 시각을 표지로 쓰던 배포의 키와
 * **이름이 달라야 한다** — 같은 이름이면 그 배포가 브라우저에 남긴 시각(13자리 수)을 세대로 읽어 모든 사본을 지운다.
 */
export const FORGOTTEN_KEY = 'wirebound:drafts-signed-out-era'

/** 사본의 모양이 바뀌면 올린다 — 모르는 판의 사본은 읽지 않는다. 2 는 쓴 시각이 아니라 세대(`era`)를 싣는 모양이다. */
const VERSION = 2

/** 한 사람의 칸에 드는 것 — 방문 하나. `slots`의 값은 칸이 스스로 지은 JSON 값이다(`panel-drafts.tsx`). */
export interface DraftVisit {
  readonly projectId: string
  readonly pageId: string
  readonly slots: Readonly<Record<string, unknown>>
}

export interface DraftStore {
  /**
   * 그 사람이 이 탭에서 마지막으로 연 방문이 **이 (프로젝트, 페이지)** 면 그 칸들을, 아니면 빈 것을 낸다.
   * 못 읽거나 모양이 틀리거나 로그아웃보다 앞선 사본이면 빈 것이다.
   */
  recall(userId: string, projectId: string, pageId: string): Readonly<Record<string, unknown>>
  /**
   * 그 사람의 방문을 이것으로 바꾼다 — 칸이 비었으면(`slots`에 아무것도 없으면) 지운다. `since`는 부르는
   * provider 가 선 때의 `generation`이다 — 그 뒤에 `forget`이 돌았으면 쓰지 않는다(위 머리말).
   */
  keep(userId: string, visit: DraftVisit, since: number): void
  /**
   * **이 탭의** 명시적 로그아웃 — 이 탭의 초안 칸을 전부 지우고 세대를 올려 표지에 적는다. 올린 번호를 낸다 — 다른
   * 탭에 알리는 소식에 싣는다(위 머리말 «표지는 세대 번호다»).
   */
  forget(): number
  /**
   * **다른 탭의** 명시적 로그아웃을 들었다 — 이 탭의 초안 칸을 전부 지우고, 표지와 이 탭의 세대를 **그 번호로 `max`만**
   * 한다. 번호가 없으면(앞 배포의 탭이 보낸 소식) 이 탭의 세대 + 1 이다.
   */
  forgetHeard(era: number | undefined): void
  /** 이 탭의 사람은 그 사람이다 — **그 사람이 아닌 칸을 전부 지운다**(위 머리말 «다른 사람이 들어오면»). */
  admit(userId: string): void
  /** `forget`·`forgetHeard`가 돈 횟수. provider 가 설 때 읽어 `keep`에 싣는다. */
  readonly generation: number
}

/** 저장소를 꺼내는 함수 — **꺼내는 것 자체가 던질 수 있다**(위 머리말). */
export type StorageSource = () => Storage | null | undefined

function open(source: StorageSource): Storage | null {
  try {
    return source() ?? null
  } catch {
    return null
  }
}

/** 그 저장소의 세대 표지. 없거나 못 읽거나 세대의 모양(0 이상의 정수)이 아니면 `0`. */
function signedOutEra(shared: Storage | null): number {
  if (shared === null) return 0
  try {
    const value = Number(shared.getItem(FORGOTTEN_KEY))
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

/** 표지를 `era`까지 올린다 — **`max`로만**(위 머리말 «표지는 세대 번호다»). 못 적으면 남는 틈(`write-ledger.tsx`). */
function raiseMarker(shared: Storage | null, era: number): void {
  if (shared === null || signedOutEra(shared) >= era) return
  try {
    shared.setItem(FORGOTTEN_KEY, String(era))
  } catch {
    // 표지를 못 적으면 닫아 둔 탭의 사본이 남는다 — 남는 틈.
  }
}

/** 칸 하나를 지운다. 지우기도 던지면 남는다(위 머리말 «못 쓰면»의 끝). */
function remove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // 남는 틈 — 위 머리말.
  }
}

/** 이 탭의 초안 칸 키들. 못 읽으면 빈 목록. */
function draftKeys(storage: Storage): string[] {
  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key !== null && key.startsWith(DRAFT_KEY_PREFIX),
    )
  } catch {
    return []
  }
}

/** 로그아웃 표지보다 앞선 세대의 사본을 지운다(위 머리말 «섞은 것»). */
function sweep(storage: Storage | null, era: number): void {
  if (storage === null || era === 0) return
  for (const key of draftKeys(storage)) {
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      continue
    }
    const stored = raw === null ? null : parse(raw)
    if (stored !== null && stored.era < era) remove(storage, key)
  }
}

interface Stored {
  v: number
  /** 이 사본을 쓴 탭이 그때 알던 세대(위 머리말 «표지는 세대 번호다»). */
  era: number
  projectId: string
  pageId: string
  slots: Record<string, unknown>
}

/** 읽은 사본을 믿지 않는다 — 앞 배포가 남긴 것이거나 손으로 고친 것일 수 있다. */
function parse(raw: string): Stored | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.v !== VERSION) return null
  if (!Number.isSafeInteger(record.era) || typeof record.projectId !== 'string' || typeof record.pageId !== 'string') {
    return null
  }
  if (typeof record.slots !== 'object' || record.slots === null || Array.isArray(record.slots)) return null
  return record as unknown as Stored
}

/**
 * 저장소를 연다. **여는 자리는 `main.tsx` 하나다** — 화면 테스트는 세우지 않거나 가짜를 끼운다(탭 사이의 통로
 * `session/tab-channel.tsx`와 같은 관례). `session`은 초안이 드는 곳, `shared`는 로그아웃 표지가 드는 곳이다.
 */
export function openDraftStore(session: StorageSource, shared: StorageSource): DraftStore {
  let generation = 0
  /** 이 탭이 아는 세대 — 문서가 설 때의 표지에서 시작해 로그아웃마다 오른다(위 머리말 «표지는 세대 번호다»). */
  let era = signedOutEra(open(shared))
  /** 이 탭의 사람(`admit`). `null`이면 아직 모른다 — 그때는 사람으로 막지 않는다. */
  let admitted: string | null = null
  sweep(open(session), era)

  /** 이 탭의 사본을 사람을 가리지 않고 전부 지우고, 세대를 `next`까지 올린다(`max`로만). */
  const forgetAt = (next: number): void => {
    generation += 1
    admitted = null
    const storage = open(session)
    if (storage !== null) for (const key of draftKeys(storage)) remove(storage, key)
    era = Math.max(era, next)
    raiseMarker(open(shared), era)
  }

  return {
    get generation() {
      return generation
    },

    recall(userId, projectId, pageId) {
      const storage = open(session)
      if (storage === null) return {}
      const key = DRAFT_KEY_PREFIX + userId
      let raw: string | null
      try {
        raw = storage.getItem(key)
      } catch {
        return {}
      }
      if (raw === null) return {}
      const stored = parse(raw)
      if (stored === null) return {}
      // **로그아웃보다 앞선 세대의 사본은 읽지 않고 지운다** — 닫아 둔 탭을 로그아웃 뒤에 다시 연 판이다(위 머리말).
      if (stored.era < Math.max(era, signedOutEra(open(shared)))) {
        remove(storage, key)
        return {}
      }
      if (stored.projectId !== projectId || stored.pageId !== pageId) return {}
      return stored.slots
    },

    keep(userId, visit, since) {
      if (since !== generation) return
      if (admitted !== null && admitted !== userId) return
      const storage = open(session)
      if (storage === null) return
      const key = DRAFT_KEY_PREFIX + userId
      if (Object.keys(visit.slots).length === 0) {
        remove(storage, key)
        return
      }
      const stored: Stored = {
        v: VERSION,
        // **이 탭의 세대다 — 표지를 다시 읽지 않는다**(위 머리말 «표지는 세대 번호다»).
        era,
        projectId: visit.projectId,
        pageId: visit.pageId,
        slots: { ...visit.slots },
      }
      try {
        storage.setItem(key, JSON.stringify(stored))
      } catch {
        // **못 썼으면 앞 방문을 남기지 않는다**(위 머리말 «못 쓰면») — 남으면 다음 읽기가 그것을 되살린다.
        remove(storage, key)
      }
    },

    forget() {
      // **올리는 것은 로그아웃한 탭뿐이다** — 표지와 이 탭의 세대 중 큰 것 + 1.
      const next = Math.max(era, signedOutEra(open(shared))) + 1
      forgetAt(next)
      return next
    },

    forgetHeard(heard) {
      forgetAt(heard ?? era + 1)
    },

    admit(userId) {
      admitted = userId
      const storage = open(session)
      if (storage === null) return
      const own = DRAFT_KEY_PREFIX + userId
      for (const key of draftKeys(storage)) if (key !== own) remove(storage, key)
    },
  }
}

const DraftStoreContext = createContext<DraftStore | null>(null)

export function DraftStoreProvider(props: { store: DraftStore | null; children: ReactNode }): ReactElement {
  return <DraftStoreContext.Provider value={props.store}>{props.children}</DraftStoreContext.Provider>
}

/** 초안의 사본. **Provider 가 없으면 `null`이고 던지지 않는다** — 그때 초안은 메모리에만 산다. */
export function useDraftStore(): DraftStore | null {
  return useContext(DraftStoreContext)
}
