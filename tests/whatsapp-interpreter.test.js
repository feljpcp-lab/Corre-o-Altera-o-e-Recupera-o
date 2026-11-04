const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('whatsapp-interpreter.js', 'utf8'), sandbox);
const parser = sandbox.window.FELJWhatsAppInterpreter;

const txt = [
  '11/09/2026, 08:16 - PCP: Entrada de correção',
  'Matriz',
  'P-180',
  'OS 38083',
  'Aguardando na erosão a fio',
  '11/09/2026, 09:20 - Operador: Liberada após correção',
  'P-180 OS 38083'
].join('\n');
const parsed = parser.interpret(txt);
assert.equal(parsed.messages.length, 2, 'duas mensagens com continuação agrupada');
assert.equal(parsed.messages[0].date, '2026-09-11', 'data do cabeçalho');
assert.match(parsed.messages[0].text, /Aguardando na erosão a fio/, 'continuação mantida');
assert.equal(parsed.candidates[0].os, '38083', 'OS extraída');
assert.ok(parsed.candidates[0].tool, 'ferramenta identificada');
assert.equal(parsed.candidates[0].components[0], 'Matriz', 'componente identificado');
assert.equal(parsed.candidates[0].stage, 'Erosão a fio', 'etapa operacional identificada');
assert.equal(parsed.candidates[1].kind, 'execution', 'mensagem de liberação classificada como execução');

const score = parser.matchScore(
  { os: '38083', tool: 'P-180', extrusora: 'ALFA', serviceType: 'Correção' },
  { os: '38083', tool: 'P-180', extrusora: 'ALFA', serviceType: 'Correção' }
);
assert.equal(score.score, 105);
assert.equal(score.status, 'SUGESTÃO FORTE');
console.log('OK: parser WhatsApp — multiline, cabeçalho, OS, ferramenta, componente, etapa e matching.');
