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
  return falha('Não encontrei um pedido de serviço com data nesta mensagem. Se for um pedido, agende manualmente ou mande de novo com a data e a hora escritas.', d);
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

// Sem botão de confirmação: o evento nasce verde. Qualquer dúvida real sobre a data
// o deixa vermelho, com "⚠️ VERIFICAR" no título. Avisos só informativos não mudam a cor.
const alertas = [];
let verificar = false;
const duvida = msg => { alertas.push(msg); verificar = true; };

let inicio, fim, diaInteiro = false;
if (hi) {
  inicio = dia.set({ ...hi, second: 0, millisecond: 0 });
  fim = hf ? dia.set({ ...hf, second: 0, millisecond: 0 }) : inicio.plus({ hours: p.duracao_padrao_horas });
  if (fim <= inicio) fim = inicio.plus({ hours: p.duracao_padrao_horas });
} else {
  diaInteiro = true;
  inicio = dia.startOf('day');
  fim = inicio.plus({ days: 1 });
  duvida('HORÁRIO NÃO ENCONTRADO: criei como evento de dia inteiro. Os lembretes contam a partir da meia-noite. Ajuste a hora na agenda.');
}

// ---- 3. Checagens determinísticas (não dependem da IA) ----
const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DIAS = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, dom: 7 };
const citado = DIAS[semAcento(d.dia_da_semana_citado).slice(0, 3)];
const diaSemanaReal = inicio.setLocale('pt-BR').toFormat('cccc');
if (citado && citado !== inicio.weekday) {
  duvida('CONFLITO DE DATA: a mensagem diz "' + d.dia_da_semana_citado + '", mas ' +
    inicio.toFormat('dd/MM/yyyy') + ' cai numa ' + diaSemanaReal + '. Uma das duas informações está errada. CONFIRA COM O CLIENTE.');
}
if (inicio < agora) duvida('A data identificada JÁ PASSOU (' + inicio.toFormat('dd/MM/yyyy HH:mm') + ').');
// 6 meses, não 1 ano: com o ano omitido, uma data que acabou de passar ("05/10" lido em 13/10)
// vira a do ano seguinte, a ~11 meses. Serviço de licitação raramente é marcado com 6 meses de antecedência.
if (inicio > agora.plus({ days: 180 })) duvida('A data está a mais de 6 meses de distância. Confira o ano.');
const horasAte = inicio.diff(agora, 'hours').hours;
if (horasAte >= 0 && horasAte < 48) alertas.push('URGENTE: faltam só ' + Math.floor(horasAte) + 'h.');
// A IA às vezes marca "relativa" só porque o ano não foi escrito ("05/11 às 10:00"). Com dia e mês
// escritos no trecho, a data não é relativa, e o alerta seria ruído que ensina a Naty a ignorar alertas.
const temDiaEMes = /\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}º?\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(semAcento(d.trecho_da_data));
// A IA dá confiança MÉDIA a toda data relativa ("amanhã às 15h"). Digitada na hora, isso não é dúvida:
// a resposta já mostra o dia por extenso. Visto no teste de 14/10/2026: todo "amanhã" ficava vermelho.
const relativaDigitada = d.data_relativa && !temDiaEMes && !p.encaminhada;
if (d.confianca === 'baixa' || (d.confianca === 'media' && !relativaDigitada)) {
  duvida('Confiança da IA: ' + d.confianca.toUpperCase() + '.');
}
if (d.data_relativa && !temDiaEMes) {
  if (p.encaminhada) {
    // O WhatsApp não diz quando o cliente escreveu: "amanhã" de 3 dias atrás vira o amanhã de hoje
    duvida('Mensagem ENCAMINHADA com data relativa: o WhatsApp não informa quando o cliente escreveu, então "' +
      (d.trecho_da_data || 'a data') + '" foi calculado a partir de quando você encaminhou (' + p.referencia_extenso +
      '). Se o cliente escreveu em outro dia, a data está errada.');
  } else {
    alertas.push('A data foi escrita de forma relativa ("amanhã", "sexta que vem"...) e foi calculada a partir de ' + p.referencia_extenso + '.');
  }
}
for (const a of d.ambiguidades || []) duvida(a);

// ---- 4. Evento ----
const resumo = d.resumo || d.tipo_servico || 'Serviço de licitação';
const convidados = [...new Set((p.emails_equipe || []).map(e => String(e).trim().toLowerCase()).filter(e => e.includes('@')))];
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

const evento = {
  summary: (verificar ? '⚠️ VERIFICAR: ' : '') + resumo,
  location: d.local || undefined,
  description: descricao,
  colorId: verificar ? '11' : '10', // vermelho = conferir a data; verde = ok
  extendedProperties: { private: { naty_bot: '1' } }, // marca usada pelo workflow de lembretes
  start: diaInteiro ? { date: inicio.toISODate() } : { dateTime: inicio.toISO({ suppressMilliseconds: true }), timeZone: fuso },
  end: diaInteiro ? { date: fim.toISODate() } : { dateTime: fim.toISO({ suppressMilliseconds: true }), timeZone: fuso },
  // Alarmes no celular de quem é dono da agenda. Os e-mails de lembrete saem do workflow de lembretes.
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 2880 }, // 2 dias
      { method: 'popup', minutes: 1440 }, // 1 dia
      { method: 'popup', minutes: 720 },  // 12 horas
      { method: 'popup', minutes: 360 },  // 6 horas
    ],
  },
};
// Convidados recebem o convite do Google e os lembretes por e-mail
if (convidados.length) evento.attendees = convidados.map(email => ({ email }));

// ---- 5. Resposta para quem mandou o pedido (WhatsApp ou e-mail) ----
const dataExtenso = inicio.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL 'de' yyyy").toUpperCase() +
  (diaInteiro ? ' (SEM HORÁRIO)' : ' às ' + inicio.toFormat('HH:mm'));

// Mesmo conteúdo nos dois formatos: no WhatsApp, *negrito*; no e-mail, HTML com o texto do cliente escapado
function resposta(b, t) {
  return [
    verificar ? '⚠️ ' + b('Agendei, mas CONFIRA a data') : '✅ ' + b('Agendado'),
    b(resumo),
    '',
    '📅 ' + b(dataExtenso),
    t('A mensagem diz: "' + (d.trecho_da_data || '—') + '"'),
    alertas.length ? '\n⚠️ ' + b('ATENÇÃO:') + '\n' + alertas.map(a => '• ' + t(a)).join('\n') : '',
    '',
    t('Serviço: ' + (d.tipo_servico || '—')),
    t('Órgão: ' + (d.orgao || '—')),
    t('Processo: ' + (d.numero_processo || '—')),
    t('Local: ' + (d.local || '—')),
    t('Contato: ' + (d.contato || '—')),
    outras.length ? '\n' + t('Outras datas na mensagem:') + '\n' + outras.map(t).join('\n') : '',
    convidados.length ? '\n' + t('Convite e lembretes por e-mail para: ' + convidados.join(', ')) : '',
    '',
    t(verificar
      ? 'Na agenda o evento ficou VERMELHO, com "VERIFICAR" no título. Confira a data e corrija direto no evento se precisar; os lembretes se ajustam sozinhos.'
      : 'Se algo estiver errado, corrija direto no evento; os lembretes se ajustam sozinhos.'),
  ].join('\n');
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let resposta_whatsapp = resposta(s => '*' + s + '*', s => s);
if (resposta_whatsapp.length > 3800) resposta_whatsapp = resposta_whatsapp.slice(0, 3700) + '\n[...]'; // limite do WhatsApp: 4096
const resposta_html = resposta(s => '<b>' + esc(s) + '</b>', esc).replace(/\n/g, '<br>');

return [{
  json: {
    erro: '',
    resumo,
    verificar,
    evento,
    resposta_whatsapp,
    resposta_html,
    assunto_email: (verificar ? '⚠️ CONFIRA: ' : '✅ Agendado: ') + resumo + ' — ' + inicio.toFormat('dd/MM') + (diaInteiro ? '' : ' ' + inicio.toFormat('HH:mm')),
    alertas,
    dados: d,
  },
}];
