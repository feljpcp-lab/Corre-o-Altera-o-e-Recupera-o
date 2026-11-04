/* FELJ WhatsApp Interpreter — parser determinístico, sem gravação automática.
 * Preserva data/hora do cabeçalho, linhas multilinha e evidência original.
 */
(() => {
  'use strict';
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const isoDate = (raw) => {
    const m = String(raw || '').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!m) return '';
    let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    // Exportações brasileiras são dd/mm; só inverte quando a primeira parte não pode ser mês.
    let day = a, month = b;
    if (a <= 12 && b > 12) { month = a; day = b; }
    const d = new Date(Date.UTC(y, month - 1, day));
    return d.getUTCFullYear() === y && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
      ? y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') : '';
  };
  const headerPatterns = [
    /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+?):\s?(.*)$/,
    /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2})(?:\s*-\s*|\s+)([^:]+?):\s?(.*)$/
  ];
  function parseMessages(input) {
    const lines = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const messages = []; let current = null;
    for (const line of lines) {
      let match = null;
      for (const pattern of headerPatterns) { match = line.match(pattern); if (match) break; }
      if (match) {
        if (current) messages.push(current);
        current = { date: isoDate(match[1]), time: match[2], sender: match[3].trim().replace(/^[-–—]\\s*/, ''), text: match[4].trim(), rawLines: 1 };
      } else if (current && line.trim()) {
        current.text += '\n' + line.trim(); current.rawLines++;
      } else if (!current && line.trim()) {
        // Cabeçalhos de sistema/linhas soltas são mantidos fora dos registros.
      }
    }
    if (current) messages.push(current);
    return messages.filter(m => m.text && !/^(mensagens e chamadas sao protegidas|messages and calls are end-to-end encrypted|<midia oculta>|<media omitted>)$/i.test(norm(m.text)));
  }
  function extract(message) {
    const text = message.text || '', n = norm(text);
    const osMatches = [...text.matchAll(/\b(?:OS|O\.S\.?|ordem(?:\s+de\s+servico)?)\s*[:#-]?\s*(\d{4,7})\b/gi)].map(m => m[1]);
    const genericOs = !osMatches.length ? text.match(/\b(\d{5})\b/) : null;
    const osList = [...new Set(osMatches.length ? osMatches : (genericOs ? [genericOs[1]] : []))];
    const toolMatches = [...text.matchAll(/\b[A-Z]{1,6}[- ]?\d{2,5}(?:[-/][A-Z0-9]{1,5}){0,3}\b/gi)]
      .map(m => m[0].replace(/\s+/g, '').toUpperCase())
      .filter(v => !/^\d{4,7}$/.test(v) && !/^(19|20)\d{2}$/.test(v) && !/^OS\d/i.test(v));
    const toolList = [...new Set(toolMatches)].slice(0, 12);
    const components = [];
    if (/\bmatriz\b/i.test(n)) components.push('Matriz');
    if (/\bfeeder\b/i.test(n)) components.push('Feeder');
    if (/\b\bba\b\b/i.test(n) || /\bbacker\b/i.test(n)) components.push('BA');
    if (/\bespina\b/i.test(n)) components.push('Espina');
    const serviceType = /recupera|recondicion/i.test(n) ? 'Recuperação'
      : /alterac|modific|mudanca|projeto/i.test(n) ? 'Alteração'
      : /correc|reparo|ajuste/i.test(n) ? 'Correção' : 'Não classificado';
    const stageRules = [
      ['Erosão a fio', /erosao\s+a\s+fio|fio\s+de\s+erosao/],
      ['Erosão', /erosao/], ['Preparação', /preparacao/], ['Calibração', /calibracao|calibrar/],
      ['Tempera', /tempera|tratamento termico/], ['Solda', /solda|soldar/],
      ['Fresadora', /fresadora|fresar/], ['Torno', /torno|tornear/], ['Serra', /serra|corte/]
    ];
    const stage = (stageRules.find(([, re]) => re.test(n)) || [null])[0];
    const state = /aguardando|esperando/.test(n) ? 'Aguardando'
      : /liberada|liberado|pronta|pronto|concluida|concluido|executada|executado/.test(n) ? 'Liberada'
      : /em andamento|iniciada|iniciado|fazendo/.test(n) ? 'Em andamento' : null;
    const entryCue = /entrada|recebid|chegou|solicit|favor fazer|orcamento aprovado|mandar para|enviar para/.test(n);
    const executionCue = /liberada|liberado|concluida|concluido|executada|executado|servico feito|correcao aplicada|pronta/.test(n);
    const updateCue = Boolean(stage || /aguardando|parada|retornou|voltou|segue|continua/.test(n));
    const kind = executionCue ? 'execution' : entryCue ? 'entry' : updateCue ? 'update' : 'review';
    const confidence = (osList.length ? 0.35 : 0) + (toolList.length ? 0.35 : 0) + (serviceType !== 'Não classificado' ? 0.15 : 0) + (message.date ? 0.15 : 0);
    return { ...message, osList, toolList, components, serviceType, stage, state, kind,
      confidence: Math.min(1, confidence), needsReview: !message.date || (!osList.length && !toolList.length) || confidence < 0.7 };
  }
  function interpret(input) {
    const messages = parseMessages(input).map(extract);
    const candidates = [];
    for (const message of messages) {
      const tools = message.toolList.length ? message.toolList : [null];
      const oss = message.osList.length ? message.osList : [null];
      // Não cruza várias OS com várias ferramentas: cria combinações marcadas para revisão.
      for (const os of oss) for (const tool of tools) {
        const ambiguous = oss.length > 1 && tools.length > 1;
        candidates.push({ ...message, os, tool, ambiguous,
          needsReview: message.needsReview || ambiguous,
          reviewReason: ambiguous ? 'Mensagem contém várias OS e ferramentas; confirmar os vínculos.' :
            message.needsReview ? 'Identificação incompleta; revisar antes de confirmar.' : '' });
      }
    }
    return { messages, candidates, summary: {
      messages: messages.length, entries: candidates.filter(x => x.kind === 'entry').length,
      executions: candidates.filter(x => x.kind === 'execution').length,
      updates: candidates.filter(x => x.kind === 'update').length,
      review: candidates.filter(x => x.needsReview || x.kind === 'review').length
    } };
  }
  function matchScore(entry, execution) {
    let score = 0, reasons = [];
    if (entry.os && execution.os && norm(entry.os) === norm(execution.os)) { score += 60; reasons.push('mesma OS'); }
    if (entry.tool && execution.tool && norm(entry.tool) === norm(execution.tool)) { score += 30; reasons.push('mesma ferramenta'); }
    if (entry.extrusora && execution.extrusora && norm(entry.extrusora) === norm(execution.extrusora)) { score += 10; reasons.push('mesma extrusora'); }
    if (entry.serviceType && execution.serviceType && entry.serviceType === execution.serviceType) { score += 5; reasons.push('mesmo tipo'); }
    return { score, reasons, status: score >= 90 ? 'SUGESTÃO FORTE' : score >= 60 ? 'REVISAR VÍNCULO' : 'SEM VÍNCULO' };
  }
  window.FELJWhatsAppInterpreter = { parseMessages, extract, interpret, matchScore, normalize: norm };
})();
