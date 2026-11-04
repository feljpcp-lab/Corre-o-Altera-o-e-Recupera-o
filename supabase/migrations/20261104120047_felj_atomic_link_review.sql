create or replace function public.felj_set_link(
  p_entry_id text,
  p_execution_id text,
  p_status text,
  p_reason text,
  p_match_score smallint,
  p_match_reasons text[],
  p_actor_email text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_previous jsonb;
begin
  if p_status not in ('EM ABERTO','CONFERIR VÍNCULO','EXECUTADA','CANCELADA') then
    raise exception 'Status de vínculo inválido.';
  end if;
  if p_status='EXECUTADA' and p_execution_id is null then
    raise exception 'Uma execução deve ser selecionada para confirmar o vínculo.';
  end if;
  select to_jsonb(l) into v_previous
  from public.felj_links l where l.entry_id=p_entry_id;

  insert into public.felj_links
    (entry_id,execution_id,status,reason,manual,updated_by,updated_at,match_score,match_reasons,candidate_count)
  values
    (p_entry_id,p_execution_id,p_status,coalesce(p_reason,''),true,p_actor_email,now(),p_match_score,coalesce(p_match_reasons,'{}'),0)
  on conflict (entry_id) do update set
    execution_id=excluded.execution_id,status=excluded.status,reason=excluded.reason,
    manual=true,updated_by=excluded.updated_by,updated_at=now(),
    match_score=excluded.match_score,match_reasons=excluded.match_reasons;

  insert into public.felj_link_history
    (entry_id,action,note,previous_data,actor_email)
  values
    (p_entry_id,'VINCULO_'||p_status,coalesce(p_reason,''),v_previous,p_actor_email);
end;
$$;
grant execute on function public.felj_set_link(text,text,text,text,smallint,text[],text) to authenticated;
