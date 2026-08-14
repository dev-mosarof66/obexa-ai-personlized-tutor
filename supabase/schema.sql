-- Obexa — knowledge base schema
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query → Run),
-- or via `supabase db push` if the project is linked and you have DB credentials.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  course text not null default '',
  raw_text text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

alter table documents add column if not exists course text not null default '';
create index if not exists documents_course_idx on documents (course);

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  topic text not null default '',
  questions jsonb not null,
  created_at timestamptz not null default now()
);

alter table exams add column if not exists topic text not null default '';

create index if not exists exams_document_id_idx on exams (document_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_topic_idx on chat_messages (topic, created_at);

alter table documents enable row level security;
alter table exams enable row level security;
alter table chat_messages enable row level security;

-- MVP has no auth (see HLD §2 "Explicitly Out of Scope") — the app talks to
-- Supabase from Next.js server route handlers using the publishable/anon key,
-- so both roles need read/write. Tighten this before any real deployment.
drop policy if exists "documents_all_anon" on documents;
create policy "documents_all_anon" on documents
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "exams_all_anon" on exams;
create policy "exams_all_anon" on exams
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "chat_messages_all_anon" on chat_messages;
create policy "chat_messages_all_anon" on chat_messages
  for all to anon, authenticated using (true) with check (true);
