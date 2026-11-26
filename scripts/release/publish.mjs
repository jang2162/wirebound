#!/usr/bin/env node
// npm 에 아직 없는 판만 골라 pnpm pack 뒤 npm publish 로 낸다 — `.github/workflows/publish.yml` 이 부른다.
//
//   node scripts/release/publish.mjs plan                       낼 것을 고르고 적기만 한다
//   node scripts/release/publish.mjs pack <디렉터리>            고른 것을 pack 하고 tarball 을 검사한다
//   node scripts/release/publish.mjs publish <디렉터리> [--dry-run]   pack 한 tarball 을 npm publish 한다
//
// 왜 pnpm publish 가 아니라 pack + npm publish 인가: pnpm 10.0.0 의 publish 는 스스로 OIDC 를 다루지 않고
// pack 한 tarball 을 PATH 의 npm 에 넘긴다. 그 길을 드러내 두면 Trusted Publishing 이 요구하는 npm 판
// (11.5.1 이상)을 이 스크립트가 직접 확인하고, `workspace:` 범위가 실제 판으로 바뀌었는지 tarball 로 잴 수 있다.
//
// 낼 집합은 `private` 가 아닌 워크스페이스 패키지 전부다(이름을 적어 두지 않는다). 차례는 의존 먼저.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const MIN_NPM = [11, 5, 1]

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
}

function workspacePackages() {
  const list = JSON.parse(run('pnpm', ['ls', '-r', '--depth', '-1', '--json']))
  return list
    .filter((p) => !p.private)
    .map((p) => {
      const manifest = JSON.parse(readFileSync(join(p.path, 'package.json'), 'utf8'))
      return { name: manifest.name, version: manifest.version, dir: p.path, manifest }
    })
}

// 의존(dependencies · peer · optional) 먼저. devDependencies 는 받는 쪽 설치에 안 들어 차례에 안 넣는다.
function dependencyOrder(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.name, p]))
  const out = []
  const state = new Map()
  const visit = (p, trail) => {
    if (state.get(p.name) === 'done') return
    if (state.get(p.name) === 'open') throw new Error(`의존 고리: ${[...trail, p.name].join(' → ')}`)
    state.set(p.name, 'open')
    const m = p.manifest
    const deps = Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies }).sort()
    for (const d of deps) if (byName.has(d)) visit(byName.get(d), [...trail, p.name])
    state.set(p.name, 'done')
    out.push(p)
  }
  for (const p of [...pkgs].sort((a, b) => a.name.localeCompare(b.name))) visit(p, [])
  return out
}

// 그 판이 레지스트리에 있는가. 404 만 «없다» 로 읽는다 — 다른 실패(망 · 권한)는 던진다.
function published(name, version) {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], { encoding: 'utf8' })
  if (r.status === 0) return r.stdout.trim() !== ''
  if (/E404|404 Not Found/.test(`${r.stdout}\n${r.stderr}`)) return false
  throw new Error(`npm view ${name}@${version} 실패(종료 ${r.status}):\n${r.stderr || r.stdout}`)
}

function plan() {
  const ordered = dependencyOrder(workspacePackages())
  const pick = []
  for (const p of ordered) {
    if (published(p.name, p.version)) console.log(`건너뜀  ${p.name}@${p.version} — 이미 레지스트리에 있다`)
    else {
      console.log(`낼 것   ${p.name}@${p.version}`)
      pick.push(p)
    }
  }
  console.log(`대상 ${ordered.length} 개 · 낼 것 ${pick.length} 개`)
  return pick
}

function checkNpm() {
  const v = run('npm', ['--version']).trim()
  const parts = v.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_NPM[i]) break
    if (parts[i] < MIN_NPM[i]) throw new Error(`npm ${v} — Trusted Publishing 은 npm ${MIN_NPM.join('.')} 이상이 필요하다`)
  }
  console.log(`npm ${v}`)
}

// tarball 의 package.json 에 `workspace:` 가 남았으면 받는 쪽 설치가 깨진다 — 내기 전에 멈춘다.
function checkTarball(tgz, expect) {
  const manifest = JSON.parse(run('tar', ['-xOzf', tgz, 'package/package.json']))
  if (manifest.name !== expect.name || manifest.version !== expect.version) {
    throw new Error(`${tgz}: ${manifest.name}@${manifest.version} — ${expect.name}@${expect.version} 이어야 한다`)
  }
  const left = []
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
    for (const [k, v] of Object.entries(manifest[field] ?? {})) if (String(v).startsWith('workspace:')) left.push(`${field}.${k}=${v}`)
  }
  if (left.length > 0) throw new Error(`${tgz}: workspace: 범위가 남았다 — ${left.join(', ')}`)
  const deps = Object.entries(manifest.dependencies ?? {})
    .filter(([k]) => k.startsWith('@wirebound/'))
    .map(([k, v]) => `${k}@${v}`)
  console.log(`검사    ${manifest.name}@${manifest.version}${deps.length ? ` (${deps.join(', ')})` : ''}`)
}

function pack(dest) {
  const pick = plan()
  mkdirSync(dest, { recursive: true })
  const order = []
  for (const p of pick) {
    const before = new Set(readdirSync(dest))
    run('pnpm', ['pack', '--pack-destination', dest], { cwd: p.dir, stdio: ['ignore', 'pipe', 'inherit'] })
    const made = readdirSync(dest).filter((f) => f.endsWith('.tgz') && !before.has(f))
    if (made.length !== 1) throw new Error(`${p.name}: pack 이 tarball ${made.length} 개를 냈다`)
    const tgz = join(dest, made[0])
    checkTarball(tgz, p)
    order.push({ name: p.name, version: p.version, tarball: made[0] })
  }
  writeFileSync(join(dest, 'order.json'), `${JSON.stringify(order, null, 2)}\n`)
  console.log(`pack ${order.length} 개 → ${dest}/order.json`)
}

function publish(dest, dryRun) {
  checkNpm()
  const order = JSON.parse(readFileSync(join(dest, 'order.json'), 'utf8'))
  if (order.length === 0) console.log('낼 것이 없다')
  for (const p of order) {
    // 판에 `-` 가 들면(프리릴리스) latest 를 안 옮긴다.
    const tag = p.version.includes('-') ? ['--tag', 'next'] : []
    const args = ['publish', join(dest, p.tarball), '--access', 'public', ...tag, ...(dryRun ? ['--dry-run'] : [])]
    console.log(`npm ${args.join(' ')}`)
    const r = spawnSync('npm', args, { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`${p.name}@${p.version} 내기 실패(종료 ${r.status})`)
  }
}

const [cmd, dir, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'plan') plan()
  else if (cmd === 'pack' && dir) pack(resolve(dir))
  else if (cmd === 'publish' && dir) publish(resolve(dir), rest.includes('--dry-run'))
  else {
    console.error('쓰는 법: publish.mjs plan | pack <디렉터리> | publish <디렉터리> [--dry-run]')
    process.exit(2)
  }
} catch (e) {
  console.error(`::error::${e.message}`)
  process.exit(1)
}
