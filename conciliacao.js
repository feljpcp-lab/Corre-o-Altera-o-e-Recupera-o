(() => {
  'use strict';
  const cfg=window.FELJ_CLOUD_CONFIG||{};
  const supabase=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  let user=null,entries=[],executions=[],links=[],events=[];
  let selectedEntry=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const fmt=v=>{if(!v)return '—';const p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(v)};
  const today=()=>new Date().toISOString().slice(0,10);
  const closed=s=>s==='EXECUTADA'||s==='CANCELADA';
  function linkFor(id){return links.find(x=>x.entry_id===id)||{entry_id:id,status:'EM ABERTO',execution_id:null,reason:'',manual:false};}
  function score(e,x){
    let n=0,why=[];
    if(e.os&&x.os&&norm(e.os)===norm(x.os)){n+=60;why.push('OS');}
    if(e.tool_code&&x.tool_code&&norm(e.tool_code)===norm(x.tool_code)){n+=30;why.push('ferramenta');}
    if(e.extrusora&&x.extrusora&&norm(e.extrusora)===norm(x.extrusora)){n+=10;why.push('extrusora');}
    if(e.service_type===x.service_type&&e.service_type!=='Não classificado'){n+=5;why.push('tipo');}
    return {score:n,why};
  }
  function statusPill(s){
    const c=s==='EXECUTADA'?'done':s==='CONFERIR VÍNCULO'?'review':s==='EM ABERTO'?'open':'';
    return '<span class="pill '+c+'">'+esc(s||'EM ABERTO')+'</span>';
  }
  function filtered(){
    const q=norm($('search').value),type=$('filterType').value,status=$('filterStatus').value,year=$('filterYear').value;
    return entries.filter(e=>{
      const l=linkFor(e.id),blob=norm([e.os,e.extrusora,e.tool_code,e.description].join(' '));
      return (!q||blob.includes(q))&&(!type||e.service_type===type)&&(!status||l.status===status)&&(!year||String(e.entry_date||'').slice(0,4)===year);
    }).sort((a,b)=>String(b.entry_date||'').localeCompare(String(a.entry_date||'')));
  }
  function render(){
    const list=filtered(),review=links.filter(x=>x.status==='CONFERIR VÍNCULO').length,open=links.filter(x=>x.status==='EM ABERTO').length;
    const done=links.filter(x=>x.status==='EXECUTADA').length;
    const late=entries.filter(e=>e.due_date&&e.due_date<today()&&!closed(linkFor(e.id).status)).length;
    $('kEntries').textContent=entries.length;$('kExecutions').textContent=executions.length;
    $('kExecuted').textContent=done;$('kReview').textContent=review;$('kOpen').textContent=open;$('kLate').textContent=late;
    const bars=(items,total)=>items.length?items.map(([label,count])=>'<div class="barrow"><div class="barlabel"><span>'+esc(label)+'</span><strong>'+count+'</strong></div><div class="track"><i style="width:'+Math.max(2,Math.round(count/Math.max(total,1)*100))+'%"></i></div></div>').join(''):'<div class="muted">Sem dados.</div>';
    const byType=Object.entries(entries.reduce((a,e)=>(a[e.service_type||'Não classificado']=(a[e.service_type||'Não classificado']||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
    const byClient=Object.entries(entries.reduce((a,e)=>(a[e.extrusora||'Não identificada']=(a[e.extrusora||'Não identificada']||0)+1,a),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
    $('byType').innerHTML=bars(byType,entries.length);$('byExtrusora').innerHTML=bars(byClient,entries.length);
    const cycle=links.filter(l=>l.status==='EXECUTADA'&&l.execution_id).map(l=>{const e=entries.find(v=>v.id===l.entry_id),x=executions.find(v=>v.id===l.execution_id);return e?.entry_date&&x?.execution_date?(Date.parse(x.execution_date)-Date.parse(e.entry_date))/86400000:null;}).filter(v=>v!==null&&v>=0);
    $('cycleMetric').textContent=cycle.length?(cycle.reduce((a,b)=>a+b,0)/cycle.length).toFixed(1).replace('.',','):'—';
    $('resultCount').textContent=list.length+' de '+entries.length+' entradas';
    const years=[...new Set(entries.map(e=>String(e.entry_date||'').slice(0,4)).filter(Boolean))].sort().reverse();
    const old=$('filterYear').value;
    $('filterYear').innerHTML='<option value="">Todos os anos</option>'+years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join('');
    $('filterYear').value=years.includes(old)?old:'';
    $('rows').innerHTML=list.length?list.map(e=>{
      const l=linkFor(e.id),x=executions.find(v=>v.id===l.execution_id),late=e.due_date&&e.due_date<today()&&!closed(l.status);
      return '<tr><td><strong>OS '+esc(e.os||'—')+'</strong><br><span class="muted">'+esc(e.tool_code||'Ferramenta não identificada')+'</span></td>'+
       '<td>'+esc(e.extrusora)+'</td><td>'+esc(e.service_type)+'</td><td>'+fmt(e.entry_date)+'</td>'+
       '<td><span class="'+(late?'error':'')+'">'+fmt(e.due_date)+'</span></td><td>'+statusPill(l.status)+'</td>'+
       '<td>'+(l.match_score?esc(l.match_score)+' pts · '+esc((l.match_reasons||[]).join(', ')):(x?'Vínculo manual':'Sem sugestão'))+
       (x?'<br><span class="muted">Exec.: '+esc(fmt(x.execution_date))+'</span>':'')+'</td>'+
       '<td><div class="actions"><button class="btn" data-detail="'+esc(e.id)+'">Histórico</button><button class="btn primary" data-link="'+esc(e.id)+'">Vincular</button></div></td></tr>';
    }).join(''):'<tr><td colspan="8" class="empty">Nenhuma entrada encontrada para os filtros.</td></tr>';
    document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
    document.querySelectorAll('[data-link]').forEach(b=>b.addEventListener('click',()=>openLink(b.dataset.link)));
  }
  async function load(){
    $('connection').textContent='Carregando registros…';
    const [a,b,c,d]=await Promise.all([
      supabase.from('felj_entries').select('*').order('entry_date',{ascending:false}).limit(5000),
      supabase.from('felj_executions').select('*').order('execution_date',{ascending:false}).limit(5000),
      supabase.from('felj_links').select('*').limit(5000),
      supabase.from('felj_message_events').select('*').order('message_date',{ascending:false}).limit(5000)
    ]);
    for(const r of [a,b,c,d])if(r.error)throw r.error;
    entries=a.data||[];executions=b.data||[];links=c.data||[];events=d.data||[];
    $('connection').textContent='Conectado como '+(user.email||'equipe')+' · '+entries.length+' entradas e '+executions.length+' execuções';
    render();
  }
  async function openDetail(id){
    const e=entries.find(x=>x.id===id);if(!e)return;
    const l=linkFor(id),x=executions.find(v=>v.id===l.execution_id);
    $('detailTitle').textContent='OS '+(e.os||'sem OS')+' · '+(e.tool_code||'ferramenta não identificada');
    $('detailSub').textContent=e.extrusora+' · '+e.service_type+' · '+l.status;
    $('detailGrid').innerHTML=[
      ['Extrusora',e.extrusora],['Ferramenta',e.tool_code],['OS',e.os],['Tipo',e.service_type],
      ['Entrada',fmt(e.entry_date)],['Prazo',fmt(e.due_date)],['Etapa atual',e.operational_stage],
      ['Estado',e.operational_state],['Responsável',e.responsavel],['Vínculo sugerido',x?x.id:'Não definido']
    ].map(([k,v])=>'<div class="detail"><small>'+esc(k)+'</small><strong>'+esc(v||'—')+'</strong></div>').join('');
    let timeline=[];
    timeline.push({date:e.entry_date,title:'Entrada registrada',text:e.description,source:e.source_name});
    if(x)timeline.push({date:x.execution_date,title:'Execução localizada',text:x.description,source:x.source_name});
    const matchingEvents=events.filter(v=>(e.os&&v.os&&norm(v.os)===norm(e.os))||(e.tool_code&&v.tool_code&&norm(v.tool_code)===norm(e.tool_code)));
    matchingEvents.forEach(v=>timeline.push({date:v.message_date,title:'WhatsApp · '+v.classification,text:v.message_text,source:v.sender+' · '+v.source_name}));
    timeline.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    $('timeline').innerHTML=timeline.length?timeline.map(v=>'<div class="event"><strong>'+esc(v.title)+'</strong><p>'+esc(v.text)+'</p><time>'+fmt(v.date)+' · '+esc(v.source||'')+'</time></div>').join(''):'<div class="muted">Ainda não há eventos importados para esta OS/ferramenta.</div>';
    $('detailDialog').showModal();
  }
  function openLink(id){
    selectedEntry=entries.find(e=>e.id===id);if(!selectedEntry)return;
    const l=linkFor(id);
    $('linkSub').textContent='OS '+(selectedEntry.os||'—')+' · '+(selectedEntry.tool_code||'—')+' · '+selectedEntry.extrusora;
    const ranked=executions.map(x=>({x,...score(selectedEntry,x)})).sort((a,b)=>b.score-a.score||String(b.x.execution_date||'').localeCompare(String(a.x.execution_date||'')));
    $('executionSelect').innerHTML='<option value="">— Nenhuma execução selecionada —</option>'+ranked.map(v=>'<option value="'+esc(v.x.id)+'" '+(v.x.id===l.execution_id?'selected':'')+'>'+esc(v.x.execution_date||'sem data')+' · OS '+esc(v.x.os||'—')+' · '+esc(v.x.tool_code||'—')+' · '+esc(v.x.extrusora)+' · '+v.score+' pts</option>').join('');
    $('matchHint').textContent=ranked[0]?'Melhor candidato: '+ranked[0].score+' pontos ('+ranked[0].why.join(', ')+'). A confirmação é manual.':'Nenhuma execução cadastrada.';
    $('linkNote').value=l.reason||'';$('linkError').textContent='';$('linkDialog').showModal();
  }
  async function saveLink(status){
    if(!selectedEntry)return;
    const executionId=$('executionSelect').value||null;
    if(status==='EXECUTADA'&&!executionId){$('linkError').textContent='Selecione a execução antes de confirmar.';return;}
    const old=linkFor(selectedEntry.id),note=$('linkNote').value.trim();
    const payload={entry_id:selectedEntry.id,execution_id:executionId,status,
      reason:note||('Conferido manualmente por '+(user.email||'equipe')),
      manual:true,updated_by:user.email||null,updated_at:new Date().toISOString(),
      match_score:executionId?score(selectedEntry,executions.find(x=>x.id===executionId)).score:null,
      match_reasons:executionId?score(selectedEntry,executions.find(x=>x.id===executionId)).why:[],
      candidate_count:old.candidate_count||0};
    const saved=await supabase.rpc('felj_set_link',{
      p_entry_id:selectedEntry.id,p_execution_id:executionId,p_status:status,
      p_reason:payload.reason,p_match_score:payload.match_score,
      p_match_reasons:payload.match_reasons,p_actor_email:user.email||null
    });
    if(saved.error){$('linkError').textContent=saved.error.message;return;}
    $('linkDialog').close();await load();
  }
  async function init(){
    const s=await supabase.auth.getSession();user=s.data.session?.user||null;
    if(user){$('auth').close();await load().catch(e=>$('connection').textContent='Erro: '+e.message);}
    else $('auth').showModal();
    supabase.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;if(user){$('auth').close();await load().catch(e=>$('connection').textContent='Erro: '+e.message);}else $('auth').showModal();});
  }
  $('authForm').addEventListener('submit',async e=>{e.preventDefault();$('authError').textContent='';const r=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error)$('authError').textContent=r.error.message;else $('password').value='';});
  $('logout').addEventListener('click',()=>supabase.auth.signOut());
  $('refresh').addEventListener('click',()=>load().catch(e=>alert(e.message)));
  ['search','filterType','filterStatus','filterYear'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
  $('leaveOpen').addEventListener('click',()=>saveLink('EM ABERTO').catch(e=>$('linkError').textContent=e.message));
  $('saveReview').addEventListener('click',()=>saveLink('CONFERIR VÍNCULO').catch(e=>$('linkError').textContent=e.message));
  $('confirmExecution').addEventListener('click',()=>saveLink('EXECUTADA').catch(e=>$('linkError').textContent=e.message));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  init();
})();