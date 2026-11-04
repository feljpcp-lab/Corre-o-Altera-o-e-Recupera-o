with scored as (
 select e.id entry_id,x.id execution_id,
  (case when e.os is not null and x.os is not null and regexp_replace(lower(e.os),'[^a-z0-9]','','g')=regexp_replace(lower(x.os),'[^a-z0-9]','','g') then 60 else 0 end)+
  (case when e.tool_code is not null and x.tool_code is not null and regexp_replace(lower(e.tool_code),'[^a-z0-9]','','g')=regexp_replace(lower(x.tool_code),'[^a-z0-9]','','g') then 30 else 0 end)+
  (case when e.extrusora is not null and x.extrusora is not null and regexp_replace(lower(e.extrusora),'[^a-z0-9]','','g')=regexp_replace(lower(x.extrusora),'[^a-z0-9]','','g') then 10 else 0 end)+
  (case when e.service_type=x.service_type and e.service_type<>'Não classificado' then 5 else 0 end) score,
  array_remove(array[
   case when e.os is not null and x.os is not null and regexp_replace(lower(e.os),'[^a-z0-9]','','g')=regexp_replace(lower(x.os),'[^a-z0-9]','','g') then 'mesma OS' end,
   case when e.tool_code is not null and x.tool_code is not null and regexp_replace(lower(e.tool_code),'[^a-z0-9]','','g')=regexp_replace(lower(x.tool_code),'[^a-z0-9]','','g') then 'mesma ferramenta' end,
   case when e.extrusora is not null and x.extrusora is not null and regexp_replace(lower(e.extrusora),'[^a-z0-9]','','g')=regexp_replace(lower(x.extrusora),'[^a-z0-9]','','g') then 'mesma extrusora' end,
   case when e.service_type=x.service_type and e.service_type<>'Não classificado' then 'mesmo tipo' end
  ],null) reasons
 from public.felj_entries e join public.felj_executions x
 on (e.os is not null and x.os is not null and regexp_replace(lower(e.os),'[^a-z0-9]','','g')=regexp_replace(lower(x.os),'[^a-z0-9]','','g'))
 or (e.tool_code is not null and x.tool_code is not null and regexp_replace(lower(e.tool_code),'[^a-z0-9]','','g')=regexp_replace(lower(x.tool_code),'[^a-z0-9]','','g'))
), tops as (select entry_id,max(score) best_score from scored group by entry_id),
best as (
 select s.*,t.best_score,count(*) filter(where s.score=t.best_score) over(partition by s.entry_id) top_count,
 row_number() over(partition by s.entry_id order by s.score desc,s.execution_id) rn
 from scored s join tops t on t.entry_id=s.entry_id
)
update public.felj_links l set
 execution_id=case when b.best_score>=30 and b.top_count=1 then b.execution_id else null end,
 status=case when b.best_score>=30 then 'CONFERIR VÍNCULO' else 'EM ABERTO' end,
 reason=case when b.best_score>=30 then 'Sugestão automática (pontuação '||b.best_score||'). '||
   case when b.top_count>1 then 'Há múltiplos candidatos empatados; selecionar manualmente.' else 'Confirmar manualmente antes de marcar como executada.' end
   else 'Nenhuma execução compatível encontrada automaticamente.' end,
 match_score=case when b.best_score>=30 then b.best_score else null end,
 match_reasons=coalesce(b.reasons,'{}'::text[]),candidate_count=coalesce(b.top_count,0),
 updated_at=now(),updated_by='sistema:conciliacao-v2'
from public.felj_entries e left join best b on b.entry_id=e.id and b.rn=1
where l.entry_id=e.id and l.manual=false;
