# Configuração

Passo a passo para deixar os dois workflows funcionando: WhatsApp, credenciais, importação, celular da Naty e testes. Visão geral do sistema no [README](README.md).

**Pré-requisito:** o n8n no ar com HTTPS em https://naty-n8n.onrender.com, com a conta de dono criada. Veja [`deploy/RENDER.md`](deploy/RENDER.md).

| Passo | O quê | Tempo |
|---|---|---|
| 1 | [App do WhatsApp na Meta](#1-app-do-whatsapp-na-meta) | 30 min |
| 2 | [Token permanente do WhatsApp](#2-token-permanente-do-whatsapp) | 10 min |
| 3 | [Rótulo e filtros no Gmail](#3-rótulo-e-filtros-no-gmail) | 5 min |
| 4 | [Chave do Groq](#4-chave-do-groq) | 3 min |
| 5 | [Credenciais do Google](#5-credenciais-do-google) | 15 min |
| 6 | [Credenciais do WhatsApp no n8n](#6-credenciais-do-whatsapp-no-n8n) | 5 min |
| 7 | [Importar o workflow 1 (pedidos)](#7-importar-o-workflow-1-pedidos) | 5 min |
| 8 | [Importar o workflow 2 (lembretes)](#8-importar-o-workflow-2-lembretes) | 5 min |
| 9 | [Ativar](#9-ativar) | 1 min |
| 10 | [Celular da Naty](#10-celular-da-naty) | 5 min |
| 11 | [Testes](#11-testes) | 20 min |
| 12 | [Trocar o número de teste por um número próprio](#12-trocar-o-número-de-teste-por-um-número-próprio) | 30 min |
| 13 | [Opcional: conectar o n8n ao Claude (MCP)](#13-opcional-conectar-o-n8n-ao-claude-mcp) | 5 min |

---

## 1. App do WhatsApp na Meta

O robô usa a **API oficial do WhatsApp** (WhatsApp Cloud API, da Meta). Para começar, a Meta dá um **número de teste grátis**, sem chip. Ele só conversa com até 5 números que você cadastrar, o que basta para testar. O número definitivo fica para o passo 12.

1. Entre em https://developers.facebook.com com uma conta do Facebook. Se for o primeiro acesso, aceite se cadastrar como desenvolvedor.
2. **Meus apps → Criar app.** Caso de uso: **"Conectar-se com clientes pelo WhatsApp"**. Nome: `Agenda Naty`. Se pedir um **portfólio empresarial**, crie um com o nome da empresa.
3. No app, abra **WhatsApp → Configuração da API** (*API Setup*):
   - em **"Para"** (*To*), adicione o seu número e o da Naty e confirme cada um com o código que chega no WhatsApp. **Celular de DDD fora de 11–19, 21, 22, 24, 27 e 28** (ex.: 61, Brasília): adicione **também sem o 9** depois do DDD (`+55 61 8123-4567`). Nesses DDDs o WhatsApp identifica o celular pelo número antigo, de 8 dígitos; o robô responde para esse número, e a Meta recusa a resposta (erro 131030) se só a forma com o 9 estiver na lista. Isso só vale para o número de teste; com número próprio não existe lista;
   - anote o **ID da conta do WhatsApp Business** (*WhatsApp Business Account ID*). O ID do número não precisa: o robô responde pelo número que recebeu a mensagem;
   - o **token de acesso temporário** desta tela vale só 24 horas. Serve para o primeiro teste; o permanente é o passo 2.
4. **Configurações do app → Básico:** anote o **ID do aplicativo** e a **Chave secreta do aplicativo** (clique em *Mostrar*). A chave secreta é senha: vai só para a credencial do n8n (passo 6).

> Não configure o *webhook* à mão nesta tela. O n8n faz isso sozinho quando o workflow 1 for ativado (passo 9).

## 2. Token permanente do WhatsApp

O token temporário vence em 24h. Quando vence, o robô continua agendando, mas a resposta pelo WhatsApp falha e o aviso chega **por e-mail**, com a nota "a resposta pelo WhatsApp falhou". Para não depender disso, crie um token que não vence:

1. https://business.facebook.com → **Configurações** → **Usuários → Usuários do sistema → Adicionar**. Nome: `n8n`. Função: **Administrador**.
2. No usuário criado, **Atribuir ativos**:
   - **Apps → Agenda Naty** → controle total;
   - **Contas do WhatsApp** → a conta do app → controle total.
3. **Gerar token** → app **Agenda Naty** → validade **Nunca** → permissões `whatsapp_business_messaging` e `whatsapp_business_management` → **Gerar**.
4. Copie o token **na hora**: ele só aparece uma vez. Ele é senha e vai direto para a credencial do n8n (passo 6).

## 3. Rótulo e filtros no Gmail

Pedidos que chegam por e-mail entram sem encaminhar nada:

1. No Gmail que recebe os pedidos, crie o rótulo **`pedidos-licitacao`**.
2. Crie filtros (Configurações → Filtros) que apliquem o rótulo aos e-mails dos clientes, por remetente ou por palavras como "pregão", "sessão", "edital".
3. E-mail **sem** o rótulo **não é processado**. Nesse caso, encaminhe o texto ao WhatsApp do robô.

## 4. Chave do Groq

1. Crie a chave em https://console.groq.com → **API Keys**.
2. Em **Settings → Data Controls**, ative a **retenção zero de dados** (Zero Data Retention), se disponível: são dados de clientes.
3. No n8n: **Credentials → New → Header Auth**
   - Name: `Authorization`
   - Value: `Bearer gsk_…` (a palavra `Bearer`, um espaço e a chave)

## 5. Credenciais do Google

O n8n roda no seu próprio servidor (Render), então o login com Google precisa de um projeto seu no Google Cloud:

1. https://console.cloud.google.com → crie um projeto (ex.: "naty-n8n").
2. **APIs & Services → Library:** ative **Gmail API** e **Google Calendar API**.
3. **OAuth consent screen:** tipo *External*, preencha nome e e-mail, adicione o seu e-mail como usuário de teste.
4. **Credentials → Create credentials → OAuth client ID → Web application.** Em *Authorized redirect URIs*, cole:
   `https://naty-n8n.onrender.com/rest/oauth2-credential/callback`
   (é o endereço que o n8n mostra na tela da credencial; confira se bate).
5. No n8n, crie duas credenciais com o Client ID e o Client Secret e clique em **Sign in with Google**:
   - **Gmail OAuth2:** conta que recebe os pedidos e envia os avisos e lembretes.
   - **Google Calendar OAuth2:** conta **da agenda que a Naty olha no celular**.

> ⚠️ **Armadilha:** com a tela de consentimento em modo **Testing**, o Google derruba o login **a cada 7 dias** e tudo para: agenda, avisos e lembretes. O próprio e-mail de alerta usa o mesmo login, então **nem o alerta sai**. Em **OAuth consent screen** (ou *Público-alvo*), clique em **Publish app** para passar a *In production*. Se o botão estiver desativado, preencha antes a tela **Branding**. Para uso próprio não precisa da verificação do Google; basta aceitar o aviso de "app não verificado" no login.

> **Recomendado:** crie no Google Agenda um calendário só para os serviços (ex.: "Serviços Naty") e use o ID dele nos dois workflows (Configurações do calendário → *Integrar agenda*). Assim, até eventos criados à mão recebem lembretes (passo 8).

## 6. Credenciais do WhatsApp no n8n

São duas, porque a Meta separa "receber" de "enviar":

| Credencial (Credentials → New) | Campos | Usada para |
|---|---|---|
| **WhatsApp OAuth API** | *Client ID* = **ID do aplicativo**; *Client Secret* = **chave secreta do aplicativo** (passo 1.4) | Receber as mensagens. Com a chave secreta, o n8n confere que cada mensagem veio mesmo da Meta. |
| **WhatsApp API** | *Access Token* = **token** (passo 2, ou o temporário para o primeiro teste); *Business Account ID* = **ID da conta do WhatsApp Business** (passo 1.3) | Responder na conversa |

## 7. Importar o workflow 1 (pedidos)

1. n8n → **Workflows → Import from File** → `workflow-naty-agenda.json`.
2. Abra o nó **"Normalizar entrada"** e edite o bloco `CONFIG` no topo:

   | Chave | Valor |
   |---|---|
   | `email_naty` | recebe as respostas dos pedidos que chegam por e-mail ou formulário, e os avisos quando o WhatsApp falha |
   | `whatsapp_autorizados` | quem pode mandar pedidos ao robô: DDI + DDD + número, só dígitos. Ex.: `['5511987654321', '5511912345678']`. Mensagem de outro número é ignorada, sem resposta. |
   | `emails_equipe` | quem recebe o convite do evento e os lembretes por e-mail, além da Naty. Ex.: `['joao@empresa.com']`. Vazio = só a Naty. |
   | `calendario_id` | `primary` ou o ID do calendário de serviços |
   | `duracao_padrao_horas` | duração quando o pedido não diz a hora de término (padrão 2) |

3. Selecione a credencial em cada nó:

   | Nó | Credencial |
   |---|---|
   | WhatsApp: novo pedido | WhatsApp OAuth API |
   | WhatsApp: agendado · WhatsApp: NÃO agendado | WhatsApp API (o *Credential Type* já vem como `WhatsApp API`) |
   | Gmail: novo pedido · E-mail: agendado · E-mail: NÃO agendado | Gmail OAuth2 |
   | Groq: extrair dados | Header Auth (`Authorization`) |
   | Criar evento na agenda | Google Calendar OAuth2 (o *Credential Type* já vem como `Google Calendar OAuth2 API`) |

## 8. Importar o workflow 2 (lembretes)

1. **Import from File** → `workflow-naty-lembretes.json`.
2. Nó **"Configuração"**:

   | Chave | Valor |
   |---|---|
   | `email_naty` | recebe todos os lembretes |
   | `calendario_id` | **o mesmo** do workflow 1 |
   | `apenas_eventos_do_robo` | `true` se for o calendário pessoal (senão ela recebe lembrete do dentista). `false` com um calendário só de serviços: aí os eventos criados à mão também recebem lembrete (só para a Naty; convidados só recebem nos eventos criados pelo robô). |
   | `antecedencias_min` | padrão `[2880, 1440]` (2 dias e 1 dia antes). Ex.: `[2880, 1440, 360]` para também 6h antes. |

3. Credenciais:

   | Nó | Credencial |
   |---|---|
   | Ler agenda (próximas 49h) · Marcar lembrete como enviado | Google Calendar OAuth2 |
   | Enviar lembrete por e-mail · Avisar: lembretes PARADOS | Gmail OAuth2 |

## 9. Ativar

Ligue a chave **Active** (ou **Publish**) no topo de **cada um** dos dois workflows. A partir daí:
- o workflow 1 registra o seu endereço no app da Meta e passa a receber o WhatsApp; verifica o Gmail a cada minuto; o formulário passa a usar a *Production URL*;
- o workflow 2 roda a cada 10 minutos.

> **Depois de ativar, ligue a conta do WhatsApp ao app** (uma vez só). Sem isso, o botão *Testar* do painel da Meta chega ao n8n, mas as mensagens reais não chegam: https://developers.facebook.com/tools/explorer → app **Agenda Naty** → permissões `whatsapp_business_management` e `whatsapp_business_messaging` → **Generate Access Token** → troque GET por **POST** → endereço `<ID da conta do WhatsApp Business>/subscribed_apps` → **Enviar**. A resposta deve ser `{"success": true}`. (Achado no primeiro teste, em 14/10/2026: o n8n registra o webhook no app, mas não liga a conta.)

> O gatilho do WhatsApp **só funciona com o workflow ativo**. Evite o botão de teste ("Listen for test event") nesse nó: ele registra um endereço provisório no app da Meta, e cada app aceita **um** endereço só. Se aparecer *"already has a webhook subscription"*, veja `docs/OPERACAO.md`.

## 10. Celular da Naty

- **WhatsApp:** salve o número do robô como contato (ex.: "Agenda"). Para mandar um pedido, ela segura a mensagem do cliente → **Encaminhar** → "Agenda".
- **Google Agenda:** app instalado, logado na conta do passo 5, notificações liberadas. Os alarmes de 2 dias, 1 dia, 12h e 6h antes vêm daqui. No iPhone, ative "Sensível ao tempo". No Android, deixe as notificações do app com prioridade alta e, se ela usa o Não Perturbe, adicione o Google Agenda como exceção.
- **E-mail:** os lembretes e avisos chegam no `email_naty`. Confira se não caem no spam na primeira semana.

## 11. Testes

**Pedidos pelo WhatsApp:** mande cada mensagem do seu WhatsApp (número em `whatsapp_autorizados`) para o número do robô. A resposta chega na mesma conversa em alguns segundos. Confira também a agenda.

| Mensagem | Resultado esperado |
|---|---|
| `Bom dia Naty! Preciso de representante na sessão do Pregão Eletrônico 45/2026 da Prefeitura de Campinas, dia 20/11 às 9h. Obrigado, Carlos` | "✅ Agendado", sexta 20/11 09:00; evento **verde** |
| `Naty, a visita técnica é na segunda-feira, 19/11, às 14h na Sabesp de Santos` | "⚠️ Agendei, mas CONFIRA a data": **CONFLITO DE DATA** (19/11/2026 é quinta); evento **vermelho** |
| Uma mensagem com `amanhã às 15h`, **encaminhada** (botão Encaminhar) | ⚠️ com o aviso de mensagem encaminhada; evento vermelho |
| `Impugnação até 10/11, abertura das propostas 14/11 às 10h, precisamos de você na disputa dia 18/11 às 9h30` | Data principal 18/11 09:30; as outras listadas na resposta |
| Um áudio | "🚨 NÃO agendei: … só leio mensagens de texto" |
| `Oi, tudo bem? Depois a gente se fala` | "🚨 NÃO agendei" |
| Qualquer mensagem de um número **fora** da lista | Nenhuma resposta |

Rode os casos **mais de uma vez**: a IA pode variar. Se ela errar a data principal ou "amanhã", anote e reavalie o modelo (veja `docs/DECISOES.md`, D5).

**Pedidos por e-mail e formulário:** aplique o rótulo `pedidos-licitacao` a um e-mail de teste, ou cole um texto no formulário (*Production URL* do nó "Formulário: colar pedido"). A resposta chega **por e-mail** no `email_naty`.

**Convite:** com `emails_equipe` preenchido, cada pessoa da lista recebe o convite do Google ao criar o evento.

**Lembretes:** mande um pedido para **daqui a umas 30 horas**. No workflow 2, clique em **Execute workflow**: deve chegar o e-mail "📅 Faltam 1 dia e 6h: …" (ou parecido) no `email_naty` e na equipe. Execute de novo: **não** deve chegar outro. Mude a hora do evento na agenda para o dia seguinte e execute de novo: deve voltar a chegar.

Apague os eventos de teste no final.

## 12. Trocar o número de teste por um número próprio

O número de teste só conversa com os números cadastrados em "Para" e não é para uso definitivo. Para o número do robô:

1. Um número **exclusivo**, que **não esteja** em uso no aplicativo do WhatsApp (nem no WhatsApp Business). Um chip novo resolve. Se o número já estiver no WhatsApp, é preciso apagar a conta dele no aplicativo antes.
2. No app da Meta: **WhatsApp → Configuração da API → Adicionar número de telefone**. Informe o nome de exibição (a Meta aprova) e confirme por SMS ou ligação.
3. No n8n, nada muda: o robô responde pelo mesmo número que recebeu a mensagem.
4. Mande uma mensagem de teste. **Se ela não chegar no n8n** (nenhuma execução nova), ligue a conta do WhatsApp Business ao app como no passo 9 (`<ID da conta>/subscribed_apps`).

> Responder pedidos dentro de 24 horas da mensagem recebida é **grátis**. A Meta pode pedir uma forma de pagamento na conta; ela só seria usada para mensagens que a empresa inicia (ex.: lembretes pelo WhatsApp), que este sistema ainda não manda.

## 13. Opcional: conectar o n8n ao Claude (MCP)

Permite que o Claude veja e rode os workflows do seu n8n, por exemplo para testar o formulário ou investigar uma execução com erro.

1. n8n → **Settings → Instance-level MCP** → ative **Enable MCP access** (precisa ser o dono).
2. Em cada workflow que o Claude deve enxergar, ative a disponibilidade no MCP nas configurações do workflow. **Por padrão, nenhum fica exposto.**
3. Em **Connect a client**, copie a **Server URL** (termina em `/mcp-server/http`).
4. Em https://claude.ai/customize/connectors, adicione um conector personalizado com essa URL e faça o login.
5. Abra uma **sessão nova** do Claude (os conectores são carregados no início da sessão).

> O MCP do n8n consegue rodar, criar, publicar e despublicar workflows. Exponha só os dois da Naty. Pelo MCP, só disparam workflows com gatilho de formulário, agendamento, webhook, chat ou manual: os gatilhos do Gmail e do WhatsApp ficam de fora.

---

Problemas depois de configurado? Veja [`docs/OPERACAO.md`](docs/OPERACAO.md).
