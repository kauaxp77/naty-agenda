// E-mail para a Naty quando uma resposta do robô pelo WhatsApp NÃO foi entregue.
// A Meta aceita o envio (o nó de envio dá certo) e só depois avisa a falha, num status do webhook.
// Por isso o e-mail de reserva dos nós de envio não pega este caso.
const p = $input.first().json;
const falhas = p.falhas_entrega || [];

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Os códigos que já apareceram ou que são prováveis com um robô que só responde
const DICAS = {
  131031: 'A Meta <b>bloqueou a conta</b> do WhatsApp Business. Nenhuma resposta vai chegar até a conta ser liberada: veja a Central de suporte para empresas da Meta.',
  131047: 'Passaram <b>mais de 24 horas</b> desde a última mensagem dessa pessoa para o robô. Fora dessa janela, a Meta só aceita mensagens pagas com modelo aprovado.',
  131026: 'O número não pôde receber: WhatsApp desatualizado, número sem WhatsApp ou que não aceitou os termos atuais.',
  131030: 'O número não está na lista de destinatários permitidos do <b>número de teste</b> da Meta.',
};
const numero = n => (String(n).startsWith('55') ? '+' : '') + n;

const itens = falhas.map(f => {
  const quando = DateTime.fromISO(f.quando_iso).setZone(p.fuso).setLocale('pt-BR');
  return '<li><b>Para:</b> ' + esc(numero(f.para)) +
    '<br><b>Quando:</b> ' + esc(quando.toFormat("cccc, dd/MM 'às' HH:mm")) +
    '<br><b>Erro ' + esc(f.codigo) + ':</b> ' + esc(f.titulo) + (f.detalhe && f.detalhe !== f.titulo ? ' (' + esc(f.detalhe) + ')' : '') +
    (DICAS[f.codigo] ? '<br>' + DICAS[f.codigo] : '') + '</li>';
});

return [{
  json: {
    assunto: '⚠️ Resposta do WhatsApp NÃO entregue' + (falhas.length > 1 ? ' (' + falhas.length + ')' : ''),
    html:
      '<p><b>O robô respondeu pelo WhatsApp, mas a Meta não entregou a mensagem.</b></p>' +
      '<p>Quem mandou o pedido não recebeu a confirmação. O pedido pode ter entrado na agenda normalmente: ' +
      '<a href="https://calendar.google.com">confira a agenda</a> e avise a pessoa por outro meio, se precisar.</p>' +
      '<ul>' + itens.join('') + '</ul>',
  },
}];
