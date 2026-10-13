# Arquitetura

Como o sistema funciona por dentro: cada nó dos dois workflows, os estados de um evento na agenda e o algoritmo dos lembretes.

- [Visão geral](#visão-geral)
- [Workflow 1: Pedidos → Agenda](#workflow-1-pedidos--agenda)
- [Workflow 2: Lembretes por e-mail](#workflow-2-lembretes-por-e-mail)
- [Estados de um evento](#estados-de-um-evento)
- [Dados gravados no evento](#dados-gravados-no-evento)
- [Configuração (blocos CONFIG)](#configuração-blocos-config)
- [Tratamento de falhas](#tratamento-de-falhas)
- [Serviços externos e endpoints](#serviços-externos-e-endpoints)

---

## Visão geral

```
               ┌───────────────── n8n (Render) ──────────────────┐
 WhatsApp ────►│ Workflow 1: Pedidos → Agenda                    │──► Google Agenda ◄──────┐
 Gmail ───────►│   Groq (IA) + validação em código               │──► WhatsApp (resposta)  │
 Formulário ──►│                                                 │──► Gmail (Naty)         │
               │ Workflow 2: Lembretes (a cada 10 min)           │─── lê/marca eventos ────┘
               │                                                 │──► Gmail (Naty + equipe)
               └────────────────────────┬────────────────────────┘
                                        │ workflows, credenciais, execuções
                                        ▼
                              Supabase Postgres (schema n8n)
```

Os dois workflows **não se chamam**. A ligação entre eles é a própria Agenda Google: o workflow 1 escreve eventos marcados com `naty_bot = 1`, e o workflow 2 lê esses eventos.

O robô **não lê as conversas do WhatsApp**. Ele só recebe o que é mandado ao número dele: a Naty (ou outro número autorizado) encaminha o pedido do cliente para o robô.

---

## Workflow 1: Pedidos → Agenda

Arquivo: `workflow-naty-agenda.json` (gerado por `build.js`). 17 nós.

| # | Nó | Tipo | O que faz |
|---|---|---|---|
| 1a | **WhatsApp: novo pedido** | WhatsApp Trigger | Recebe as mensagens mandadas ao número do robô (WhatsApp Cloud API, oficial da Meta). Credencial "WhatsApp OAuth API" (ID do app + chave secreta do app). Ao **ativar** o workflow, o n8n registra o webhook no app da Meta: com o workflow inativo, nada chega. O n8n confere a assinatura `x-hub-signature-256` de cada chamada com a chave secreta. Só um WhatsApp Trigger por app da Meta. Avisos de entregue/lido são filtrados (`messageStatusUpdates` vazio). |
| 1b | **Gmail: novo pedido** | Gmail Trigger | Verifica a cada minuto e-mails que batem com `label:pedidos-licitacao`. Lê o e-mail completo (`simple: false`). |
| 1c | **Formulário: colar pedido** | Form Trigger | Formulário com "Texto do pedido" e "Origem" (WhatsApp/Telefone/Outro). Reserva e testes. |
| 2 | **Normalizar entrada** | Code (`src/01_normalizar.js`) | Unifica as três entradas em `{texto, origem, canal, responder_para, encaminhada, erro, referencia_iso, referencia_extenso}` e injeta o `CONFIG`. Detalhes abaixo. |
| 3 | **Dá para ler?** | IF | `erro` vazio → segue; senão (áudio, imagem…) → "Montar aviso de falha". |
| 4 | **Montar pedido para a IA** | Code (`src/02_montar_requisicao.js`) | Monta a requisição para o Groq: prompt de sistema, esquema JSON (`strict`) e um **calendário dos próximos 60 dias** com o dia da semana de cada data. |
| 5 | **Groq: extrair dados** | HTTP Request | `POST https://api.groq.com/openai/v1/chat/completions`. 3 tentativas com 30s de intervalo (cobre o limite por minuto do plano grátis). Em erro, **continua** com o erro no JSON, para o nó 6 tratar. |
| 6 | **Validar e montar evento** | Code (`src/03_validar.js`) | Lê a resposta, faz as **checagens determinísticas** de data, decide se o evento é `VERIFICAR`, monta o evento do Google Agenda (com os convidados) e a resposta em dois formatos: WhatsApp e e-mail (HTML). Em qualquer problema, devolve `{erro}`. |
| 7 | **Extraiu certo?** | IF | `erro` vazio → cria o evento; senão → "Montar aviso de falha". |
| 8 | **Criar evento na agenda** | HTTP Request (Google Calendar API) | `POST /calendars/{id}/events?sendUpdates=all`: o Google manda o convite por e-mail aos convidados. 3 tentativas. Se falhar → "Montar aviso de falha". |
| 9 | **Responder pelo WhatsApp?** | IF | `canal === 'whatsapp'` → nó 10; senão (e-mail ou formulário) → nó 11. |
| 10 | **WhatsApp: agendado** | HTTP Request (Graph API da Meta) | `POST https://graph.facebook.com/v23.0/{whatsapp_phone_number_id}/messages`, credencial "WhatsApp API". Manda a resposta + link do evento para `responder_para`, na mesma conversa. 2 tentativas. Se falhar → nó 11. |
| 11 | **E-mail: agendado** | Gmail | Para `email_naty`. Assunto `✅ Agendado: …` ou `⚠️ CONFIRA: …`, resposta em HTML + link do evento. Quando substitui o WhatsApp que falhou, traz uma nota com o erro. Se este e-mail falhar, a execução fica com erro em *Executions* (o evento já existe). |
| F1 | **Montar aviso de falha** | Code (`src/04_aviso_falha.js`) | Recebe as três saídas de falha (nós 3, 7 e 8) e monta o aviso "NÃO agendado": motivo, origem e texto original do pedido, em versão WhatsApp e e-mail. |
| F2 | **Avisar pelo WhatsApp?** | IF | Mesma regra do nó 9. |
| F3 | **WhatsApp: NÃO agendado** | HTTP Request (Graph API da Meta) | 🚨 "NÃO agendei este pedido." + motivo, na mesma conversa. Se falhar → F4. |
| F4 | **E-mail: NÃO agendado** | Gmail | 🚨 "Pedido NÃO agendado — agende manualmente", para `email_naty`, com o motivo e o texto original. Quando substitui o WhatsApp que falhou, traz a nota com o erro. Se este e-mail falhar, a execução fica com erro em *Executions*. |

O `build.js` recusa gerar o workflow se algum nó de resposta pelo WhatsApp não tiver a saída de erro ligada a um nó de e-mail.

### Entrada pelo WhatsApp (`src/01_normalizar.js`)

| Situação | O que acontece |
|---|---|
| Número fora de `whatsapp_autorizados` | Devolve nada: a execução para em silêncio, sem resposta. |
| Aviso de entrega/leitura (`statuses`) | Devolve nada. |
| Celular antigo que chega sem o 9 (`551187654321`) | Aceito: as duas formas do número são comparadas. |
| Áudio, imagem, documento, vídeo, figurinha | `erro` = "Recebi um áudio, mas por enquanto só leio mensagens de texto…" → aviso "NÃO agendado". |
| Mensagem encaminhada (`context.forwarded`) | `encaminhada = true`. |
| Texto | Segue para a IA. |

A **data de referência** (base para "amanhã", "sexta que vem") é:

- WhatsApp: a hora da mensagem recebida pelo robô. Uma mensagem **encaminhada não traz a hora em que o cliente escreveu**, só a do encaminhamento. Por isso, encaminhada com data relativa vira `VERIFICAR` (ver checagens).
- E-mail: a data de **envio do e-mail** (não "agora").
- Formulário: o momento em que foi enviado.

### A requisição para a IA

- **Modelo:** `openai/gpt-oss-120b` no Groq, `reasoning_effort: medium`, até 4.000 tokens de saída.
- **Saída:** `response_format: json_schema` com `strict: true`, o que garante JSON válido no formato do esquema.
- **Mensagem do usuário:** data de referência, origem, calendário de 60 dias e o texto do pedido dentro de `<mensagem>…</mensagem>`.
- **Regras principais do prompt:**
  - nunca inventar;
  - formato brasileiro (05/11 = 5 de novembro);
  - datas relativas resolvidas **consultando o calendário**;
  - data com dia e mês escritos não é relativa, mesmo sem o ano; ano omitido é normal e não reduz a confiança;
  - copiar literalmente o trecho da data (`trecho_da_data`);
  - copiar o dia da semana citado, **sem calculá-lo**;
  - a data principal é a da execução do serviço; as outras vão para `outras_datas`.

Campos do esquema:

| Campo | Tipo | Uso |
|---|---|---|
| `eh_pedido_de_servico` | boolean | `false` → aviso "NÃO agendado" |
| `resumo`, `tipo_servico`, `orgao`, `numero_processo`, `local`, `contato`, `observacoes` | string | Título e descrição do evento |
| `data` (AAAA-MM-DD), `hora_inicio`, `hora_fim` (HH:MM) | string | Início e fim do evento |
| `trecho_da_data` | string | Mostrado na resposta, para comparar com o original |
| `dia_da_semana_citado` | string | Comparado em código com o dia real da data |
| `data_relativa` | boolean | Gera alerta explicando como a data foi calculada (`VERIFICAR` se a mensagem foi encaminhada), **exceto** se `trecho_da_data` tem dia e mês escritos ("05/11", "5 de novembro"): a IA às vezes marca `true` só porque o ano faltou |
| `outras_datas[]` | `{data, hora, descricao}` | Listadas na resposta e na descrição do evento |
| `confianca` | `alta` / `media` / `baixa` | Diferente de `alta` → `VERIFICAR` |
| `ambiguidades[]` | string | Cada uma vira um alerta e deixa o evento em `VERIFICAR` |

### Checagens feitas em código (`src/03_validar.js`)

Não há etapa de confirmação. O evento nasce **verde**; qualquer dúvida real sobre a data o deixa **vermelho**, com `⚠️ VERIFICAR:` no título. Alertas só informativos não mudam a cor.

| Checagem | Resultado | Vermelho (`VERIFICAR`)? |
|---|---|---|
| Resposta da IA com erro, recusada, cortada, vazia ou com JSON inválido | **Falha** → "NÃO agendado" | — |
| `eh_pedido_de_servico = false` | **Falha** → "NÃO agendado" | — |
| Data ausente ou impossível (ex.: 30/02) | **Falha** → "NÃO agendado" | — |
| Sem hora | Evento de **dia inteiro** + alerta "HORÁRIO NÃO ENCONTRADO" | Sim |
| Dia da semana citado ≠ dia real da data | Alerta **CONFLITO DE DATA** | Sim |
| Data no passado | Alerta "JÁ PASSOU" | Sim |
| Data a mais de 180 dias | Alerta "confira o ano" (pega "05/10" escrito sem ano logo depois de 05/10, que vira o ano seguinte) | Sim |
| `confianca` ≠ `alta` | Alerta "Confiança da IA: MEDIA/BAIXA" | Sim |
| Cada item de `ambiguidades` | Alerta com o texto da IA | Sim |
| Data relativa em mensagem **encaminhada** | Alerta "Mensagem ENCAMINHADA com data relativa" | Sim |
| Data relativa digitada direto (não encaminhada) | Alerta informando a data de referência usada | Não |
| Faltam menos de 48h | Alerta **URGENTE** | Não |
| `data_relativa = true`, mas o trecho tem dia e mês ("05/11") | Nenhum alerta | — |
| `hora_fim` ausente ou antes do início | Fim = início + `duracao_padrao_horas` | — |

Os alertas aparecem na resposta (WhatsApp ou e-mail) e na descrição do evento.

### Texto da resposta

`src/03_validar.js` monta o mesmo conteúdo em dois formatos:

- **WhatsApp** (`resposta_whatsapp`): negrito com `*…*`. Começa com `✅ *Agendado*` ou `⚠️ *Agendei, mas CONFIRA a data*`, depois o resumo, a data **por extenso** (ex.: `QUINTA-FEIRA, 15 DE OUTUBRO DE 2026 às 09:00`, ou `(SEM HORÁRIO)`), o trecho original, os alertas, os dados do serviço, outras datas, quem foi convidado e o que fazer se algo estiver errado. O limite do WhatsApp é 4.096 caracteres: acima de 3.800, o texto é cortado em 3.700 com `[...]`, deixando espaço para o link da agenda que o nó 10 acrescenta.
- **E-mail** (`resposta_html`): o mesmo texto em HTML, com `&`, `<` e `>` do texto do cliente escapados. O assunto é `✅ Agendado: <resumo> — dd/MM HH:mm` ou `⚠️ CONFIRA: …`.

O aviso de falha (`src/04_aviso_falha.js`) segue a mesma ideia: `🚨 *NÃO agendei este pedido.*` + motivo no WhatsApp; no e-mail, motivo, origem e o texto original do pedido (até 6.000 caracteres), escapados.

---

## Workflow 2: Lembretes por e-mail

Arquivo: `workflow-naty-lembretes.json` (gerado por `build.js`). Nome no n8n: "Naty – Lembretes por e-mail". 8 nós.

| # | Nó | Tipo | O que faz |
|---|---|---|---|
| 1 | **A cada 10 minutos** | Schedule Trigger | Dispara o ciclo. |
| 2 | **Configuração** | Code (`src/10_lembretes_config.js`) | `CONFIG` + janela de busca: de agora até agora + maior antecedência + 1h (49h com o padrão). |
| 3 | **Ler agenda (próximas 49h)** | HTTP Request (GET events) | `singleEvents=true`, `orderBy=startTime`, até 250 eventos. Em erro → saída de falha. |
| 4 | **Calcular lembretes devidos** | Code (`src/11_calcular_lembretes.js`) | Decide quais eventos recebem e-mail agora e monta cada e-mail (algoritmo abaixo). |
| 5 | **Enviar lembrete por e-mail** | Gmail (HTML) | **Um** e-mail por evento devido, para a Naty e os convidados do evento. Se falhar, nada é marcado. |
| 6 | **Marcar lembrete como enviado** | HTTP Request (PATCH) | Grava as marcas no evento. **Só roda se o e-mail saiu.** |
| F1 | **Avisar falha nesta rodada?** | IF | Só avisa se o minuto atual < 10, ou seja, **no máximo 1x por hora**. |
| F2 | **Avisar: lembretes PARADOS** | Gmail | 🚨 "Os lembretes da agenda estão PARADOS", para `email_naty`. |

### Algoritmo dos lembretes

Para cada evento retornado:

1. Ignora eventos cancelados, sem início, que já começaram ou que não são do robô (quando `apenas_eventos_do_robo = true`).
2. Para cada antecedência de `antecedencias_min` (padrão: 2880 e 1440 minutos), o lembrete está **devido** quando:
   `início − antecedência ≤ agora` **e** a marca `lembrete_<min>` do evento **≠** o horário de início atual.
3. Se houver ao menos um devido, monta **um** e-mail com o tempo real que falta e marca **todos** os devidos.
4. Destinatários: `email_naty` + convidados do evento, **só em eventos do robô** (nunca os convidados de um compromisso pessoal). Ficam de fora convidados que recusaram o convite e salas (`resource`). Sem repetidos.

Consequências do algoritmo (todas testadas):

| Situação | Comportamento |
|---|---|
| Rodada normal | Cada lembrete sai uma vez, no ciclo de 10 min seguinte ao seu horário. |
| n8n fora do ar e perdeu dois lembretes | Ao voltar, manda **um** e-mail com o tempo real que falta e marca os dois. |
| Pedido criado com 30h de antecedência | Um e-mail imediato (o de 2 dias já está devido); o de 1 dia sai no horário. |
| Naty muda a data do evento na agenda | As marcas guardam a data **antiga**, então deixam de valer e os lembretes recomeçam para a data nova. |
| Naty apaga o evento | Não há mais lembretes. |
| Gmail falha ao enviar | Nada é marcado, e o lembrete sai no ciclo seguinte. |
| Evento sem a marca do robô (com `apenas_eventos_do_robo = false`) | Lembrete só para a Naty. |

Formato do e-mail:

- **Assunto:** ícone por urgência (🚨 ≤ 6h, ⏰ ≤ 24h, 📅 > 24h) + "Faltam X: título (dia, data às hora)". Ex.: `📅 Faltam 1 dia e 23h: Sessão Pregão 45/2026 (sexta-feira, 09/10 às 09:00)`.
- **Corpo:** "FALTAM X", título sem o prefixo de status, data, local, "SEM HORÁRIO DEFINIDO" em evento de dia inteiro, aviso se o evento está `⚠️ VERIFICAR`, e link para a agenda.

---

## Estados de um evento

| Título | Cor | Significa | Como chega aqui |
|---|---|---|---|
| `…` (sem prefixo) | Verde (`10`) | Criado pelo robô, sem dúvida sobre a data | Workflow 1, nó 8 |
| `⚠️ VERIFICAR: …` | Vermelho (`11`) | Criado pelo robô com dúvida real sobre a data; os alertas estão na descrição e na resposta | Workflow 1, nó 8 |
| `⏳ [A CONFIRMAR] …` / `✅ …` | Laranja (`6`) / Verde (`10`) | Legado da versão com confirmação pelo Telegram. Podem existir em eventos antigos de teste | Não são mais criados. Os e-mails de lembrete tiram esses prefixos do título |

O robô não mexe no evento depois de criado, a não ser para gravar as marcas dos lembretes. A Naty corrige um ⚠️ direto na agenda (data, hora) e, depois de conferir com o cliente, tira o `⚠️ VERIFICAR:` do título e, se quiser, troca a cor para verde. Enquanto o título começar com ⚠️, os e-mails de lembrete avisam que a data pode estar errada. Em **todos** os estados, os lembretes continuam ativos.

## Dados gravados no evento

```json
{
  "summary": "Sessão Pregão 45/2026 – Pref. Campinas",
  "colorId": "10",
  "start": { "dateTime": "2026-10-15T09:00:00-03:00", "timeZone": "America/Sao_Paulo" },
  "end":   { "dateTime": "2026-10-15T11:00:00-03:00", "timeZone": "America/Sao_Paulo" },
  "attendees": [ { "email": "joao@empresa.com" } ],
  "reminders": { "useDefault": false, "overrides": [
    { "method": "popup", "minutes": 2880 }, { "method": "popup", "minutes": 1440 },
    { "method": "popup", "minutes": 720 },  { "method": "popup", "minutes": 360 } ] },
  "extendedProperties": { "private": {
    "naty_bot": "1",
    "lembrete_2880": "2026-10-15T12:00:00.000Z"
  } }
}
```

- `attendees`: os `emails_equipe`, sem repetidos (o campo não é enviado se a lista estiver vazia). Como o evento é criado com `sendUpdates=all`, o Google manda o convite por e-mail.
- `reminders`: só alarmes (`popup`) no celular e no computador do dono da agenda, independentes do n8n. Não há lembrete por e-mail do Google: ele foi retirado para não duplicar os e-mails do workflow 2. O limite do Google é de 5 lembretes por evento.
- `naty_bot = "1"`: identifica eventos criados pelo robô.
- `lembrete_<minutos>`: o lembrete por e-mail foi enviado **para este horário de início** (em UTC).
- A **descrição** do evento guarda serviço, órgão, processo, local, contato, trecho original da data, outras datas, alertas, observações, origem e o texto original do pedido (até 6.000 caracteres).

## Configuração (blocos CONFIG)

Ficam no topo dos nós de código. Edite em `src/`, rode `node build.js` e reimporte, ou edite direto no nó dentro do n8n.

**Workflow 1: nó "Normalizar entrada" (`src/01_normalizar.js`)**

| Chave | Padrão | Descrição |
|---|---|---|
| `email_naty` | (preencher) | Recebe as respostas de pedidos que chegam por e-mail ou formulário, e os avisos quando o WhatsApp falha |
| `whatsapp_autorizados` | (preencher) | Números que podem mandar pedidos: DDI + DDD + número, só dígitos (ex.: `5511987654321`). Com ou sem o 9, as duas formas funcionam. Outros números são ignorados sem resposta |
| `whatsapp_phone_number_id` | (preencher) | ID do número do robô (Meta → app → WhatsApp → Configuração da API). Usado no endereço de envio da resposta |
| `emails_equipe` | `[]` | Viram convidados do evento: recebem o convite do Google e os lembretes por e-mail |
| `calendario_id` | `primary` | Calendário onde os eventos são criados |
| `duracao_padrao_horas` | `2` | Duração quando o pedido não diz a hora de término |
| `fuso` | `America/Sao_Paulo` | |

**Workflow 2: nó "Configuração" (`src/10_lembretes_config.js`)**

| Chave | Padrão | Descrição |
|---|---|---|
| `calendario_id` | `primary` | **O mesmo** do workflow 1 |
| `email_naty` | (preencher) | Recebe todos os lembretes e o aviso "lembretes PARADOS" |
| `apenas_eventos_do_robo` | `true` | `true` para o calendário pessoal; `false` para um calendário só de serviços (eventos criados à mão também recebem lembrete, só para a Naty) |
| `antecedencias_min` | `[2880, 1440]` | 2 dias e 1 dia antes. Ex.: `[2880, 1440, 360]` para também 6h antes. A janela de busca acompanha a maior antecedência |
| `fuso` | `America/Sao_Paulo` | |

## Tratamento de falhas

"Quem mandou" é a resposta no WhatsApp quando o pedido veio pelo WhatsApp, ou o e-mail para a Naty quando veio por e-mail ou formulário.

| Falha | O que acontece | Quem fica sabendo |
|---|---|---|
| Mensagem de número não autorizado | Ignorada | Ninguém (de propósito) |
| Áudio, imagem, documento, vídeo, figurinha | "NÃO agendado": só lê texto | Quem mandou |
| IA fora do ar, limite do Groq, resposta inválida | 3 tentativas; depois "NÃO agendado" | Quem mandou |
| Mensagem sem pedido ou sem data | "NÃO agendado" | Quem mandou |
| Google Agenda recusa criar o evento | 3 tentativas; depois "NÃO agendado" | Quem mandou |
| Dúvida real sobre a data | Evento criado vermelho, `⚠️ VERIFICAR` | Quem mandou ("Agendei, mas CONFIRA a data") |
| WhatsApp recusa a resposta (token vencido, número fora da lista de teste…) | 2 tentativas; depois o mesmo aviso vai por e-mail, com nota do erro | Naty (e-mail) |
| E-mail de resposta falha | O evento já está na agenda; o erro fica registrado só no nó | Ninguém (ver em Executions) |
| Workflow 2 não consegue ler a agenda | "Lembretes PARADOS" | Naty (e-mail, 1x/hora) |
| Acesso ao Google cai (Gmail e Agenda usam o mesmo app OAuth) | Lembretes param **e** o e-mail "PARADOS" também falha | Ninguém: só aparece como erro em Executions. Mitigação: app OAuth publicado e rotina semanal |
| Gmail falha ao mandar lembrete | Tenta de novo no ciclo seguinte | (transparente) |
| n8n dormindo ou fora do ar | Nada roda; ao voltar, os lembretes atrasados viram 1 e-mail | **cron-job.org** manda e-mail quando o `/healthz` falha |

## Serviços externos e endpoints

| Serviço | Endpoint | Credencial no n8n |
|---|---|---|
| Groq | `POST https://api.groq.com/openai/v1/chat/completions` | Header Auth: `Authorization: Bearer gsk_…` |
| Google Agenda | `https://www.googleapis.com/calendar/v3/calendars/{id}/events` (GET, POST com `sendUpdates=all`, PATCH) | Google Calendar OAuth2 |
| Gmail | Gmail Trigger / Send | Gmail OAuth2 |
| WhatsApp: entrada | WhatsApp Trigger (webhook `messages` registrado no app da Meta ao ativar o workflow) | "WhatsApp OAuth API": ID do app + chave secreta do app |
| WhatsApp: resposta | `POST https://graph.facebook.com/v23.0/{phone_number_id}/messages` | "WhatsApp API": token de acesso + ID da conta do WhatsApp Business |

- O webhook do WhatsApp exige o n8n acessível por **HTTPS público** (`WEBHOOK_URL` no Render).
- A versão da Graph API (`v23.0`) está fixada em `build.js`. Cada versão vale cerca de 2 anos; ao vencer, a Meta passa a usar a mais antiga disponível.
- Com um número real (fora do número de teste da Meta), pode ser preciso inscrever o app na conta do WhatsApp Business (`POST /{WABA_ID}/subscribed_apps`) para os webhooks chegarem.
- Responder dentro de 24h da mensagem recebida é grátis. Mensagens iniciadas pelo robô (ex.: lembretes no WhatsApp) exigiriam modelo aprovado pela Meta e são pagas por mensagem (ver `DECISOES.md`, D13).
