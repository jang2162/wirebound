import { liftStateRegions, MigrationError } from './migrate-document'
import type { AnyDocument, PageDocument } from './node'

/** 지금 문서 판. 판 2 — 화면 상태가 노드 보임이다(판 1 의 상태 영역은 `migrate-document.ts`가 푼다). */
export const CURRENT_DOCUMENT_VERSION = 2

export interface Migration {
  from: number
  to: number
  migrate: (doc: AnyDocument) => AnyDocument
}

/**
 * 버전별 마이그레이션 체인.
 * 컴포넌트 props가 바뀌면 여기에 한 단계를 추가한다. 앞 단계는 고치지 않는다 — 그 판의 뜻으로 얼어 있다(DB 마이그레이션이 직접 부른다).
 */
export const MIGRATIONS: Migration[] = [{ from: 1, to: 2, migrate: (doc) => liftStateRegions(doc).doc }]

/** 문서를 목표 버전까지 올린다. 가져오기·스냅샷 복원·읽기가 모두 이 경로를 탄다. */
export function migrateDocument<T extends AnyDocument>(
  doc: T,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_DOCUMENT_VERSION,
): T {
  let current: AnyDocument = structuredClone(doc)

  if (current.version > target) {
    throw new Error(`지원하지 않는 문서 버전: ${current.version}`)
  }

  while (current.version < target) {
    const step = migrations.find((migration) => migration.from === current.version)
    if (!step) {
      throw new Error(`버전 ${current.version}에서 올릴 마이그레이션이 없습니다`)
    }
    current = { ...step.migrate(current), version: step.to }
  }

  // 마이그레이션은 문서 종류(페이지/레이아웃)를 절대 바꾸지 않는다 — 버전만 올린다.
  // Migration.migrate가 AnyDocument -> AnyDocument로 넓게 타입되어 있어 컴파일러는
  // 이 함수가 입력과 같은 종류를 반환한다는 사실을 알 수 없으므로 캐스트가 필요하다.
  return current as T
}

/**
 * **페이지 문서를 지금 판으로** — 문서가 들어오는 경계(DB 의 `pages.schema` · 스냅샷 복원 · 페이지 JSON 가져오기 · 클립보드 봉투)가 부르는
 * 이름. `migrateDocument` 와 같은 사슬이다(판 2 면 그대로의 사본). `pageId` 를 주면 판 1 → 2 가 멈춘 `MigrationError` 에 그 페이지를 싣는다.
 */
export function migratePageDocument(doc: unknown, options: { pageId?: string } = {}): PageDocument {
  try {
    return migrateDocument(doc as PageDocument)
  } catch (error) {
    if (error instanceof MigrationError && options.pageId !== undefined) throw new MigrationError(error.nodeId, options.pageId)
    throw error
  }
}
