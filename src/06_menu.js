// Resposta dos comandos "menu" (com botões) e "ajuda" no WhatsApp.
// Os botões chegam de volta como mensagem "interactive" com o id (ver 01_normalizar.js).
const p = $('Normalizar entrada').first().json;

if (p.comando === 'ajuda') {
  return [{ json: { mensagem: { type: 'text', text: { preview_url: false, body:
    '➕ *Como agendar*\n\n' +
    'Encaminhe para mim a mensagem do cliente (segure a mensagem → Encaminhar) ou escreva o pedido com a data e a hora. Exemplo:\n\n' +
    '_Sessão do Pregão 45/2026 da Prefeitura de Campinas, dia 20/11 às 9h_\n\n' +
    'Eu coloco na agenda e respondo aqui com o dia por extenso. Para ver o que está marcado, mande *agenda*.',
  } } } }];
}

return [{ json: { mensagem: {
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: 'Olá! Eu coloco os pedidos de serviço na agenda.\n\nEncaminhe a mensagem do cliente ou escreva o pedido com data e hora. Ou escolha:' },
    action: {
      buttons: [ // título: até 20 caracteres
        { type: 'reply', reply: { id: 'ver_agenda', title: '📅 Ver agenda' } },
        { type: 'reply', reply: { id: 'como_agendar', title: '➕ Como agendar' } },
      ],
    },
  },
} } }];
