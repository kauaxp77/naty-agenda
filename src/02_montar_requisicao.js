const p = $input.first().json;

const SYSTEM = `Você extrai dados de pedidos de serviço recebidos por uma empresa que atua com licitações públicas (ex.: representar o cliente em sessão de pregão, entregar documentos/envelopes, fazer visita técnica, enviar proposta, protocolar recurso).

Leia a mensagem e preencha o esquema. Regras:
- Nunca invente. Campo sem informação = string vazia.
- "data" no formato AAAA-MM-DD; horas em HH:MM (24h), horário de Brasília.
- Datas no formato brasileiro: 05/11 é 5 de novembro. Nunca leia como mês/dia.
- Datas relativas ("amanhã", "sexta que vem", "daqui a 3 dias") devem ser resolvidas a partir da DATA DE REFERÊNCIA informada, consultando o CALENDÁRIO fornecido. Marque data_relativa=true. Não liste isso em "ambiguidades" (o sistema já avisa); use "ambiguidades" só para dúvida real, como "sexta" sem dizer qual.
- Data com dia e mês escritos (ex.: "05/11", "5 de novembro") NÃO é relativa, mesmo sem o ano: data_relativa=false. Se o ano não estiver escrito, use a próxima ocorrência a partir da data de referência. Ano omitido é normal: sozinho, não reduz a confiança e não vai em "ambiguidades".
- "trecho_da_data": copie LITERALMENTE o trecho da mensagem de onde tirou a data e a hora.
- "dia_da_semana_citado": se a mensagem escrever um dia da semana junto da data principal, copie-o (ex.: "segunda-feira"). Se não escrever, deixe vazio. Não calcule o dia da semana você mesmo.
- Mensagens de licitação costumam ter várias datas (impugnação, abertura de propostas, sessão de disputa, entrega). A data principal é aquela em que a empresa precisa EXECUTAR o serviço pedido. Liste as demais em "outras_datas". Se não for possível saber qual é a principal, diga isso em "ambiguidades" e use confianca "baixa".
- "confianca": "alta" somente se dia, mês e hora estão escritos explicitamente (o ano pode faltar) e não há conflito; "media" se algo foi deduzido; "baixa" se há dúvida real.
- "resumo": título curto para a agenda, ex.: "Sessão Pregão 45/2026 – Pref. de Campinas".
- eh_pedido_de_servico=false se a mensagem não pede nenhum serviço com data (propaganda, conversa, aviso genérico).`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    eh_pedido_de_servico: { type: 'boolean' },
    resumo: { type: 'string' },
    tipo_servico: { type: 'string' },
    orgao: { type: 'string' },
    numero_processo: { type: 'string' },
    local: { type: 'string' },
    contato: { type: 'string' },
    data: { type: 'string' },
    hora_inicio: { type: 'string' },
    hora_fim: { type: 'string' },
    trecho_da_data: { type: 'string' },
    dia_da_semana_citado: { type: 'string' },
    data_relativa: { type: 'boolean' },
    outras_datas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          data: { type: 'string' },
          hora: { type: 'string' },
          descricao: { type: 'string' },
        },
        required: ['data', 'hora', 'descricao'],
      },
    },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    ambiguidades: { type: 'array', items: { type: 'string' } },
    observacoes: { type: 'string' },
  },
  required: [
    'eh_pedido_de_servico', 'resumo', 'tipo_servico', 'orgao', 'numero_processo', 'local',
    'contato', 'data', 'hora_inicio', 'hora_fim', 'trecho_da_data', 'dia_da_semana_citado',
    'data_relativa', 'outras_datas', 'confianca', 'ambiguidades', 'observacoes',
  ],
};

// Calendário pronto: modelos erram conta de dia da semana; assim só precisam consultar
const ref = DateTime.fromISO(p.referencia_iso, { setZone: true });
const calendario = [];
for (let i = 0; i < 60; i++) {
  const dia = ref.plus({ days: i });
  calendario.push(dia.setLocale('pt-BR').toFormat('cccc dd/MM/yyyy') + (i === 0 ? ' (hoje)' : i === 1 ? ' (amanhã)' : ''));
}

const body = {
  model: 'openai/gpt-oss-120b',
  reasoning_effort: 'medium',
  max_completion_tokens: 4000,
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'pedido', strict: true, schema: SCHEMA },
  },
  messages: [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        'DATA DE REFERÊNCIA (envio da mensagem): ' + p.referencia_extenso + ' (' + p.referencia_iso + ')\n' +
        'ORIGEM: ' + p.origem + '\n\n' +
        'CALENDÁRIO (use para resolver datas relativas e dias da semana, não calcule de cabeça):\n' +
        calendario.join('\n') + '\n\n<mensagem>\n' + p.texto + '\n</mensagem>',
    },
  ],
};

return [{ json: { body } }];
