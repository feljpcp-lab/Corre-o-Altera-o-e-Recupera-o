drop policy if exists "FELJ authenticated write entries" on public.felj_entries;
drop policy if exists "FELJ authenticated write executions" on public.felj_executions;
drop policy if exists "FELJ authenticated write imports" on public.felj_imports;
drop policy if exists "FELJ authenticated write links" on public.felj_links;
drop policy if exists "FELJ authenticated read link history" on public.felj_link_history;
drop policy if exists "FELJ authenticated write link history" on public.felj_link_history;
drop policy if exists "FELJ authenticated read message events" on public.felj_message_events;
drop policy if exists "FELJ authenticated insert message events" on public.felj_message_events;

create policy "FELJ team read entries" on public.felj_entries
 for select to authenticated using (true);
create policy "FELJ PCP insert entries" on public.felj_entries
 for insert to authenticated with check (private.has_role(array['admin','pcp']));
create policy "FELJ PCP update entries" on public.felj_entries
 for update to authenticated using (private.has_role(array['admin','pcp']))
 with check (private.has_role(array['admin','pcp']));
create policy "FELJ admin delete entries" on public.felj_entries
 for delete to authenticated using (private.has_role(array['admin']));

create policy "FELJ team read executions" on public.felj_executions
 for select to authenticated using (true);
create policy "FELJ PCP insert executions" on public.felj_executions
 for insert to authenticated with check (private.has_role(array['admin','pcp']));
create policy "FELJ PCP update executions" on public.felj_executions
 for update to authenticated using (private.has_role(array['admin','pcp']))
 with check (private.has_role(array['admin','pcp']));
create policy "FELJ admin delete executions" on public.felj_executions
 for delete to authenticated using (private.has_role(array['admin']));

create policy "FELJ team read imports" on public.felj_imports
 for select to authenticated using (true);
create policy "FELJ PCP insert imports" on public.felj_imports
 for insert to authenticated with check (private.has_role(array['admin','pcp']));

create policy "FELJ team read links" on public.felj_links
 for select to authenticated using (true);
create policy "FELJ PCP insert links" on public.felj_links
 for insert to authenticated with check (private.has_role(array['admin','pcp']));
create policy "FELJ PCP update links" on public.felj_links
 for update to authenticated using (private.has_role(array['admin','pcp']))
 with check (private.has_role(array['admin','pcp']));
create policy "FELJ admin delete links" on public.felj_links
 for delete to authenticated using (private.has_role(array['admin']));

create policy "FELJ team read link history" on public.felj_link_history
 for select to authenticated using (true);
create policy "FELJ PCP insert link history" on public.felj_link_history
 for insert to authenticated with check (private.has_role(array['admin','pcp']));

create policy "FELJ team read message events" on public.felj_message_events
 for select to authenticated using (true);
create policy "FELJ PCP insert message events" on public.felj_message_events
 for insert to authenticated with check (private.has_role(array['admin','pcp']));
