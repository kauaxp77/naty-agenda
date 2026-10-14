// ===== CONFIGURAÇÃO: edite aqui =====
const CONFIG = {
  email_naty: 'COLOQUE_O_EMAIL_DA_NATY@gmail.com',
  // Quem pode mandar pedidos ao robô pelo WhatsApp: DDI + DDD + número, só dígitos (ex.: '5511987654321').
  // Mensagem de qualquer outro número é ignorada sem resposta.
  whatsapp_autorizados: ['COLOQUE_O_NUMERO_DA_NATY'],
  // Recebem o convite do evento e os lembretes por e-mail, além da Naty. Ex.: ['joao@empresa.com']
  emails_equipe: [],
  calendario_id: 'primary',       // ou o ID de um calendário dedicado
  duracao_padrao_horas: 2,        // usada quando o pedido não diz a hora de término
  fuso: 'America/Sao_Paulo',
};
// ====================================

// Celular brasileiro antigo pode chegar do WhatsApp sem o 9 ("551187654321" em vez de "5511987654321").
// Compara as duas formas para a lista de autorizados funcionar nos dois casos.
const formas = n => {
  const d = String(n || '').replace(/\D/g, '');
  const f = new Set([d]);
  if (/^55\d{2}9\d{8}$/.test(d)) f.add(d.slice(0, 4) + d.slice(5));
  if (/^55\d{2}\d{8}$/.test(d)) f.add(d.slice(0, 4) + '9' + d.slice(4));
  return f;
};
const autorizado = numero => {
  const de = formas(numero);
  return CONFIG.whatsapp_autorizados.some(a => [...formas(a)].some(x => de.has(x)));
};

// Comandos do WhatsApp: valem só se a mensagem for SÓ a palavra ("agenda"), para que
// "agenda pra mim a sessão dia 20/11" continue sendo um pedido. Botões do menu chegam pelo id.
const COMANDOS = {
  agenda: ['agenda', 'ver agenda', 'minha agenda', 'eventos', 'proximos', 'proximos eventos', 'compromissos', 'lista'],
  menu: ['menu', 'oi', 'ola', 'opcoes', 'inicio', 'bom dia', 'boa tarde', 'boa noite'],
  ajuda: ['ajuda', 'como agendar', 'help'],
};
const BOTOES = { ver_agenda: 'agenda', como_agendar: 'ajuda' };
const qualComando = t => {
  const n = String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return Object.keys(COMANDOS).find(c => COMANDOS[c].includes(n)) || '';
};

const j = $input.first().json;
let texto = '', origem, referencia, canal, responder_para = '', whatsapp_phone_number_id = '', encaminhada = false, erro = '', comando = '';

if (j.messaging_product === 'whatsapp' || j.messages || j.statuses) {
  // Veio do WhatsApp (nó "WhatsApp Trigger": um item por mensagem recebida)
  const m = (j.messages || [])[0];
  if (!m) return [];                     // aviso de entrega/leitura, não é mensagem
  if (!autorizado(m.from)) return [];    // número fora da lista: ignora
  const nome = ((j.contacts || [])[0] || {}).profile?.name;
  canal = 'whatsapp';
  responder_para = m.from;
  // A resposta sai pelo mesmo número que recebeu a mensagem (o de teste da Meta ou o próprio)
  whatsapp_phone_number_id = (j.metadata && j.metadata.phone_number_id) || '';
  origem = 'WhatsApp' + (nome ? ' (' + nome + ')' : '');
  encaminhada = !!(m.context && (m.context.forwarded || m.context.frequently_forwarded));
  // Mensagem encaminhada não traz a data em que o cliente escreveu: a referência é o encaminhamento
  const enviado = DateTime.fromSeconds(Number(m.timestamp) || 0);
  referencia = (Number(m.timestamp) && enviado.isValid ? enviado : DateTime.now()).setZone(CONFIG.fuso);
  if (m.type === 'text') {
    texto = (m.text && m.text.body) || '';
    comando = qualComando(texto);
  } else if (m.type === 'interactive') {
    // Clique num botão do menu
    const r = (m.interactive && (m.interactive.button_reply || m.interactive.list_reply)) || {};
    comando = BOTOES[r.id] || 'menu';
    texto = r.title || '';
  } else {
    const tipos = { audio: 'um áudio', image: 'uma imagem', document: 'um arquivo', video: 'um vídeo', sticker: 'uma figurinha' };
    erro = 'Recebi ' + (tipos[m.type] || 'uma mensagem que não é texto') +
      ', mas por enquanto só leio mensagens de texto. Mande o pedido escrito (ou encaminhe a mensagem de texto do cliente).';
  }
  if (!erro && !texto.trim()) erro = 'A mensagem chegou vazia.';
} else if (j['Texto do pedido']) {
  // Veio do formulário (texto colado à mão)
  texto = j['Texto do pedido'];
  canal = 'formulario';
  origem = 'Formulário (' + (j['Origem'] || 'colado') + ')';
  referencia = DateTime.now().setZone(CONFIG.fuso);
} else {
  // Veio do Gmail
  const corpo = j.text || j.textPlain || j.snippet || '';
  texto = 'Assunto: ' + (j.subject || '') + '\nDe: ' + ((j.from && j.from.text) || '') + '\n\n' + corpo;
  canal = 'email';
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
    canal,             // whatsapp | email | formulario: define por onde vai a resposta
    responder_para,    // número do WhatsApp de quem mandou o pedido
    whatsapp_phone_number_id, // ID (na Meta) do número do robô que recebeu a mensagem
    encaminhada,
    erro,              // preenchido quando a mensagem não dá para ler (áudio, imagem...)
    comando,           // agenda | menu | ajuda: responde sem passar pela IA. Vazio = pedido
    referencia_iso: referencia.toISO(),
    referencia_extenso: referencia.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL 'de' yyyy, HH:mm"),
  },
}];
