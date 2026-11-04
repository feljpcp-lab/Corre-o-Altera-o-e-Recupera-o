alter table public.felj_links
  add column if not exists match_score smallint,
  add column if not exists match_reasons text[] not null default '{}',
  add column if not exists candidate_count integer not null default 0;
