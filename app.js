(() => {
  'use strict';

  const types = ['Correção', 'Recuperação', 'Alteração', 'Não classificado'];
  const statuses = ['Entrada registrada', 'Em análise', 'Em execução', 'Aguardando retorno', 'Concluída', 'Cancelada'];
  const storageKey = 'felj-mobile-registros-v1';
  const config = window.FELJ_CLOUD_CONFIG || {};
  const cloudConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let supabase = null;
  let currentUser = null;
  let records = [];
  let selectedId = null;
  const $ = id => document.getElementById(id);

  function dateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = (h + l - 7 * m + 114) % 31 + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const holidayCache = new Map();
  function holidaysForYear(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const easter = easterSunday(year);
    const goodFriday = new Date(easter);
    goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
    const corpusChristi = new Date(easter);
    corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
    const holidays = new Set([
      `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-07-09`,
      `${year}-08-15`, `${year}-09-07`, `${year}-10-12`, `${year}-11-02`,
      `${year}-11-15`, `${year}-11-20`, `${year}-12-25`,
      dateKey(goodFriday), dateKey(corpusChristi)
    ]);
    holidayCache.set(year, holidays);
    return holidays;
  }

  function addBusinessDays(start, count) {
    const date = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    let added = 0;
    while (added < count) {
      date.setUTCDate(date.getUTCDate() + 1);
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6 && !holidaysForYear(date.getUTCFullYear()).has(dateKey(date))) added++;
    }
    return date;
  }

  function businessDaysBetween(start, end) {
    if (!start || !end) return 0;
    let current = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const finish = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    let days = 0;
    while (current < finish) {
      current += 86400000;
      const date = new Date(current);
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6 && !holidaysForYear(date.getUTCFullYear()).has(dateKey(date))) days++;
    }
    return days;
  }

  function toDate(value) {
    return value instanceof Date ? value : new Date(`${value}T12:00:00`);
  }

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat('pt-BR').format(toDate(value)) : '—';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(records));
    render();
  }

  function isClosed(record) {
    return record.status === 'Concluída' || record.status === 'Cancelada';
  }

  function leadDays(record) {
    if (!record.receivedAt) return null;
    const start = toDate(record.receivedAt);
    const end = record.status === 'Concluída' && record.completedAt ? toDate(record.completedAt) : new Date();
    return businessDaysBetween(start, end);
  }

  function isOverdue(record) {
    if (record.status === 'Cancelada') return false;
    if (record.requiresReview) return false;
    if (!record.receivedAt) return false;
    if (record.status === 'Concluída') return leadDays(record) > 3;
    const dueDate = toDate(record.dueAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > dueDate;
  }

  function statusClass(status) {
    if (status === 'Concluída') return 'green';
    if (status === 'Em execução') return 'blue';
    if (status === 'Aguardando retorno') return 'yellow';
    if (status === 'Cancelada') return 'orange';
    return '';
  }

  function setNotice(message, error = false) {
    const notice = $('connectionNotice');
    notice.textContent = message;
    notice.classList.toggle('cloud', !error && cloudConfigured);
    notice.classList.toggle('error', error);
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2400);
  }

  function updateConnectionBadge() {
    const label = $('connectionState').querySelector('span');
    if (!cloudConfigured) {
      label.textContent = 'Modo local';
      $('connectionState').title = 'Demonstração local, sem sincronização';
    } else if (!supabase) {
      label.textContent = 'Nuvem indisponível';
      $('connectionState').title = 'Verifique a configuração Supabase';
    } else if (!currentUser) {
      label.textContent = 'Entrar';
      $('connectionState').title = 'Entrar na conta da equipe';
    } else {
      label.textContent = currentUser.email || 'Conta conectada';
      $('connectionState').title = 'Clique para sair';
    }
  }

  function render() {
    const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
    const type = $('filterType').value;
    const status = $('filterStatus').value;
    const filtered = records.filter(record =>
      (!query || [record.client, record.os, record.reference, record.profile, record.description, record.assignee]
        .join(' ').toLocaleLowerCase('pt-BR').includes(query)) &&
      (!type || record.type === type) && (!status || record.status === status)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    $('metricTotal').textContent = records.length;
    $('metricOpen').textContent = records.filter(record => !isClosed(record)).length;
    $('metricLate').textContent = records.filter(isOverdue).length;
    const openRecords = records.filter(record => !isClosed(record));
    const completed = records.filter(record => record.status === 'Concluída');
    const overdue = records.filter(isOverdue);
    const completionRate = records.length ? Math.round(completed.length / records.length * 100) : 0;
    $('execTotal').textContent = records.length;
    $('execOpen').textContent = openRecords.length;
    $('execCompleted').textContent = completed.length;
    $('execOverdue').textContent = overdue.length;
    $('execRate').textContent = completionRate + '%';
    const statusCounts = statuses.map(value => ({ label: value, count: records.filter(record => record.status === value).length })).filter(item => item.count);
    const typeCounts = types.map(value => ({ label: value, count: records.filter(record => record.type === value).length })).filter(item => item.count);
    const bars = items => items.length ? items.map(item => {
      const width = records.length ? Math.max(3, Math.round(item.count / records.length * 100)) : 0;
      return '<div class="exec-bar-row"><div class="exec-bar-label"><span>' + escapeHtml(item.label) + '</span><strong>' + item.count + '</strong></div><div class="exec-bar-track"><i style="width:' + width + '%"></i></div></div>';
    }).join('') : '<p class="exec-empty">Ainda não há dados para exibir.</p>';
    $('execStatusBars').innerHTML = bars(statusCounts);
    $('execTypeBars').innerHTML = bars(typeCounts);
    $('execOverdueList').innerHTML = overdue.length ? overdue.slice().sort((a,b) => (a.dueAt || '').localeCompare(b.dueAt || '')).slice(0,5).map(record =>
      '<div class="exec-overdue-item"><span><strong>' + escapeHtml(record.client) + '</strong><small>' + escapeHtml(record.type) + ' · Prazo ' + escapeHtml(formatDate(record.dueAt)) + '</small></span><b>' + escapeHtml(record.status) + '</b></div>'
    ).join('') : '<p class="exec-empty">Nenhuma solicitação fora do prazo.</p>';

    $('resultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'registro' : 'registros'}`;
    $('recordsList').innerHTML = filtered.map(record => {
      const late = isOverdue(record);
      const duration = leadDays(record);
      const sla = record.status === 'Concluída'
        ? duration === null ? 'Data de entrada a revisar' : `Concluída em ${duration} dias úteis`
        : !record.receivedAt ? 'Data de entrada a revisar' : late ? 'Prazo vencido' : `Prazo ${formatDate(record.dueAt)}`;
      const code = record.profile ? `Perfil ${escapeHtml(record.profile)}` : '';
      const os = record.os ? `OS ${escapeHtml(record.os)}` : '';
      const reference = record.reference ? escapeHtml(record.reference) : '';
      return `<article class="record">
        <div class="record-main"><div class="record-title"><strong>${escapeHtml(record.client)}</strong><span class="badge ${statusClass(record.status)}">${escapeHtml(record.type)}</span>${record.requiresReview ? '<span class="badge yellow">Revisar importação</span>' : ''}</div>
        <div class="record-sub">${os ? `<span>${os}</span>` : ''}${reference ? `<span>${reference}</span>` : ''}${code ? `<span>${code}</span>` : ''}</div>
        <div class="record-description">${escapeHtml(record.description)}</div></div>
        <div class="record-meta"><span>Status atual</span><strong>${escapeHtml(record.status)}</strong><span class="${late ? 'late' : 'safe'}">${sla}</span>${record.executionGroupSeen ? '<span>Também consta no grupo de execução</span>' : ''}</div>
        <div class="status-cell"><span class="status-hint">Atualizar andamento</span><select class="field status-select" data-status-id="${escapeHtml(record.id)}" aria-label="Atualizar status de ${escapeHtml(record.client)}">${statuses.map(value => `<option${value === record.status ? ' selected' : ''}>${value}</option>`).join('')}</select></div>
        <button class="text-button" data-detail-id="${escapeHtml(record.id)}" type="button">Ver histórico</button></article>`;
    }).join('');
    $('emptyState').hidden = filtered.length > 0;
    if (!filtered.length) {
      $('emptyState').hidden = false;
      $('emptyState').innerHTML = records.length
        ? '<strong>Nenhum resultado</strong>Altere a busca ou os filtros.'
        : '<strong>Nenhum registro por enquanto</strong>Use “Novo registro” para lançar a primeira solicitação.';
    }
    $('updatedAt').textContent = `Atualizado ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
    document.querySelectorAll('[data-status-id]').forEach(select => select.addEventListener('change', () => quickStatus(select.dataset.statusId, select.value)));
    document.querySelectorAll('[data-detail-id]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.detailId)));
  }

  function openEntry() {
    if (cloudConfigured && !currentUser) {
      $('authDialog').showModal();
      return;
    }
    $('entryForm').reset();
    $('receivedAt').value = dateKey(new Date());
    $('formError').textContent = '';
    $('entryDialog').showModal();
  }

  async function fetchInitialRecords() {
    const response = await fetch('./initial-records.json', { cache: 'no-store' });
    if (!response.ok) return [];
    return response.json();
  }

  async function seedEmptyCloudTable() {
    const seed = await fetchInitialRecords();
    if (!seed.length) return false;
    for (let offset = 0; offset < seed.length; offset += 40) {
      const batch = seed.slice(offset, offset + 40).map(record => ({
        id: record.id,
        client: record.client,
        os: record.os || null,
        reference: record.reference || null,
        profile_code: record.profile || null,
        request_type: record.type,
        description: record.description,
        assignee: record.assignee || null,
        received_at: record.receivedAt || null,
        due_at: record.dueAt || null,
        status: record.status,
        status_note: record.statusNote,
        completed_at: record.completedAt,
        source: record.source,
        requires_review: record.requiresReview,
        execution_group_seen: record.executionGroupSeen,
        created_at: record.createdAt
      }));
      const { error } = await supabase.from('correction_records').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    setNotice(`${seed.length} registros históricos carregados. Revise os sinalizados antes de usar os status.`);
    return true;
  }

  async function loadCloudRecords() {
    if (!supabase || !currentUser) return;
    const { data, error } = await supabase.from('correction_records').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data.length && await seedEmptyCloudTable()) return loadCloudRecords();
    const historyByRecord = new Map();
    if (data.length) {
      const ids = data.map(record => record.id);
      const result = await supabase.from('correction_status_history').select('*').in('correction_id', ids).order('created_at');
      if (result.error) throw result.error;
      for (const event of result.data || []) {
        if (!historyByRecord.has(event.correction_id)) historyByRecord.set(event.correction_id, []);
        historyByRecord.get(event.correction_id).push({
          status: event.status,
          previousStatus: event.previous_status,
          note: event.note,
          at: event.created_at,
          by: event.actor_email || 'Equipe'
        });
      }
    }
    records = data.map(row => ({
      id: row.id,
      client: row.client,
      os: row.os || '',
      reference: row.reference || '',
      profile: row.profile_code || '',
      type: row.request_type,
      description: row.description,
      assignee: row.assignee || '',
      receivedAt: row.received_at,
      dueAt: row.due_at,
      status: row.status,
      completedAt: row.completed_at,
      source: row.source || 'app',
      requiresReview: row.requires_review,
      executionGroupSeen: row.execution_group_seen,
      createdAt: row.created_at,
      createdBy: row.created_by,
      photoPath: row.photo_path || null,
      history: historyByRecord.get(row.id) || []
    }));
    render();
  }

  async function applySession(session) {
    currentUser = session?.user || null;
    updateConnectionBadge();
    if (currentUser) {
      setNotice(`Conectado como ${currentUser.email}. Registros sincronizados com a nuvem.`);
      try {
        await loadCloudRecords();
      } catch (error) {
        setNotice(`Falha ao carregar registros: ${error.message}`, true);
      }
    } else if (cloudConfigured) {
      records = [];
      render();
      setNotice('Entre com sua conta para consultar e registrar solicitações.');
    }
  }

  async function initializeCloud() {
    if (!cloudConfigured) {
      try {
        const saved = localStorage.getItem(storageKey);
        records = saved === null ? await fetchInitialRecords() : JSON.parse(saved);
        if (saved === null && records.length) localStorage.setItem(storageKey, JSON.stringify(records));
      } catch {
        records = [];
      }
      updateConnectionBadge();
      setNotice(records.length
        ? `${records.length} registros históricos carregados; confira os sinalizados. Este navegador ainda não sincroniza com a equipe.`
        : 'Demonstração local: os registros ficam somente neste navegador. Configure o projeto Supabase para compartilhar com a equipe.');
      render();
      return;
    }
    updateConnectionBadge();
    setNotice('Conectando ao Supabase...');
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
      supabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => applySession(session), 0);
      });
    } catch (error) {
      supabase = null;
      updateConnectionBadge();
      records = [];
      render();
      setNotice(`Não foi possível conectar ao Supabase: ${error.message}`, true);
    }
  }

  async function addEntry(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const os = String(form.get('os') || '').trim();
    const reference = String(form.get('reference') || '').trim();
    const profile = String(form.get('profile') || '').trim();
    if (!os && !reference && !profile) {
      $('formError').textContent = 'Informe pelo menos uma identificação: OS, referência ou perfil.';
      return;
    }
    if (cloudConfigured && (!supabase || !currentUser)) {
      $('formError').textContent = 'Entre na conta da equipe para gravar na nuvem.';
      return;
    }
    const receivedAt = String(form.get('receivedAt'));
    const client = String(form.get('client')).trim();
    const kind = String(form.get('kind'));
    const description = String(form.get('description')).trim();
    const assignee = String(form.get('assignee') || '').trim();
    const dueAt = dateKey(addBusinessDays(toDate(receivedAt), 3));
    const photo = $('photo').files[0] || null;
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
      $('formError').textContent = 'A foto deve ser JPG, PNG ou WebP e ter no máximo 5 MB.';
      return;
    }
    if (photo && !supabase) {
      $('formError').textContent = 'O anexo de fotos exige conexão com a nuvem.';
      return;
    }
    if (supabase) {
      const recordId = crypto.randomUUID();
      let photoPath = null;
      if (photo) {
        photoPath = `${recordId}/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('correction-photos').upload(photoPath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) {
          $('formError').textContent = `Não foi possível enviar a foto: ${uploadError.message}`;
          return;
        }
      }
      const { error } = await supabase.from('correction_records').insert({ id: recordId, photo_path: photoPath,
        client, os: os || null, reference: reference || null, profile_code: profile || null,
        request_type: kind, description, assignee: assignee || null,
        received_at: receivedAt, due_at: dueAt, status: 'Entrada registrada',
        status_note: 'Registro criado', source: 'app', requires_review: false, execution_group_seen: false
      });
      if (error) {
        $('formError').textContent = `Não foi possível gravar: ${error.message}`;
        return;
      }
      const { error: emailError } = await supabase.functions.invoke('notify-new-record', {
        body: { client, os, reference, profile_code: profile, request_type: kind, description, assignee, received_at: receivedAt, due_at: dueAt, status: 'Entrada registrada' }
      });
      await loadCloudRecords();
      $('entryDialog').close();
      toast(emailError ? 'Entrada salva; aviso por e-mail ainda não enviado' : 'Entrada registrada e aviso enviado ao PCP');
      return;
    }
    const now = new Date().toISOString();
    records.unshift({
      id: crypto.randomUUID(), client, os, reference, profile, type: kind, description, assignee,
      receivedAt, dueAt, status: 'Entrada registrada', createdAt: now, createdBy: 'Usuário local',
      completedAt: null, source: 'app', requiresReview: false, executionGroupSeen: false,
      history: [{ status: 'Entrada registrada', note: 'Entrada criada no aplicativo', at: now, by: 'Usuário local' }]
    });
    saveLocal();
    $('entryDialog').close();
    toast('Entrada salva neste navegador');
  }

  async function updateStatus(record, status, note, by = 'Usuário local', requestType = record.type, requiresReview = Boolean(record.requiresReview)) {
    const oldStatus = record.status;
    const oldType = record.type;
    const typeChanged = oldType !== requestType;
    const reviewChanged = Boolean(record.requiresReview) !== requiresReview;
    if (oldStatus === status && !typeChanged && !reviewChanged && !note) return;
    const completedAt = status === 'Concluída'
      ? (record.completedAt || new Date().toISOString())
      : null;
    const auditNote = note || (typeChanged
      ? `Tipo corrigido: ${oldType} → ${requestType}`
      : reviewChanged ? 'Dados da importação revisados.' : 'Status atualizado');
    if (supabase) {
      const { error } = await supabase.from('correction_records').update({
        status, request_type: requestType, requires_review: requiresReview,
        status_note: auditNote, completed_at: completedAt
      }).eq('id', record.id);
      if (error) throw error;
      await loadCloudRecords();
      return;
    }
    record.status = status;
    record.type = requestType;
    record.requiresReview = requiresReview;
    record.completedAt = completedAt;
    record.history.push({ status, previousStatus: oldStatus, note: auditNote, at: new Date().toISOString(), by });
    saveLocal();
  }

  async function quickStatus(id, status) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    try {
      await updateStatus(record, status, 'Status atualizado pela lista');
      toast(supabase ? 'Status sincronizado' : 'Status salvo neste navegador');
    } catch (error) {
      toast(`Falha ao atualizar: ${error.message}`);
      render();
    }
  }

  async function openDetail(id) {
    selectedId = id;
    const record = records.find(item => item.id === id);
    if (!record) return;
    $('detailTitle').textContent = record.client;
    $('detailSubtitle').textContent = `${record.type} · ${record.status}`;
    $('updateType').value = record.type;
    $('updateStatus').value = record.status;
    $('updateNote').value = '';
    $('reviewPrompt').hidden = !record.requiresReview;
    $('confirmReview').hidden = !record.requiresReview;
    $('detailPhotoSection').hidden = true;
    $('detailPhoto').removeAttribute('src');
    $('detailPhotoLink').removeAttribute('href');
    if (record.photoPath && supabase) {
      const { data, error } = await supabase.storage.from('correction-photos').createSignedUrl(record.photoPath, 3600);
      if (!error && data?.signedUrl && selectedId === record.id) {
        $('detailPhoto').src = data.signedUrl;
        $('detailPhotoLink').href = data.signedUrl;
        $('detailPhotoSection').hidden = false;
      }
    }
    $('detailFields').innerHTML = [
      ['OS', record.os], ['Referência', record.reference], ['Código do perfil', record.profile],
      ['Responsável', record.assignee], ['Entrada', formatDate(record.receivedAt)],
      ['Prazo', formatDate(record.dueAt)], ['Descrição', record.description]
    ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('');
    $('history').innerHTML = [...record.history].reverse().map(item =>
      `<div class="history-item"><strong>${escapeHtml(item.status)}${item.previousStatus ? ` · ${escapeHtml(item.previousStatus)} → ${escapeHtml(item.status)}` : ''}</strong><p>${escapeHtml(item.note || 'Sem observação')} · ${escapeHtml(item.by)}</p><time>${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.at))}</time></div>`
    ).join('');
    $('detailDialog').showModal();
  }

  async function signIn(event) {
    event.preventDefault();
    $('authError').textContent = '';
    if (!supabase) {
      $('authError').textContent = 'Configure o URL e a chave pública do Supabase primeiro.';
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: $('authEmail').value.trim(),
      password: $('authPassword').value
    });
    if (error) {
      $('authError').textContent = error.message;
      return;
    }
    $('authPassword').value = '';
    $('authDialog').close();
  }

  async function handleConnectionClick() {
    if (!cloudConfigured) {
      toast('A nuvem ainda não foi configurada');
    } else if (!supabase) {
      toast('Verifique a conexão e a configuração Supabase');
    } else if (currentUser) {
      const { error } = await supabase.auth.signOut();
      if (error) toast(`Falha ao sair: ${error.message}`);
    } else {
      $('authError').textContent = '';
      $('authDialog').showModal();
    }
  }

  $('entryForm').addEventListener('submit', addEntry);
  $('newRecord').addEventListener('click', openEntry);
  $('newRecordMobile').addEventListener('click', openEntry);
  $('search').addEventListener('input', render);
  $('filterType').addEventListener('change', render);
  $('filterStatus').addEventListener('change', render);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('saveUpdate').addEventListener('click', async () => {
    const record = records.find(item => item.id === selectedId);
    if (!record) return;
    try {
      await updateStatus(record, $('updateStatus').value, $('updateNote').value.trim(), 'Usuário local', $('updateType').value);
      openDetail(selectedId);
      toast(supabase ? 'Atualização sincronizada' : 'Atualização salva neste navegador');
    } catch (error) {
      toast(`Falha ao atualizar: ${error.message}`);
    }
  });
  $('confirmReview').addEventListener('click', async () => {
    const record = records.find(item => item.id === selectedId);
    if (!record) return;
    try {
      await updateStatus(record, $('updateStatus').value, 'Importação revisada pela equipe.', 'Usuário local', $('updateType').value, false);
      openDetail(selectedId);
      toast(supabase ? 'Revisão sincronizada' : 'Importação revisada neste navegador');
    } catch (error) {
      toast(`Falha ao revisar: ${error.message}`);
    }
  });
  $('authForm').addEventListener('submit', signIn);
  $('connectionState').addEventListener('click', handleConnectionClick);

  // Importação revisável de exportações TXT do WhatsApp.
  (function setupWhatsAppImport(){
    const modal=$('whatsappImportDialog'); if(!modal || !$('importWhatsApp')) return;
    let parsed=[], importClient=null;
    const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function dateKey(raw){const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return '';let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);if(d.getFullYear()!==y||d.getMonth()!==+m[2]-1||d.getDate()!==+m[1])return '';return y+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function parse(text){const out=[];let cur=null;const ps=[/^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+?):\s?(.*)$/,/^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?:\s*-\s*|\s+)([^:]+?):\s?(.*)$/];text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').forEach(line=>{let m=null;for(const p of ps){m=line.match(p);if(m)break;}if(m){if(cur)out.push(cur);cur={date:dateKey(m[1]),time:m[2],sender:m[3].trim(),text:m[4].trim()};}else if(cur&&line.trim())cur.text+='\n'+line.trim();});if(cur)out.push(cur);return out.filter(m=>m.text&&!/^(mensagens e chamadas são protegidas|messages and calls are end-to-end encrypted|<mídia oculta>|media omitted)/i.test(m.text));}
    function render(){ $('whatsappPreview').innerHTML=parsed.map((c,i)=>'<article data-i="'+i+'" style="border:1px solid var(--line);background:white;border-radius:7px;padding:12px;display:grid;gap:8px"><label><input type="checkbox" data-k="include" '+(c.include?'checked':'')+'> Importar mensagem '+(i+1)+' · '+esc(c.date||'Data não identificada')+' · '+esc(c.sender)+'</label><div class="form-grid"><div class="form-field"><label>Cliente / Extrusora *</label><input class="field" data-k="client" value="'+esc(c.client)+'" placeholder="Preencher cliente"></div><div class="form-field"><label>OS</label><input class="field" data-k="os" value="'+esc(c.os)+'"></div><div class="form-field"><label>Referência</label><input class="field" data-k="reference" value="'+esc(c.reference)+'"></div><div class="form-field"><label>Tipo</label><select class="field" data-k="type">'+['Correção','Recuperação','Alteração','Não classificado'].map(t=>'<option '+(c.type===t?'selected':'')+'>'+t+'</option>').join('')+'</select></div><div class="form-field full"><label>Descrição original</label><textarea data-k="description">'+esc(c.text)+'</textarea></div><div class="form-field"><label>Responsável / remetente</label><input class="field" data-k="assignee" value="'+esc(c.sender)+'"></div><div class="form-field"><label>Data de entrada</label><input class="field" type="date" data-k="receivedAt" value="'+esc(c.date)+'"></div></div><small>Confira se é uma nova solicitação. Desmarque mensagens que sejam apenas atualizações.</small></article>').join('');$('whatsappSave').disabled=!parsed.some(c=>c.include);}
    function collect(){document.querySelectorAll('#whatsappPreview [data-i]').forEach(card=>{const c=parsed[+card.dataset.i];card.querySelectorAll('[data-k]').forEach(el=>c[el.dataset.k]=el.dataset.k==='include'?el.checked:el.value);});}
    $('importWhatsApp').addEventListener('click',()=>{modal.showModal();$('whatsappFile').value='';$('whatsappPreview').innerHTML='';$('whatsappSave').disabled=true;$('whatsappImportMessage').textContent='Selecione a exportação .txt do WhatsApp.';parsed=[];});
    $('whatsappFile').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;if(f.size>10*1024*1024){$('whatsappImportMessage').textContent='Arquivo acima de 10 MB. Divida a exportação.';return;}const msgs=parse(await f.text());parsed=msgs.map(m=>{const os=m.text.match(/\b(?:OS\s*[:#-]?\s*)?(\d{4,6})\b/i),ref=m.text.match(/\b(?:matriz|refer[eê]ncia)\s*[:#-]?\s*([A-Z0-9./_-]+)/i);return {include:Boolean(os||ref),date:m.date,sender:m.sender,text:m.text,client:'',os:os?os[1]:'',reference:ref?ref[1]:'',type:/recupera|recondicion/i.test(m.text)?'Recuperação':/altera|modifica|mudança/i.test(m.text)?'Alteração':'Correção',assignee:m.sender};});$('whatsappImportMessage').textContent=msgs.length?msgs.length+' mensagens identificadas. Linhas de continuação foram agrupadas. Revise cada item antes de importar.':'Não reconheci o formato. Exporte a conversa como .txt.';render();});
    $('whatsappPreview').addEventListener('input',collect);$('whatsappPreview').addEventListener('change',()=>{collect();$('whatsappSave').disabled=!parsed.some(c=>c.include);});
    $('whatsappSave').addEventListener('click',async()=>{collect();const chosen=parsed.filter(c=>c.include);if(!chosen.length)return;if(chosen.some(c=>!c.client.trim()||!c.description.trim()||(!c.os.trim()&&!c.reference.trim()))){$('whatsappImportMessage').textContent='Preencha cliente e OS ou referência nos itens selecionados.';return;}$('whatsappSave').disabled=true;try{if(!supabase||!currentUser)throw new Error('Entre na conta da equipe antes de importar.');const q=await supabase.from('correction_records').select('client,os,reference,description').limit(5000);if(q.error)throw q.error;const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();const seen=new Set((q.data||[]).map(r=>[r.client,r.os,r.reference,r.description].map(norm).join('|')));let duplicates=0;const rows=[];chosen.forEach(c=>{const key=[c.client,c.os,c.reference,c.description].map(norm).join('|');if(seen.has(key)){duplicates++;return;}seen.add(key);const received=c.receivedAt||new Date().toISOString().slice(0,10),due=addBusinessDays(toDate(received),3);rows.push({id:crypto.randomUUID(),client:c.client.trim(),os:c.os.trim()||null,reference:c.reference.trim()||null,profile_code:null,request_type:c.type,description:c.description.trim(),assignee:c.assignee.trim()||null,received_at:received,due_at:dateKey(due),status:'Entrada registrada',status_note:'Importado do WhatsApp; aguardando revisão.',source:'whatsapp',requires_review:true,execution_group_seen:false});});if(!rows.length){$('whatsappImportMessage').textContent='Nenhum registro novo. '+duplicates+' possível(is) duplicidade(s) ignorada(s).';$('whatsappSave').disabled=false;return;}const ins=await supabase.from('correction_records').insert(rows);if(ins.error)throw ins.error;$('whatsappImportMessage').textContent='Importados '+rows.length+' registros; '+duplicates+' duplicidade(s) ignorada(s). Atualizando a tela...';await loadCloudRecords();$('whatsappPreview').innerHTML='';$('whatsappSave').disabled=true;setTimeout(()=>modal.close(),1800);}catch(err){$('whatsappImportMessage').textContent='Falha na importação: '+err.message;$('whatsappSave').disabled=false;}});
  })();

  render();
  initializeCloud();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(error => console.info('PWA indisponível:', error.message));
  }
})();