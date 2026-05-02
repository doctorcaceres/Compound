-- 0003_jobs.sql
-- Compound — Jobs feature (Block 6)
-- Tables: jobs, job_applications
-- RLS: anyone authenticated can read jobs; only the company that posted can
-- create/update/delete its own. Applications: applicants see and create their
-- own; the company that posted the job sees applications to their jobs.

create extension if not exists "pgcrypto";

-- ============================================================
-- jobs
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  location text,
  sector text,
  job_type text not null default 'full-time',
  experience_level text,
  salary_range text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- job_applications
-- ============================================================
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cover_note text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.jobs              enable row level security;
alter table public.job_applications  enable row level security;

-- ---------- jobs ----------
create policy "jobs_read_all"
  on public.jobs for select
  to authenticated
  using (true);

create policy "jobs_insert_own"
  on public.jobs for insert
  to authenticated
  with check (company_id = auth.uid());

create policy "jobs_update_own"
  on public.jobs for update
  to authenticated
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

create policy "jobs_delete_own"
  on public.jobs for delete
  to authenticated
  using (company_id = auth.uid());

-- ---------- job_applications ----------
-- Applicants can see their own applications, and the company that posted a
-- given job can see applications to that job.
create policy "applications_read_own_or_owned_jobs"
  on public.job_applications for select
  to authenticated
  using (
    applicant_id = auth.uid()
    or job_id in (select id from public.jobs where company_id = auth.uid())
  );

create policy "applications_insert_own"
  on public.job_applications for insert
  to authenticated
  with check (applicant_id = auth.uid());
