# Configuração

Passo a passo para deixar os dois workflows funcionando: credenciais, importação, celular da Naty e testes. Visão geral do sistema no [README](README.md).

**Pré-requisito:** o n8n no ar com HTTPS em https://naty-n8n.onrender.com, com a conta de dono criada. Veja [`deploy/RENDER.md`](deploy/RENDER.md).

| Passo | O quê | Tempo |
|---|---|---|
| 1 | [Bot do Telegram](#1-bot-do-telegram) | 5 min |
| 2 | [Rótulo e filtros no Gmail](#2-rótulo-e-filtros-no-gmail) | 5 min |
| 3 | [Chave do Groq](#3-chave-do-groq) | 3 min |
| 4 | [Credenciais do Google](#4-credenciais-do-google) | 15 min |
| 5 | [Importar o workflow 1 (pedidos)](#5-importar-o-workflow-1-pedidos) | 5 min |
| 6 | [Importar o workflow 2 (lembretes)](#6-importar-o-workflow-2-lembretes) | 5 min |
| 7 | [Celular da Naty](#7-celular-da-naty) | 5 min |
| 8 | [Testes](#8-testes) | 20 min |
| 9 | [Ativar](#9-ativar) | 1 min |
| 10 | [Opcional: conectar o n8n ao Claude (MCP)](#10-opcional-conectar-o-n8n-ao-claude-mcp) | 5 min |

---

## 1. Bot do Telegram

1. No Telegram, abra o **@BotFather** → `/newbot` → um nome (ex.: "Agenda Naty") e um usuário terminado em `bot` (ex.: `agenda_naty_bot`). Ele devolve um **token** (`123456:ABC…`). **Guarde em segredo:** quem tem o token controla o bot.
2. A Naty abre o bot pelo link do BotFather e manda `/start`. **Sem isso o bot não consegue escrever para ela.**
3. **Chat ID da Naty:** no navegador, abra `https://api.telegram.org/bot<TOKEN>/getUpdates` (troque `<TOKEN>`) e procure `"chat":{"id":123456789`. Esse número é o chat ID. Se vier `"result":[]`, peça para ela mandar outra mensagem ao bot e recarregue.
4. No n8n: **Credentials → New → Telegram API** → cole o token.

## 2. Rótulo e filtros no Gmail

1. No Gmail que recebe os pedidos, crie o rótulo **`pedidos-licitacao`**.
2. Crie filtros (Configurações → Filtros) que apliquem o rótulo aos e-mails dos clientes, por remetente ou por palavras como "pregão", "sessão", "edital".
3. Pedido que **não** recebe o rótulo **não é processado**. Para esses, existe o formulário (passo 5).

## 3. Chave do Groq

1. Crie a chave em https://console.groq.com → **API Keys**.
2. Em **Settings → Data Controls**, ative a **retenção zero de dados** (Zero Data Retention), se disponível: são dados de clientes.
3. No n8n: **Credentials → New → Header Auth**
   - Name: `Authorization`
   - Value: `Bearer gsk_…` (a palavra `Bearer`, um espaço e a chave)

## 4. Credenciais do Google

O n8n roda no seu próprio servidor (Render), então o login com Google precisa de um projeto seu no Google Cloud:

1. https://console.cloud.google.com → crie um projeto (ex.: "naty-n8n").
2. **APIs & Services → Library:** ative **Gmail API** e **Google Calendar API**.
3. **OAuth consent screen:** tipo *External*, preencha nome e e-mail, adicione o seu e-mail como usuário de teste.
4. **Credentials → Create credentials → OAuth client ID → Web application.** Em *Authorized redirect URIs*, cole:
   `https://naty-n8n.onrender.com/rest/oauth2-credential/callback`
   (é o endereço que o n8n mostra na tela da credencial; confira se bate).
5. No n8n, crie duas credenciais com o Client ID e o Client Secret e clique em **Sign in with Google**:
   - **Gmail OAuth2:** conta que recebe os pedidos e envia os avisos.
   - **Google Calendar OAuth2:** conta **da agenda que a Naty olha no celular**.

> ⚠️ **Armadilha:** com a tela de consentimento em modo **Testing**, o Google derruba o login **a cada 7 dias** e os workflows param (chega o 🚨 "lembretes PARADOS"). Em **OAuth consent screen**, clique em **Publish app** para passar a *In production*. Para uso próprio não precisa da verificação do Google; basta aceitar o aviso de "app não verificado" no login.

> **Recomendado:** crie no Google Agenda um calendário só para os serviços (ex.: "Serviços Naty") e use o ID dele nos dois workflows (Configurações do calendário → *Integrar agenda*). Assim, até eventos criados à mão recebem lembretes (passo 6).

## 5. Importar o workflow 1 (pedidos)

1. n8n → **Workflows → Import from File** → `workflow-naty-agenda.json`.
2. Abra o nó **"Normalizar entrada"** e edite o bloco `CONFIG` no topo:

   | Chave | Valor |
   |---|---|
   | `telegram_chat_id` | chat ID da Naty (passo 1). Só esse chat pode tocar nos botões de confirmação. |
   | `email_naty` | e-mail de reserva: recebe a confirmação se o Telegram falhar, e os avisos 🚨 |
   | `calendario_id` | `primary` ou o ID do calendário de serviços |
   | `duracao_padrao_horas` | duração quando o pedido não diz a hora de término (padrão 2) |

3. Selecione a credencial em cada nó:

   | Nó | Credencial |
   |---|---|
   | Gmail: novo pedido | Gmail OAuth2 |
   | Groq: extrair dados | Header Auth (`Authorization`) |
   | Criar evento na agenda · Marcar como confirmado · Marcar para verificar | Google Calendar OAuth2 (o *Credential Type* já vem como `Google Calendar OAuth2 API`) |
   | Confirmar pelo Telegram · Avisar: corrigir na agenda · Avisar no Telegram: NÃO agendado | Telegram API |
   | Confirmar por e-mail (reserva) · Avisar: NÃO agendado | Gmail OAuth2 |

## 6. Importar o workflow 2 (lembretes)

1. **Import from File** → `workflow-naty-lembretes-telegram.json`.
2. Nó **"Configuração"**:

   | Chave | Valor |
   |---|---|
   | `telegram_chat_id` | chat ID da Naty |
   | `calendario_id` | **o mesmo** do workflow 1 |
   | `apenas_eventos_do_robo` | `true` se for o calendário pessoal (senão ela recebe lembrete do dentista). `false` com um calendário só de serviços: aí os eventos criados à mão também recebem lembrete. |
   | `antecedencias_min` | padrão `[2880, 1440, 720, 360]` (2 dias, 1 dia, 12h, 6h) |

3. Credenciais:

   | Nó | Credencial |
   |---|---|
   | Ler agenda (próximas 49h) · Marcar lembrete como enviado | Google Calendar OAuth2 |
   | Enviar lembrete · Avisar: lembretes PARADOS | Telegram API |

## 7. Celular da Naty

Esta etapa decide se o sistema funciona ou não.

- **Telegram:** conversa com o bot → nome do bot no topo → **notificações ativadas** com um **som próprio**, diferente das outras conversas. No Android: Configurações → Apps → Telegram → Notificações → conversas privadas com **prioridade alta**. Se ela usa o modo Não Perturbe, adicione o Telegram como exceção.
- **Google Agenda** (segunda camada, independente do n8n): app instalado, logado na conta do passo 4, notificações liberadas. No iPhone, ative "Sensível ao tempo".

## 8. Testes

**Pedidos:** abra o nó **"Formulário: colar pedido"** → *Test URL* e cole cada caso. Confira o Telegram e a agenda:

| Texto para colar | Resultado esperado |
|---|---|
| `Bom dia Naty! Preciso de representante na sessão do Pregão Eletrônico 45/2026 da Prefeitura de Campinas, dia 20/11 às 9h. Obrigado, Carlos` | Evento sexta, 20/11, 09:00, sem alertas |
| `Naty, a visita técnica é na segunda-feira, 19/11, às 14h na Sabesp de Santos` | ⚠️ **CONFLITO DE DATA** (19/11/2026 é quinta) |
| `Consegue entregar os envelopes amanhã no protocolo do DER?` | Dia inteiro + alertas de "horário não encontrado" e "data relativa" |
| `Impugnação até 10/11, abertura das propostas 14/11 às 10h, precisamos de você na disputa dia 18/11 às 9h30` | Data principal 18/11 09:30; as outras listadas |
| `Oi, tudo bem? Depois a gente se fala` | 🚨 "NÃO agendado" (Telegram + e-mail) |
| `Contato: joao_silva@pref.sp.gov.br, sessão *urgente* dia 20/11 às 9h` | Confirmação chega normalmente (testa os caracteres especiais) |

Rode os casos **mais de uma vez**: a IA pode variar. Se ela errar a data principal ou "amanhã", anote e reavalie o modelo (veja `docs/DECISOES.md`, D5).

**Botões:** toque em ✅ num evento e em ❌ em outro. O primeiro deve virar `✅` (verde) e o segundo `⚠️ VERIFICAR` (vermelho), com um aviso no Telegram. Os botões devem responder **dentro do chat**: a mensagem mostra o resultado e os botões somem. Se abrirem uma página no navegador, o n8n não está em HTTPS público; funciona, mas é menos prático.

**Lembretes:** cole um pedido para **daqui a umas 30 horas**. No workflow 2, clique em **Execute workflow**: deve chegar "⏰ FALTAM 1 DIA E 6H" (ou parecido). Execute de novo: **não** deve chegar outro. Mude a hora do evento na agenda para o dia seguinte e execute de novo: deve voltar a chegar.

Apague os eventos de teste no final.

## 9. Ativar

Ligue a chave **Active** no topo de **cada um** dos dois workflows. A partir daí:
- o workflow 1 verifica o Gmail a cada minuto, e o formulário passa a usar a *Production URL* (salve esse link no celular da Naty);
- o workflow 2 roda a cada 10 minutos.

## 10. Opcional: conectar o n8n ao Claude (MCP)

Permite que o Claude veja e rode os workflows do seu n8n, por exemplo para testar o formulário ou investigar uma execução com erro.

1. n8n → **Settings → Instance-level MCP** → ative **Enable MCP access** (precisa ser o dono).
2. Em cada workflow que o Claude deve enxergar, ative a disponibilidade no MCP nas configurações do workflow. **Por padrão, nenhum fica exposto.**
3. Em **Connect a client**, copie a **Server URL** (termina em `/mcp-server/http`).
4. Em https://claude.ai/customize/connectors, adicione um conector personalizado com essa URL e faça o login.
5. Abra uma **sessão nova** do Claude (os conectores são carregados no início da sessão).

> O MCP do n8n consegue rodar, criar, publicar e despublicar workflows. Exponha só os dois da Naty. Pelo MCP, só disparam workflows com gatilho de formulário, agendamento, webhook, chat ou manual: o gatilho do Gmail fica de fora.

---

Problemas depois de configurado? Veja [`docs/OPERACAO.md`](docs/OPERACAO.md).
