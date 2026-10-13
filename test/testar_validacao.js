// Testa os nós de código fora do n8n, simulando $input, $() e DateTime.
// Uso: node test/testar_validacao.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

Settings.now = () => new Date('2026-10-07T10:00:00-03:00').valueOf(); // "hoje" fixo: qua 07/10/2026 10h

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const rodar = (codigo, entrada, nos = {}) =>
  new Function('$input', '$', 'DateTime', codigo)(
    { first: () => ({ json: entrada }) },
    nome => ({ first: () => ({ json: nos[nome] }) }),
    DateTime,
  )[0].json;

// Normalização: e-mail e formulário
const normEmail = rodar(src('01_normalizar.js'), {
  subject: 'Pregão 45/2026', from: { text: 'Cliente <c@x.com>' }, text: 'Sessão dia 15/10 às 9h', date: '2026-10-06T14:30:00.000Z',
});
assert.equal(normEmail.origem, 'E-mail');
assert.ok(normEmail.referencia_iso.startsWith('2026-10-06T11:30'), 'referência = data de envio do e-mail em Brasília');
const normForm = rodar(src('01_normalizar.js'), { 'Texto do pedido': 'oi naty, amanhã 14h', Origem: 'WhatsApp' });
assert.equal(normForm.origem, 'Formulário (WhatsApp)');

// Montagem da requisição
const req = rodar(src('02_montar_requisicao.js'), normEmail).body;
assert.equal(req.model, 'openai/gpt-oss-120b');
assert.equal(req.response_format.json_schema.strict, true);
assert.equal(req.messages[0].role, 'system');
assert.ok(req.messages[1].content.includes('Sessão dia 15/10'));
assert.ok(req.messages[1].content.includes('terça-feira 06/10/2026 (hoje)'), 'calendário começa na data de envio');
assert.ok(req.messages[1].content.includes('quinta-feira 15/10/2026'), 'calendário com dia da semana certo');
console.log('ok  requisição Groq com calendário');

const base = {
  eh_pedido_de_servico: true, resumo: 'Sessão Pregão 45/2026 – Pref. Campinas', tipo_servico: 'Sessão de pregão',
  orgao: 'Prefeitura de Campinas', numero_processo: '45/2026', local: 'Paço Municipal', contato: '',
  data: '2026-10-15', hora_inicio: '09:00', hora_fim: '', trecho_da_data: 'Sessão dia 15/10 às 9h',
  dia_da_semana_citado: '', data_relativa: false, outras_datas: [], confianca: 'alta', ambiguidades: [], observacoes: '',
};
const resposta = d => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(d), reasoning: '...' } }] });
const validar = d => rodar(src('03_validar.js'), d.__raw || resposta(d), { 'Normalizar entrada': normEmail });

// 1. Caso feliz
let r = validar(base);
assert.equal(r.erro, '');
assert.equal(r.evento.start.dateTime, '2026-10-15T09:00:00-03:00');
assert.equal(r.evento.end.dateTime, '2026-10-15T11:00:00-03:00');
assert.deepEqual(r.evento.reminders.overrides.map(o => o.minutes), [2880, 1440, 720, 360, 1440]);
assert.deepEqual(r.alertas, []);
assert.ok(r.email_texto.includes('📅 QUINTA-FEIRA, 15 DE OUTUBRO DE 2026 às 09:00'), r.email_texto.slice(0, 400));
console.log('ok  caso feliz →', r.assunto_email);

// 2. Dia da semana em conflito (o erro clássico: "segunda, 15/10" mas 15/10 é quinta)
r = validar({ ...base, dia_da_semana_citado: 'segunda-feira' });
assert.ok(r.alertas.some(a => a.startsWith('CONFLITO DE DATA')), r.alertas);
assert.ok(r.assunto_email.startsWith('⚠️'));
console.log('ok  conflito de dia da semana →', r.alertas[0]);

// 3. Dia da semana coerente, com acento/abreviação
r = validar({ ...base, dia_da_semana_citado: 'Qui.' });
assert.ok(!r.alertas.some(a => a.startsWith('CONFLITO')));
console.log('ok  "Qui." coerente com 15/10');

// 4. Sem horário → dia inteiro + alerta
r = validar({ ...base, hora_inicio: '' });
assert.deepEqual(r.evento.start, { date: '2026-10-15' });
assert.deepEqual(r.evento.end, { date: '2026-10-16' });
assert.ok(r.alertas[0].startsWith('HORÁRIO NÃO ENCONTRADO'));
console.log('ok  sem horário → dia inteiro');

// 5. Data no passado
r = validar({ ...base, data: '2026-10-01' });
assert.ok(r.alertas.some(a => a.includes('JÁ PASSOU')));
console.log('ok  data no passado sinalizada');

// 6. Menos de 48h
r = validar({ ...base, data: '2026-10-08', hora_inicio: '14:00' });
assert.ok(r.alertas.some(a => a.startsWith('URGENTE: faltam só 28h')), r.alertas);
console.log('ok  urgente <48h');

// 7. Hora de fim antes do início → usa duração padrão
r = validar({ ...base, hora_fim: '08:00' });
assert.equal(r.evento.end.dateTime, '2026-10-15T11:00:00-03:00');
console.log('ok  hora_fim inválida corrigida');

// 8. Falhas: não é pedido, sem data, data inválida, recusa, erro HTTP, JSON quebrado
const falhas = [
  ['não é pedido', { ...base, eh_pedido_de_servico: false }, 'não identificou'],
  ['sem data', { ...base, data: '' }, 'Não consegui identificar a data'],
  ['data impossível', { ...base, data: '2026-02-30' }, 'Não consegui identificar a data'],
  ['recusa', { __raw: { choices: [{ finish_reason: 'stop', message: { refusal: 'não posso', content: null } }] } }, 'recusou'],
  ['cortada', { __raw: { choices: [{ finish_reason: 'length', message: { content: '{"eh_ped' } }] } }, 'cortada'],
  ['erro HTTP (limite do plano grátis)', { __raw: { error: { message: '429 rate_limit_exceeded' } } }, 'Falha na chamada'],
  ['resposta vazia', { __raw: { choices: [] } }, 'não devolveu'],
  ['JSON quebrado', { __raw: { choices: [{ finish_reason: 'stop', message: { content: '{oops' } }] } }, 'JSON'],
];
for (const [nome, entrada, trecho] of falhas) {
  r = validar(entrada);
  assert.ok(r.erro && r.erro.includes(trecho), nome + ': ' + r.erro);
  console.log('ok  falha tratada:', nome);
}

// 9. Alertas aparecem no texto do e-mail de confirmação
r = validar({ ...base, dia_da_semana_citado: 'segunda' });
assert.ok(r.email_texto.includes('⚠️ ATENÇÃO:\n• CONFLITO DE DATA'));
console.log('ok  alertas no e-mail de confirmação');

// 10. Texto do Telegram (Markdown antigo): caracteres do cliente não podem quebrar a formatação.
// Regra do Telegram: fora de entidades, _ * ` [ só podem aparecer escapados com \; * de negrito em pares.
function markdownValido(t) {
  const semEscapes = t.replace(/\\[_*`\[]/g, '');
  return !/[_`\[]/.test(semEscapes) && (semEscapes.match(/\*/g) || []).length % 2 === 0;
}
r = validar(base);
assert.ok(r.telegram_texto.includes('📅 *QUINTA-FEIRA, 15 DE OUTUBRO DE 2026 às 09:00*'), r.telegram_texto);
assert.ok(r.telegram_texto.endsWith('*A data está certa?*'));
assert.ok(markdownValido(r.telegram_texto));
r = validar({
  ...base, contato: 'joao_silva@pref.sp.gov.br', orgao: 'Secretaria *Obras* [SP]', local: 'Sala `3`',
  trecho_da_data: 'dia 15_10 *urgente*', dia_da_semana_citado: 'segunda',
  outras_datas: [{ data: '2026-10-10', hora: '', descricao: 'impugnação_prazo' }],
});
assert.ok(markdownValido(r.telegram_texto), r.telegram_texto);
assert.ok(r.telegram_texto.includes('joao\\_silva@pref.sp.gov.br'));
r = validar({ ...base, ambiguidades: Array.from({ length: 80 }, (_, i) => 'ambiguidade_longa número ' + i + ' com *asterisco* e texto de enchimento') });
assert.ok(r.telegram_texto.length <= 4096, 'limite do Telegram');
assert.ok(markdownValido(r.telegram_texto), 'texto cortado continua válido');
assert.ok(r.telegram_texto.endsWith('*A data está certa?*'));
console.log('ok  texto do Telegram com Markdown válido (inclusive com _ * ` [ do cliente e texto longo)');

// 11. Evento marcado para o workflow de lembretes
assert.equal(validar(base).evento.extendedProperties.private.naty_bot, '1');
console.log('ok  evento marcado como do robô');

// 12. "Data relativa" só quando é relativa de verdade. Caso real (13/10/2026): "05/11 às 10:00"
// voltou com data_relativa=true só porque o ano não estava escrito, e gerou alerta falso.
const ehRelativa = a => a.startsWith('A data foi escrita de forma relativa');
for (const trecho of ['agendada para 05/11 às 10:00', 'dia 5 de novembro às 10h', '1º de novembro, 10h', 'em 05 / 11']) {
  r = validar({ ...base, data: '2026-11-05', hora_inicio: '10:00', trecho_da_data: trecho, data_relativa: true });
  assert.ok(!r.alertas.some(ehRelativa), trecho + ' → ' + r.alertas);
}
for (const trecho of ['amanhã às 22h', 'sexta que vem, 9h', 'daqui a 3 dias']) {
  r = validar({ ...base, trecho_da_data: trecho, data_relativa: true });
  assert.ok(r.alertas.some(ehRelativa), trecho + ' → ' + r.alertas);
}
assert.ok(req.messages[0].content.includes('NÃO é relativa, mesmo sem o ano'), 'regra no prompt');
console.log('ok  "05/11" sem ano não vira alerta de data relativa; "amanhã" continua virando');

// 13. Ano omitido + data que acabou de passar: "05/10" lido em 07/10 vira 05/10/2027.
r = validar({ ...base, data: '2027-10-05', trecho_da_data: 'dia 05/10 às 9h' });
assert.ok(r.alertas.some(a => a.includes('mais de 6 meses')), r.alertas);
r = validar({ ...base, data: '2027-03-01' }); // ~5 meses: sem alerta de ano
assert.ok(!r.alertas.some(a => a.includes('mais de 6 meses')), r.alertas);
console.log('ok  data a mais de 6 meses pede para conferir o ano');

console.log('\nTodos os testes passaram.');
