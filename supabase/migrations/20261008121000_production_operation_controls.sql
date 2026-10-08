-- Production operation controls
create or replace function public.iniciar_operacao(p_operacao_id uuid)
returns public.operacoes_producao
language plpgsql security invoker set search_path=public
as $$
declare v public.operacoes_producao;
begin
 update public.operacoes_producao
 set status='em_execucao', inicio=coalesce(inicio,now()), updated_at=now()
 where id=p_operacao_id and status in ('aguardando','pausada')
 returning * into v;
 if v.id is null then raise exception 'Operação não disponível para iniciar'; end if;
 return v;
end $$;

create or replace function public.pausar_operacao(p_operacao_id uuid,p_motivo_id uuid default null,p_observacao text default null)
returns public.operacoes_producao
language plpgsql security invoker set search_path=public
as $$
declare v public.operacoes_producao;
begin
 update public.operacoes_producao
 set status='pausada',updated_at=now()
 where id=p_operacao_id and status='em_execucao'
 returning * into v;
 if v.id is null then raise exception 'Operação não está em execução'; end if;
 insert into public.paradas_producao(maquina_id,operacao_id,motivo_id,observacao)
 values(v.maquina_id,v.id,p_motivo_id,p_observacao);
 return v;
end $$;

revoke execute on function public.iniciar_operacao(uuid) from public,anon;
revoke execute on function public.pausar_operacao(uuid,uuid,text) from public,anon;
grant execute on function public.iniciar_operacao(uuid) to authenticated;
grant execute on function public.pausar_operacao(uuid,uuid,text) to authenticated;