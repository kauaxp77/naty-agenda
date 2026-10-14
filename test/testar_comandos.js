// Testa os comandos do WhatsApp ("agenda", "menu", "ajuda") fora do n8n.
// Uso: node test/testar_comandos.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

Settings.now = () => new Date('2026-10-14T11:00:00-03:00').valueOf(); // "hoje" fixo: qua 14/10/2026 11h

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const rodar = (codigo, entrada, nos = {}) =>
  new Function('$input', '$', 'DateTime', codigo)(
    { first: () => ({ json: entrada }), all: () => [{ json: entrada }] },
    nome => ({ first: () => ({ json: nos[nome] }) }),
    DateTime,
  ).map(i => i.json);

// 1. Detecção do comando no normalizar
const src01 = src('01_normalizar.js').replace("'COLOQUE_O_NUMERO_DA_NATY'", "'5561981234567'");
const wa = m => ({
  messaging_product: 'whatsapp', metadata: { phone_number_id: '123' },
  contacts: [{ profile: { name: 'Naty' } }], field: 'messages',
  messages: [{ from: '556181234567', id: 'wamid.1', timestamp: '1791986000', ...m }],
});
const comando = m => rodar(src01, wa(m))[0].comando;
const texto = body => ({ type: 'text', text: { body } });
for (const t of ['agenda', 'Agenda', ' AGENDA! ', 'ver agenda', 'Próximos', 'eventos']) assert.equal(comando(texto(t)), 'agenda', t);
for (const t of ['oi', 'Oi!', 'Olá', 'menu', 'bom dia', 'Boa noite']) assert.equal(comando(texto(t)), 'menu', t);
for (const t of ['ajuda', 'como agendar']) assert.equal(comando(texto(t)), 'ajuda', t);
for (const t of ['agenda pra mim a sessão dia 20/11 às 9h', 'Bom dia Naty! Sessão dia 20/11 às 9h', 'oi, preciso de visita técnica amanhã 14h']) {
  assert.equal(comando(texto(t)), '', 'pedido não é comando: ' + t);
}
const botao = id => ({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } });
assert.equal(comando(botao('ver_agenda')), 'agenda');
assert.equal(comando(botao('como_agendar')), 'ajuda');
assert.equal(rodar(src01, wa(botao('ver_agenda')))[0].erro, '', 'clique em botão não é "mensagem que não é texto"');
assert.equal(rodar(src('01_normalizar.js'), { subject: 'agenda', text: 'agenda', date: '2026-10-14T10:00:00Z' })[0].comando, '', 'e-mail não tem comandos');
console.log('ok  comandos: só a palavra (com acento, maiúscula, pontuação) ou clique no botão; pedido continua pedido');

// 2. Lista de eventos
const p = { fuso: 'America/Sao_Paulo' };
const lista = resp => rodar(src('05_listar_eventos.js'), resp, { 'Normalizar entrada': p })[0].mensagem;
const ev = (summary, start, extra = {}) => ({ status: 'confirmed', summary, start, ...extra });
let m = lista({ items: [
  ev('Entrega de envelopes – Pref. Águas Lindas', { dateTime: '2026-10-15T15:00:00-03:00' }),
  ev('⚠️ VERIFICAR: Visita técnica – Sabesp', { dateTime: '2026-10-15T09:00:00-03:00' }),
  ev('Sessão Pregão 45/2026', { dateTime: '2026-11-20T09:00:00-03:00' }),
  ev('Prazo de recurso', { date: '2026-10-14' }),
  ev('Cancelado', { dateTime: '2026-10-16T09:00:00-03:00' }, { status: 'cancelled' }),
] });
assert.equal(m.type, 'text');
const b = m.text.body;
assert.ok(b.startsWith('📅 *Próximos serviços* (4)'), b);
assert.ok(b.includes('*Hoje · Quarta-feira, 14/10*\n• dia todo — Prazo de recurso'), b);
assert.ok(b.includes('*Amanhã · Quinta-feira, 15/10*'), b);
assert.ok(b.includes('⚠️ 09:00 — Visita técnica – Sabesp'), 'VERIFICAR vira ⚠️ e sai do título');
assert.ok(b.includes('*Sexta-feira, 20/11*\n• 09:00 — Sessão Pregão 45/2026'), b);
assert.ok(!b.includes('Cancelado'));
assert.ok(b.endsWith('⚠️ = marcado para VERIFICAR: confira a data no evento.'));
assert.equal(b.split('*Amanhã').length, 2, 'cabeçalho do dia aparece uma vez só');
console.log('ok  lista agrupada por dia, Hoje/Amanhã, ⚠️ nos que estão para conferir');

assert.equal(lista({ items: [] }).text.body, '📅 Nenhum serviço marcado nos próximos 60 dias.');
assert.ok(lista({ error: { message: '401 invalid_grant' } }).text.body.startsWith('⚠️ Não consegui ler a agenda'));
m = lista({ items: Array.from({ length: 45 }, (_, i) => ev('Serviço número ' + i + ' com um título bem comprido para encher a mensagem', { dateTime: DateTime.fromISO('2026-10-15T09:00:00-03:00').plus({ days: i }).toISO() })) });
assert.ok(m.text.body.length <= 4096, 'limite do WhatsApp');
assert.ok(m.text.body.includes('… e mais 15'), m.text.body.slice(-200));
console.log('ok  agenda vazia, erro do Google e lista longa');

// 3. Menu e ajuda
const menu = c => rodar(src('06_menu.js'), {}, { 'Normalizar entrada': { comando: c } })[0].mensagem;
m = menu('menu');
assert.equal(m.type, 'interactive');
assert.deepEqual(m.interactive.action.buttons.map(x => x.reply.id), ['ver_agenda', 'como_agendar']);
assert.ok(m.interactive.action.buttons.every(x => [...x.reply.title].length <= 20), 'título do botão: até 20 caracteres');
assert.ok(menu('ajuda').text.body.startsWith('➕ *Como agendar*'));
console.log('ok  menu com 2 botões e texto de ajuda');

// 4. O workflow gerado liga tudo
const wf = require('../workflow-naty-agenda.json');
const con = wf.connections;
assert.equal(con['Resposta não entregue?'].main[1][0].node, 'É comando?', 'mensagem normal chega aos comandos');
assert.equal(con['É comando?'].main[1][0].node, 'Dá para ler?', 'sem comando → fluxo de pedido');
const q = wf.nodes.find(n => n.name === 'Ler próximos eventos').parameters.queryParameters.parameters;
assert.ok(q.some(x => x.name === 'privateExtendedProperty' && x.value === 'naty_bot=1'), 'só eventos do robô');
console.log('ok  workflow: comando desvia antes da IA; lista só eventos do robô');

console.log('\nTodos os testes de comandos passaram.');
