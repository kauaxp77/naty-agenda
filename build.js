// Gera os JSONs dos dois workflows a partir dos arquivos em src/.
// Uso: node build.js
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

let n = 0;
const id = () => 'a0000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const NORM = "$('Normalizar entrada').first().json";
const VAL = "$('Validar e montar evento').first().json";
const EVT = "$('Criar evento na agenda').first().json";
const FALHA = "$('Montar aviso de falha').first().json";
const CAL_URL = "https://www.googleapis.com/calendar/v3/calendars/{{ encodeURIComponent(" + NORM + ".calendario_id) }}/events";
// Versão da API do WhatsApp (Meta). Cada versão vale ~2 anos; ao vencer, a Meta usa a mais antiga disponível.
const GRAPH = 'https://graph.facebook.com/v23.0';

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
const gmail = (name, pos, sendTo, subject, message, extra = {}) => ({
  id: id(), name, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: pos,
  parameters: {
    sendTo, subject, emailType: 'html', message,
    options: { appendAttribution: false },
  },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
  ...extra,
});
// Resposta no WhatsApp para quem mandou o pedido. Grátis: é resposta dentro de 24h da mensagem recebida.
const whatsapp = (name, pos, texto) => ({
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: {
    method: 'POST',
    url: '=' + GRAPH + '/{{ ' + NORM + '.whatsapp_phone_number_id }}/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'whatsAppApi', // credencial "WhatsApp API": token + ID da conta do WhatsApp Business
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: " + NORM +
      ".responder_para, type: 'text', text: { preview_url: false, body: " + texto + ' } }) }}',
    options: {},
  },
  retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
  // Se o WhatsApp recusar (token vencido, número fora da lista de teste...), o aviso vai por e-mail
  onError: 'continueErrorOutput',
});
// Resposta a um comando ("agenda", "menu"): a mensagem já vem pronta em $json.mensagem (texto ou botões).
// Sem onError: se falhar, a execução fica com erro no n8n. Não há pedido em jogo, então não vai para o e-mail.
const whatsappMensagem = (name, pos) => ({
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: {
    method: 'POST',
    url: '=' + GRAPH + '/{{ ' + NORM + '.whatsapp_phone_number_id }}/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'whatsAppApi',
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: " + NORM +
      '.responder_para, ...$json.mensagem }) }}',
    options: {},
  },
  retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
});
// Linha extra no e-mail quando ele substitui uma resposta do WhatsApp que falhou.
// Os nós de e-mail não têm onError: se o e-mail também falhar, a execução fica marcada com erro
// no n8n (aparece em Executions), em vez de passar como sucesso sem ninguém ter sido avisado.
const NOTA_WHATSAPP_FALHOU = "{{ $json.error ? '<p><i>Este aviso foi por e-mail porque a resposta pelo WhatsApp falhou: ' + " +
  "JSON.stringify($json.error).slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</i></p>' : '' }}";
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
const VAZIO = { type: 'string', operation: 'empty', singleValue: true };
const VERDADEIRO = { type: 'boolean', operation: 'true', singleValue: true };
const code = (name, pos, file) => ({
  id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
  parameters: { jsCode: src(file) },
});

// ===================== Workflow 1: pedidos → agenda =====================
const nodes = [
  {
    id: id(), name: 'WhatsApp: novo pedido', type: 'n8n-nodes-base.whatsAppTrigger', typeVersion: 1, position: [0, -220],
    webhookId: 'e4d1b3f5-8a2c-4f6e-b7d9-0c1e2f3a4b5c',
    // Credencial "WhatsApp OAuth API": ID do app + chave secreta do app (Meta). Ao ativar o workflow,
    // o n8n registra este endereço no app da Meta. Só funciona com o workflow ATIVO.
    // messageStatusUpdates vazio: avisos de "entregue"/"lido" não disparam execuções.
    parameters: { updates: ['messages'], options: { messageStatusUpdates: [] } },
  },
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
      formDescription: 'Cole aqui o texto de um pedido. O robô agenda e avisa por e-mail. (O caminho normal é encaminhar o pedido ao WhatsApp do robô.)',
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
  code('Normalizar entrada', [240, 0], '01_normalizar.js'),
  // Comandos do WhatsApp ("agenda", "menu", "ajuda"): respondem sem passar pela IA
  ifNode('É comando?', [460, 0], '={{ $json.comando }}', { type: 'string', operation: 'notEmpty', singleValue: true }),
  ifNode('Pediu a agenda?', [680, -460], "={{ $json.comando === 'agenda' }}", VERDADEIRO),
  {
    id: id(), name: 'Ler próximos eventos', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [900, -560],
    parameters: {
      method: 'GET',
      url: '=' + CAL_URL,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleCalendarOAuth2Api',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'timeMin', value: '={{ $now.toUTC().toISO() }}' },
          { name: 'timeMax', value: '={{ $now.plus({ days: 60 }).toUTC().toISO() }}' },
          { name: 'singleEvents', value: 'true' },
          { name: 'orderBy', value: 'startTime' },
          { name: 'maxResults', value: '100' },
          { name: 'privateExtendedProperty', value: 'naty_bot=1' }, // só os eventos criados pelo robô
        ],
      },
      options: {},
    },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    onError: 'continueRegularOutput', // o erro segue adiante e vira "não consegui ler a agenda"
  },
  code('Montar lista de eventos', [1120, -560], '05_listar_eventos.js'),
  code('Montar menu', [900, -360], '06_menu.js'),
  whatsappMensagem('WhatsApp: responder comando', [1340, -460]),
  ifNode('Dá para ler?', [680, 0], '={{ $json.erro }}', VAZIO),
  code('Montar pedido para a IA', [680, -100], '02_montar_requisicao.js'),
  {
    id: id(), name: 'Groq: extrair dados', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [900, -100],
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
  code('Validar e montar evento', [1120, -100], '03_validar.js'),
  ifNode('Extraiu certo?', [1340, -100], '={{ $json.erro }}', VAZIO),
  // sendUpdates=all: os convidados (emails_equipe) recebem o convite do Google
  googleHttp('Criar evento na agenda', [1560, -200], 'POST', '=' + CAL_URL + '?sendUpdates=all',
    '={{ JSON.stringify($json.evento) }}', { onError: 'continueErrorOutput' }),
  ifNode('Responder pelo WhatsApp?', [1780, -200], '={{ ' + NORM + ".canal === 'whatsapp' }}", VERDADEIRO),
  whatsapp('WhatsApp: agendado', [2000, -300],
    VAL + ".resposta_whatsapp + '\\n\\nAbrir na agenda: ' + " + EVT + '.htmlLink'),
  gmail('E-mail: agendado', [2220, -160], '={{ ' + NORM + '.email_naty }}', '={{ ' + VAL + '.assunto_email }}',
    '={{ ' + VAL + ".resposta_html }}<br><br><a href=\"{{ " + EVT + '.htmlLink }}">Abrir na agenda</a>' + NOTA_WHATSAPP_FALHOU),
  code('Montar aviso de falha', [1560, 160], '04_aviso_falha.js'),
  ifNode('Avisar pelo WhatsApp?', [1780, 160], '={{ ' + NORM + ".canal === 'whatsapp' }}", VERDADEIRO),
  whatsapp('WhatsApp: NÃO agendado', [2000, 60], FALHA + '.texto_whatsapp'),
  gmail('E-mail: NÃO agendado', [2220, 200], '={{ ' + NORM + '.email_naty }}', '={{ ' + FALHA + '.assunto_email }}',
    '={{ ' + FALHA + '.html_email }}' + NOTA_WHATSAPP_FALHOU),
];

const link = (to, idx = 0) => ({ node: to, type: 'main', index: idx });
const connections = {
  'WhatsApp: novo pedido': { main: [[link('Normalizar entrada')]] },
  'Gmail: novo pedido': { main: [[link('Normalizar entrada')]] },
  'Formulário: colar pedido': { main: [[link('Normalizar entrada')]] },
  'Normalizar entrada': { main: [[link('É comando?')]] },
  'É comando?': { main: [[link('Pediu a agenda?')], [link('Dá para ler?')]] },
  'Pediu a agenda?': { main: [[link('Ler próximos eventos')], [link('Montar menu')]] },
  'Ler próximos eventos': { main: [[link('Montar lista de eventos')]] },
  'Montar lista de eventos': { main: [[link('WhatsApp: responder comando')]] },
  'Montar menu': { main: [[link('WhatsApp: responder comando')]] },
  'Dá para ler?': { main: [[link('Montar pedido para a IA')], [link('Montar aviso de falha')]] },
  'Montar pedido para a IA': { main: [[link('Groq: extrair dados')]] },
  'Groq: extrair dados': { main: [[link('Validar e montar evento')]] },
  'Validar e montar evento': { main: [[link('Extraiu certo?')]] },
  'Extraiu certo?': { main: [[link('Criar evento na agenda')], [link('Montar aviso de falha')]] },
  'Criar evento na agenda': { main: [[link('Responder pelo WhatsApp?')], [link('Montar aviso de falha')]] },
  'Responder pelo WhatsApp?': { main: [[link('WhatsApp: agendado')], [link('E-mail: agendado')]] },
  'WhatsApp: agendado': { main: [[], [link('E-mail: agendado')]] },
  'Montar aviso de falha': { main: [[link('Avisar pelo WhatsApp?')]] },
  'Avisar pelo WhatsApp?': { main: [[link('WhatsApp: NÃO agendado')], [link('E-mail: NÃO agendado')]] },
  'WhatsApp: NÃO agendado': { main: [[], [link('E-mail: NÃO agendado')]] },
};

function salvar(arquivo, name, nodes, connections) {
  // Sanidade: toda conexão aponta para um nó que existe; nenhum resto do Telegram
  const nomes = new Set(nodes.map(x => x.name));
  for (const [de, c] of Object.entries(connections)) {
    if (!nomes.has(de)) throw new Error('nó inexistente: ' + de);
    c.main.flat().forEach(l => { if (!nomes.has(l.node)) throw new Error('nó inexistente: ' + l.node); });
  }
  if (nodes.some(x => /telegram/i.test(x.type))) throw new Error('sobrou nó do Telegram em ' + arquivo);
  // Resposta pelo WhatsApp que falha precisa cair no e-mail, senão ninguém fica sabendo do pedido
  for (const x of nodes.filter(x => ['WhatsApp: agendado', 'WhatsApp: NÃO agendado'].includes(x.name))) {
    const erro = ((connections[x.name] || {}).main || [])[1] || [];
    if (x.onError !== 'continueErrorOutput' || !erro.some(l => l.node.startsWith('E-mail:'))) {
      throw new Error('"' + x.name + '" precisa mandar a falha para um nó de e-mail');
    }
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

// ===================== Workflow 2: lembretes por e-mail =====================
const CFG = "$('Configuração').first().json";

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
  gmail('Enviar lembrete por e-mail', [880, -80], '={{ $json.para }}', '={{ $json.assunto }}', '={{ $json.html }}',
    { onError: 'continueErrorOutput' }),
  googleHttp('Marcar lembrete como enviado', [1100, -100], 'PATCH',
    "=https://www.googleapis.com/calendar/v3/calendars/{{ encodeURIComponent(" + CFG + ".calendario_id) }}/events/{{ $('Calcular lembretes devidos').item.json.event_id }}",
    "={{ JSON.stringify({ extendedProperties: $('Calcular lembretes devidos').item.json.extendedProperties }) }}"),
  // Falha ao ler a agenda: avisa por e-mail, no máximo 1x por hora (não 6x).
  // Limite conhecido: se o problema for o acesso ao Google (Gmail e Agenda usam o mesmo), este e-mail também falha.
  ifNode('Avisar falha nesta rodada?', [660, 120], '={{ $now.minute < 10 }}', VERDADEIRO),
  gmail('Avisar: lembretes PARADOS', [880, 100], '={{ ' + CFG + '.email_naty }}', '=🚨 Os lembretes da agenda estão PARADOS',
    "=<p><b>O robô não conseguiu ler a Agenda Google.</b> Confira a agenda manualmente e avise quem cuida do n8n.</p>" +
    "<p>Erro: {{ JSON.stringify($json.error || $json).slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;') }}</p>"),
];

const connectionsL = {
  'A cada 10 minutos': { main: [[link('Configuração')]] },
  'Configuração': { main: [[link('Ler agenda (próximas 49h)')]] },
  'Ler agenda (próximas 49h)': { main: [[link('Calcular lembretes devidos')], [link('Avisar falha nesta rodada?')]] },
  'Calcular lembretes devidos': { main: [[link('Enviar lembrete por e-mail')]] },
  // Só marca como enviado se o e-mail saiu; se falhar, tenta de novo na próxima rodada
  'Enviar lembrete por e-mail': { main: [[link('Marcar lembrete como enviado')], []] },
  'Avisar falha nesta rodada?': { main: [[link('Avisar: lembretes PARADOS')], []] },
};

salvar('workflow-naty-lembretes.json', 'Naty – Lembretes por e-mail', nodesL, connectionsL);
