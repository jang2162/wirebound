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
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
    },
    fetch: async (url: string, init?: HttpRequestInit): Promise<HttpResponse> => {
      // 전역 `fetch`를 그대로 쓴다 — HTTP 클라이언트를 새로 들이지 않는다(D10).
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

function isNotFound(error: unknown): boolean {
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
