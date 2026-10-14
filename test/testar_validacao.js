// Testa os nós de código fora do n8n, simulando $input, $() e DateTime.
// Uso: node test/testar_validacao.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

Settings.now = () => new Date('2026-10-07T10:00:00-03:00').valueOf(); // "hoje" fixo: qua 07/10/2026 10h

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const rodarTodos = (codigo, entrada, nos = {}) =>
  new Function('$input', '$', 'DateTime', codigo)(
    { first: () => ({ json: entrada }), all: () => [{ json: entrada }] },
    nome => ({ first: () => ({ json: nos[nome] }) }),
    DateTime,
  );
const rodar = (codigo, entrada, nos) => rodarTodos(codigo, entrada, nos)[0].json;

// Normalização: e-mail e formulário
const normEmail = rodar(src('01_normalizar.js'), {
  subject: 'Pregão 45/2026', from: { text: 'Cliente <c@x.com>' }, text: 'Sessão dia 15/10 às 9h', date: '2026-10-06T14:30:00.000Z',
});
assert.equal(normEmail.origem, 'E-mail');
assert.equal(normEmail.canal, 'email');
assert.ok(normEmail.referencia_iso.startsWith('2026-10-06T11:30'), 'referência = data de envio do e-mail em Brasília');
const normForm = rodar(src('01_normalizar.js'), { 'Texto do pedido': 'oi naty, amanhã 14h', Origem: 'WhatsApp' });
assert.equal(normForm.origem, 'Formulário (WhatsApp)');
assert.equal(normForm.canal, 'formulario');
console.log('ok  entrada por e-mail e formulário');

// Normalização: WhatsApp (formato do nó "WhatsApp Trigger": o "value" do webhook da Meta)
const src01 = src('01_normalizar.js').replace("'COLOQUE_O_NUMERO_DA_NATY'", "'5511987654321'");
const waMsg = m => ({
  messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: '123' },
  contacts: [{ profile: { name: 'Naty' }, wa_id: m.from }], messages: [m], field: 'messages',
});
const msgTexto = {
  from: '5511987654321', id: 'wamid.1', type: 'text', text: { body: 'Sessão dia 15/10 às 9h' },
  timestamp: String(Date.parse('2026-10-06T14:30:00Z') / 1000),
};
let w = rodar(src01, waMsg(msgTexto));
assert.equal(w.canal, 'whatsapp');
assert.equal(w.responder_para, '5511987654321');
assert.equal(w.whatsapp_phone_number_id, '123', 'responde pelo número que recebeu');
assert.equal(w.origem, 'WhatsApp (Naty)');
assert.equal(w.texto, 'Sessão dia 15/10 às 9h');
assert.equal(w.erro, '');
assert.equal(w.encaminhada, false);
assert.ok(w.referencia_iso.startsWith('2026-10-06T11:30'), 'referência = hora da mensagem, em Brasília');
assert.equal(rodarTodos(src01, waMsg({ ...msgTexto, from: '551187654321' })).length, 1, 'celular antigo, sem o 9');
assert.equal(rodarTodos(src01, waMsg({ ...msgTexto, from: '5521999999999' })).length, 0, 'número não autorizado é ignorado');
assert.equal(rodarTodos(src('01_normalizar.js'), waMsg(msgTexto)).length, 0, 'sem número configurado, ninguém é autorizado');
assert.equal(rodarTodos(src01, { messaging_product: 'whatsapp', statuses: [{ status: 'read' }], field: 'messages' }).length, 0, 'aviso de leitura');
w = rodar(src01, waMsg({ ...msgTexto, type: 'audio', audio: { id: 'm1' }, text: undefined }));
assert.ok(w.erro.includes('Recebi um áudio') && w.erro.includes('só leio mensagens de texto'), w.erro);
w = rodar(src01, waMsg({ ...msgTexto, context: { forwarded: true } }));
assert.equal(w.encaminhada, true);
console.log('ok  entrada pelo WhatsApp: autorizados (com e sem o 9), status ignorado, áudio recusado, encaminhada');

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
const validar = (d, p = normEmail) => rodar(src('03_validar.js'), d.__raw || resposta(d), { 'Normalizar entrada': p });

// 1. Caso feliz: evento verde, sem prefixo, sem convidados
let r = validar(base);
assert.equal(r.erro, '');
assert.equal(r.evento.start.dateTime, '2026-10-15T09:00:00-03:00');
assert.equal(r.evento.end.dateTime, '2026-10-15T11:00:00-03:00');
assert.deepEqual(r.evento.reminders.overrides.map(o => o.method + o.minutes), ['popup2880', 'popup1440', 'popup720', 'popup360']);
assert.deepEqual(r.alertas, []);
assert.equal(r.verificar, false);
assert.equal(r.evento.summary, 'Sessão Pregão 45/2026 – Pref. Campinas');
assert.equal(r.evento.colorId, '10');
assert.equal(r.evento.attendees, undefined);
assert.ok(r.resposta_whatsapp.startsWith('✅ *Agendado*\n*Sessão Pregão 45/2026 – Pref. Campinas*'), r.resposta_whatsapp);
assert.ok(r.resposta_whatsapp.includes('📅 *QUINTA-FEIRA, 15 DE OUTUBRO DE 2026 às 09:00*'), r.resposta_whatsapp);
assert.ok(r.assunto_email.startsWith('✅ Agendado: '));
console.log('ok  caso feliz →', r.assunto_email);

// 2. Dia da semana em conflito (o erro clássico: "segunda, 15/10" mas 15/10 é quinta) → vermelho
r = validar({ ...base, dia_da_semana_citado: 'segunda-feira' });
assert.ok(r.alertas.some(a => a.startsWith('CONFLITO DE DATA')), r.alertas);
assert.equal(r.verificar, true);
assert.equal(r.evento.summary, '⚠️ VERIFICAR: Sessão Pregão 45/2026 – Pref. Campinas');
assert.equal(r.evento.colorId, '11');
assert.ok(r.assunto_email.startsWith('⚠️ CONFIRA: '));
assert.ok(r.resposta_whatsapp.startsWith('⚠️ *Agendei, mas CONFIRA a data*'));
assert.ok(r.resposta_whatsapp.includes('⚠️ *ATENÇÃO:*\n• CONFLITO DE DATA'));
console.log('ok  conflito de dia da semana → evento VERIFICAR');

// 3. Dia da semana coerente, com acento/abreviação
r = validar({ ...base, dia_da_semana_citado: 'Qui.' });
assert.ok(!r.alertas.some(a => a.startsWith('CONFLITO')));
console.log('ok  "Qui." coerente com 15/10');

// 4. Sem horário → dia inteiro + VERIFICAR
r = validar({ ...base, hora_inicio: '' });
assert.deepEqual(r.evento.start, { date: '2026-10-15' });
assert.deepEqual(r.evento.end, { date: '2026-10-16' });
assert.ok(r.alertas[0].startsWith('HORÁRIO NÃO ENCONTRADO'));
assert.equal(r.verificar, true);
console.log('ok  sem horário → dia inteiro');

// 5. Data no passado
r = validar({ ...base, data: '2026-10-01' });
assert.ok(r.alertas.some(a => a.includes('JÁ PASSOU')));
assert.equal(r.verificar, true);
console.log('ok  data no passado sinalizada');

// 6. Menos de 48h: aviso de urgência, mas sem dúvida sobre a data → continua verde
r = validar({ ...base, data: '2026-10-08', hora_inicio: '14:00' });
assert.ok(r.alertas.some(a => a.startsWith('URGENTE: faltam só 28h')), r.alertas);
assert.equal(r.verificar, false);
console.log('ok  urgente <48h (aviso, sem VERIFICAR)');

// 7. Hora de fim antes do início → usa duração padrão
r = validar({ ...base, hora_fim: '08:00' });
assert.equal(r.evento.end.dateTime, '2026-10-15T11:00:00-03:00');
console.log('ok  hora_fim inválida corrigida');

// 8. Falhas: não é pedido, sem data, data inválida, recusa, erro HTTP, JSON quebrado
const falhas = [
  ['não é pedido', { ...base, eh_pedido_de_servico: false }, 'Não encontrei um pedido'],
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

// 9. Resposta por e-mail: mesmo conteúdo, em HTML, com o texto do cliente escapado
r = validar({ ...base, dia_da_semana_citado: 'segunda', contato: 'João <joao@x.com>', orgao: 'Obras & Cia' });
assert.ok(r.resposta_html.includes('⚠️ <b>ATENÇÃO:</b><br>• CONFLITO DE DATA'), r.resposta_html);
assert.ok(r.resposta_html.includes('Contato: João &lt;joao@x.com&gt;') && r.resposta_html.includes('Obras &amp; Cia'));
assert.ok(!r.resposta_html.includes('\n'));
console.log('ok  resposta em HTML para e-mail, com texto do cliente escapado');

// 10. Limite do WhatsApp (4096 caracteres) com texto enorme
r = validar({ ...base, ambiguidades: Array.from({ length: 80 }, (_, i) => 'ambiguidade longa número ' + i + ' com texto de enchimento') });
assert.ok(r.resposta_whatsapp.length <= 4096 - 200, 'sobra espaço para o link da agenda');
console.log('ok  resposta do WhatsApp dentro do limite');

// 11. Evento marcado para o workflow de lembretes; equipe convidada
assert.equal(validar(base).evento.extendedProperties.private.naty_bot, '1');
r = validar(base, { ...normEmail, emails_equipe: ['Joao@Empresa.com', 'joao@empresa.com', ' maria@empresa.com ', 'sem-arroba'] });
assert.deepEqual(r.evento.attendees, [{ email: 'joao@empresa.com' }, { email: 'maria@empresa.com' }]);
assert.ok(r.resposta_whatsapp.includes('Convite e lembretes por e-mail para: joao@empresa.com, maria@empresa.com'));
console.log('ok  evento marcado como do robô; equipe convidada sem repetidos');

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
  assert.equal(r.verificar, false, 'relativa digitada na hora: só aviso');
}
assert.ok(req.messages[0].content.includes('NÃO é relativa, mesmo sem o ano'), 'regra no prompt');
console.log('ok  "05/11" sem ano não vira alerta de data relativa; "amanhã" continua virando');

// 13. Mensagem ENCAMINHADA com data relativa: "amanhã" pode ser de dias atrás → VERIFICAR
r = validar({ ...base, trecho_da_data: 'amanhã às 9h', data_relativa: true }, { ...normEmail, encaminhada: true });
assert.ok(r.alertas.some(a => a.startsWith('Mensagem ENCAMINHADA com data relativa')), r.alertas);
assert.equal(r.verificar, true);
r = validar({ ...base, data_relativa: false }, { ...normEmail, encaminhada: true });
assert.equal(r.verificar, false, 'encaminhada com data escrita: sem alerta');
console.log('ok  encaminhada + "amanhã" → VERIFICAR');

// 13b. Confiança MÉDIA por causa de "amanhã" digitado na hora não deixa vermelho (teste real de 14/10/2026);
// MÉDIA por outro motivo, BAIXA, ou "amanhã" encaminhado continuam vermelhos.
const amanha = { ...base, trecho_da_data: 'amanhã às 15h', data_relativa: true, confianca: 'media' };
r = validar(amanha);
assert.equal(r.verificar, false, 'amanhã digitado + média → verde');
assert.ok(!r.alertas.some(a => a.startsWith('Confiança da IA')), r.alertas);
assert.equal(validar(amanha, { ...normEmail, encaminhada: true }).verificar, true, 'encaminhada → vermelho');
assert.equal(validar({ ...amanha, confianca: 'baixa' }).verificar, true, 'baixa → vermelho');
assert.equal(validar({ ...base, confianca: 'media' }).verificar, true, 'média com data escrita → vermelho');
assert.ok(req.messages[0].content.includes('Não liste isso em "ambiguidades"'), 'regra no prompt');
console.log('ok  "amanhã" digitado na hora com confiança média fica verde; baixa, encaminhada ou média por outro motivo, vermelho');

// 14. Ano omitido + data que acabou de passar: "05/10" lido em 07/10 vira 05/10/2027.
r = validar({ ...base, data: '2027-10-05', trecho_da_data: 'dia 05/10 às 9h' });
assert.ok(r.alertas.some(a => a.includes('mais de 6 meses')), r.alertas);
r = validar({ ...base, data: '2027-03-01' }); // ~5 meses: sem alerta de ano
assert.ok(!r.alertas.some(a => a.includes('mais de 6 meses')), r.alertas);
console.log('ok  data a mais de 6 meses pede para conferir o ano');

// 15. Aviso de falha: motivo vindo da entrada, da IA ou do Google Agenda
const aviso = entrada => rodar(src('04_aviso_falha.js'), entrada, { 'Normalizar entrada': { ...normEmail, texto: 'pedido <urgente>' } });
let a = aviso({ erro: 'Recebi um áudio, mas por enquanto só leio mensagens de texto.' });
assert.ok(a.texto_whatsapp.startsWith('🚨 *NÃO agendei este pedido.*\n\nRecebi um áudio'), a.texto_whatsapp);
a = aviso({ error: { message: '401 - invalid_grant' } });
assert.ok(a.motivo.startsWith('Erro ao criar o evento no Google Agenda: ') && a.motivo.includes('invalid_grant'));
assert.ok(a.html_email.includes('pedido &lt;urgente&gt;'));
console.log('ok  aviso de falha (entrada, IA, Google Agenda)');

console.log('\nTodos os testes passaram.');
