// ===== CONFIGURAÇÃO: edite aqui =====
const CONFIG = {
  calendario_id: 'primary',                    // o mesmo do workflow de pedidos
  email_naty: 'COLOQUE_O_EMAIL_DA_NATY@gmail.com', // recebe todos os lembretes
  // true  = só eventos criados pelo robô (use se o calendário for o pessoal da Naty)
  // false = todos os eventos do calendário (use com um calendário só de serviços)
  apenas_eventos_do_robo: true,
  antecedencias_min: [2880, 1440], // 2 dias e 1 dia antes. Ex.: [2880, 1440, 360] para também 6h antes
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
