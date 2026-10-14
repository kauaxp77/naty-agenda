# Operação

Manual do dia a dia: o que conferir, o que fazer quando chega um alerta, onde ver logs e como manter o sistema.

- [Painéis e endereços](#painéis-e-endereços)
- [Rotina semanal (5 minutos)](#rotina-semanal-5-minutos)
- [Quando chega um alerta](#quando-chega-um-alerta)
- [Problemas comuns](#problemas-comuns)
- [Deploy e atualização do n8n](#deploy-e-atualização-do-n8n)
- [Senhas e chaves](#senhas-e-chaves)
- [Backup e recuperação](#backup-e-recuperação)
- [Limites do plano grátis](#limites-do-plano-grátis)
- [Quando sair do plano grátis](#quando-sair-do-plano-grátis)

---

## Painéis e endereços

| O quê | Onde |
|---|---|
| n8n (editor e execuções) | https://naty-n8n.onrender.com |
| Serviço no Render | https://dashboard.render.com/web/srv-db3ra6jtqb8s73f3t9lg |
| Banco no Supabase | https://supabase.com/dashboard/project/umbtzzxqcblurjthpydg |
| Repositório | https://github.com/kauaxp77/naty-agenda |
| Monitor de disponibilidade | https://cron-job.org (tarefa batendo em `/healthz`) |
| Chave da IA | https://console.groq.com |
| App da Meta (WhatsApp) | https://developers.facebook.com/apps → app do robô → WhatsApp |
| Token permanente do WhatsApp | https://business.facebook.com → Configurações do negócio → Usuários do sistema |

## Rotina semanal (5 minutos)

1. **cron-job.org:** o histórico da tarefa `/healthz` está todo verde? Um vermelho isolado é normal (reinício do Render); vários seguidos, não.
2. **n8n → Executions:** filtre por **Error**. Execução com erro sem ter gerado um 🚨 é sinal de algo novo. Olhe também o workflow "Lembretes por e-mail": se o acesso ao Google cair, o e-mail "lembretes PARADOS" também falha, e o problema só aparece aqui.
3. **n8n:** o workflow 1 está **ativo**? Sem isso, o WhatsApp não chega.
4. **Agenda:** há eventos vermelhos `⚠️ VERIFICAR` ainda não corrigidos? Conferir a data com o cliente, corrigir no evento e tirar o `⚠️ VERIFICAR:` do título.

## Quando chega um alerta

### 🚨 "NÃO agendei este pedido" (WhatsApp) ou "Pedido NÃO agendado — agende manualmente" (e-mail)
O robô recebeu o pedido mas não conseguiu agendar. A mensagem traz o **motivo**; o e-mail traz também o **texto original**.

1. **Agende à mão agora**, com base no texto original.
2. Veja o motivo:
   - *"Recebi um áudio / uma imagem / um arquivo…"*: o robô só lê texto. Mande o pedido escrito, ou encaminhe a mensagem de texto do cliente.
   - *"Não encontrei um pedido de serviço com data"* / *"Não consegui identificar a data"*: o texto não tinha data clara. Confirme a data com o cliente.
   - *"Falha na chamada à IA"* com `429` / `rate_limit`: limite do plano grátis do Groq (mensagem muito longa, ou muitos pedidos no mesmo minuto). Se acontecer com frequência, veja [Limites](#limites-do-plano-grátis).
   - *"Falha na chamada à IA"* com `401`: a chave do Groq expirou ou foi revogada. Crie outra e atualize a credencial no n8n.
   - *"Erro ao criar o evento no Google Agenda"*: veja [Google desconectado](#google-desconectado).
3. Se o evento criado à mão estiver no calendário pessoal e o workflow 2 estiver com `apenas_eventos_do_robo: true`, ele **não terá lembretes por e-mail**, só os alarmes do app do Google Agenda. Alternativa: mandar o pedido de novo ao robô (WhatsApp ou formulário) quando o problema for resolvido.

### ⚠️ "Agendei, mas CONFIRA a data"
O evento foi criado, mas **vermelho**, com `⚠️ VERIFICAR:` no título: o robô encontrou uma dúvida real sobre a data (sem horário, conflito com o dia da semana, data passada ou distante, IA incerta, mensagem encaminhada com "amanhã"). A lista de alertas está na resposta e na descrição do evento.

1. Confira a data com o cliente.
2. Abra o evento pelo link e corrija data e hora, se preciso. Os lembretes se ajustam sozinhos.
3. Tire o `⚠️ VERIFICAR:` do título (e, se quiser, troque a cor para verde). Enquanto o título começar com ⚠️, os e-mails de lembrete avisam que a data pode estar errada.

### ✉️ E-mail com a nota "a resposta pelo WhatsApp falhou"
O pedido foi processado, mas o robô não conseguiu responder no WhatsApp; o aviso foi por e-mail. O motivo está na nota. Veja [O robô não respondeu no WhatsApp](#o-robô-não-respondeu-no-whatsapp). O mais comum é o token temporário vencido.

### ⚠️ "Resposta do WhatsApp NÃO entregue"
A Meta aceitou a resposta do robô e depois não entregou. O pedido pode ter entrado na agenda normalmente; quem mandou é que não recebeu a confirmação.

1. Confira na agenda se o pedido entrou (o e-mail traz o horário) e, se precisar, avise a pessoa por outro meio.
2. Veja o código no e-mail:
   - `131031` (*Business Account locked*): a Meta bloqueou a conta do WhatsApp Business. Nenhuma resposta chega até a conta ser liberada. Central de suporte para empresas da Meta (business.facebook.com/business-support-home) → veja a restrição e peça análise. Visto em 14/10/2026, no número de teste.
   - `131047`: mais de 24h desde a última mensagem da pessoa para o robô. Fora dessa janela só vai mensagem paga, com modelo aprovado.
   - `131026`: o número não pôde receber (WhatsApp desatualizado, número sem WhatsApp ou que não aceitou os termos).
3. Este aviso sai pelo Gmail: se o acesso ao Google cair, ele também não chega.

### 🚨 "Os lembretes da agenda estão PARADOS"
O workflow 2 não conseguiu ler a Agenda Google. **Enquanto isso, nenhum lembrete por e-mail sai.** Os alarmes do app do Google Agenda continuam funcionando.

1. Abra o n8n → Executions do workflow "Naty – Lembretes por e-mail" → a execução com erro → nó "Ler agenda (próximas 49h)".
2. Causas comuns:
   - `401` / `invalid_grant`: login do Google expirou. Veja [Google desconectado](#google-desconectado).
   - `404`: `calendario_id` errado no nó "Configuração".
3. Depois de corrigir, rode o workflow manualmente uma vez. Os lembretes atrasados saem em **um** e-mail por evento.

> Se o problema for o acesso ao Google, este e-mail também pode não chegar (Gmail e Agenda usam o mesmo app OAuth). Por isso a rotina semanal confere as execuções.

### ✉️ E-mail do cron-job.org: "falhou"
O n8n não respondeu ao `/healthz`, então **nada está rodando**: nem pedidos, nem lembretes.

1. Render → serviço `naty-n8n` → **Events**: houve deploy com falha? O serviço foi suspenso?
2. Render → **Logs**: procure `Out of memory`, `ECONNREFUSED`, `password authentication failed`, `Timed Out`.
3. Veja [O n8n não sobe](#o-n8n-não-sobe).

## Problemas comuns

### O n8n não sobe
| Sintoma nos logs do Render | Causa | Solução |
|---|---|---|
| `429 Too Many Requests` ao baixar a imagem | Limite do registro de imagens | O `Dockerfile` já usa o Docker Hub (`n8nio/n8n`). Se o Docker Hub também limitar, aguarde e rode **Manual Deploy**. |
| `No open ports detected` … `Timed Out`, sem erro | n8n travou antes de abrir a porta | Veja se ele conectou no banco: no Supabase, `select state, query from pg_stat_activity where usename = 'n8n'`. Veja o histórico em [`DECISOES.md`](DECISOES.md#d10-o-n8n-cria-o-próprio-schema-no-banco). |
| `password authentication failed for user "n8n"` | Senha errada na variável `DB_POSTGRESDB_PASSWORD` | Corrija no Render ou troque a senha (veja [Senhas e chaves](#senhas-e-chaves)). |
| `ENOTFOUND` / `ENETUNREACH` no host do banco | Host errado, ou conexão direta (IPv6) em vez do pooler | Use o host do **Session pooler**, porta 5432, usuário `n8n.umbtzzxqcblurjthpydg`. |
| `Tenant or user not found` | Usuário sem o sufixo `.umbtzzxqcblurjthpydg` | O pooler exige `usuario.ID-do-projeto`. |
| `Task runner connection attempt failed: invalid or expired grant token` | O executor dos nós de código demorou mais que o prazo para iniciar (CPU fraca) | Aumentar `N8N_RUNNERS_GRANT_TOKEN_TTL` (hoje `180`). Sem o runner, **os nós Code falham** e os dois workflows param. |
| Página 502 por 1–2 min; em **Events**: *server_failed · oomKilled 512Mi* (não aparece nos logs do app) | 512 MB não bastaram | Reinicia sozinho. Se for frequente, veja [Quando sair do plano grátis](#quando-sair-do-plano-grátis). |
| `JavaScript heap out of memory` nos logs | O limite de memória do processo (`NODE_OPTIONS`) ficou baixo demais | Subir `--max-old-space-size` (hoje 300), sem passar de ~380 no plano grátis |

### Google desconectado
Credenciais OAuth do Google podem expirar. No n8n: **Credentials** → "Google Calendar OAuth2" / "Gmail OAuth2" → **Reconnect**.

> Se o projeto no Google Cloud estiver em modo **Testing**, o login cai **a cada 7 dias**. Em *OAuth consent screen*, clique em **Publish app** para passar a *In production* (veja o `SETUP.md`). Isso também vale para os lembretes: com o Google desconectado, nem o e-mail de alerta sai.

### O robô não respondeu no WhatsApp
Primeiro veja em n8n → Executions do workflow 1 se a mensagem chegou.

| Sintoma | Causa | Solução |
|---|---|---|
| Nenhuma execução | Workflow 1 **inativo**. O WhatsApp Trigger só recebe com o workflow ativo: é na ativação que o n8n registra o webhook na Meta | Ative o workflow 1. Depois de reimportar, ative de novo |
| Execução que para em "Normalizar entrada", sem resposta | Número fora de `whatsapp_autorizados` (ou foi só um aviso de entregue/lido) | Coloque o número no formato certo: DDI + DDD + número, só dígitos (ex.: `5511987654321`). Com ou sem o 9, as duas formas funcionam |
| Resposta chegou por e-mail, com a nota "a resposta pelo WhatsApp falhou" e erro `190` (token) | Token temporário do painel da Meta: **vence em 24h** | Crie um **token permanente** de Usuário do sistema (Gerenciador de Negócios → Usuários do sistema) e atualize a credencial "WhatsApp API" |
| Idem, com erro `131030` (destinatário fora da lista permitida) | O **número de teste** da Meta só envia para destinatários verificados (até 5). Em DDD fora de 11–19, 21, 22, 24, 27 e 28, o WhatsApp identifica o celular **sem o 9** (ex.: `556181234567`), e a lista só tem a forma com o 9 | Adicione o número à lista de destinatários (Meta → WhatsApp → Etapa 1 → "Para"). Nesses DDDs, adicione **também sem o 9**. Visto no 1º teste real, 14/10/2026 (DDD 61) |
| O robô agenda, mas a resposta não chega no WhatsApp, e chega o e-mail "Resposta do WhatsApp NÃO entregue" com `131031` | A Meta bloqueou a conta do WhatsApp Business. O envio é aceito e a falha só vem depois | Central de suporte para empresas da Meta → restrição da conta → pedir análise. Veja [Quando chega um alerta](#quando-chega-um-alerta) |
| Erro ao ativar: *already has a webhook subscription* | Só pode haver **um** WhatsApp Trigger por app da Meta. Outro workflow (ou um registro de teste) está com ele | Desative o outro workflow que usa o mesmo app, ou pare o teste no editor, e ative de novo |
| O *Testar* do painel da Meta chega ao n8n, mas mensagens reais não (nem no número de teste) | A conta do WhatsApp Business não está ligada ao app. O n8n registra o webhook no app, mas não faz essa ligação | `POST <ID da conta>/subscribed_apps` no Explorador da Graph API (SETUP.md, passo 9). Resposta esperada: `{"success": true}`. Visto no 1º teste real, 14/10/2026 |
| Resposta "só leio mensagens de texto" | Áudio, imagem, documento, vídeo ou figurinha | Comportamento esperado: mandar o pedido escrito |
| Formulário e webhook apontam para o endereço errado | `WEBHOOK_URL` / `N8N_HOST` errados no Render | Corrija no Render e desative/ative o workflow 1 |

### Editar um workflow direto no banco
**Não edite** `n8n.workflow_entity` com o editor do n8n aberto: o **autosave** da aba aberta sobrescreve a mudança segundos depois, mesmo trocando o `versionId` (aconteceu em 09/10/2026). Se precisar mesmo editar pelo banco, feche antes todas as abas do workflow e só reabra depois da alteração. O caminho normal é editar pelo editor, ou por `src/` + `build.js` e reimportar.

### O lembrete não chegou
- Por padrão, o e-mail sai **2 dias e 1 dia antes** (`antecedencias_min`). Os de 12h e 6h são só alarmes do app do Google Agenda, no celular do dono da agenda.
- Procure no spam e confira o `email_naty` no nó "Configuração" do workflow 2.
- O evento tem `naty_bot = 1`? Só eventos criados pelo robô recebem lembrete quando `apenas_eventos_do_robo = true`.
- Era um convidado? Só recebe quem é convidado de evento do robô e não recusou o convite.
- O n8n estava dormindo? Veja o histórico do cron-job.org.
- Execução do workflow 2 com erro? Veja n8n → Executions.

## Deploy e atualização do n8n

- **Como o serviço é construído:** o Render clona este repositório e constrói o `Dockerfile` (`FROM n8nio/n8n:2.42.5`). Toda a configuração vem das variáveis de ambiente do serviço.
- **Deploy automático:** **todo push na `main`** refaz o deploy, e o n8n fica alguns minutos fora do ar. A primeira subida num banco vazio leva ~5 min (migrações); as seguintes, ~2–4 min.
- **Mudou uma variável de ambiente?** O Render refaz o deploy sozinho.
- **Workflows reimportados?** Ative o workflow 1 de novo (registra o webhook do WhatsApp na Meta).
- **Workflow antigo "Naty – Lembretes no Telegram":** se ainda existir no n8n, desative e apague. Ele grava as mesmas marcas (`lembrete_2880`, `lembrete_1440`) e faria o workflow novo pular os e-mails.

### Evitar redeploy a cada push
Render → serviço → **Settings → Build & Deploy → Build Filters → Included Paths**: `Dockerfile`. Assim só uma mudança no `Dockerfile` refaz o deploy; documentação e workflows (que são importados à mão no n8n) não derrubam o serviço.

### Atualizar o n8n
A versão está **fixada** no `Dockerfile` (`n8nio/n8n:2.42.5`). Para atualizar:
1. Leia as notas da versão nova (docs.n8n.io → Release notes), procurando mudanças nos nós Gmail, WhatsApp Trigger, Form, Code, HTTP Request, IF e Schedule.
2. Troque a versão no `Dockerfile`, faça o commit e o push. O deploy roda sozinho.
3. Nos logs, confira `Version: …`, `Editor is now accessible` e a **ausência** de `Task runner connection attempt failed`.
4. Rode o roteiro de testes do `SETUP.md`.

### Health check
Render → **Settings → Health Check Path**: `/healthz`. Com isso, o Render só troca a versão antiga pela nova quando a nova responde, e reinicia o n8n se ele travar.

## Senhas e chaves

| Segredo | Onde fica | Como trocar |
|---|---|---|
| Senha do usuário `n8n` no banco | Render → variável `DB_POSTGRESDB_PASSWORD` | No Supabase (SQL Editor): `alter role n8n with password 'NOVA_SENHA';` → atualizar a variável no Render → deploy |
| `N8N_ENCRYPTION_KEY` | Render → variável + **cópia no gerenciador de senhas** | ⚠️ Trocar **invalida todas as credenciais salvas no n8n** (Google, Groq, WhatsApp), que precisam ser recriadas. Só é barato **antes** de criar as credenciais. |
| Chave do Groq | Credencial "Header Auth" dentro do n8n | console.groq.com → nova chave → atualizar a credencial |
| Token de acesso do WhatsApp | Credencial "WhatsApp API" dentro do n8n (token + ID da conta do WhatsApp Business) | Gerenciador de Negócios → Usuários do sistema → gerar novo token permanente (permissões do WhatsApp) → atualizar a credencial → revogar o antigo. O token temporário do painel vence em 24h: não use em produção |
| Chave secreta do app da Meta | Credencial "WhatsApp OAuth API" dentro do n8n (ID do app + chave secreta) | developers.facebook.com → app → Configurações → Básico → redefinir a chave secreta → atualizar a credencial → desativar e ativar o workflow 1 |
| Google (Gmail/Agenda) | Credenciais OAuth2 dentro do n8n | Reconnect |
| Conta de dono do n8n | Você | Senha forte + 2FA (Settings → Personal) |

## Backup e recuperação

| O quê | Onde está a cópia | Se perder |
|---|---|---|
| Workflows | **Este repositório** (`workflow-*.json`, gerados de `src/`) | Reimportar |
| Credenciais (Google, Groq, WhatsApp) | Só no banco, criptografadas com a `N8N_ENCRYPTION_KEY` | Recriar seguindo o `SETUP.md` (o token permanente do WhatsApp pode ser gerado de novo na Meta) |
| `N8N_ENCRYPTION_KEY` | Render + gerenciador de senhas | Credenciais precisam ser recriadas |
| Eventos e status de lembretes | **Google Agenda** (fica fora do n8n) | Não se perdem se o n8n cair |
| Histórico de execuções | Banco, 3 dias | Não é crítico |

O plano grátis do Supabase **não tem backup automático** que se possa baixar. Como os workflows estão no git e os eventos ficam no Google Agenda, perder o banco custa só recriar credenciais e a conta de dono.

**Recriar tudo do zero:** banco (veja o `deploy/RENDER.md`) → serviço no Render com as mesmas variáveis → conta de dono → credenciais e importação (veja o `SETUP.md`).

## Limites do plano grátis

| Serviço | Limite | O que acontece se estourar |
|---|---|---|
| Render (free) | 750 h/mês **por conta**, 512 MB, dorme após 15 min sem acesso | Acabou a cota: serviço suspenso até o mês virar. **Mantenha só um serviço grátis ativo** (o `Beto_Banco` está suspenso). |
| Supabase (free) | 500 MB de banco, 2 projetos ativos, projeto pausa após 7 dias sem uso | O n8n usa o banco o tempo todo, então não pausa. Histórico de execuções limitado a 3 dias para caber. |
| Groq (free, `gpt-oss-120b`) | ~30 req/min, ~1.000 req/dia, ~8.000 tokens/min | Pedido vira 🚨 "NÃO agendado" após 3 tentativas |
| WhatsApp Cloud API | Receber e responder dentro de 24h: grátis. Número de teste da Meta: envia só para até 5 destinatários verificados | Fora da janela de 24h, só com mensagem de modelo aprovado (paga). O robô não faz isso hoje |
| cron-job.org | Grátis | Se a conta for desativada, o n8n dorme |

## Quando sair do plano grátis

| Sinal | Upgrade | Custo aproximado |
|---|---|---|
| Dorme mesmo com o cron-job.org, ou está lento demais | Render **Starter** (não dorme, mais CPU). ⚠️ Continua com **512 MB**: não resolve falta de memória | ~US$ 7/mês |
| n8n encerrado por falta de memória com frequência | **VPS** com o `deploy/LEIA-ME.md` (2–4 GB por ~R$ 30/mês) ou Render Standard (2 GB) | ~R$ 30/mês ou US$ 25/mês |
| Muitos 🚨 por limite do Groq | Plano pago do Groq (Developer), ou trocar o modelo | centavos por pedido |
| Cliente quer lembretes no WhatsApp | Mensagens de modelo aprovadas pela Meta, iniciadas pelo robô | centavos por mensagem |
| Quer backup automático do banco | Supabase Pro | US$ 25/mês |
