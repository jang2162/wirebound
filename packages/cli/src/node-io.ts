/**
 * 진짜 `Io` 하나. **`node:*`를 부르는 자리는 이 파일뿐이어야 한다**(D9 —
 * `test/io-boundary.test.ts`가 `src/`를 훑어 센다).
 *
 * 이 파일은 케이스가 거의 못 덮는다(진짜 홈·진짜 소켓을 건드리기 때문이다). 그래서
 * **여기에는 판단을 두지 않는다** — 조립만 하고, 무엇을 어디에 쓸지는 전부 `commands/`가
 * 정한다. `build-test/dist-bin.test.ts`가 이 파일이 실제로 서는지(shebang·실행 권한·
 * `bin` 필드)를 빌드 결과물로 잰다(D11).
 */
import { createInterface } from 'node:readline'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import type { HttpRequestInit, HttpResponse, Io } from './io'

/** 자격 파일의 권한. 소유자만 읽고 쓴다(D6). */
export const CREDENTIALS_FILE_MODE = 0o600
/** 자격 디렉터리의 권한. 소유자만 드나든다. */
export const CREDENTIALS_DIR_MODE = 0o700

export function createNodeIo(): Io {
  return {
    cwd: process.cwd(),
    home: homedir(),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    files: {
      read: async (path) => {
        try {
          return await readFile(path, 'utf8')
        } catch (error) {
          // *"없다"*만 `null`로 접는다. 권한 오류 같은 것은 그대로 올려 보내야
          // `run`이 그 문장을 사람에게 보인다.
          if (isNotFound(error)) return null
          throw error
        }
      },
      write: async (path, content, options) => {
        await mkdir(dirname(path), { recursive: true, mode: options?.dirMode })
        await writeFile(path, content, { encoding: 'utf8', mode: options?.mode })
      },
      kind: async (path) => {
        try {
          return (await stat(path)).isDirectory() ? 'directory' : 'file'
        } catch (error) {
          // `read`와 **같은 술어**를 쓴다 — *"없다"*만 접고 나머지는 올려 보낸다.
          if (isNotFound(error)) return null
          throw error
        }
      },
    },
    fetch: async (url: string, init?: HttpRequestInit): Promise<HttpResponse> => {
      // 전역 `fetch`를 그대로 쓴다 — HTTP 클라이언트를 새로 들이지 않는다(D10).
      // `Response`가 `HttpResponse`의 면을 이미 갖는다(`bytes()` 포함 — Node 22).
      return await fetch(url, init)
    },
    promptSecret: async (label) => {
      // **tty가 아니면 묻지 않는다.** CI에서 물으면 그 작업이 영원히 멈춘다.
      if (!process.stdin.isTTY) return null
      return await readHidden(label)
    },
    readStdin: async () => {
      if (process.stdin.isTTY) return null
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk as Buffer))
      }
      const text = Buffer.concat(chunks).toString('utf8')
      return text.length === 0 ? null : text
    },
  }
}

/**
 * 읽기 실패가 *"그 파일이 없다"*인가. **`ENOENT` 하나만 참이다.**
 *
 * *"없다"*는 정상 갈래라 `read`가 `null`로 접지만(자격 파일이 아직 없는 것은 흔하다),
 * **그 밖의 실패는 접으면 안 된다.** 접히면 `chmod 000`된 자격 파일이 *"`wireb login`을
 * 먼저 실행하세요"*(코드 2)로 나가 **이미 로그인했고 파일도 있는 사람이 엉뚱한 곳을 본다.**
 *
 * ---
 *
 * # 왜 export 하는가 — **대역이 대역이 아니었다** (델타 리뷰 D4)
 *
 * 앞 판은 이 술어를 `read()`를 통해서만 쟀다. `chmod 000`은 **root로 도는 판(흔한 CI
 * 컨테이너)에서 그냥 읽혀** 값이 누가 돌리느냐에 갈리므로, 대신 **디렉터리를 파일로 읽어
 * `EISDIR`**을 얻는 대역을 썼다. 그 회피 이유는 옳았다.
 *
 * **그런데 그 대역이 원래 물음을 안 쟀다.** `EISDIR`은 *"ENOENT가 아닌 실패"*의 **한
 * 예일 뿐**이라, 자가 그 **한 코드**만 본다. 리뷰어가 `EISDIR`은 그대로 던지되
 * **`EACCES`·`EPERM`만** 접는 변이를 심었더니 **81건 중 0건**이 죽었고, 그때
 * `wireb pull`이 실제로 코드 2 *"`wireb login`을 먼저 실행하세요"*로 나갔다(리뷰어 실측).
 * **N8이 원래 지목한 결말 그대로다.**
 *
 * 그래서 술어를 **코드 표로 직접 잰다** — 파일 시스템도 `chmod`도 root 여부도 안 타므로
 * 피하려던 문제가 애초에 안 생긴다. `test/node-io.test.ts`가 그 표를 든다.
 *
 * **`EISDIR` 케이스는 그대로 둔다.** 그쪽은 **진짜 파일 시스템을 지나는** 카나리아이고
 * 이쪽은 **술어를 지나는** 자다 — 둘이 서로를 대신하지 않는다.
 */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * 에코를 끄고 한 줄을 읽는다.
 *
 * `readline`은 입력을 그대로 되비추므로 그 사이에 끼어들어 지운다 — 비밀번호가 화면에
 * 남으면 어깨너머로도 스크롤백으로도 새어 나간다. 이 저장소에 프롬프트 라이브러리가
 * 없고 들이지도 않는다(D10).
 */
async function readHidden(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const target = rl as unknown as { _writeToOutput?: (text: string) => void; output?: { write(text: string): void } }
  const original = target._writeToOutput
  target._writeToOutput = (text: string): void => {
    // 라벨 자체는 보여야 한다. 그 뒤에 오는 타이핑만 삼킨다.
    if (text.includes(label)) {
      target.output?.write(text)
      return
    }
    target.output?.write('')
  }

  try {
    return await new Promise<string>((resolve) => {
      rl.question(label, (answer) => {
        process.stdout.write('\n')
        resolve(answer)
      })
    })
  } finally {
    target._writeToOutput = original
    rl.close()
  }
}
