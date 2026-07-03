# SUPABASE KNOWLEDGE BASE

## OVERVIEW

이 디렉터리는 글림의 실질적인 서버 보안 계약이다. timestamp SQL migration이 데이터 모델·RLS·RPC를 정의하고, `functions/send-push/index.ts`가 인증된 이벤트를 FCM v1로 전달한다.

## STRUCTURE

```text
supabase/
├── config.toml                 # 로컬 Supabase 17/Deno 2 설정
├── migrations/                # 배포 순서가 의미인 append-only SQL
├── functions/send-push/       # 서비스 역할과 Firebase secret을 쓰는 Deno 함수
├── RLS_AUDIT.sql              # SQL Editor용 read-only 권한 감사
└── .temp/                     # CLI 생성 상태; 소스 아님
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| 푸시 구독·로그 | `migrations/20260702020000_push_notifications.sql` | 기기별 preferences와 dedupe 테이블 |
| 알림 소유권 | `migrations/20260703020000_notifications_rls.sql` | mutable 닉네임 대신 Auth UUID 사용 |
| 신고·관리자·제재 | `migrations/20260703030000_moderation_reports.sql` | moderator RPC와 콘텐츠 제재 |
| 게시글/댓글 보안 | `migrations/20260703040000_secure_content_rls.sql` | 참여 테이블, RPC, RLS, 최소 권한 |
| 프로필 동기화 | `migrations/20260703041000_harden_profile_sync.sql` | 예약 닉네임과 작성자 표시명 |
| 계정 삭제 | 최신 `delete_user_data` 정의 | 후속 migration이 이전 정의를 대체 |
| 푸시 발송 | `functions/send-push/index.ts` | JWT 인증, 이벤트 검증, FCM, stale token 정리 |
| 권한 감사 | `RLS_AUDIT.sql` | 결과 JSON만 반환하며 객체/행을 변경하지 않음 |

## CONVENTIONS

- migration 파일명은 UTC 성격의 증가 timestamp다. 이미 원격 적용된 파일은 수정하지 않고 더 늦은 파일에서 교체한다.
- 동일 함수가 여러 migration에 나오면 가장 늦은 `create or replace`가 현재 계약이다. 계정 삭제처럼 누적 대상이 있는 함수는 전체 최신 본문을 재정의한다.
- `security definer` 함수는 `set search_path = ''`, schema-qualified 객체, `revoke all`, 필요한 역할만 `grant execute` 패턴을 유지한다.
- RLS 정책과 table privilege를 함께 좁힌다. 정책만 추가하고 anon/authenticated의 광범위한 grant를 남기지 않는다.
- 소유권과 알림 recipient/actor는 `auth.uid()` 및 UUID FK로 검증한다. 닉네임은 snapshot/표시 용도다.
- 클라이언트 참여 상태는 `post_likes`, `comment_likes`, `bookmarks`와 toggle RPC가 원본이다. legacy localStorage 이전은 `import_legacy_*` 경로를 보존한다.
- 관리자 권한은 `user_roles`와 `is_moderator()`로 검사한다. 브라우저의 이메일 비교만으로 권한을 부여하지 않는다.
- `send-push`는 사용자 JWT를 먼저 검증하고, service-role client는 검증된 이벤트 조회·발송에만 사용한다.
- 공지 broadcast 외 푸시는 follow/post 관계를 `validateEvent`로 확인한다. `push_delivery_log` dedupe를 제거하지 않는다.
- Edge secret은 `FIREBASE_SERVICE_ACCOUNT_JSON`이다. `SUPABASE_URL`, anon/service-role key는 배포 환경 제공값을 사용한다.
- 푸시 카테고리 집합은 root 브라우저 코드, SQL preference JSON, Edge `ALLOWED_CATEGORIES`에서 동기화한다.

## ANTI-PATTERNS

- 빈 DB에서도 migration이 단독 실행된다고 가정하지 않는다. 초기 base table 생성 migration은 현재 저장소에 없다.
- `supabase/.temp`, pooler URL, linked-project 상태를 문서화하거나 커밋하지 않는다.
- 서비스 역할을 공개 RPC나 브라우저 요청에 노출하지 않는다.
- 사용자 입력으로 `reports_count`, 좋아요 수, 제재 상태, 운영자 공지를 직접 update/insert하게 만들지 않는다.
- RLS 감사 파일에서 `create`, `alter`, `update`, `delete`를 실행하지 않는다.
- Firebase 서비스 계정 JSON을 `push-config.js`에 옮기지 않는다. 해당 파일은 공개 웹 설정 전용이다.

## COMMANDS

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run --yes
npx supabase db push --linked --yes
npx supabase db lint --linked --level warning
npx supabase functions deploy send-push --project-ref qdnpeliqtxdglqewbvgg
```

## VERIFICATION

- migration 적용 전 dry-run으로 순서를 확인하고, 적용 후 remote/local 목록 일치를 확인한다.
- `db lint` 결과에 schema error가 없어야 한다.
- `RLS_AUDIT.sql`은 Dashboard SQL Editor에서 실행해 anon/authenticated 권한·policy·함수 execute를 검토한다.
- 익명 REST 검증은 공개 `SELECT`만 200이고 게시글/댓글 쓰기, 참여 테이블, 관리자 RPC가 401/403인지 확인한다.
- 푸시는 HTTPS 또는 localhost에서 두 계정으로 좋아요·댓글·팔로우를 만들고 Supabase function log와 실제 기기 수신까지 확인한다.
