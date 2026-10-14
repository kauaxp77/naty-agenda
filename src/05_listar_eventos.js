// Resposta do comando "agenda" no WhatsApp: os serviços marcados nos próximos 60 dias.
// Entrada: a resposta da API do Google Agenda (só eventos do robô), ou o erro dela.
const resp = $input.first().json;
const p = $('Normalizar entrada').first().json;
const agora = DateTime.now().setZone(p.fuso);
const LIMITE = 30; // a mensagem do WhatsApp tem limite de 4096 caracteres

const texto = body => ({ type: 'text', text: { preview_url: false, body } });

if (resp.error || !Array.isArray(resp.items)) {
  return [{ json: { mensagem: texto('⚠️ Não consegui ler a agenda agora. Tente de novo em alguns minutos.' +
    (resp.error ? '\n\nErro: ' + JSON.stringify(resp.error).slice(0, 200) : '')) } }];
}
const inicioDe = ev => ev.start.dateTime
  ? DateTime.fromISO(ev.start.dateTime).setZone(p.fuso)
  : DateTime.fromISO(ev.start.date, { zone: p.fuso });
// O Google já devolve em ordem (orderBy=startTime); ordenar de novo custa nada e não depende disso
const eventos = resp.items.filter(ev => ev.status !== 'cancelled' && ev.start).sort((a, b) => inicioDe(a) - inicioDe(b));
if (!eventos.length) {
  return [{ json: { mensagem: texto('📅 Nenhum serviço marcado nos próximos 60 dias.') } }];
}

const linhas = [];
let diaAnterior = '';
let temVerificar = false;
for (const ev of eventos.slice(0, LIMITE)) {
  const diaInteiro = !ev.start.dateTime;
  const inicio = inicioDe(ev);
  const dias = Math.round(inicio.startOf('day').diff(agora.startOf('day'), 'days').days);
  const semana = inicio.setLocale('pt-BR').toFormat('cccc, dd/MM');
  const dia = (dias === 0 ? 'Hoje · ' : dias === 1 ? 'Amanhã · ' : '') + semana.charAt(0).toUpperCase() + semana.slice(1);
  if (dia !== diaAnterior) {
    linhas.push('', '*' + dia + '*');
    diaAnterior = dia;
  }
  const titulo = String(ev.summary || '(sem título)');
  const verificar = titulo.startsWith('⚠️');
  temVerificar = temVerificar || verificar;
  // Prefixos de status: ⏳ e ✅ vêm da versão com confirmação pelo Telegram (eventos antigos)
  const limpo = titulo.replace(/^(⏳ \[A CONFIRMAR\] |✅ |⚠️ VERIFICAR: )/, '');
  linhas.push((verificar ? '⚠️ ' : '• ') + (diaInteiro ? 'dia todo' : inicio.toFormat('HH:mm')) + ' — ' + limpo);
}

let body = '📅 *Próximos serviços* (' + eventos.length + ')\n' + linhas.join('\n') +
  (eventos.length > LIMITE ? '\n\n… e mais ' + (eventos.length - LIMITE) + '. Veja tudo na agenda.' : '') +
  (temVerificar ? '\n\n⚠️ = marcado para VERIFICAR: confira a data no evento.' : '');
if (body.length > 4000) body = body.slice(0, 3950) + '\n[...]';

return [{ json: { mensagem: texto(body) } }];
