// Decide quais eventos precisam de lembrete AGORA e monta o e-mail de cada um.
// Regras:
// - Um lembrete está "devido" quando já passou do horário dele (início - antecedência).
// - O envio fica marcado no próprio evento (extendedProperties.private.lembrete_<min>),
//   guardando o horário de início a que ele se refere. Se a Naty mudar a data do evento,
//   a marca deixa de valer e os lembretes voltam a disparar para a nova data.
// - Se vários lembretes estiverem devidos ao mesmo tempo (n8n fora do ar, pedido urgente),
//   manda UM e-mail com o tempo real que falta, em vez de vários seguidos.
// - Destinatários: a Naty e os convidados do evento. Convidados só em eventos criados pelo robô,
//   para nunca mandar e-mail aos convidados de compromissos pessoais da agenda.
const cfg = $('Configuração').first().json;
const resp = $input.first().json;
const agora = DateTime.now().setZone(cfg.fuso);

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Prefixos de status: ⏳ e ✅ vêm da versão com confirmação pelo Telegram (eventos antigos)
const limparTitulo = s => String(s || '').replace(/^(⏳ \[A CONFIRMAR\] |✅ |⚠️ VERIFICAR: )/, '');

function faltam(inicio) {
  const total = Math.floor(inicio.diff(agora, 'minutes').minutes);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return d + (d === 1 ? ' dia' : ' dias') + (h ? ' e ' + h + 'h' : '');
  if (h > 0) return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  return m + ' min';
}

const saida = [];
for (const ev of resp.items || []) {
  if (ev.status === 'cancelled' || !ev.start) continue;
  const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
  const doRobo = priv.naty_bot === '1';
  if (cfg.apenas_eventos_do_robo && !doRobo) continue;

  const diaInteiro = !ev.start.dateTime;
  const inicio = diaInteiro
    ? DateTime.fromISO(ev.start.date, { zone: cfg.fuso })
    : DateTime.fromISO(ev.start.dateTime).setZone(cfg.fuso);
  if (!inicio.isValid || inicio <= agora) continue;

  const chaveInicio = inicio.toUTC().toISO();
  const devidos = cfg.antecedencias_min.filter(min =>
    inicio.minus({ minutes: min }) <= agora && priv['lembrete_' + min] !== chaveInicio);
  if (!devidos.length) continue;

  const horas = inicio.diff(agora, 'hours').hours;
  const icone = horas <= 6 ? '🚨' : horas <= 24 ? '⏰' : '📅';
  const titulo = ev.summary || '(sem título)';
  const quando = inicio.setLocale('pt-BR').toFormat("cccc, dd/MM") + (diaInteiro ? '' : ' às ' + inicio.toFormat('HH:mm'));
  const linhas = [
    icone + ' <b>FALTAM ' + esc(faltam(inicio)).toUpperCase() + '</b>',
    '<b>' + esc(limparTitulo(titulo)) + '</b>',
    '📅 ' + esc(quando) + (diaInteiro ? ' — <b>SEM HORÁRIO DEFINIDO</b>' : ''),
  ];
  if (ev.location) linhas.push('📍 ' + esc(ev.location));
  if (titulo.startsWith('⚠️')) linhas.push('', '⚠️ Este evento está marcado para <b>VERIFICAR</b>. A data pode estar errada!');
  if (ev.htmlLink) linhas.push('', '<a href="' + esc(ev.htmlLink) + '">Abrir na agenda</a>');

  const convidados = doRobo
    ? (ev.attendees || []).filter(a => a.email && !a.resource && a.responseStatus !== 'declined').map(a => a.email)
    : [];
  const para = [...new Set([cfg.email_naty, ...convidados].map(e => String(e).trim().toLowerCase()).filter(e => e.includes('@')))];

  const marcas = {};
  for (const min of devidos) marcas['lembrete_' + min] = chaveInicio;

  saida.push({
    json: {
      event_id: ev.id,
      para: para.join(','),
      assunto: icone + ' Faltam ' + faltam(inicio) + ': ' + limparTitulo(titulo) + ' (' + quando + ')',
      html: linhas.join('<br>'),
      extendedProperties: { private: { ...priv, ...marcas } },
    },
  });
}
return saida;
