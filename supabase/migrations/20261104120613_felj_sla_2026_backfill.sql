with holiday_dates as (
 select d::date as holiday_day from (values
  ('2026-01-01'),('2026-04-03'),('2026-04-21'),('2026-05-01'),('2026-06-04'),
  ('2026-07-09'),('2026-08-15'),('2026-09-07'),('2026-10-12'),('2026-11-02'),
  ('2026-11-15'),('2026-11-20'),('2026-12-25')
 ) v(d)
), targets as (
 select e.id,e.received_at,case when e.service_type='Correção' then 3 when e.service_type='Alteração' then 5 end as sla_days
 from public.felj_entries e
 where e.due_date is null and e.received_at is not null
   and e.service_type in ('Correção','Alteração')
), calculated as (
 select t.id,min(s.work_day)::date as due_date,t.sla_days
 from targets t
 cross join lateral (
  select g.work_day::date as work_day,
   sum(case when extract(isodow from g.work_day) between 1 and 5 and h.holiday_day is null then 1 else 0 end)
    over(order by g.work_day) as business_count
  from generate_series(t.received_at+1,t.received_at+20,interval '1 day') as g(work_day)
  left join holiday_dates h on h.holiday_day=g.work_day::date
 ) s
 where s.business_count=t.sla_days
 group by t.id,t.sla_days
)
update public.felj_entries e set due_date=c.due_date,
 deadline_source='sla_'||c.sla_days||'_business_days',updated_at=now()
from calculated c where e.id=c.id;
