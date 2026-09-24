-- Date de dezvoltare locală (nu se rulează în producție).
-- Adminul NU are factor TOTP: îl înrolează la prima autentificare prin /auth/mfa.

do $$
declare
  v_users jsonb := '[
    {"id": "00000000-0000-4000-a000-000000000001", "email": "admin@example.test"},
    {"id": "00000000-0000-4000-a000-00000000000a", "email": "org-a@example.test"},
    {"id": "00000000-0000-4000-a000-00000000000b", "email": "org-b@example.test"}
  ]';
  v_user jsonb;
begin
  for v_user in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', (v_user ->> 'id')::uuid, 'authenticated',
      'authenticated', v_user ->> 'email', '', now(),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (v_user ->> 'id')::uuid, v_user ->> 'id',
      jsonb_build_object('sub', v_user ->> 'id', 'email', v_user ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end;
$$;

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a000-000000000001');

-- Catalogul de retenție (decizia din 2026-09-24): 3 luni incluse, 6 luni +49 lei, 12 luni +99 lei.
insert into public.retention_options (months, surcharge_minor) values
  (3, 0),
  (6, 4900),
  (12, 9900);
