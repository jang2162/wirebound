#!/usr/bin/env python3
"""P6-2 구분력 실증. 변이를 심고 케이스를 돌린 뒤 `finally`에서 원본 전문을 되쓴다.

`git checkout --`을 쓰지 않는다(전역 제약). 새 파일은 untracked라 `git diff`가 늘 비므로
복구 확인은 **파일 내용**으로 한다.
"""
import subprocess, sys, json, os

# 저장소 루트. 이 파일이 `docs/superpowers/plans/` 아래 있으므로 세 칸 올라간다.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

API_SUITE = [
    "apps/api/test/restore.test.ts",
    "apps/api/test/restore-plan.test.ts",
    "apps/api/test/snapshots.test.ts",
    "apps/api/test/permission-matrix.test.ts",
    "apps/api/test/canonical-json.test.ts",
    "apps/api/test/snapshot-capture.test.ts",
    "apps/api/test/restore-concurrency.test.ts",
]

# 잠금 census는 느리다(라우트마다 실제 커밋 + 대기 창). 잠금을 건드리는 변이에만 붙인다.
LOCK_SUITE = API_SUITE + ["apps/api/test/restore-lock-census.test.ts"]
WEB_SUITE = [
    "apps/web/test/routes/snapshots.test.tsx",
    "apps/web/test/projects/project-actions.test.ts",
    "apps/web/test/api/http-client.test.ts",
    "apps/web/test/api-consumers.test.ts",
]

# (이름, 파일, 찾을 것, 바꿀 것, 스위트)
MUTATIONS = [
    # ── services/restore-plan.ts — 순서와 판정
    ("M1 삭제-메뉴를 재부모보다 앞으로 (FK 순서)", "apps/api/src/services/restore-plan.ts",
     """  // 3. 메뉴 생성 — 부모가 자식보다 먼저.""",
     """  // [변이] 메뉴 삭제를 여기로 끌어올린다.
  {
    const doomedEarly = current.menu.filter((node) => !snapshotMenuIds.has(node.id))
    for (const id of childrenFirst(doomedEarly)) {
      steps.push({ kind: 'delete-menu', id })
      summary.menu.deleted += 1
    }
  }
  // 3. 메뉴 생성 — 부모가 자식보다 먼저.""", "api"),

    ("M2 parentsFirst를 항등으로", "apps/api/src/services/restore-plan.ts",
     "function parentsFirst(nodes: SnapshotMenuNode[]): SnapshotMenuNode[] {",
     "function parentsFirst(nodes: SnapshotMenuNode[]): SnapshotMenuNode[] {\n  return nodes // [변이]", "api"),

    ("M3 childrenFirst를 항등으로", "apps/api/src/services/restore-plan.ts",
     "function childrenFirst(nodes: Array<{ id: string; parentId: string | null }>): string[] {",
     "function childrenFirst(nodes: Array<{ id: string; parentId: string | null }>): string[] {\n  return nodes.map((n) => n.id) // [변이]", "api"),

    ("M4 sameDocument가 늘 true (스키마를 안 쓴다)", "apps/api/src/services/restore-plan.ts",
     "  return canonicalJson(a) === canonicalJson(b)",
     "  return true // [변이]", "api"),

    ("M5 sameDocument가 늘 false (늘 쓴다)", "apps/api/src/services/restore-plan.ts",
     "  return canonicalJson(a) === canonicalJson(b)",
     "  return false // [변이]", "api"),

    ("M6 canonicalJson 대신 JSON.stringify (문서)", "apps/api/src/services/restore-plan.ts",
     "  return canonicalJson(a) === canonicalJson(b)",
     "  return JSON.stringify(a) === JSON.stringify(b) // [변이]", "api"),

    ("M7 저장된 문서의 버전 검사 제거 (D5 한 방향)", "apps/api/src/services/restore-plan.ts",
     """    const stored = currentPageById.get(page.id)
    if (stored && stored.schema.version > CURRENT_DOCUMENT_VERSION) {""",
     """    const stored = currentPageById.get(page.id)
    if (false && stored && stored.schema.version > CURRENT_DOCUMENT_VERSION) {""", "api"),

    ("M8 payload 문서의 버전 검사 제거 (D5 반대 방향)", "apps/api/src/services/restore-plan.ts",
     "    if (page.schema.version > CURRENT_DOCUMENT_VERSION) {",
     "    if (false) { // [변이]", "api"),

    ("M9 레이아웃 불일치 검사 제거 (D7)", "apps/api/src/services/restore-plan.ts",
     "  if (snapshotLayoutIds.join(',') !== currentLayoutIds.join(',')) {",
     "  if (false) { // [변이]", "api"),

    ("M10 dangling-reference 검사 제거", "apps/api/src/services/restore-plan.ts",
     "  if (dangling.length > 0) return { kind: 'dangling-reference', references: dangling }",
     "  // [변이] 검사 제거", "api"),

    ("M11 만들 페이지의 validatePage 제거", "apps/api/src/services/restore-plan.ts",
     "      if (errors.length > 0) {",
     "      if (false) { // [변이]", "api"),

    # ── services/restore.ts
    # **변이의 find 문자열이 프로덕션 코드와 함께 낡는다.** 리뷰 뒤 `edit-failed`가 필드를
    # 더 들게 되면서 이 변이가 "심지 못했다"로 나왔다 — 하네스가 조용히 0 사망을 내지 않고
    # 그렇게 말해 주는 것이 이 스크립트의 성질이다(찾는 문자열이 없으면 보고한다).
    ("M12 applyEdit 실패를 던지지 않고 넘어간다 (D1)", "apps/api/src/services/restore.ts",
     """          throw new RestoreAbort({
            kind: 'edit-failed',
            pageId: step.page.id,
            title: step.page.title,
            baseSeq,
            outcome,
          })""",
     "          break // [변이] 던지지 않는다", "api"),

    ("M13 안전망 스냅샷을 만들지 않는다 (D2)", "apps/api/src/services/restore.ts",
     """    safety = await insertSnapshot(trx, {""",
     """    safety = { id: 'x', tag: safetyTag } as never // [변이]
    void (async () => insertSnapshot)
    if (false) await insertSnapshot(trx, {""", "api"),

    ("M14 actor label을 평범한 편집과 같게 (D10)", "apps/api/src/services/restore.ts",
     "  return `복원: ${tag}`",
     "  return tag // [변이]", "api"),

    ("M15 코멘트 시각을 컬럼 기본값에 맡긴다", "apps/api/src/repos/comments.ts",
     """      created_at: input.createdAt,
      updated_at: input.updatedAt,""",
     """      // [변이] 시각을 심지 않는다""", "api"),

    ("M16 payloadVersion 게이트 제거", "apps/api/src/services/restore.ts",
     "  if (target.payload.payloadVersion > SNAPSHOT_PAYLOAD_VERSION) {",
     "  if (false) { // [변이]", "api"),

    ("M17 코멘트 작성자 존재 검사 제거", "apps/api/src/services/restore.ts",
     "    if (missing.length > 0) throw new RestoreAbort({ kind: 'missing-author', authorIds: missing })",
     "    // [변이] 검사 제거", "api"),

    ("M18 canonicalJson 대신 JSON.stringify (테마)", "apps/api/src/services/restore.ts",
     "      differs: canonicalJson(nowTheme ?? null) !== canonicalJson(frozen),",
     "      differs: JSON.stringify(nowTheme ?? null) !== JSON.stringify(frozen), // [변이]", "api"),

    ("M19 프로젝트 잠금 제거 (D8)", "apps/api/src/services/restore.ts",
     "  await lockProjectForRestore(trx, input.projectId)",
     "  void lockProjectForRestore // [변이] 잠그지 않는다", "lock"),

    # ── repos
    ("M20 페이지를 payload의 headSeq로 되살린다", "apps/api/src/repos/pages.ts",
     """      schema: JSON.stringify(input.schema),
      schema_version: input.schemaVersion,
    })
    .execute()
}""",
     """      schema: JSON.stringify(input.schema),
      schema_version: input.schemaVersion,
      head_seq: 7, // [변이]
    })
    .execute()
}""", "api"),

    ("M21 메뉴 갱신이 sort_order를 안 쓴다", "apps/api/src/repos/menu.ts",
     "    .set({ parent_id: input.parentId, title: input.title, sort_order: input.sortOrder })",
     "    .set({ parent_id: input.parentId, title: input.title }) // [변이]", "api"),

    # ── routes
    ("M22 복원 가드를 editor로 (D9)", "apps/api/src/routes/snapshots.ts",
     """      '/:projectId/snapshots/:snapshotId/restore',
      { preHandler: projectGuard('owner') },""",
     """      '/:projectId/snapshots/:snapshotId/restore',
      { preHandler: projectGuard('editor') },""", "api"),

    ("M23 레이아웃 불일치를 400으로", "apps/api/src/routes/snapshots.ts",
     """    case 'layout-mismatch':
      return conflict(""",
     """    case 'layout-mismatch':
      return badRequest(""", "api"),

    ("M24 미지원 버전 응답에서 페이지 정보를 뺀다 (D5)", "apps/api/src/routes/snapshots.ts",
     """        `지원하지 않는 문서 버전이라 복원할 수 없습니다: ${outcome.pages
          .map((page) => `${page.title}(${page.source === 'stored' ? '현재' : '스냅샷'} 버전 ${page.version})`)
          .join(', ')}`,""",
     """        '지원하지 않는 문서 버전이라 복원할 수 없습니다', // [변이]""", "api"),

    # ── 리뷰 뒤에 더한 것들 (R로 매긴다)
    ("R1 안전망 태그 앞머리를 바꾼다 (D2 형식)", "apps/api/src/services/restore.ts",
     "export const SAFETY_TAG_PREFIX = '복원 전 '",
     "export const SAFETY_TAG_PREFIX = 'before-restore '", "api"),

    ("R2 안전망 태그의 시각을 지금 시각으로", "apps/api/src/services/restore.ts",
     "  const safetyTag = `${SAFETY_TAG_PREFIX}${now.capturedAt}`",
     "  const safetyTag = `${SAFETY_TAG_PREFIX}${new Date(0).toISOString()}` // [변이]", "api"),

    ("R3 D5 좁힘을 되돌린다 (쓰지 않는 페이지도 막는다)", "apps/api/src/services/restore-plan.ts",
     "    if (writeByPage.get(page.id) === 'skip') continue",
     "    // [변이] 좁힘 제거", "api"),

    ("R4 D5 좁힘을 지나치게 넓힌다 (만들 페이지도 안 막는다)", "apps/api/src/services/restore-plan.ts",
     "    if (writeByPage.get(page.id) === 'skip') continue",
     "    if (writeByPage.get(page.id) !== 'rewrite') continue // [변이]", "api"),

    ("R5 edit-failed가 페이지를 안 싣는다", "apps/api/src/routes/snapshots.ts",
     "      return new ApiError(mapped.code, `${outcome.title}: ${mapped.message}`, mapped.issues)",
     "      return mapped // [변이]", "api"),

    ("R6 잠금에서 projects 행을 뺀다 (census)", "apps/api/src/repos/snapshots.ts",
     "  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forUpdate().execute()",
     "  // [변이] projects 행을 잠그지 않는다", "lock"),

    ("R7 잠금에서 코멘트 표를 뺀다 (census)", "apps/api/src/repos/snapshots.ts",
     "  await lockProjectComments(trx, projectId)",
     "  void lockProjectComments // [변이]", "lock"),

    # ── web
    ("M25 확인 단계를 건너뛴다 (D11)", "apps/web/src/routes/snapshots.tsx",
     "                      onClick={() => setConfirming(snapshot.id)}",
     "                      onClick={() => void runRestore(snapshot)} // [변이]", "web"),

    ("M26 그대로인 페이지 수를 안 말한다 (D11)", "apps/web/src/routes/snapshots.tsx",
     "        {props.tag}(으)로 되돌렸습니다. 페이지 {pages.schemaChanged}개가 바뀌고 {pages.schemaUnchanged}개는\n        그대로입니다.",
     "        {props.tag}(으)로 되돌렸습니다. 페이지 {pages.schemaChanged}개가 바뀌었습니다.", "web"),

    ("M27 실패해도 목록을 다시 받는다", "apps/web/src/routes/snapshots.tsx",
     """      setNotice({ kind: 'restored', tag: snapshot.tag, result })
      // **성공했을 때만** 목록을 다시 받는다. 프로젝트가 바뀌었고 안전망 스냅샷이 하나 생겼다.
      props.onSaved()
    } catch (caught) {""",
     """      setNotice({ kind: 'restored', tag: snapshot.tag, result })
    } catch (caught) {
      props.onSaved() // [변이]""", "web"),

    ("M28 복원 버튼을 owner가 아니어도 그린다 (D11)", "apps/web/src/routes/snapshots.tsx",
     "                {abilities.restoreSnapshot ? (",
     "                {true ? ( // [변이]", "web"),

    ("M29 restoreSnapshot 능력을 editor에게도 연다", "apps/web/src/projects/project-actions.ts",
     "  if (role === 'editor') return { ...NOTHING, createSnapshot: true }",
     "  if (role === 'editor') return { ...NOTHING, createSnapshot: true, restoreSnapshot: true }", "web"),

    ("M30 themes shape 검사 제거", "apps/web/src/api/http-client.ts",
     "  return Array.isArray(value['themes'])",
     "  return true // [변이]", "web"),
]


def run_suite(kind):
    files = {"api": API_SUITE, "lock": LOCK_SUITE, "web": WEB_SUITE}[kind]
    project = "web" if kind == "web" else "api"
    proc = subprocess.run(
        ["pnpm", "vitest", "run", *files, "--project", project, "--reporter", "dot"],
        cwd=ROOT, capture_output=True, text=True,
    )
    out = proc.stdout + proc.stderr
    failed = 0
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Tests "):
            for part in line.replace("Tests ", "").split("|"):
                part = part.strip()
                if part.endswith("failed"):
                    failed = int(part.split()[0])
    if proc.returncode != 0 and failed == 0:
        failed = -1  # 컴파일/수집 실패
    return failed, out


def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    results = []
    for name, rel, find, repl, kind in MUTATIONS:
        if only and not any(name.startswith(o) for o in only):
            continue
        path = os.path.join(ROOT, rel)
        original = open(path, encoding="utf-8").read()
        try:
            if find not in original:
                results.append((name, "심지 못했다(찾는 문자열 없음)"))
                print(f"!! {name}: 심지 못했다", flush=True)
                continue
            open(path, "w", encoding="utf-8").write(original.replace(find, repl, 1))
            planted = open(path, encoding="utf-8").read()
            assert planted != original, "심었는데 파일이 그대로다"
            failed, out = run_suite(kind)
            results.append((name, failed))
            print(f"{name}: {failed} 사망", flush=True)
            if failed == -1:
                print("   (수집/컴파일 실패)", out[-600:], flush=True)
        finally:
            open(path, "w", encoding="utf-8").write(original)
            assert open(path, encoding="utf-8").read() == original, f"복구 실패: {rel}"
    print("\n=== 요약 ===")
    for name, failed in results:
        print(f"{failed}\t{name}")
    print(json.dumps([[n, f] for n, f in results], ensure_ascii=False))


if __name__ == "__main__":
    main()
