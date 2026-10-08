# Arquitetura

Como o sistema funciona por dentro: cada nó dos dois workflows, os estados de um evento na agenda e o algoritmo dos lembretes.

- [Visão geral](#visão-geral)
- [Workflow 1: Pedidos → Agenda](#workflow-1-pedidos--agenda)
- [Workflow 2: Lembretes no Telegram](#workflow-2-lembretes-no-telegram)
- [Estados de um evento](#estados-de-um-evento)
- [Dados gravados no evento](#dados-gravados-no-evento)
- [Configuração (blocos CONFIG)](#configuração-blocos-config)
- [Tratamento de falhas](#tratamento-de-falhas)
- [Serviços externos e endpoints](#serviços-externos-e-endpoints)

---

## Visão geral

```
              ┌──────────────── n8n (Render) ─────────────────┐
 Gmail ──────►│ Workflow 1: Pedidos → Agenda                  │──► Google Agenda ◄──┐
 Formulário ─►│   Groq (IA) + validação em código             │──► Telegram (Naty)   │
              │                                                │──► Gmail (reserva)   │
              │ Workflow 2: Lembretes (a cada 10 min)          │─── lê/marca eventos ─┘
              │                                                │──► Telegram (Naty)
              └──────────────────────┬─────────────────────────┘
                                     │ workflows, credenciais, execuções
                                     ▼
                           Supabase Postgres (schema n8n)
```

Os dois workflows **não se chamam**. A ligação entre eles é a própria Agenda Google: o workflow 1 escreve eventos marcados com `naty_bot = 1`, e o workflow 2 lê esses eventos.

---

## Workflow 1: Pedidos → Agenda

Arquivo: `workflow-naty-agenda.json` (gerado por `build.js`).

| # | Nó | Tipo | O que faz |
|---|---|---|---|
| 1a | **Gmail: novo pedido** | Gmail Trigger | Verifica a cada minuto e-mails que batem com `label:pedidos-licitacao`. Lê o e-mail completo (`simple: false`). |
| 1b | **Formulário: colar pedido** | Form Trigger | Formulário com "Texto do pedido" e "Origem" (WhatsApp/Telefone/Outro), para pedidos que não chegam por e-mail. |
| 2 | **Normalizar entrada** | Code (`src/01_normalizar.js`) | Unifica as duas entradas em `{texto, origem, referencia_iso, referencia_extenso}` e injeta o `CONFIG`. A **data de referência** é a data de **envio do e-mail** (não "agora"), para que "amanhã" seja relativo a quando o cliente escreveu. |
| 3 | **Montar pedido para a IA** | Code (`src/02_montar_requisicao.js`) | Monta a requisição para o Groq: prompt de sistema, esquema JSON (`strict`) e um **calendário dos próximos 60 dias** com o dia da semana de cada data. |
| 4 | **Groq: extrair dados** | HTTP Request | `POST https://api.groq.com/openai/v1/chat/completions`. 3 tentativas com 30s de intervalo (cobre o limite por minuto do plano grátis). Em erro, **continua** com o erro no JSON, para o nó 5 tratar. |
| 5 | **Validar e montar evento** | Code (`src/03_validar.js`) | Lê a resposta, faz as **checagens determinísticas** de data, monta o evento do Google Agenda, o texto da confirmação no Telegram (Markdown escapado) e o texto do e-mail. Em qualquer problema, devolve `{erro}`. |
| 6 | **Extraiu certo?** | IF | `erro` vazio → segue; senão → avisos de falha. |
| 7 | **Criar evento na agenda** | HTTP Request (Google Calendar API) | `POST /calendars/{id}/events`. 3 tentativas. Se falhar → avisos de falha. |
| 8 | **Confirmar pelo Telegram** | Telegram, *Send and Wait* | Mensagem com a data por extenso + botões ✅/❌ **dentro do chat** (`chatApproval`), aceitando toques só do chat da Naty (`approverIds`). Espera até **24h**. Se o Telegram falhar → nó 8b. |
| 8b | **Confirmar por e-mail (reserva)** | Gmail, *Send and Wait* | Mesma confirmação por e-mail, com link para o evento. |
| 9 | **Confirmou?** | IF | `data.approved === true`. "Está errado" **e** 24h sem resposta caem no "não". |
| 10a | **Marcar como confirmado** | HTTP Request (PATCH) | Título `✅ …`, cor verde (`colorId 10`). |
| 10b | **Marcar para verificar** | HTTP Request (PATCH) | Título `⚠️ VERIFICAR: …`, cor vermelha (`colorId 11`). |
| 11 | **Avisar: corrigir na agenda** | Telegram | Pede para corrigir direto no evento, com link. Os lembretes continuam ativos. |
| F1 | **Avisar: NÃO agendado** | Gmail | 🚨 E-mail com o motivo e o texto original do pedido. |
| F2 | **Avisar no Telegram: NÃO agendado** | Telegram | 🚨 O mesmo aviso no Telegram. F1 e F2 disparam juntos. |

### A requisição para a IA

- **Modelo:** `openai/gpt-oss-120b` no Groq, `reasoning_effort: medium`, até 4.000 tokens de saída.
- **Saída:** `response_format: json_schema` com `strict: true`, o que garante JSON válido no formato do esquema.
- **Mensagem do usuário:** data de referência, origem, calendário de 60 dias e o texto do pedido dentro de `<mensagem>…</mensagem>`.
- **Regras principais do prompt:**
  - nunca inventar;
  - formato brasileiro (05/11 = 5 de novembro);
  - datas relativas resolvidas **consultando o calendário**;
  - copiar literalmente o trecho da data (`trecho_da_data`);
  - copiar o dia da semana citado, **sem calculá-lo**;
  - a data principal é a da execução do serviço; as outras vão para `outras_datas`.

Campos do esquema:

| Campo | Tipo | Uso |
|---|---|---|
| `eh_pedido_de_servico` | boolean | `false` → aviso "NÃO agendado" |
| `resumo`, `tipo_servico`, `orgao`, `numero_processo`, `local`, `contato`, `observacoes` | string | Título e descrição do evento |
| `data` (AAAA-MM-DD), `hora_inicio`, `hora_fim` (HH:MM) | string | Início e fim do evento |
| `trecho_da_data` | string | Mostrado na confirmação, para a Naty comparar com o original |
| `dia_da_semana_citado` | string | Comparado em código com o dia real da data |
| `data_relativa` | boolean | Gera alerta explicando como a data foi calculada |
| `outras_datas[]` | `{data, hora, descricao}` | Listadas na confirmação e na descrição do evento |
| `confianca` | `alta` / `media` / `baixa` | Diferente de `alta` → alerta |
| `ambiguidades[]` | string | Cada uma vira um alerta |

### Checagens feitas em código (`src/03_validar.js`)

| Checagem | Resultado |
|---|---|
| Resposta da IA com erro, recusada, cortada, vazia ou com JSON inválido | **Falha** → "NÃO agendado" |
| `eh_pedido_de_servico = false` | **Falha** → "NÃO agendado" |
| Data ausente ou impossível (ex.: 30/02) | **Falha** → "NÃO agendado" |
| Dia da semana citado ≠ dia real da data | Alerta **CONFLITO DE DATA** |
| Data no passado | Alerta "JÁ PASSOU" |
| Data a mais de 365 dias | Alerta "confira o ano" |
| Faltam menos de 48h | Alerta **URGENTE** (os lembretes de 2d/1d não vão disparar) |
| Sem hora | Evento de **dia inteiro** + alerta "HORÁRIO NÃO ENCONTRADO" |
| `hora_fim` ausente ou antes do início | Fim = início + `duracao_padrao_horas` |

Alertas aparecem na confirmação do Telegram, no e-mail de reserva e na descrição do evento. O assunto ganha ⚠️ quando há alerta.

### Texto da confirmação no Telegram

O nó *Send and Wait* do Telegram envia em **Markdown legado**. Os caracteres `_ * \` [` vindos do cliente (ex.: `joao_silva@...`) são escapados com `\`, senão o Telegram recusa a mensagem. Textos longos são cortados em ~3.700 caracteres sem quebrar a formatação. Isso é coberto por testes.

---

## Workflow 2: Lembretes no Telegram

Arquivo: `workflow-naty-lembretes-telegram.json` (gerado por `build.js`).

| # | Nó | Tipo | O que faz |
|---|---|---|---|
| 1 | **A cada 10 minutos** | Schedule Trigger | Dispara o ciclo. |
| 2 | **Configuração** | Code (`src/10_lembretes_config.js`) | `CONFIG` + janela de busca: de agora até agora + maior antecedência + 1h (49h). |
| 3 | **Ler agenda (próximas 49h)** | HTTP Request (GET events) | `singleEvents=true`, `orderBy=startTime`, até 250 eventos. Em erro → saída de falha. |
| 4 | **Calcular lembretes devidos** | Code (`src/11_calcular_lembretes.js`) | Decide quais eventos recebem mensagem agora (algoritmo abaixo). |
| 5 | **Enviar lembrete** | Telegram (HTML) | Uma mensagem por evento devido. |
| 6 | **Marcar lembrete como enviado** | HTTP Request (PATCH) | Grava as marcas no evento. **Só roda se o Telegram aceitou** a mensagem. |
| F1 | **Avisar falha nesta rodada?** | IF | Só avisa se o minuto atual < 10, ou seja, **no máximo 1x por hora**. |
| F2 | **Avisar: lembretes PARADOS** | Telegram | 🚨 "O robô não conseguiu ler a Agenda Google." |

### Algoritmo dos lembretes

Para cada evento retornado:

1. Ignora eventos cancelados, sem início, que já começaram ou que não são do robô (quando `apenas_eventos_do_robo = true`).
2. Para cada antecedência (2880, 1440, 720 e 360 minutos), o lembrete está **devido** quando:
   `início − antecedência ≤ agora` **e** a marca `lembrete_<min>` do evento **≠** o horário de início atual.
3. Se houver ao menos um devido, monta **uma** mensagem com o tempo real que falta e marca **todos** os devidos.

Consequências do algoritmo (todas testadas):

| Situação | Comportamento |
|---|---|
| Rodada normal | Cada lembrete sai uma vez, no ciclo de 10 min seguinte ao seu horário. |
| n8n fora do ar e perdeu o de 12h e o de 6h | Ao voltar, manda **uma** mensagem ("FALTAM 5H30") e marca os dois. |
| Pedido criado com 20h de antecedência | Uma mensagem imediata; os de 12h e 6h saem no horário. |
| Naty muda a data do evento na agenda | As marcas guardam a data **antiga**, então deixam de valer e os lembretes recomeçam para a data nova. |
| Naty apaga o evento | Não há mais lembretes. |
| Telegram falha | Nada é marcado, e o lembrete sai no ciclo seguinte. |

Formato da mensagem: ícone por urgência (🚨 ≤ 6h, ⏰ ≤ 24h, 📅 > 24h), "FALTAM X", título sem o prefixo de status, data por extenso, local, aviso se o evento ainda está `⏳` ou `⚠️`, e link para a agenda.

---

## Estados de um evento

| Título | Cor | Significa | Como chega aqui |
|---|---|---|---|
| `⏳ [A CONFIRMAR] …` | Laranja (`6`) | Criado pelo robô, aguardando a Naty | Workflow 1, nó 7 |
| `✅ …` | Verde (`10`) | Naty confirmou a data | Toque em "✅ Está certo" |
| `⚠️ VERIFICAR: …` | Vermelho (`11`) | Naty disse que está errado, ou não respondeu em 24h | Toque em "❌" ou fim do prazo |

Em **todos** os estados, os lembretes continuam ativos. A Naty corrige um ⚠️ editando o evento direto na agenda. O título pode ficar como está ou ser trocado à mão.

## Dados gravados no evento

```json
{
  "summary": "⏳ [A CONFIRMAR] Sessão Pregão 45/2026 – Pref. Campinas",
  "colorId": "6",
  "start": { "dateTime": "2026-10-15T09:00:00-03:00", "timeZone": "America/Sao_Paulo" },
  "end":   { "dateTime": "2026-10-15T11:00:00-03:00", "timeZone": "America/Sao_Paulo" },
  "reminders": { "useDefault": false, "overrides": [
    { "method": "popup", "minutes": 2880 }, { "method": "popup", "minutes": 1440 },
    { "method": "popup", "minutes": 720 },  { "method": "popup", "minutes": 360 },
    { "method": "email", "minutes": 1440 } ] },
  "extendedProperties": { "private": {
    "naty_bot": "1",
    "lembrete_2880": "2026-10-15T12:00:00.000Z"
  } }
}
```

- `reminders`: segunda camada de aviso, pelo app do Google Agenda, independente do n8n. O limite do Google é de 5 lembretes por evento.
- `naty_bot = "1"`: identifica eventos criados pelo robô.
- `lembrete_<minutos>`: o lembrete do Telegram foi enviado **para este horário de início** (em UTC).
- A **descrição** do evento guarda serviço, órgão, processo, local, contato, trecho original da data, outras datas, alertas, origem e o texto original do pedido (até 6.000 caracteres).

## Configuração (blocos CONFIG)

Ficam no topo dos nós de código. Edite em `src/`, rode `node build.js` e reimporte, ou edite direto no nó dentro do n8n.

**Workflow 1: nó "Normalizar entrada" (`src/01_normalizar.js`)**

| Chave | Padrão | Descrição |
|---|---|---|
| `email_naty` | (preencher) | Recebe a confirmação de reserva e os avisos 🚨 |
| `telegram_chat_id` | (preencher) | Chat da Naty; também é o único autorizado a tocar nos botões |
| `calendario_id` | `primary` | Calendário onde os eventos são criados |
| `duracao_padrao_horas` | `2` | Duração quando o pedido não diz a hora de término |
| `fuso` | `America/Sao_Paulo` | |

**Workflow 2: nó "Configuração" (`src/10_lembretes_config.js`)**

| Chave | Padrão | Descrição |
|---|---|---|
| `calendario_id` | `primary` | **O mesmo** do workflow 1 |
| `telegram_chat_id` | (preencher) | Chat da Naty |
| `apenas_eventos_do_robo` | `true` | `true` para o calendário pessoal; `false` para um calendário só de serviços (eventos criados à mão também recebem lembrete) |
| `antecedencias_min` | `[2880, 1440, 720, 360]` | 2 dias, 1 dia, 12h, 6h |
| `fuso` | `America/Sao_Paulo` | |

## Tratamento de falhas

| Falha | O que acontece | Quem fica sabendo |
|---|---|---|
| IA fora do ar, limite do Groq, resposta inválida | 3 tentativas; depois "NÃO agendado" | Naty (Telegram + e-mail) |
| Mensagem sem pedido ou sem data | "NÃO agendado" | Naty (Telegram + e-mail) |
| Google Agenda recusa criar o evento | 3 tentativas; depois "NÃO agendado" | Naty (Telegram + e-mail) |
| Telegram falha ao pedir confirmação | Confirmação vai por e-mail | (transparente) |
| Naty não responde em 24h | Evento vira ⚠️ VERIFICAR | Naty (Telegram) |
| Workflow 2 não consegue ler a agenda | "Lembretes PARADOS" | Naty (Telegram, 1x/hora) |
| Telegram falha ao mandar lembrete | Tenta de novo no ciclo seguinte | (transparente) |
| n8n dormindo ou fora do ar | Nada roda; ao voltar, os lembretes atrasados viram 1 mensagem | **cron-job.org** manda e-mail quando o `/healthz` falha |

## Serviços externos e endpoints

| Serviço | Endpoint | Credencial no n8n |
|---|---|---|
| Groq | `POST https://api.groq.com/openai/v1/chat/completions` | Header Auth: `Authorization: Bearer gsk_…` |
| Google Agenda | `https://www.googleapis.com/calendar/v3/calendars/{id}/events` (GET, POST, PATCH) | Google Calendar OAuth2 |
| Gmail | Gmail Trigger / Send / Send and Wait | Gmail OAuth2 |
| Telegram | Bot API: sendMessage, Send and Wait (webhook fixo de aprovação) | Telegram API (token do BotFather) |

A aprovação dentro do chat do Telegram exige o n8n acessível por **HTTPS público**. Sem isso, o n8n troca sozinho para botões que abrem um link no navegador.
