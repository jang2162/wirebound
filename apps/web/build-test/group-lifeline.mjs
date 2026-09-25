/**
 * **띄운 프로세스가 사라지면 제 프로세스 그룹째 끝낸다** — `editor-stack.ts` 의 `spawnGroup` 이 api · vite 를 이것에 매달아 띄운다.
 *
 * 쓰는 법: `node group-lifeline.mjs <지켜볼 pid> <명령> [인자…]`. 이 프로세스가 그룹의 머리(`detached`)이고 명령은 그 그룹 안의
 * 자식이다(표준 입출력을 물려준다). 명령이 끝나면 같은 코드로 끝나고, 지켜볼 pid 가 사라지면 그룹 전부를 `SIGKILL` 한다.
 *
 * 왜 필요한가: 판은 api · vite 를 **떼어 띄운다**(제 그룹 — 거둘 때 손자까지 그룹째 보낸다). 그래서 vitest 가 `SIGKILL` 로 죽으면
 * 그 그룹들은 함께 안 죽고 `exit` 처리기도 못 돈다 — 고아로 남아 포트 · DB 연결을 쥔다. [macOS] `pnpm vitest run --project build
 * apps/web/build-test/editor-page-move.test.ts` 를 판이 선 뒤 그룹째 `SIGKILL` 하면 4s 뒤 tsx · node(api) · vite · esbuild 넷이
 * 남았다(Chrome 은 파이프가 닫혀 스스로 끝났다).
 */
import { spawn } from 'node:child_process'

const [watched, command, ...args] = process.argv.slice(2)
const watchedPid = Number(watched)
if (!Number.isInteger(watchedPid) || watchedPid <= 0 || command === undefined) {
  process.stderr.write('쓰는 법: node group-lifeline.mjs <지켜볼 pid> <명령> [인자…]\n')
  process.exit(2)
}

const child = spawn(command, args, { stdio: 'inherit' })
child.on('error', (error) => {
  process.stderr.write(`${command} 를 못 띄웠다: ${error.message}\n`)
  process.exit(127)
})
child.on('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)))

/** 지켜볼 pid 가 살아 있나 — EPERM 은 남의 프로세스로 살아 있다는 뜻이다. */
function watchedAlive() {
  try {
    process.kill(watchedPid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

setInterval(() => {
  if (watchedAlive()) return
  try {
    process.kill(-process.pid, 'SIGKILL')
  } catch {
    process.exit(1)
  }
}, 250)
