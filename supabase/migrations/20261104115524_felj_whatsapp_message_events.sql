create table if not exists public.felj_message_events (
  id text primary key,
  source_key text not null unique,
  source_name text not null default '',
  message_date date,
  message_time text,
  sender text not null default '',
  message_text text not null default '',
  classification text not null default 'review'
    check (classification in ('entry','execution','update','review')),
  os text,
  tool_code text,
  components text[] not null default '{}',
  service_type text not null default 'Não classificado'
    check (service_type in ('Correção','Recuperação','Alteração','Não classificado')),
  operational_stage text,
  operational_state text,
  matched_entry_id text references public.felj_entries(id) on delete set null,
  review_required boolean not null default true,
  legacy_data jsonb,
  imported_at timestamptz not null default now()
);
create index if not exists felj_message_events_date_idx on public.felj_message_events(message_date);
create index if not exists felj_message_events_os_idx on public.felj_message_events(os);
create index if not exists felj_message_events_tool_idx on public.felj_message_events(tool_code);
create index if not exists felj_message_events_classification_idx on public.felj_message_events(classification);
alter table public.felj_message_events enable row level security;
grant select, insert on public.felj_message_events to authenticated;
drop policy if exists "FELJ authenticated read message events" on public.felj_message_events;
create policy "FELJ authenticated read message events"
  on public.felj_message_events for select to authenticated using (true);
drop policy if exists "FELJ authenticated insert message events" on public.felj_message_events;
create policy "FELJ authenticated insert message events"
  on public.felj_message_events for insert to authenticated with check (true);
