const resp = $input.first().json;
const p = $('Normalizar entrada').first().json;
const fuso = p.fuso;
const agora = DateTime.now().setZone(fuso);

const falha = (erro, dados) => [{ json: { erro, dados: dados || null } }];

// ---- 1. Ler a resposta da IA ----
let d;
try {
  if (resp.error) throw new Error('Falha na chamada à IA: ' + JSON.stringify(resp.error).slice(0, 400));
  const escolha = (resp.choices || [])[0];
  if (!escolha || !escolha.message) throw new Error('A IA não devolveu resposta.');
  if (escolha.message.refusal) throw new Error('A IA se recusou a processar a mensagem.');
  if (escolha.finish_reason === 'length') throw new Error('A resposta da IA veio cortada (limite de tokens).');
  if (!escolha.message.content) throw new Error('A resposta da IA não trouxe texto.');
  d = JSON.parse(escolha.message.content);
} catch (e) {
  return falha(e.message);
}

if (!d.eh_pedido_de_servico) {
  return falha('A IA não identificou um pedido de serviço com data nesta mensagem. Se for um pedido, agende manualmente ou cole o texto no formulário.', d);
}

// ---- 2. Data e hora ----
const dia = DateTime.fromISO(d.data || '', { zone: fuso });
if (!d.data || !dia.isValid) {
  return falha('Não consegui identificar a data do serviço. Trecho encontrado: "' + (d.trecho_da_data || '—') + '"', d);
}

const hhmm = s => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  return m && +m[1] < 24 && +m[2] < 60 ? { hour: +m[1], minute: +m[2] } : null;
};
const hi = hhmm(d.hora_inicio);
const hf = hhmm(d.hora_fim);
const alertas = [];

let inicio, fim, diaInteiro = false;
if (hi) {
  inicio = dia.set({ ...hi, second: 0, millisecond: 0 });
  fim = hf ? dia.set({ ...hf, second: 0, millisecond: 0 }) : inicio.plus({ hours: p.duracao_padrao_horas });
  if (fim <= inicio) fim = inicio.plus({ hours: p.duracao_padrao_horas });
} else {
  diaInteiro = true;
  inicio = dia.startOf('day');
  fim = inicio.plus({ days: 1 });
  alertas.push('HORÁRIO NÃO ENCONTRADO: criei como evento de dia inteiro. Os lembretes contam a partir da meia-noite. Ajuste a hora na agenda.');
}

// ---- 3. Checagens determinísticas (não dependem da IA) ----
const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DIAS = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, dom: 7 };
const citado = DIAS[semAcento(d.dia_da_semana_citado).slice(0, 3)];
const diaSemanaReal = inicio.setLocale('pt-BR').toFormat('cccc');
if (citado && citado !== inicio.weekday) {
  alertas.push('CONFLITO DE DATA: a mensagem diz "' + d.dia_da_semana_citado + '", mas ' +
    inicio.toFormat('dd/MM/yyyy') + ' cai numa ' + diaSemanaReal + '. Uma das duas informações está errada. CONFIRA COM O CLIENTE.');
}
if (inicio < agora) alertas.push('A data identificada JÁ PASSOU (' + inicio.toFormat('dd/MM/yyyy HH:mm') + ').');
if (inicio > agora.plus({ days: 365 })) alertas.push('A data está a mais de 1 ano de distância. Confira o ano.');
const horasAte = inicio.diff(agora, 'hours').hours;
if (horasAte >= 0 && horasAte < 48) alertas.push('URGENTE: faltam só ' + Math.floor(horasAte) + 'h. Alguns lembretes (2 dias / 1 dia antes) não vão disparar.');
if (d.confianca !== 'alta') alertas.push('Confiança da IA: ' + d.confianca.toUpperCase() + '.');
if (d.data_relativa) alertas.push('A data foi escrita de forma relativa ("amanhã", "sexta que vem"...) e foi calculada a partir de ' + p.referencia_extenso + '.');
for (const a of d.ambiguidades || []) alertas.push(a);

// ---- 4. Textos ----
const dataExtenso = inicio.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL 'de' yyyy").toUpperCase() +
  (diaInteiro ? ' (SEM HORÁRIO)' : ' às ' + inicio.toFormat('HH:mm'));
const outras = (d.outras_datas || []).map(o => '• ' + o.descricao + ': ' + o.data + (o.hora ? ' ' + o.hora : ''));

const descricao = [
  'Serviço: ' + (d.tipo_servico || '—'),
  'Órgão: ' + (d.orgao || '—'),
  'Processo/Edital: ' + (d.numero_processo || '—'),
  'Local: ' + (d.local || '—'),
  'Contato: ' + (d.contato || '—'),
  '',
  'Trecho original da data: "' + (d.trecho_da_data || '—') + '"',
  outras.length ? '\nOutras datas na mensagem:\n' + outras.join('\n') : '',
  alertas.length ? '\n⚠️ ALERTAS:\n- ' + alertas.join('\n- ') : '',
  d.observacoes ? '\nObservações: ' + d.observacoes : '',
  '',
  'Origem: ' + p.origem,
  '--- Mensagem original ---',
  p.texto.length > 6000 ? p.texto.slice(0, 6000) + '\n[...texto completo na mensagem original]' : p.texto,
].join('\n');

const resumo = d.resumo || d.tipo_servico || 'Serviço de licitação';

const evento = {
  summary: '⏳ [A CONFIRMAR] ' + resumo,
  location: d.local || undefined,
  description: descricao,
  colorId: '6', // laranja = aguardando confirmação
  extendedProperties: { private: { naty_bot: '1' } }, // marca usada pelo workflow de lembretes no Telegram
  start: diaInteiro ? { date: inicio.toISODate() } : { dateTime: inicio.toISO({ suppressMilliseconds: true }), timeZone: fuso },
  end: diaInteiro ? { date: fim.toISODate() } : { dateTime: fim.toISO({ suppressMilliseconds: true }), timeZone: fuso },
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 2880 }, // 2 dias
      { method: 'popup', minutes: 1440 }, // 1 dia
      { method: 'popup', minutes: 720 },  // 12 horas
      { method: 'popup', minutes: 360 },  // 6 horas
      { method: 'email', minutes: 1440 }, // e-mail 1 dia antes
    ],
  },
};

// Texto puro: o nó "Send and Wait" do Gmail escapa HTML, mas preserva quebras de linha
const email_texto = [
  'Recebi um pedido e JÁ COLOQUEI NA AGENDA como "A CONFIRMAR". Confira a data:',
  '',
  '📅 ' + dataExtenso,
  '',
  'A mensagem original diz: "' + (d.trecho_da_data || '—') + '"',
  alertas.length ? '\n⚠️ ATENÇÃO:\n' + alertas.map(a => '• ' + a).join('\n') : '',
  '',
  'Serviço: ' + (d.tipo_servico || '—'),
  'Órgão: ' + (d.orgao || '—'),
  'Processo: ' + (d.numero_processo || '—'),
  'Local: ' + (d.local || '—'),
  'Contato: ' + (d.contato || '—'),
  'Origem: ' + p.origem,
  outras.length ? '\nOutras datas na mensagem:\n' + outras.join('\n') : '',
  '',
  'Se estiver tudo certo, clique em CONFIRMAR. Se algo estiver errado, clique em ESTÁ ERRADO e corrija direto na agenda.',
].join('\n');

// Texto para o Telegram. O nó "Send and Wait" do Telegram usa Markdown antigo:
// _ * ` [ vindos do cliente (ex.: joao_silva@...) precisam de \ antes, senão o Telegram recusa a mensagem.
const md = s => String(s || '—').replace(/([_*`\[])/g, '\\$1');
let telegram_texto = [
  '📥 *Novo pedido* (já está na agenda como A CONFIRMAR)',
  '',
  '📅 *' + md(dataExtenso) + '*',
  '',
  'A mensagem diz: "' + md(d.trecho_da_data) + '"',
  alertas.length ? '\n⚠️ *ATENÇÃO:*\n' + alertas.map(a => '• ' + md(a)).join('\n') : '',
  '',
  'Serviço: ' + md(d.tipo_servico),
  'Órgão: ' + md(d.orgao),
  'Processo: ' + md(d.numero_processo),
  'Local: ' + md(d.local),
  'Contato: ' + md(d.contato),
  'Origem: ' + md(p.origem),
  outras.length ? '\nOutras datas na mensagem:\n' + outras.map(md).join('\n') : '',
  '',
  '*A data está certa?*',
].join('\n');
if (telegram_texto.length > 3800) telegram_texto = telegram_texto.slice(0, 3700).replace(/\\$/, '') + '\n\\[...]\n\n*A data está certa?*';

return [{
  json: {
    erro: '',
    resumo,
    evento,
    email_texto,
    telegram_texto,
    assunto_email: (alertas.length ? '⚠️ ' : '') + 'Confirme: ' + resumo + ' — ' + inicio.toFormat('dd/MM') + (diaInteiro ? '' : ' ' + inicio.toFormat('HH:mm')),
    alertas,
    dados: d,
  },
}];
