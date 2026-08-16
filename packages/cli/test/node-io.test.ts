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
import { createNodeIo } from '../src/node-io'

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
