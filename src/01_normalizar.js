// ===== CONFIGURAÇÃO: edite aqui =====
const CONFIG = {
  email_naty: 'COLOQUE_O_EMAIL_DA_NATY@gmail.com',
  telegram_chat_id: 'COLOQUE_O_CHAT_ID',  // o mesmo do workflow de lembretes (SETUP.md, passo 6)
  calendario_id: 'primary',       // ou o ID de um calendário dedicado
  duracao_padrao_horas: 2,        // usada quando o pedido não diz a hora de término
  fuso: 'America/Sao_Paulo',
};
// ====================================

const j = $input.first().json;
let texto, origem, referencia;

if (j['Texto do pedido']) {
  // Veio do formulário (texto de WhatsApp colado pela Naty)
  texto = j['Texto do pedido'];
  origem = 'Formulário (' + (j['Origem'] || 'colado') + ')';
  referencia = DateTime.now().setZone(CONFIG.fuso);
} else {
  // Veio do Gmail
  const corpo = j.text || j.textPlain || j.snippet || '';
  texto = 'Assunto: ' + (j.subject || '') + '\nDe: ' + ((j.from && j.from.text) || '') + '\n\n' + corpo;
  origem = 'E-mail';
  // Datas relativas ("amanhã", "próxima terça") contam a partir do ENVIO do e-mail, não de agora
  const enviado = j.date ? DateTime.fromJSDate(new Date(j.date)) : null;
  referencia = (enviado && enviado.isValid ? enviado : DateTime.now()).setZone(CONFIG.fuso);
}

return [{
  json: {
    ...CONFIG,
    texto,
    origem,
    referencia_iso: referencia.toISO(),
    referencia_extenso: referencia.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL 'de' yyyy, HH:mm"),
  },
}];
