import type { AnyDocument } from './node'

export const CURRENT_DOCUMENT_VERSION = 1

export interface Migration {
  from: number
  to: number
  migrate: (doc: AnyDocument) => AnyDocument
}

/**
 * 버전별 마이그레이션 체인.
 * 컴포넌트 props가 바뀌면 여기에 한 단계를 추가한다.
 */
export const MIGRATIONS: Migration[] = []

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
