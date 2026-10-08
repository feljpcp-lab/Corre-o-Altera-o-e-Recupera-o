create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb; v_new jsonb;
begin
 v_old:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
 v_new:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
 v_id:=coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid);
 insert into public.audit_logs(user_id,tabela,registro_id,acao,valor_anterior,valor_novo,created_at)
 values((select auth.uid()),tg_table_name,v_id,tg_op,v_old,v_new,now());
 return coalesce(new,old);
end $$;

revoke all on function private.audit_row_change() from public,anon;
grant execute on function private.audit_row_change() to authenticated;

do $$
declare t text;
begin
 foreach t in array array['ordens_servico','componentes_os','reservas_materiais','movimentacoes_estoque','operacoes_producao','apontamentos','inspecoes','nao_conformidades','faturamentos','expedicoes'] loop
   execute format('drop trigger if exists audit_row_change on public.%I',t);
   execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function private.audit_row_change()',t);
 end loop;
end $$;