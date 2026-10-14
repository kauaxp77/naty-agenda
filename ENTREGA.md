# Entrega para a Naty

Roteiro para o robô passar a funcionar **em nome da Naty**: WhatsApp na conta da Meta da empresa dela e Google na conta dela. Hoje tudo roda nas contas do desenvolvedor, com o número de teste da Meta.

Decisões (14/10/2026): o WhatsApp fica no portfólio empresarial da Naty, com o desenvolvedor como administrador. Se o desenvolvedor sair do projeto, o número continua com ela, e o bloqueio da conta pessoal dele na Meta não afeta a cliente. A agenda e os e-mails usam a conta Google dela: os alarmes que o robô grava só tocam para a conta que criou o evento.

Quem faz: **D** = desenvolvedor · **N** = Naty · **C** = Claude (pelo banco do n8n, sem reiniciar nada).

## 0. O que pedir à Naty antes de começar

| Item | Para quê |
|---|---|
| Um **chip novo**, ou um número cujo WhatsApp tenha sido apagado | Número do robô. Não pode estar em uso no app do WhatsApp |
| Razão social, CNPJ, endereço e telefone da empresa | Portfólio empresarial na Meta |
| Cartão CNPJ ou contrato social em PDF | Verificação da empresa na Meta (recomendada) |
| Os números de WhatsApp que podem mandar pedidos (ela e quem mais) | `whatsapp_autorizados`. Número fora da lista é ignorado |
| O e-mail dela | Respostas, avisos e lembretes (`email_naty`) |
| Os e-mails da equipe | Convite do Google e lembretes por e-mail (`emails_equipe`). Pode ficar vazio |
| 20 minutos dela junto com o desenvolvedor | Os logins da Meta e do Google |

## 1. WhatsApp na conta da empresa (cerca de 1 hora)

1. **N:** em https://business.facebook.com, criar o **portfólio empresarial** com os dados da empresa. Depois, **Configurações → Pessoas → Adicionar**: o e-mail do desenvolvedor, com **controle total**.
   Recomendado: **Central de segurança → Verificação da empresa**, com o cartão CNPJ. Portfólio novo, sem verificação, é o perfil que a Meta mais bloqueia (foi o erro 131031 de 14/10).
2. **D:** em https://developers.facebook.com, **Criar app** → caso de uso WhatsApp → **portfólio da Naty** → nome `Agenda Naty`. Anote o **ID do app** e a **chave secreta** (Configurações do app → Básico). Detalhes no [SETUP, passo 1](SETUP.md#1-app-do-whatsapp-na-meta).
3. **D + N:** **número próprio**, como no [SETUP, passo 12](SETUP.md#12-trocar-o-número-de-teste-por-um-número-próprio): WhatsApp → Configuração da API → **Adicionar número de telefone** → nome de exibição (o nome da empresa; a Meta aprova) → código por SMS ou ligação no chip. Anote o **ID da conta do WhatsApp Business** e o **ID do número**.
   Se o envio falhar com o erro `133010` (número não registrado): no [Explorador da Graph API](https://developers.facebook.com/tools/explorer), `POST <ID do número>/register` com o corpo `{"messaging_product": "whatsapp", "pin": "<6 dígitos>"}`. Guarde o PIN: ele vira a verificação em duas etapas do número.
4. **D:** **token permanente** no portfólio da Naty, como no [SETUP, passo 2](SETUP.md#2-token-permanente-do-whatsapp): usuário do sistema → atribuir o app e a conta do WhatsApp com controle total → gerar token com validade **Nunca**.
5. **D:** no n8n, atualizar as duas credenciais (sem mandar nada para o Claude):
   - **WhatsApp OAuth account:** ID e chave secreta do app **novo**;
   - **WhatsApp account:** token **novo** e ID da conta do WhatsApp **nova**.
6. **D:** no workflow 1, **desligar e ligar** a chave de ativação. É na ativação que o n8n registra o webhook no app novo. Fechar o n8n.
7. **D:** ligar a conta do WhatsApp ao app novo: `POST <ID da conta>/subscribed_apps` no Explorador da Graph API, como no [SETUP, passo 9](SETUP.md#9-ativar). A resposta esperada é `{"success": true}`.
8. **D:** do seu WhatsApp, mandar `oi` para o número novo. Deve chegar o menu com os botões. **C** confere a execução.

O número novo não tem lista de destinatários: qualquer número em `whatsapp_autorizados` conversa com ele.

## 2. Google na conta da Naty (15 minutos)

O app OAuth já está publicado (14/10), então qualquer conta Google pode autorizar.

1. **D + N:** n8n → Credentials → **Gmail account** → **Sign in with Google** → na janela, **Usar outra conta** → a Naty entra com a conta dela → **Avançado → Acessar** → marcar todas as permissões → Continuar.
2. **D + N:** o mesmo em **Google Calendar account**. Fechar o n8n.
3. **N:** no celular dela, o app Google Agenda logado nessa conta, com as notificações liberadas, e o número do robô salvo como "Agenda". Detalhes no [SETUP, passo 10](SETUP.md#10-celular-da-naty).

A partir daqui, os eventos vão para a agenda principal dela, e os e-mails do robô saem do Gmail dela.

## 3. Configuração final (C)

Com os dados da seção 0, o Claude troca a configuração nos dois workflows, pelo banco, sem reiniciar:

- `email_naty` (workflows 1 e 2);
- `whatsapp_autorizados`: a Naty e a equipe. O número do desenvolvedor fica até o fim da semana de testes;
- `emails_equipe`.

## 4. Teste com a Naty (30 minutos)

Do celular dela, o roteiro do [SETUP, passo 11](SETUP.md#11-testes): encaminhar um pedido real, mandar `agenda`, mandar um áudio. Conferir o evento verde na agenda dela, o alarme no celular e, no dia seguinte, o e-mail de lembrete. Apagar os eventos de teste no final.

## 5. Entregar

- **Guia de uso:** [`docs/apresentacao/guia-da-naty.pdf`](docs/apresentacao/guia-da-naty.pdf). Antes de imprimir ou enviar, colocar o número do robô e o contato de suporte (`guia-da-naty.html`, ver o [LEIA-ME](docs/apresentacao/LEIA-ME.md)).
- **Formulário de reserva:** o link está no guia. O usuário e a senha (credencial Basic Auth do n8n) vão para ela **à parte**, nunca no PDF.
- **Suporte:** os alertas ("NÃO agendado", "resposta não entregue", "lembretes PARADOS") chegam no e-mail dela. Combinar que ela encaminha para o suporte. A rotina semanal do [OPERACAO](docs/OPERACAO.md#rotina-semanal-5-minutos) fica com o desenvolvedor.
- **Custos:** hoje, zero. Render, Supabase e Groq estão no plano grátis, e responder pelo WhatsApp em até 24 horas é grátis. Limites em [OPERACAO](docs/OPERACAO.md#limites-do-plano-grátis).

## 6. Depois da entrega

- Tirar o número do desenvolvedor de `whatsapp_autorizados`, se não for mais testar.
- Apagar o app antigo (portfólio do desenvolvedor) e os eventos de teste da agenda dele (ex.: Pregão 45/2026, 22/11).
- Fora desta entrega: lembretes pelo WhatsApp (mensagens pagas, com modelo aprovado), leitura de áudio, leitura do PDF do edital, notas fiscais.
