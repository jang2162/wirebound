/**
 * **명령이 바깥 세계와 만나는 다섯 자리를 값 하나로 묶는다**(P9-2 D9).
 *
 * 파일·네트워크·출력·환경·현재 디렉터리. 명령이 이것을 모듈 안에서 직접 부르면 케이스가
 * **진짜 홈 디렉터리와 진짜 서버**를 건드리게 되고, 그런 케이스는 개발자 기계에서만
 * 통과한다.
 *
 * **`node:fs`를 직접 부르는 자리가 `createNodeIo` 하나여야 한다.** 그 밖에 하나라도
 * 남으면 위 문장이 거짓이 된다 — `test/io-boundary.test.ts`가 `src/`를 훑어 그것을 센다.
 *
 * **`process.exit`도 여기 없다**(D9). 종료 코드는 `run`이 **값으로** 돌려주고 그것을
 * 실제 종료로 바꾸는 것은 `bin.ts` 한 줄이다 — 케이스가 코드를 읽을 수 있어야 한다.
 */

/** `fetch`에 넘길 것 중 이 CLI가 쓰는 것만. 전역 `fetch`의 부분집합이다(D10). */
export interface HttpRequestInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

/** `fetch`가 돌려주는 것 중 이 CLI가 읽는 것만. */
export interface HttpResponse {
  status: number
  headers: {
    get(name: string): string | null
    /**
     * `Set-Cookie`를 **배열로** 돌려준다. `get('set-cookie')`는 여럿일 때 쉼표로 이어
     * 붙이는데 쿠키의 `Expires` 값 안에도 쉼표가 있어 되가를 수 없다.
     * Node 22의 `Headers`가 이 메서드를 갖는다(재라 #4에서 함께 쟀다).
     */
    getSetCookie(): string[]
  }
  text(): Promise<string>
  /**
   * 본문을 **날 바이트로**. `wireb export`가 zip을 받는 자리다(P9-3 D9).
   *
   * **`text()`와 둘 중 하나만 부른다.** 진짜 `Response`의 본문은 한 번만 읽힌다 —
   * 오류 응답은 서버가 쓴 문장을 옮겨야 하므로 `text()`, 2xx는 `bytes()`다.
   *
   * `Response.bytes()`가 Node 22.x에 있다(전역 `fetch`가 내는 것이 그것이다).
   */
  bytes(): Promise<Uint8Array>
}

export type HttpFetch = (url: string, init?: HttpRequestInit) => Promise<HttpResponse>

/** 파일 조작. **경로는 전부 절대 경로다** — 상대 경로를 푸는 것은 명령의 몫이다. */
export interface FileIo {
  /** 없으면 `null`. *"없다"*를 예외로 만들지 않는 것은 그것이 정상 갈래이기 때문이다. */
  read(path: string): Promise<string | null>
  /** 부모 디렉터리는 이 함수가 만든다. `mode`는 파일 권한(8진수). */
  write(path: string, content: string, options?: { mode?: number; dirMode?: number }): Promise<void>
  /**
   * 그 경로에 **무엇이 있는가.** 없으면 `null`(P9-3 리뷰 N6).
   *
   * **`read`로는 이 물음에 답할 수 없다** — 디렉터리를 읽으면 `EISDIR`로 던지므로
   * *"디렉터리다"*와 *"못 읽는다"*가 같은 모양이 된다. `wireb export`가 `-o`를 쓰기
   * **전에** 그 자리가 파일인지 알아야 하고, 그것이 이 자리의 존재 이유다.
   *
   * **`null`로 말하는 결을 따른다** — `promptSecret`·`readStdin`이 tty 아님을 예외가
   * 아니라 `null`로 말하는 것과 같다(P9-2 이월 §5). *"없다"*는 정상 갈래다.
   *
   * **접히는 것은 *"없다"* 하나뿐이다.** 권한 오류 같은 것은 그대로 올라간다 —
   * `read`의 `isNotFound`와 같은 규칙이고 `test/node-io.test.ts`가 그 표를 든다.
   */
  kind(path: string): Promise<'file' | 'directory' | null>
}

export interface Io {
  /** 명령이 시작된 디렉터리. `.wirebound.json`을 여기서부터 위로 찾는다. */
  cwd: string
  /** 홈 디렉터리. 자격 파일이 이 아래 산다(D6 — 리포에 쓰지 않는다). */
  home: string
  env: Record<string, string | undefined>
  /** 사람이 읽을 것. 줄바꿈은 부르는 쪽이 붙이지 않는다 — 이 함수가 붙인다. */
  out(line: string): void
  /** 오류·안내. 표준출력을 파이프로 받는 쪽이 그것에 섞이지 않아야 한다. */
  err(line: string): void
  files: FileIo
  fetch: HttpFetch
  /**
   * 에코 없이 한 줄을 묻는다. **tty가 아니면 `null`**이고, 그때 호출자는 표준입력을 읽는다.
   * 비밀번호가 argv에 오지 않게 하는 것이 이 자리의 존재 이유다(D7).
   */
  promptSecret(label: string): Promise<string | null>
  /** 표준입력 전문. 비어 있거나 tty면 `null`. */
  readStdin(): Promise<string | null>
}
