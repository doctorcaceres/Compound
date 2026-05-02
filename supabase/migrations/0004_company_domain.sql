-- 0004_company_domain.sql
-- Block 8 — Company verification (revised).
-- ------------------------------------------------------------------
-- Two-tier model:
--   1. Verified — automatic when a company signs up with a corporate
--      email (domain extracted into profiles.domain), or manual when
--      profiles.is_verified is set to true.
--   2. Verification Pending — every other company account; account is
--      fully functional but shows a neutral pending tag. Companies
--      submit a website / social link / docs URL via the profile edit
--      form, stored in profiles.verification_url for human review.
-- There is no permanently-unverified state: pending accounts that
-- never verify or turn out to be fake get removed by ops.
-- ------------------------------------------------------------------

-- ============================================================
-- 1. Schema changes
-- ============================================================
alter table public.profiles
  add column if not exists domain text;

alter table public.profiles
  add column if not exists verification_url text;

-- ============================================================
-- 2. Helper: domain extraction
-- Returns the lowercased email domain ONLY when:
--   - account_type = 'company'
--   - email is set
--   - the domain isn't in the personal-email blocklist
-- Otherwise returns NULL. Companies signing up with a personal email
-- are NOT blocked at signup — they just don't auto-verify, and stay
-- in "Verification Pending" until manually approved.
-- The blocklist mirrors Auth.jsx PERSONAL_DOMAINS — keep them in sync.
-- ============================================================
create or replace function public.extract_company_domain(_email text, _account_type text)
returns text
language sql
immutable
as $$
  select case
    when _account_type = 'company'
         and _email is not null
         and position('@' in _email) > 0
         and lower(split_part(_email, '@', 2)) not in (
           'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
           'icloud.com', 'aol.com', 'protonmail.com', 'proton.me',
           'live.com', 'msn.com', 'me.com', 'mac.com',
           'gmx.com', 'gmx.net', 'mail.com',
           'yandex.com', 'yandex.ru', 'fastmail.com', 'fastmail.fm',
           'zoho.com', 'tutanota.com', 'hey.com'
         )
    then lower(split_part(_email, '@', 2))
    else null
  end
$$;

-- ============================================================
-- 3. Update handle_new_user trigger to also populate `domain`
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_name         text;
begin
  v_account_type := coalesce(new.raw_user_meta_data->>'accountType', 'individual');
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (id, account_type, display_name, email, sector, domain)
  values (
    new.id,
    v_account_type,
    v_name,
    new.email,
    new.raw_user_meta_data->>'sector',
    public.extract_company_domain(new.email, v_account_type)
  );
  return new;
end;
$$;
-- The on_auth_user_created trigger from 0001 still binds to handle_new_user,
-- so no need to recreate it.

-- ============================================================
-- 4. Backfill existing company profiles
-- ============================================================
update public.profiles
set domain = public.extract_company_domain(email, account_type)
where account_type = 'company' and domain is null;
