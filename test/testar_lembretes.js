// Testa a lógica dos lembretes por e-mail fora do n8n.
// Uso: node test/testar_lembretes.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

let AGORA = '2026-10-07T10:00:00-03:00';
Settings.now = () => new Date(AGORA).valueOf();

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const rodar = (codigo, entrada, nos = {}) =>
  new Function('$input', '$', 'DateTime', codigo)(
    { first: () => ({ json: entrada }) },
    nome => ({ first: () => ({ json: nos[nome] }) }),
    DateTime,
  ).map(i => i.json);

const cfg = () => rodar(src('10_lembretes_config.js'), {})[0];
// A lógica vale para qualquer lista de antecedências; os testes 1–9 usam quatro (2d, 1d, 12h, 6h)
const cfg4 = () => ({ ...cfg(), email_naty: 'naty@x.com', antecedencias_min: [2880, 1440, 720, 360] });
const calcular = (eventos, c = cfg4()) => rodar(src('11_calcular_lembretes.js'), { items: eventos }, { 'Configuração': c });
const ev = (extra = {}) => ({
  id: 'ev1', status: 'confirmed', summary: '✅ Sessão Pregão 45/2026', location: 'Paço Municipal',
  htmlLink: 'https://calendar.google.com/x', start: { dateTime: '2026-10-09T09:00:00-03:00' },
  extendedProperties: { private: { naty_bot: '1' } }, ...extra,
});
// Aplica as marcas devolvidas ao evento, como o PATCH faria no Google Agenda
const aplicar = (e, r) => ({ ...e, extendedProperties: r.extendedProperties });

// Janela de busca cobre a maior antecedência
const c = cfg();
assert.equal(c.timeMin, '2026-10-07T13:00:00.000Z');
assert.equal(c.timeMax, '2026-10-09T14:00:00.000Z');
assert.deepEqual(c.antecedencias_min, [2880, 1440]);
console.log('ok  janela de busca: agora até 49h; padrão: e-mail 2 dias e 1 dia antes');

// 1. Evento sexta 09/10 09:00; agora quarta 10:00 → faltam 47h → lembrete de 2 dias devido
let e = ev();
let r = calcular([e]);
assert.equal(r.length, 1);
assert.ok(r[0].html.startsWith('📅 <b>FALTAM 1 DIA E 23H</b>'), r[0].html);
assert.ok(r[0].html.includes('<b>Sessão Pregão 45/2026</b>'), 'tira o prefixo ✅');
assert.ok(r[0].html.includes('sexta-feira, 09/10 às 09:00'));
assert.deepEqual(Object.keys(r[0].extendedProperties.private).sort(), ['lembrete_2880', 'naty_bot']);
console.log('ok  lembrete de 2 dias →', r[0].html.split('\n')[0]);

// 2. Rodando de novo 10 min depois: nada (já marcado)
e = aplicar(e, r[0]);
AGORA = '2026-10-07T10:10:00-03:00';
assert.equal(calcular([e]).length, 0);
console.log('ok  não repete lembrete já enviado');

// 3. 1 dia antes
AGORA = '2026-10-08T09:05:00-03:00';
r = calcular([e]);
assert.equal(r.length, 1);
assert.ok(r[0].html.startsWith('⏰ <b>FALTAM 23H55</b>'), r[0].html);
e = aplicar(e, r[0]);
console.log('ok  lembrete de 1 dia');

// 4. n8n fora do ar entre 12h e 6h antes → ao voltar, UMA mensagem só, marcando os dois
AGORA = '2026-10-09T03:30:00-03:00';
r = calcular([e]);
assert.equal(r.length, 1);
assert.ok(r[0].html.startsWith('🚨 <b>FALTAM 5H30</b>'), r[0].html);
assert.ok(r[0].extendedProperties.private.lembrete_720 && r[0].extendedProperties.private.lembrete_360);
e = aplicar(e, r[0]);
assert.equal(calcular([e]).length, 0);
console.log('ok  lembretes atrasados viram uma mensagem só');

// 5. Naty adia o evento para segunda 12/10 → marcas antigas deixam de valer
AGORA = '2026-10-10T10:00:00-03:00';
e = { ...e, start: { dateTime: '2026-10-12T09:00:00-03:00' } };
r = calcular([e]);
assert.equal(r.length, 1);
assert.ok(r[0].html.includes('segunda-feira, 12/10'), r[0].html);
console.log('ok  evento remarcado volta a receber lembretes');

// 6. Evento já começou → nada
AGORA = '2026-10-12T09:30:00-03:00';
assert.equal(calcular([e]).length, 0);
console.log('ok  evento que já começou é ignorado');

// 7. Avisos de status e evento sem horário
AGORA = '2026-10-07T10:00:00-03:00';
r = calcular([ev({ summary: '⏳ [A CONFIRMAR] Visita técnica' })]); // evento antigo, da versão com Telegram
assert.ok(r[0].html.includes('<b>Visita técnica</b>'));
r = calcular([ev({ summary: '⚠️ VERIFICAR: Visita' })]);
assert.ok(r[0].html.includes('VERIFICAR</b>. A data pode estar errada'));
r = calcular([ev({ start: { date: '2026-10-08' } })]);
assert.ok(r[0].html.includes('quinta-feira, 08/10 — <b>SEM HORÁRIO DEFINIDO</b>'), r[0].html);
console.log('ok  avisos de "verificar" e "sem horário"; prefixo antigo removido');

// 8. Filtro: eventos pessoais da Naty (sem a marca do robô) e cancelados são ignorados
const pessoal = ev({ id: 'p', extendedProperties: undefined });
assert.equal(calcular([pessoal, ev({ status: 'cancelled' })]).length, 0);
assert.equal(calcular([pessoal], { ...cfg4(), apenas_eventos_do_robo: false }).length, 1);
console.log('ok  filtro de eventos do robô / cancelados');

// 9. Pedido criado em cima da hora (faltam 20h): manda um aviso só, e o de 12h ainda virá
r = calcular([ev({ start: { dateTime: '2026-10-08T06:00:00-03:00' } })]);
assert.equal(r.length, 1);
assert.deepEqual(Object.keys(r[0].extendedProperties.private).filter(k => k.startsWith('lembrete')).sort(), ['lembrete_1440', 'lembrete_2880']);
console.log('ok  pedido urgente: 1 aviso imediato, os de 12h/6h continuam agendados');

// 10. Texto do cliente não quebra o HTML do Telegram
r = calcular([ev({ summary: 'Pregão <urgente> & cia', location: 'Sala <3>' })]);
assert.ok(r[0].html.includes('Pregão &lt;urgente&gt; &amp; cia') && r[0].html.includes('Sala &lt;3&gt;'));
console.log('ok  HTML escapado');

// 12. Destinatários e assunto do e-mail
const convidados = [
  { email: 'naty@x.com', self: true, organizer: true },
  { email: 'Joao@Empresa.com' },
  { email: 'maria@empresa.com', responseStatus: 'declined' },
  { email: 'sala1@resource.calendar.google.com', resource: true },
];
r = calcular([ev({ attendees: convidados })]);
assert.equal(r[0].para, 'naty@x.com,joao@empresa.com', 'Naty + convidados; sem recusados, salas ou repetidos');
assert.equal(r[0].assunto, '📅 Faltam 1 dia e 23h: Sessão Pregão 45/2026 (sexta-feira, 09/10 às 09:00)');
// Evento pessoal (sem a marca do robô): só a Naty, mesmo que tenha convidados
r = calcular([ev({ extendedProperties: undefined, attendees: convidados })], { ...cfg4(), apenas_eventos_do_robo: false });
assert.equal(r[0].para, 'naty@x.com');
console.log('ok  e-mail para a Naty e convidados do evento do robô; compromisso pessoal só para a Naty');

// 11. Sem eventos → nada
assert.equal(calcular([]).length, 0);
assert.equal(rodar(src('11_calcular_lembretes.js'), {}, { 'Configuração': cfg() }).length, 0);
console.log('ok  agenda vazia');

console.log('\nTodos os testes de lembretes passaram.');
