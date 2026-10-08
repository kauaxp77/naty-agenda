// ===== CONFIGURAÇÃO: edite aqui =====
const CONFIG = {
  calendario_id: 'primary',                 // o mesmo do workflow de pedidos
  telegram_chat_id: 'COLOQUE_O_CHAT_ID',    // veja SETUP.md, passo 8
  // true  = só eventos criados pelo robô (use se o calendário for o pessoal da Naty)
  // false = todos os eventos do calendário (use com um calendário só de serviços)
  apenas_eventos_do_robo: true,
  antecedencias_min: [2880, 1440, 720, 360], // 2 dias, 1 dia, 12h, 6h
  fuso: 'America/Sao_Paulo',
};
// ====================================

const agora = DateTime.now();
return [{
  json: {
    ...CONFIG,
    timeMin: agora.toUTC().toISO(),
    timeMax: agora.plus({ minutes: Math.max(...CONFIG.antecedencias_min) + 60 }).toUTC().toISO(),
  },
}];
