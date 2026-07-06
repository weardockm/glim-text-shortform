# DOM sink 검토 결과

2026-07-04 기준 `ast-grep`의 구조 패턴 `$EL.innerHTML = $VALUE`로 `index.js`와 `admin.js`를 검사했다.

- 총 44개: `index.js` 41개, `admin.js` 3개
- constant 34개: 정적 shell, loading/error/empty 상태, 또는 빈 문자열
- safe 10개: allowlist/고정 분기 또는 `escapeHtml()`을 거친 동적 값
- unsafe 0개

기계 판독 가능한 전체 위치·소유자·근거는 `dom-sink-inventory.json`에 있다. `dom-sink-inventory.test.mjs`가 소스의 위치 집합과 1:1 일치를 검사한다. 별도의 `dom-sink-proof.test.mjs`는 manifest 분류와 변수 이름을 신뢰하지 않는다. ast-grep RHS의 모든 interpolation을 리터럴, 검증된 sanitizer 호출, 중첩 조건 분기, 재귀적으로 증명된 alias 대입으로 해석하며, BGM·알림 RHS에 임의의 unescaped alias를 넣은 mutant를 거부한다.

“unsafe 0”은 `innerHTML`을 계속 사용해도 된다는 뜻이 아니다. HTML 문자열 조립과 inline handler는 다음 변경에서 외부 값이 섞일 때 고위험 회귀가 된다. Todo 7은 정적 상태를 DOM API로 옮기고, 동적 HTML을 텍스트/속성 API로 제한하며, CSP 아래에서 inline handler를 제거해야 한다.

검증 payload:

- `<img src=x onerror="globalThis.__xss=1">`
- `<script>globalThis.__xss=1</script>`
- `javascript:globalThis.__xss=1`
- NUL/제어문자와 20,000자 한국어 문자열

게시글·댓글·탐색 프로필·탐색 게시글과 실제 `fetchNotifications()` 렌더 분기는 위 값을 HTML로 실행하지 않고 텍스트 또는 escaped HTML로 표현하는 것이 현재 계약이다.
