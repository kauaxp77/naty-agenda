// Gera workflow-naty-agenda.json a partir dos arquivos em src/.
// Uso: node build.js
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

let n = 0;
const id = () => 'a0000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const NORM = "$('Normalizar entrada').first().json";
const VAL = "$('Validar e montar evento').first().json";
const EVT = "$('Criar evento na agenda').first().json";
const CAL_URL = "https://www.googleapis.com/calendar/v3/calendars/{{ encodeURIComponent(" + NORM + ".calendario_id) }}/events";

const googleHttp = (name, pos, method, url, body, extra = {}) => ({
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: {
    method, url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googleCalendarOAuth2Api',
    sendBody: true, specifyBody: 'json', jsonBody: body, options: {},
  },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
  ...extra,
});
const gmailSend = (name, pos, subject, message) => ({
  id: id(), name, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: pos,
  parameters: {
    sendTo: '={{ ' + NORM + '.email_naty }}',
    subject, emailType: 'html', message,
    options: { appendAttribution: false },
  },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
});
const ifNode = (name, pos, left, operator) => ({
  id: id(), name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id(), leftValue: left, rightValue: '', operator }],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
});
const code = (name, pos, file) => ({
  id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
  parameters: { jsCode: src(file) },
});

const telegramMsg = (name, pos, chatId, text) => ({
  id: id(), name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos,
  parameters: {
    chatId, text,
    additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
  },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
});
const ESPERA_24H = { limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: 24, resumeUnit: 'hours' } }, appendAttribution: false };

const nodes = [
  {
    id: id(), name: 'Gmail: novo pedido', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2, position: [0, 0],
    parameters: {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      simple: false,
      filters: { q: 'label:pedidos-licitacao' },
      options: {},
    },
  },
  {
    id: id(), name: 'Formulário: colar pedido', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: [0, 220],
    webhookId: 'b1a7e0c2-5d1f-4c8e-9a3b-7f2d6e4c1a90',
    parameters: {
      formTitle: 'Novo pedido de serviço',
      formDescription: 'Cole aqui o texto do pedido que chegou por WhatsApp, telefone etc. O robô vai agendar e pedir sua confirmação por e-mail.',
      formFields: {
        values: [
          { fieldLabel: 'Texto do pedido', fieldType: 'textarea', requiredField: true },
          {
            fieldLabel: 'Origem', fieldType: 'dropdown',
            fieldOptions: { values: [{ option: 'WhatsApp' }, { option: 'Telefone' }, { option: 'Outro' }] },
          },
        ],
      },
      options: {},
    },
  },
  code('Normalizar entrada', [240, 100], '01_normalizar.js'),
  code('Montar pedido para a IA', [460, 100], '02_montar_requisicao.js'),
  {
    id: id(), name: 'Groq: extrair dados', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [680, 100],
    parameters: {
      method: 'POST',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth', // Header Auth: Authorization = "Bearer gsk_..."
      sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: { timeout: 120000 },
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 30000, // espera passar o limite por minuto do plano grátis
    onError: 'continueRegularOutput',
  },
  code('Validar e montar evento', [900, 100], '03_validar.js'),
  ifNode('Extraiu certo?', [1120, 100], '={{ $json.erro }}', { type: 'string', operation: 'empty', singleValue: true }),
  googleHttp('Criar evento na agenda', [1340, 0], 'POST', '=' + CAL_URL,
    '={{ JSON.stringify($json.evento) }}', { onError: 'continueErrorOutput' }),
  {
    id: id(), name: 'Confirmar pelo Telegram', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1560, -20],
    webhookId: 'd3c9a2e4-7f3b-4e0a-9c5d-9b4f8a6e3c12',
    parameters: {
      operation: 'sendAndWait',
      chatId: '={{ ' + NORM + '.telegram_chat_id }}',
      // Markdown antigo, montado e escapado em src/03_validar.js
      message: '={{ ' + VAL + '.telegram_texto }}',
      approvalOptions: {
        values: { approvalType: 'double', approveLabel: '✅ Está certo', disapproveLabel: '❌ Está errado' },
      },
      // Botões funcionam dentro do chat (exige n8n com HTTPS público; senão o n8n usa botões com link)
      chatApproval: true,
      approverIds: '={{ ' + NORM + '.telegram_chat_id }}',
      unauthorizedReplyText: 'Só a Naty pode confirmar este pedido.',
      postDecisionBehavior: 'showOutcome',
      options: ESPERA_24H,
    },
    // Se o Telegram falhar, a confirmação vai por e-mail
    onError: 'continueErrorOutput',
  },
  {
    id: id(), name: 'Confirmar por e-mail (reserva)', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [1560, 160],
    webhookId: 'c2b8f1d3-6e2a-4d9f-8b4c-8a3e7f5d2b01',
    parameters: {
      operation: 'sendAndWait',
      sendTo: '={{ ' + NORM + '.email_naty }}',
      subject: '={{ ' + VAL + '.assunto_email }}',
      // texto puro: este nó escapa HTML (verificado no código do n8n 2.35)
      message: '={{ ' + VAL + '.email_texto }}\n\nAbrir o evento na agenda: {{ ' + EVT + '.htmlLink }}',
      approvalOptions: {
        values: { approvalType: 'double', approveLabel: '✅ Confirmar', disapproveLabel: '❌ Está errado' },
      },
      options: ESPERA_24H,
    },
  },
  // Sem clique em 24h o nó retoma sem "data.approved" → cai em "verificar"
  ifNode('Confirmou?', [1780, -20], '={{ $json.data?.approved === true }}', { type: 'boolean', operation: 'true', singleValue: true }),
  googleHttp('Marcar como confirmado', [2000, -120], 'PATCH', '=' + CAL_URL + '/{{ ' + EVT + '.id }}',
    "={{ JSON.stringify({ summary: '✅ ' + " + VAL + ".resumo, colorId: '10' }) }}"),
  googleHttp('Marcar para verificar', [2000, 80], 'PATCH', '=' + CAL_URL + '/{{ ' + EVT + '.id }}',
    "={{ JSON.stringify({ summary: '⚠️ VERIFICAR: ' + " + VAL + ".resumo, colorId: '11' }) }}"),
  telegramMsg('Avisar: corrigir na agenda', [2220, 80], '={{ ' + NORM + '.telegram_chat_id }}',
    "=⚠️ <b>Corrija na agenda:</b> {{ " + VAL + ".resumo.replace(/&/g, '&amp;').replace(/</g, '&lt;') }}\n\n" +
    'O evento ficou marcado como <b>VERIFICAR</b> (você tocou em "Está errado" ou não respondeu em 24h).\n' +
    'Os lembretes <b>continuam ativos</b>. Corrija a data/hora direto no evento; os lembretes se ajustam sozinhos.\n\n' +
    '<a href="{{ ' + EVT + '.htmlLink }}">Abrir o evento</a>'),
  gmailSend('Avisar: NÃO agendado', [1340, 260],
    '=🚨 Pedido NÃO agendado — agende manualmente',
    "=<p><b>O robô não conseguiu agendar este pedido.</b> Coloque na agenda manualmente.</p>" +
    "<p>Motivo: {{ $json.erro || ('erro ao criar o evento no Google Agenda: ' + JSON.stringify($json.error || $json).slice(0, 500)) }}</p>" +
    "<p>Origem: {{ " + NORM + ".origem }}</p><hr>" +
    "<p>{{ " + NORM + ".texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\\n/g, '<br>') }}</p>"),
  // Falha crítica: avisa nos dois canais
  telegramMsg('Avisar no Telegram: NÃO agendado', [1340, 420], '={{ ' + NORM + '.telegram_chat_id }}',
    "=🚨 <b>Pedido NÃO agendado. Agende manualmente!</b>\n\n" +
    "Motivo: {{ ($json.erro || ('erro ao criar o evento no Google Agenda: ' + JSON.stringify($json.error || $json).slice(0, 300))).replace(/&/g, '&amp;').replace(/</g, '&lt;') }}\n" +
    "Origem: {{ " + NORM + ".origem }}\n\n" +
    "<i>{{ " + NORM + ".texto.slice(0, 3000).replace(/&/g, '&amp;').replace(/</g, '&lt;') }}</i>"),
];

const link = (to, idx = 0) => ({ node: to, type: 'main', index: idx });
const connections = {
  'Gmail: novo pedido': { main: [[link('Normalizar entrada')]] },
  'Formulário: colar pedido': { main: [[link('Normalizar entrada')]] },
  'Normalizar entrada': { main: [[link('Montar pedido para a IA')]] },
  'Montar pedido para a IA': { main: [[link('Groq: extrair dados')]] },
  'Groq: extrair dados': { main: [[link('Validar e montar evento')]] },
  'Validar e montar evento': { main: [[link('Extraiu certo?')]] },
  'Extraiu certo?': { main: [[link('Criar evento na agenda')], [link('Avisar: NÃO agendado'), link('Avisar no Telegram: NÃO agendado')]] },
  'Criar evento na agenda': { main: [[link('Confirmar pelo Telegram')], [link('Avisar: NÃO agendado'), link('Avisar no Telegram: NÃO agendado')]] },
  'Confirmar pelo Telegram': { main: [[link('Confirmou?')], [link('Confirmar por e-mail (reserva)')]] },
  'Confirmar por e-mail (reserva)': { main: [[link('Confirmou?')]] },
  'Confirmou?': { main: [[link('Marcar como confirmado')], [link('Marcar para verificar')]] },
  'Marcar para verificar': { main: [[link('Avisar: corrigir na agenda')]] },
};

function salvar(arquivo, name, nodes, connections) {
  // Sanidade: toda conexão aponta para um nó que existe
  const nomes = new Set(nodes.map(x => x.name));
  for (const [de, c] of Object.entries(connections)) {
    if (!nomes.has(de)) throw new Error('nó inexistente: ' + de);
    c.main.flat().forEach(l => { if (!nomes.has(l.node)) throw new Error('nó inexistente: ' + l.node); });
  }
  const wf = {
    name, nodes, connections,
    settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveManualExecutions: true },
    pinData: {},
  };
  fs.writeFileSync(path.join(__dirname, arquivo), JSON.stringify(wf, null, 2));
  console.log('OK:', arquivo, 'com', nodes.length, 'nós');
}

salvar('workflow-naty-agenda.json', 'Naty – Pedidos → Agenda (MVP)', nodes, connections);

// ===================== Workflow 2: lembretes no Telegram =====================
const CFG = "$('Configuração').first().json";
const telegram = (name, pos, text, extra = {}) => ({
  id: id(), name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos,
  webhookId: undefined,
  parameters: {
    chatId: '={{ ' + CFG + '.telegram_chat_id }}',
    text,
    additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
  },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
  ...extra,
});

const nodesL = [
  {
    id: id(), name: 'A cada 10 minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } },
  },
  code('Configuração', [220, 0], '10_lembretes_config.js'),
  {
    id: id(), name: 'Ler agenda (próximas 49h)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0],
    parameters: {
      method: 'GET',
      url: "=https://www.googleapis.com/calendar/v3/calendars/{{ encodeURIComponent($json.calendario_id) }}/events",
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleCalendarOAuth2Api',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'timeMin', value: '={{ $json.timeMin }}' },
          { name: 'timeMax', value: '={{ $json.timeMax }}' },
          { name: 'singleEvents', value: 'true' },
          { name: 'orderBy', value: 'startTime' },
          { name: 'maxResults', value: '250' },
        ],
      },
      options: {},
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
    onError: 'continueErrorOutput',
  },
  code('Calcular lembretes devidos', [660, -80], '11_calcular_lembretes.js'),
  telegram('Enviar lembrete', [880, -80], '={{ $json.texto }}', { onError: 'continueErrorOutput' }),
  {
    ...googleHttp('Marcar lembrete como enviado', [1100, -100], 'PATCH',
      "=https://www.googleapis.com/calendar/v3/calendars/{{ encodeURIComponent(" + CFG + ".calendario_id) }}/events/{{ $('Calcular lembretes devidos').item.json.event_id }}",
      "={{ JSON.stringify({ extendedProperties: $('Calcular lembretes devidos').item.json.extendedProperties }) }}"),
  },
  // Falha ao ler a agenda: avisa no Telegram, no máximo 1x por hora (não 6x)
  ifNode('Avisar falha nesta rodada?', [660, 120], '={{ $now.minute < 10 }}', { type: 'boolean', operation: 'true', singleValue: true }),
  telegram('Avisar: lembretes PARADOS', [880, 100],
    "=🚨 <b>Os lembretes estão PARADOS.</b>\nO robô não conseguiu ler a Agenda Google. Confira a agenda manualmente e avise quem cuida do n8n.\n\nErro: {{ JSON.stringify($json.error || $json).slice(0, 300).replace(/</g, '&lt;') }}"),
];
nodesL.forEach(nd => { if (nd.webhookId === undefined) delete nd.webhookId; });

const connectionsL = {
  'A cada 10 minutos': { main: [[link('Configuração')]] },
  'Configuração': { main: [[link('Ler agenda (próximas 49h)')]] },
  'Ler agenda (próximas 49h)': { main: [[link('Calcular lembretes devidos')], [link('Avisar falha nesta rodada?')]] },
  'Calcular lembretes devidos': { main: [[link('Enviar lembrete')]] },
  // Só marca como enviado se o Telegram aceitou; se falhar, tenta de novo na próxima rodada
  'Enviar lembrete': { main: [[link('Marcar lembrete como enviado')], []] },
  'Avisar falha nesta rodada?': { main: [[link('Avisar: lembretes PARADOS')], []] },
};

salvar('workflow-naty-lembretes-telegram.json', 'Naty – Lembretes no Telegram', nodesL, connectionsL);
