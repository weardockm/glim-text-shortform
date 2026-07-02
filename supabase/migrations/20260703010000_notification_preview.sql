alter table public.notifications
  add column if not exists preview_text text;

comment on column public.notifications.preview_text is
  '알림 목록에 표시할 짧은 댓글 미리보기';
