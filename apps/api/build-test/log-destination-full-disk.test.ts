/**
 * **가득 찬 파일시스템에서 떨구는 중에 끝내도 `flushSync`에서 멈추지 않는다**(`src/log-destination.ts`의 «공간이 차면 줄만 떨군다»).
 *
 * `test/log-destination.test.ts`의 `/dev/full` 판은 진짜 «가득 찬 디스크»가 아니다 — `/dev/full`은 0 바이트 쓰기도 ENOSPC 로
 * 거절하지만 가득 찬 파일시스템은 0 바이트를 받고 1 바이트만 거절한다. 떨구는 중에 `flushSync`를 밀어내면 sonic-boom 의 `flushSync`가
 * ENOSPC 에 100ms 쉬고 영영 되풀이하는 증상은 뒤의 판에서만 선다. 그래서 **작은 tmpfs 를 채운 리눅스 컨테이너**에서 잰다(macOS 에는
 * tmpfs 가 없다).
 *
 * 판: 자식(`log-destination-full-disk-child.ts`)을 esbuild 로 한 파일에 묶어 `docker cp`로 넣는다 — 스크래치나 저장소를
 * `docker run -v`로 붙이지 않는다(런타임의 공유 경로가 아니면 빈 디렉터리가 오류 없이 붙는다). 컨테이너 안에서 목적지 파일을 만든 뒤
 * `/full`을 `dd`로 채우고, 0 · 1 바이트 쓰기를 먼저 재서 판이 섰는지 본다(카나리아). 자식은 `timeout 8` 아래에서 돈다 — 멈추면 124 다.
 *
 * **건너뛰는 전제는 실물이다** — 도커가 있는지가 아니라, 그 이미지(`--pull never` — 받지 않는다)로 tmpfs 컨테이너를 띄워 0 바이트는
 * 되고 1 바이트는 ENOSPC 인지 본다. 안 서면 까닭을 찍고 건너뛴다.
 *
 * | 변조(`src/log-destination.ts`) | 값 |
 * |---|---|
 * | 떨구는 중의 `flushSync`도 밀어낸다 | `timeout` 종료 124 |
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 컨테이너 이미지 — Node 하한(`engines` 22.18)을 넘고 `timeout`(coreutils)이 있다. 받지 않으므로 기계에 있어야 한다. */
const IMAGE = process.env.LOG_FULL_DISK_IMAGE ?? 'node:24-slim'

/** 컨테이너 안에서 도는 순서 — 목적지 파일을 만들고 `/full`을 채운 뒤 0 · 1 바이트를 재고 자식을 돌린다. */
const RUN = `
set -u
: > /full/out.log
dd if=/dev/zero of=/full/pad bs=4096 2>/dev/null
node -e "const fs=require('fs');const fd=fs.openSync('/full/out.log','a');for(const [n,b] of [['zero',Buffer.alloc(0)],['one',Buffer.from('x')]]){try{fs.writeSync(fd,b);console.log(n+' ok')}catch(e){console.log(n+' '+e.code)}}"
[ "\${1:-}" = probe ] && exit 0
timeout 8 node /w/child.mjs /full/out.log
echo "exit=$?"
`

function docker(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const out = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
  return { status: out.status, stdout: out.stdout ?? '', stderr: out.stderr ?? out.error?.message ?? '' }
}

/** 파일들을 넣은 tmpfs 컨테이너를 돌리고 출력을 낸다 — 컨테이너는 늘 지운다. */
function runInContainer(files: Record<string, string>, mode: 'probe' | 'run'): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'wb-full-disk-'))
  const created = docker(['create', '--pull', 'never', '--tmpfs', '/full:size=64k', IMAGE, 'sh', '/w/run.sh', mode])
  const id = created.stdout.trim()
  try {
    if (created.status !== 0) return created
    for (const [name, body] of Object.entries({ ...files, 'run.sh': RUN })) writeFileSync(join(dir, name), body)
    const copied = docker(['cp', `${dir}/.`, `${id}:/w/`])
    if (copied.status !== 0) return copied
    return docker(['start', '-a', id])
  } finally {
    if (id !== '') docker(['rm', '-f', id])
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 판이 서는가 — 실물로 잰다(머리말 «건너뛰는 전제는 실물이다»). */
function prerequisite(): { ok: true } | { ok: false; reason: string } {
  const probe = runInContainer({}, 'probe')
  if (probe.status !== 0)
    return {
      ok: false,
      reason: `${IMAGE} 로 tmpfs 컨테이너를 못 띄웠다(종료 ${probe.status}): ${(probe.stderr || probe.stdout).trim().split('\n')[0]}`,
    }
  if (probe.stdout !== 'zero ok\none ENOSPC\n')
    return { ok: false, reason: `tmpfs 가 «0 바이트는 되고 1 바이트는 ENOSPC» 판이 아니다: ${JSON.stringify(probe.stdout)}` }
  return { ok: true }
}

const 전제 = prerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[가득 찬 파일시스템 판] 건너뛴다 — ${전제.reason}`)
}

/** 자식을 한 파일로 묶는다 — esbuild 는 `tsx`가 딸고 온 것을 쓴다(이 앱의 직접 의존이 아니다). */
async function bundleChild(): Promise<string> {
  const require = createRequire(createRequire(import.meta.url).resolve('tsx/package.json'))
  // 이 앱의 의존이 아니라 타입도 없다 — 쓰는 모양만 적는다.
  const esbuild = require('esbuild') as {
    build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }>
  }
  const result = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('./log-destination-full-disk-child.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    // 묶인 CJS(pino)가 `require`를 부른다 — ESM 에는 없다.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  })
  return result.outputFiles[0]!.text
}

describe.skipIf(!전제.ok)('가득 찬 파일시스템(tmpfs)', () => {
  it('떨구는 중에 끝내도 `flushSync`가 곧바로 돌아온다 — 알림 한 줄 · 종료 0', async () => {
    const out = runInContainer({ 'child.mjs': await bundleChild() }, 'run')
    const lines = out.stdout.split('\n').filter((line) => line !== '')
    // 카나리아 — 이 판의 목적지는 0 바이트를 받고 1 바이트를 거절한다(`/dev/full`과 가르는 성질).
    expect(lines.slice(0, 2), out.stderr).toEqual(['zero ok', 'one ENOSPC'])
    expect(lines.slice(2), out.stderr).toEqual([expect.stringMatching(/^끝까지 왔다 flushSync=\d+ms$/), 'exit=0'])
    expect(Number(/flushSync=(\d+)ms/.exec(out.stdout)?.[1])).toBeLessThan(1_000)
    expect(out.stderr).toMatch(/^로그 목적지\(fd \d+\)에 쓰지 못해\(ENOSPC\) 쓸 수 있을 때까지 로그 줄을 버립니다\n$/)
  }, 60_000)
})
