/**
 * 접속 문자열에서 **사람이 눈으로 가를 수 있는 만큼만** 뽑는다.
 *
 * 워크트리를 여럿 띄우면 터미널마다 서버가 하나씩 뜨는데, 오늘 그 로그가 말하는 것은
 * 포트뿐이라 **어느 DB를 보는지는 아무 데도 안 나온다.** 한쪽의 마이그레이션이 다른 쪽
 * 스키마를 바꿔 놓아도 로그에는 아무 자국이 없다(2026-08-19 보고 §2.3에서 쟀다 —
 * 옆 워크트리의 `migrate:down` 한 번에 살아 있는 서버가 500을 내기 시작했다).
 *
 * **자격 문자열은 통째로 찍지 않는다**(D4). `DATABASE_URL`에는 비밀번호가 들어 있고
 * 로그는 파일로 남거나 붙여넣어진다. 여기서 나가는 것은 `호스트:포트/DB이름`뿐이다.
 */
export function describeDatabaseTarget(databaseUrl: string): string {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    // **원문을 되돌려주지 않는다** — 해석에 실패한 문자열에도 비밀번호가 들어 있다.
    return '(DATABASE_URL을 해석할 수 없습니다)'
  }
  const name = decodePathSegment(url.pathname.replace(/^\//, ''))
  const host = url.port === '' ? url.hostname : `${url.hostname}:${url.port}`
  return name === '' ? host : `${host}/${name}`
}

/**
 * `URL`은 경로를 퍼센트 인코딩해서 들고 있다. 사람이 읽을 값이므로 되돌린다 —
 * 안 되돌리면 한글 DB 이름이 `wb_%EC%95%84…`로 나온다(실측).
 * 되돌리다 실패하면(반쪽짜리 `%`) 인코딩된 채로 둔다. 던지지 않는다.
 */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
