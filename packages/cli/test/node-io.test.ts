/**
 * **진짜 `Io`를 재는 유일한 자리.**
 *
 * 보고서 §5가 `node-io.ts`를 *"케이스가 거의 못 덮는다"*고 적었고 그것이 참이다 — 진짜
 * 홈과 진짜 소켓을 건드리기 때문이다. 그런데 그 파일에 **판단이 하나 있다**: `isNotFound`가
 * *"없다"*와 그 밖의 읽기 실패를 가른다. 그 판단은 주석이 주장할 뿐 지키는 자가 없었다
 * (리뷰 N8 — `isNotFound`를 항상 `true`로 바꿔도 71건 중 **0건**이 죽었다, 리뷰어 실측).
 *
 * ---
 *
 * # 왜 디렉터리를 읽는가 — `chmod 000`이 아니라
 *
 * 그 판단이 지키는 실제 상황은 **권한 오류**다(그 파일의 주석이 그렇게 적었다). 그것을
 * 그대로 재려면 `chmod 000`한 파일을 읽어야 하는데, **root로 도는 판(흔한 CI 컨테이너)에서는
 * 그 파일이 그냥 읽힌다** — 케이스가 누가 돌리느냐에 따라 갈린다.
 *
 * **디렉터리를 파일로 읽으면 `EISDIR`이다**(쟀다). *"ENOENT가 아닌 읽기 실패"*라는 점에서
 * 권한 오류와 **같은 부류**이고, 누가 돌려도 값이 같다. 지키려는 명제는
 * *"`isNotFound`가 모든 실패를 `null`로 접지 않는다"*이지 *"EPERM을 올려 보낸다"*가 아니다.
 *
 * # 왜 이 파일은 `node:*`를 써도 되는가
 *
 * `io-boundary.test.ts`의 인구조사는 **`src/`만** 훑는다. 자를 `test/`에 두는 것이 이
 * 저장소의 관례다(`permission-matrix.test.ts`가 `src/routes/`를 훑는 것과 같은 배치).
 */
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createNodeIo, isNotFound } from '../src/node-io'

/** 이 테스트 파일이 사는 디렉터리. **실재하고, 파일이 아니다.** */
const A_DIRECTORY = fileURLToPath(new URL('.', import.meta.url))
const NOT_THERE = fileURLToPath(new URL('./이런-파일은-없다.json', import.meta.url))

describe('createNodeIo().files.read — *"없다"*와 *"못 읽었다"*를 가른다', () => {
  it('없는 파일은 null이다 — 정상 갈래이므로 예외로 만들지 않는다', async () => {
    const io = createNodeIo()
    await expect(io.files.read(NOT_THERE)).resolves.toBeNull()
  })

  /**
   * **접히면 안 되는 자리다.** 접히면 `chmod 000`된 자격 파일이 *"`wireb login`을 먼저
   * 실행하세요"*(2)로 나가 사람이 엉뚱한 곳을 본다 — 실제로는 이미 로그인했고 파일도 있다.
   */
  it('읽을 수 없는 것은 던진다 — null로 접지 않는다', async () => {
    const io = createNodeIo()
    await expect(io.files.read(A_DIRECTORY)).rejects.toThrow()
  })

  it('그 둘이 실제로 다른 갈래다 — 하네스 카나리아', async () => {
    const io = createNodeIo()
    // 위 둘이 같은 경로를 보고 있으면 아무것도 안 재는 것이다.
    expect(A_DIRECTORY).not.toBe(NOT_THERE)
    // 그리고 디렉터리 쪽 실패는 *"없다"*가 아니다.
    await expect(io.files.read(A_DIRECTORY)).rejects.toMatchObject({ code: 'EISDIR' })
  })
})

/**
 * **술어를 직접 잰다 — `EISDIR` 대역이 못 재던 자리다**(델타 리뷰 D4).
 *
 * 위 케이스들은 진짜 파일 시스템을 지나므로 **그 실행이 실제로 만드는 코드 하나**만 본다
 * (`EISDIR`). 그래서 `EISDIR`은 그대로 던지되 **`EACCES`·`EPERM`만** 접는 변이가
 * **81건 중 0건**을 죽였다(리뷰어 실측) — 그러고도 `chmod 000`된 자격 파일이 코드 2
 * *"`wireb login`을 먼저 실행하세요"*로 나갔다.
 *
 * 표로 재면 파일 시스템도 `chmod`도 root 여부도 안 탄다. **`chmod 000`을 피한 이유가
 * 여기서는 성립하지 않는다.**
 */
describe('isNotFound — ENOENT 하나만 접는다', () => {
  it('없는 파일만 참이다', () => {
    expect(isNotFound({ code: 'ENOENT' })).toBe(true)
  })

  /**
   * **`EACCES`·`EPERM`이 이 목록의 이유다.** 나머지는 같은 부류를 넓게 덮는다 —
   * 하나만 재면 그 하나만 지키는 자가 된다.
   */
  it.each(['EACCES', 'EPERM', 'EISDIR', 'ELOOP', 'EMFILE', 'ENOTDIR', 'EBUSY', 'EIO'])(
    '%s는 접지 않는다 — 던져야 사람이 원인을 본다',
    (code) => {
      expect(isNotFound({ code })).toBe(false)
    },
  )

  it('코드가 없거나 오류가 아닌 것도 접지 않는다', () => {
    expect(isNotFound(new Error('코드가 없다'))).toBe(false)
    expect(isNotFound({})).toBe(false)
    expect(isNotFound(null)).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
    expect(isNotFound('ENOENT')).toBe(false)
  })

  /**
   * **접두사가 같다고 접히면 안 된다.** `ENOENT`로 시작하는 다른 코드는 없지만, 술어를
   * `startsWith`나 `includes`로 느슨하게 바꾸는 판을 이 줄이 막는다.
   */
  it('ENOENT를 품기만 한 코드는 접지 않는다', () => {
    expect(isNotFound({ code: 'ENOENTX' })).toBe(false)
    expect(isNotFound({ code: 'XENOENT' })).toBe(false)
  })
})
