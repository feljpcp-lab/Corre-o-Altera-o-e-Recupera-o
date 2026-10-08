drop function if exists public.finalizar_operacao(uuid,numeric,numeric,text);
create function public.finalizar_operacao(p_operacao_id uuid,p_quantidade_boa numeric default 1,p_quantidade_rejeitada numeric default 0,p_observacao text default null)
returns public.operacoes_producao language plpgsql security invoker set search_path=public
as $$
declare v public.operacoes_producao; v_prox uuid;
begin
 update public.operacoes_producao
 set status='concluida',fim=now(),quantidade_boa=coalesce(p_quantidade_boa,0),quantidade_rejeitada=coalesce(p_quantidade_rejeitada,0),observacao=coalesce(p_observacao,observacao),updated_at=now()
 where id=p_operacao_id and status='em_execucao' returning * into v;
 if v.id is null then raise exception 'Operação não está em execução'; end if;
 select id into v_prox from public.operacoes_producao where ordem_producao_id=v.ordem_producao_id and sequencia>v.sequencia and status in ('aguardando','bloqueada') order by sequencia limit 1;
 if v_prox is not null then update public.operacoes_producao set status='liberada',updated_at=now() where id=v_prox; end if;
 return v;
end $$;
revoke execute on function public.finalizar_operacao(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.finalizar_operacao(uuid,numeric,numeric,text) to authenticated;