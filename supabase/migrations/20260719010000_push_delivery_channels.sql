alter table public.push_subscriptions
  add column if not exists delivery_channel text not null default 'web';

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_delivery_channel_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_delivery_channel_check
  check (delivery_channel in ('web', 'native'));

update public.push_subscriptions
set delivery_channel = 'native'
where user_agent like '%; wv)%'
  and delivery_channel = 'web';
