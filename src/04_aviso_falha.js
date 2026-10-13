// Monta o aviso "NÃO agendado", venha a falha de onde vier:
// mensagem ilegível (áudio, imagem), IA, ou erro do Google Agenda ao criar o evento.
const j = $input.first().json;
const p = $('Normalizar entrada').first().json;

const motivo = j.erro || ('Erro ao criar o evento no Google Agenda: ' + JSON.stringify(j.error || j).slice(0, 300));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

return [{
  json: {
    motivo,
    texto_whatsapp: '🚨 *NÃO agendei este pedido.*\n\n' + motivo + '\n\nSe for um pedido, coloque na agenda manualmente.',
    assunto_email: '🚨 Pedido NÃO agendado — agende manualmente',
    html_email:
      '<p><b>O robô não conseguiu agendar este pedido.</b> Coloque na agenda manualmente.</p>' +
      '<p>Motivo: ' + esc(motivo) + '</p>' +
      '<p>Origem: ' + esc(p.origem) + '</p><hr>' +
      '<p>' + esc(p.texto.slice(0, 6000)).replace(/\n/g, '<br>') + '</p>',
  },
}];
