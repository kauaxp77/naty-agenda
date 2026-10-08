# Naty: Pedidos → Agenda + Lembretes no Telegram

## O que o robô faz

```
E-mail com rótulo "pedidos-licitacao" ─┐
                                       ├─► IA (Groq) extrai órgão, serviço, data, hora, local
Formulário (cola texto do WhatsApp) ───┘        │
                                                ▼
                         Checagens automáticas (sem IA):
                         • dia da semana bate com a data?
                         • data já passou? está a +1 ano?
                         • faltam menos de 48h?
                                                │
                    ┌──── falhou ───────────────┴──── ok ────┐
                    ▼                                         ▼
  🚨 Telegram + e-mail "NÃO agendado,     Cria evento "⏳ [A CONFIRMAR]" na agenda
     agende manualmente"                  com lembretes: 2 dias, 1 dia, 12h, 6h + e-mail
                                                              │
                                                              ▼
                                  Telegram da Naty: data POR EXTENSO + dois botões
                                  ✅ Está certo / ❌ Está errado
                                  (se o Telegram falhar, a confirmação vai por e-mail)
                                                              │
                              ┌─────── Confirmar ────────────┴──── Errado ou 24h sem resposta ─┐
                              ▼                                                                 ▼
                    Evento vira "✅ ..." (verde)                 Evento vira "⚠️ VERIFICAR" (vermelho)
                                                                 + Telegram pedindo correção

──────── Workflow 2: Lembretes no Telegram (roda a cada 10 min) ────────

Lê a Agenda Google (próximas 49h) → para cada evento do robô, vê se chegou a hora do
lembrete de 2 dias / 1 dia / 12h / 6h → manda no Telegram da Naty → marca no evento
que aquele lembrete já foi enviado.

Se não conseguir ler a agenda → 🚨 "Os lembretes estão PARADOS" no Telegram (1x por hora).
```

**Princípio do desenho:** o evento é criado **antes** da confirmação. Se ninguém responder, o evento continua na agenda com os lembretes ativos. Nenhum caminho termina em "pedido sumiu sem aviso": toda falha gera um aviso 🚨 no Telegram **e** por e-mail.

**Por que os lembretes leem a agenda, em vez de serem agendados na hora da criação:** a agenda é a fonte da verdade. Se a Naty mudar a data ou a hora de um evento direto na agenda, os lembretes do Telegram acompanham sozinhos. Se apagar o evento, os lembretes param. E se o n8n ficar fora do ar e perder lembretes, ao voltar ele manda **um** aviso com o tempo que realmente falta, em vez de vários atrasados de uma vez.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `workflow-naty-agenda.json` | Workflow 1: pedidos → agenda. Importar no n8n |
| `workflow-naty-lembretes-telegram.json` | Workflow 2: lembretes no Telegram. Importar no n8n |
| `src/*.js` | Código dos nós "Code" (os JSONs são gerados a partir deles) |
| `build.js` | Regenera os JSONs depois de editar `src/` (`node build.js`) |
| `test/` | Testes da lógica de datas e dos lembretes (`npm i && node test/testar_validacao.js && node test/testar_lembretes.js`) |

---

## Passo a passo

### 1. Onde rodar o n8n
- **n8n Cloud (recomendado para começar):** zero manutenção, e o login com Google é um clique. Plano Starter.
- **VPS própria (Hostinger, Contabo etc., ~R$30/mês):** mais barato a longo prazo, mas exige configurar domínio + HTTPS e a variável `WEBHOOK_URL`. **Sem URL pública com HTTPS, os botões de confirmação não funcionam.**

É necessário o n8n **versão 1.80 ou mais recente**: a função "Send and Wait for Response" do Gmail não existe em versões antigas.

### 2. Rótulo no Gmail
1. No Gmail da empresa, crie o rótulo `pedidos-licitacao`.
2. Crie filtros (Configurações → Filtros) que apliquem esse rótulo aos e-mails dos clientes (por remetente, ou por palavras como "pregão", "sessão", "edital").
3. Pedido que não cair no filtro **não é processado**. Nesse caso, use o formulário (passo 8).

### 3. Chave da API do Groq
1. Crie a chave em https://console.groq.com → API Keys (o plano gratuito basta para começar).
2. Em **Settings → Data Controls**, ative a **retenção zero de dados** (Zero Data Retention), se disponível. São dados de clientes.
3. No n8n: **Credentials → New → Header Auth**
   - Name: `Authorization`
   - Value: `Bearer gsk_...` (a palavra Bearer, um espaço, e a chave)

### 4. Credenciais Google
No n8n crie duas credenciais (no Cloud é só "Sign in with Google"):
- **Gmail OAuth2**: conta que recebe os pedidos e envia os avisos.
- **Google Calendar OAuth2**: conta **da agenda que a Naty olha no celular**.

Na VPS: crie um projeto no Google Cloud Console, ative **Gmail API** e **Google Calendar API**, crie um "OAuth Client ID (Web)" e cole a URL de redirect que o n8n mostra.

> ⚠️ **Armadilha da VPS:** se a tela de consentimento OAuth do projeto ficar em modo **"Testing"**, o Google derruba o login a cada **7 dias** e tudo para em silêncio (no workflow 2 chega o 🚨 "lembretes PARADOS"). Em "OAuth consent screen", clique em **Publish app** para passar a "In production". Para uso próprio não precisa da verificação do Google; basta aceitar o aviso de "app não verificado" no login.

### 5. Importar e configurar
> Faça antes o **passo 6** (bot do Telegram): este workflow também precisa do chat ID.

1. n8n → **Workflows → Import from File** → `workflow-naty-agenda.json`.
2. Abra o nó **"Normalizar entrada"** e edite o bloco `CONFIG` no topo:
   - `telegram_chat_id`: o chat ID da Naty (passo 6). Ela recebe as confirmações ali, e **só ela** pode tocar nos botões.
   - `email_naty`: e-mail de reserva (recebe a confirmação se o Telegram falhar, e os avisos 🚨)
   - `calendario_id`: deixe `primary` ou use o ID de um calendário só para os serviços
3. Selecione a credencial em cada nó:

| Nó | Credencial |
|---|---|
| Gmail: novo pedido | Gmail OAuth2 |
| Groq: extrair dados | Header Auth (`Authorization`) |
| Criar evento na agenda / Marcar como confirmado / Marcar para verificar | Google Calendar OAuth2 (em "Credential Type" já vem `Google Calendar OAuth2 API`) |
| Confirmar pelo Telegram / Avisar: corrigir na agenda / Avisar no Telegram: NÃO agendado | Telegram API |
| Confirmar por e-mail (reserva) / Avisar: NÃO agendado | Gmail OAuth2 |

### 6. Bot do Telegram (lembretes)
1. No Telegram, abra o **@BotFather** → `/newbot` → escolha um nome (ex.: "Agenda Naty") e um usuário terminado em `bot` (ex.: `agenda_naty_bot`). Ele devolve um **token** (`123456:ABC...`). **Guarde em segredo**: quem tem o token controla o bot.
2. A Naty abre o bot pelo link que o BotFather mostra e manda `/start`. **Sem isso o bot não consegue escrever para ela.**
3. Descubra o **chat ID** dela: no navegador, abra `https://api.telegram.org/bot<TOKEN>/getUpdates` (troque `<TOKEN>` pelo token) e procure `"chat":{"id":123456789`. Esse número é o chat ID. Se aparecer `"result":[]`, peça para ela mandar outra mensagem ao bot e recarregue.
4. No n8n: **Credentials → New → Telegram API** → cole o token.
5. Importe `workflow-naty-lembretes-telegram.json`, abra o nó **"Configuração"** e preencha:
   - `telegram_chat_id`: o número do item 3
   - `calendario_id`: **o mesmo** usado no workflow 1
   - `apenas_eventos_do_robo`: deixe `true` se o calendário for o pessoal da Naty (senão ela recebe lembrete do dentista também). Se usar um calendário só de serviços, ponha `false`: aí até os eventos que ela criar à mão (ex.: depois de um 🚨 "NÃO agendado") recebem lembrete.
6. Credenciais dos nós:

| Nó | Credencial |
|---|---|
| Ler agenda (próximas 49h) / Marcar lembrete como enviado | Google Calendar OAuth2 |
| Enviar lembrete / Avisar: lembretes PARADOS | Telegram API |

> **Recomendado:** crie no Google Agenda um calendário só para os serviços (ex.: "Serviços Naty"), use o ID dele nos dois workflows e ponha `apenas_eventos_do_robo: false`. Assim, todo serviço na agenda recebe lembrete, inclusive os criados à mão. O ID fica em Configurações do calendário → "Integrar agenda".

### 7. Celular da Naty
Esta etapa decide se o sistema funciona ou não.
- **Telegram:** abra a conversa com o bot → nome do bot no topo → **Notificações ativadas**, com um **som próprio** (diferente das outras conversas). No Android, em Configurações → Apps → Telegram → Notificações, deixe a categoria de conversas privadas com **prioridade alta**. Se usa Não Perturbe, adicione o Telegram como exceção.
- **Google Agenda** (segunda camada): app instalado, logado na conta do passo 4, notificações liberadas. No iPhone, ative "Sensível ao tempo".

### 8. Testar antes de ativar
Abra o nó **"Formulário: colar pedido"** → "Test URL" e cole cada caso. Confira o e-mail e a agenda:

| Texto para colar | O que deve acontecer |
|---|---|
| `Bom dia Naty! Preciso de representante na sessão do Pregão Eletrônico 45/2026 da Prefeitura de Campinas, dia 20/11 às 9h. Obrigado, Carlos` | Evento 20/11 09:00, sem alertas |
| `Naty, a visita técnica é na segunda-feira, 19/11, às 14h na Sabesp de Santos` | ⚠️ **CONFLITO DE DATA** (19/11/2026 é quinta) |
| `Consegue entregar os envelopes amanhã no protocolo do DER?` | Alerta de horário não encontrado + data relativa |
| `Impugnação até 10/11, abertura das propostas 14/11 às 10h, precisamos de você na disputa dia 18/11 às 9h30` | Data principal 18/11 09:30; as outras listadas |
| `Oi, tudo bem? Depois a gente se fala` | 🚨 e-mail "NÃO agendado" |

Teste também os dois botões no Telegram e confira se o evento muda para ✅ ou ⚠️. Os botões devem funcionar **dentro do chat**: ao tocar, a mensagem mostra o resultado e os botões somem. Se, em vez disso, abrirem uma página no navegador, o n8n não está com HTTPS público; funciona, mas é menos prático.

Teste também um texto com `_` e `*` (ex.: `Contato: joao_silva@pref.sp.gov.br, sessão *urgente* dia 20/11 às 9h`): a confirmação precisa chegar normalmente no Telegram.

**Lembretes no Telegram:** cole um pedido para **amanhã, daqui a umas 30 horas**. Em seguida, no workflow 2, clique em "Execute workflow". Deve chegar no Telegram "⏰ FALTAM 1 DIA E 6H" (ou parecido). Execute de novo: **não** deve chegar outro, porque o lembrete já ficou marcado como enviado. Depois mude a hora do evento na agenda para o dia seguinte, execute de novo e confira se volta a chegar lembrete. Apague os eventos de teste no final.

Depois disso, **ative os dois workflows** (chave "Active" no topo de cada um).

---

## Limitações que ainda existem

1. **Telegram e Agenda continuam sendo notificações, não alarmes.** São dois canais independentes, mas ambos podem ser silenciados ou ignorados. O próximo passo contra isso é a ligação automática 6h antes (Fase 3).
2. **A IA pode errar a data e a Naty confirmar sem ler.** A confirmação mostra a data por extenso com o dia da semana, junto com o trecho original da mensagem, justamente para facilitar a conferência. Mas, se ela clicar ✅ no automático, o erro passa. A conferência é parte do processo, não enfeite.
3. **Pedido que não cai no filtro do Gmail não entra.** Um cliente novo com remetente fora do filtro passa batido. Revise os filtros quando entrar cliente novo.
4. **Mudança de data pelo cliente** (ex.: "a sessão foi adiada para dia 25") gera um evento **novo**; o antigo não é apagado. Apague o antigo à mão. A confirmação no Telegram vai mostrar o novo.
5. **O que foi e o que não foi verificado:** os dois JSONs foram importados num n8n 2.35.7 real, e cada nó foi conferido contra o código-fonte do n8n (tipos, versões, nomes de parâmetro). A lógica tem 31 testes automatizados (19 de pedidos/confirmação e 12 de lembretes). **Mas nada rodou contra Gmail, Google Agenda, Groq ou Telegram de verdade** (não havia credenciais). O passo 8 é obrigatório.
6. **Qualidade do modelo.** O `openai/gpt-oss-120b` do Groq é mais fraco que o Claude para ler datas em português e escolher a data certa num e-mail de edital. Para compensar, o robô manda junto um calendário dos próximos 60 dias, e as checagens de data são feitas em código, sem IA. Rode os 5 testes do passo 8 **várias vezes**: se errar a data principal ou "sexta que vem", troque de modelo.
7. **Lembretes dependem do n8n estar no ar.** Se o servidor cair, ninguém avisa (o 🚨 "lembretes PARADOS" só cobre falha ao ler a agenda, não o servidor desligado). O lembrete do Google Agenda continua como segunda camada, por isso **não desative as notificações dele**.
8. **Limite do plano gratuito do Groq:** cerca de 8 mil tokens por minuto e 1.000 pedidos por dia. Um e-mail com o edital inteiro colado pode estourar o limite por minuto. Nesse caso o robô tenta de novo 3 vezes, com 30s de espera; se ainda falhar, chega o e-mail 🚨 "NÃO agendado". Se isso acontecer com frequência, passe para o plano pago (Developer).

## Custos estimados

| Item | Custo |
|---|---|
| n8n Cloud Starter | ~€24/mês (ou VPS ~R$30/mês) |
| Groq (`openai/gpt-oss-120b`) | grátis no plano gratuito; no pago, frações de centavo por pedido |
| Gmail / Google Agenda / Telegram | grátis |

Para trocar de modelo, edite `model` em `src/02_montar_requisicao.js`. Use só modelos do Groq que aceitem o modo `strict` (hoje: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`). Outros modelos podem devolver um JSON quebrado.

## Próximas fases
- ~~Lembretes fora do Google Agenda~~ ✅ feito (Telegram).
- ~~Confirmação pelo Telegram~~ ✅ feito.
- **Fase 2:** entrada pelo WhatsApp oficial (WhatsApp Cloud API), com a Naty **encaminhando** os pedidos para o número do bot.
- **Fase 3:** ligação automática (Twilio) 6h antes de eventos não confirmados e resumo diário às 7h com os serviços do dia e do dia seguinte.
