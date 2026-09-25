-- 002: stările evenimentului și enumerările noi (data-model.md › Enumerări).
-- Valorile noi de enum se folosesc doar în migrațiile următoare (după commit).

alter type public.event_status add value if not exists 'unconfirmed' before 'active';
alter type public.event_status add value if not exists 'awaiting_activation' before 'active';
alter type public.event_status add value if not exists 'suspended' after 'active';

create type public.event_origin as enum ('admin', 'self_service');
create type public.status_change_source as enum ('organizer', 'admin', 'system', 'payment');

alter type public.notice_threshold add value if not exists 'activation_7d';
