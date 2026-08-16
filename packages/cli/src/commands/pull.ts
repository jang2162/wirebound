/**
 * `wireb pull` — §12.3의 *"프로젝트 스냅샷을 로컬 JSON으로 (읽기 전용)"*.
 *
 * `GET /api/projects/:projectId/snapshot`(**단수**)을 부른다. 복수(`POST .../snapshots`)는
 * **쓰기이고 editor 전용이며 지울 수 없는 태그를 남긴다** — 리포를 동기화할 때마다 그것을
 * 부르면 태그가 무한히 쌓인다(D8, `apps/api/README.md`의 표).
 *
 * ---
 *
 * # 어디에 어떤 이름으로 쓰는가
 *
 * **`.wirebound.json`이 있던 디렉터리에 `wirebound-snapshot.json`.** `-o`로 덮을 수 있고,
 * 상대 경로는 **현재 디렉터리** 기준으로 푼다(사람이 친 경로는 사람이 서 있는 곳에서
 * 읽히는 것이 맞다).
 *
 * | 판정 | 왜 |
 * |---|---|
 * | 리포 뿌리(cwd가 아니다) | 바인딩과 그 산출물이 같은 자리에 있어야 하위 디렉터리에서 쳐도 같은 파일이 갱신된다 |
 * | 숨김 파일이 아니다 | 사람이 열어 볼 값이다. `git status`에 보여야 *"커밋할지"*를 정할 수 있다 |
 * | 한 파일 | payload가 이미 프로젝트 전체를 한 값으로 나른다(`snapshot-payload.ts`) |
 *
 * # 자격이 리포에 남지 않는다
 *
 * 여기서 쓰는 것은 payload뿐이다. `test/no-token-in-repo.test.ts`가 **CLI가 리포 안에
 * 쓴 파일 전부**를 훑어 그것을 지킨다 — 이 파일이 하나 더 늘어난 지금도 그 자가 분모를
 * 스스로 만든다.
 *
 * # 세 갈래를 말한다 (T6)
 *
 * | 무엇 | 코드 | 문장의 요지 |
 * |---|---|---|
 * | 자격이 없다 | 2 | *"`wireb login`을 먼저"* |
 * | 서버가 거절했다(404·403…) | 3 | **서버가 쓴 문장 그대로** — 프로젝트 불일치의 404가 여기 온다 |
 * | 서버에 닿지 못했다 | 4 | 주소와 원인(`ECONNREFUSED` 등) |
 *
 * 셋을 *"에러 처리"*로 뭉뚱그리지 않는 것이 이 명령의 값이다. 가르는 코드는
 * `client.ts` 한 자리에 있다.
 */
import { requireBinding } from '../binding'
import { callApi, parseJson } from '../client'
import { findToken } from '../credentials'
import { EXIT, configError } from '../exit'
import type { Io } from '../io'
import { join, resolveFrom } from '../paths'

/** `-o`를 안 주면 이 이름으로 리포 뿌리에 쓴다. */
export const DEFAULT_PULL_FILE = 'wirebound-snapshot.json'

export interface PullOptions {
  out?: string
}

export async function runPull(io: Io, options: PullOptions): Promise<number> {
  const binding = await requireBinding(io)

  const token = await findToken(io, binding.server, binding.projectId)
  if (token === null) {
    throw configError(
      `${binding.server} 의 프로젝트 ${binding.projectId} 에 쓸 자격이 없습니다. \`wireb login\`을 먼저 실행하세요`,
    )
  }

  const response = await callApi(io, binding.server, {
    method: 'GET',
    path: `/api/projects/${binding.projectId}/snapshot`,
    token,
  })

  const target =
    options.out === undefined ? join(binding.root, DEFAULT_PULL_FILE) : resolveFrom(io.cwd, options.out)

  // **받은 글자를 그대로 쓰지 않고 한 번 편다.** 사람이 열어 볼 파일이고 `git diff`가
  // 읽혀야 한다 — 서버는 한 줄로 보낸다. 파싱이 곧 봉투 검사이기도 하다.
  const payload = parseJson(response, '프로젝트 덤프') as { pages?: unknown[]; menu?: unknown[] }
  await io.files.write(target, `${JSON.stringify(payload, null, 2)}\n`)

  io.out(`${target}에 썼습니다`)
  io.out(`메뉴 ${payload.menu?.length ?? 0}개 · 페이지 ${payload.pages?.length ?? 0}개`)
  return EXIT.ok
}
