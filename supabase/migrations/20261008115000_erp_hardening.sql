-- FELJ ERP Industrial baseline
-- The ERP schema was bootstrapped in the FELJ Supabase project before this
-- repository migration baseline was committed. This migration records the
-- production hardening applied after the baseline and is idempotent.
--
-- Future structural changes MUST be added as new migrations.

create index if not exists correction_records_created_by_idx on public.correction_records(created_by);
create index if not exists correction_status_history_actor_idx on public.correction_status_history(actor_id);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;

drop policy if exists "Authenticated team can read records" on public.correction_records;
drop policy if exists "Authenticated team can create records" on public.correction_records;
drop policy if exists "Authenticated team can update records" on public.correction_records;
drop policy if exists "Authenticated team can read status history" on public.correction_status_history;

do $$
declare r record; cols text; idx text;
begin
  for r in
    select con.oid, con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace ns on ns.oid=rel.relnamespace
    where ns.nspname='public' and con.contype='f'
  loop
    select string_agg(format('%I',a.attname),', ' order by u.ord)
      into cols
      from pg_constraint con2
      cross join lateral unnest(con2.conkey) with ordinality u(attnum,ord)
      join pg_attribute a on a.attrelid=con2.conrelid and a.attnum=u.attnum
      where con2.oid=r.oid;
    idx:=left('fkidx_'||md5(r.relname||':'||r.conname),55);
    execute format('create index if not exists %I on public.%I (%s)',idx,r.relname,cols);
  end loop;
end $$;