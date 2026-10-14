# Registro de decisões

O porquê de cada escolha técnica, as alternativas descartadas e o preço pago por cada decisão. Ao mudar uma delas, registre aqui a nova decisão e o motivo.

| # | Decisão | Status |
|---|---|---|
| D1 | [n8n como motor da automação](#d1-n8n-como-motor-da-automação) | Em vigor |
| D2 | [Criar o evento antes da confirmação](#d2-criar-o-evento-antes-da-confirmação) | Revista em D13 |
| D3 | [Checagens de data em código, não na IA](#d3-checagens-de-data-em-código-não-na-ia) | Em vigor |
| D4 | [Agenda como fonte da verdade dos lembretes](#d4-agenda-como-fonte-da-verdade-dos-lembretes) | Em vigor |
| D5 | [Groq no lugar do Claude](#d5-groq-no-lugar-do-claude) | Em vigor |
| D6 | [Telegram para a Naty; WhatsApp só para clientes, depois](#d6-telegram-para-a-naty-whatsapp-só-para-clientes-depois) | Substituída por D13 |
| D7 | [Workflows gerados por código (`src/` + `build.js`)](#d7-workflows-gerados-por-código-src--buildjs) | Em vigor |
| D8 | [Hospedagem: Render grátis + Supabase](#d8-hospedagem-render-grátis--supabase) | Em vigor |
| D9 | [Imagem do n8n pelo Docker Hub](#d9-imagem-do-n8n-pelo-docker-hub) | Em vigor |
| D10 | [O n8n cria o próprio schema no banco](#d10-o-n8n-cria-o-próprio-schema-no-banco) | Em vigor |
| D11 | [Prazo maior para o executor dos nós de código](#d11-prazo-maior-para-o-executor-dos-nós-de-código) | Em vigor |
| D12 | [Economia de memória no plano grátis](#d12-economia-de-memória-no-plano-grátis) | Em vigor (em observação) |
| D13 | [WhatsApp oficial como entrada e resposta; Telegram removido](#d13-whatsapp-oficial-como-entrada-e-resposta-telegram-removido) | Em vigor |

---

## D1. n8n como motor da automação
**Contexto:** processo contínuo (roda 24h, reage a e-mails e horários), primeiro projeto de automação da empresa.
**Decisão:** n8n.
**Alternativas descartadas:**
- **Manus AI:** bom para tarefas pontuais, não para um processo que precisa rodar sozinho e de forma previsível 24h.
- **OpenClaw (agente com acesso amplo):** acesso amplo demais a contas da empresa para uma tarefa que é um fluxo fixo.
- **Código próprio:** mais trabalho de manutenção para quem não é desenvolvedor.

**Preço:** precisa de um servidor no ar (ver D8).

## D2. Criar o evento antes da confirmação
**Contexto:** o desenho inicial era "pedir confirmação → só então agendar". Se a Naty não respondesse, o evento nunca existiria, que é exatamente o tipo de falha que originou o projeto.
**Decisão:** o evento é criado na hora como `⏳ [A CONFIRMAR]`, já com os lembretes. A confirmação só muda o status (✅ ou ⚠️). Sem resposta em 24h → ⚠️.
**Preço:** um evento com data errada fica na agenda até alguém corrigir, mas visivelmente marcado e com alerta.
**Revisão (13/10/2026, D13):** o evento continua sendo criado na hora, mas não há mais etapa de confirmação. Ele nasce verde, ou vermelho com `⚠️ VERIFICAR:` quando há dúvida real sobre a data.

## D3. Checagens de data em código, não na IA
**Contexto:** modelos de linguagem erram com frequência a conta de dia da semana e a resolução de datas relativas.
**Decisão:**
- A IA **copia** o dia da semana citado e o trecho original da data; quem compara é o código (`src/03_validar.js`), que é testado.
- A IA recebe um **calendário pronto** de 60 dias para consultar, em vez de calcular.
- Data no passado, a mais de 6 meses, urgência < 48h e falta de horário viram alertas determinísticos.
- O código também filtra alertas falsos da IA: `data_relativa=true` com dia e mês escritos no trecho ("05/11 às 10:00") não gera alerta.
- Desde D13, os alertas que indicam dúvida real (sem horário, conflito de dia da semana, data passada ou a mais de 6 meses, IA incerta, encaminhada com data relativa) deixam o evento vermelho com `⚠️ VERIFICAR`. Urgência e data relativa digitada direto só informam.

**Correção (14/10/2026):** no primeiro pedido real pelo WhatsApp ("amanhã às 15h"), a IA deu confiança MÉDIA, como faz com toda data relativa, e o evento ficou vermelho. Todo "amanhã" digitado pela Naty ficaria vermelho. Agora confiança MÉDIA com data relativa digitada na hora (não encaminhada, sem dia e mês escritos) não deixa vermelho: a resposta já mostra o dia por extenso. O prompt também passou a pedir que a IA não liste a resolução do "amanhã" em `ambiguidades`.

**Correção (13/10/2026):** num teste real, a IA marcou "05/11 às 10:00" como data relativa e confiança média só porque o ano não estava escrito. A Naty receberia um alerta falso em quase todo pedido, e alerta que aparece sempre deixa de ser lido. O prompt passou a dizer que ano omitido é normal, e o código ignora o `data_relativa` nesse caso. Como ano omitido deixou de ser tratado como ambiguidade, o alerta "confira o ano" caiu de 1 ano para 6 meses: uma data que acabou de passar, escrita sem ano, vira a do ano seguinte (~11 meses à frente) e agora é pega.

**Preço:** nenhum relevante.

## D4. Agenda como fonte da verdade dos lembretes
**Contexto:** os lembretes poderiam ser agendados no momento da criação (um "wait" por lembrete no n8n), mas aí uma mudança de data feita na agenda não seria refletida, e uma queda do n8n perderia as esperas.
**Decisão:** o workflow 2 lê a agenda a cada 10 min e grava no próprio evento (`extendedProperties.private.lembrete_<min>`) **para qual horário de início** cada lembrete já foi enviado.
**Consequências boas:** remarcar ou apagar o evento na agenda ajusta os lembretes; queda do n8n vira **uma** mensagem atrasada, não várias; não há banco de dados extra.
**Preço:** até 10 min de atraso por lembrete; depende de o n8n estar acordado (ver D8).

## D5. Groq no lugar do Claude
**Contexto:** a primeira versão usava Claude (`claude-opus-5-5`), a uns US$ 0,02–0,05 por pedido (~US$ 3–5/mês). Decisão do dono do projeto: usar o Groq, que é grátis.
**Decisão:** Groq, `openai/gpt-oss-120b`, com `response_format` `strict` (JSON sempre válido).
**Compensações:** calendário de 60 dias na mensagem (D3) e checagens em código.
**Preço:** modelo mais fraco justamente na tarefa crítica (datas em português, escolher a data certa num edital com várias datas). Limites do plano grátis (~8 mil tokens/min). **Reavaliar** se aparecerem com frequência eventos `⚠️ VERIFICAR` ou datas erradas. A troca é uma linha em `src/02_montar_requisicao.js` (outro modelo `strict` do Groq) ou a volta para o Claude, que exige trocar o formato da requisição e da leitura da resposta.

## D6. Telegram para a Naty; WhatsApp só para clientes, depois
**Contexto:** lembrete do Google Agenda é notificação silenciável. WhatsApp não oficial tem risco de banimento do número; o oficial (Cloud API) dá mais trabalho para configurar.
**Decisão:** confirmações, lembretes e alertas vão para a Naty por um **bot do Telegram**: oficial, grátis, sem risco de banimento e com nós prontos no n8n. A confirmação usa *Send and Wait* com botões dentro do chat e aceita toques só do chat da Naty. Se o Telegram falhar, a confirmação vai por e-mail. O WhatsApp fica para a **entrada** de pedidos (Fase 2), com a Naty encaminhando os pedidos ao número do bot pela API oficial.
**Preço:** a Naty precisa ter o Telegram, e o n8n precisa de HTTPS público para os botões dentro do chat.
**Substituída por D13 (13/10/2026):** a pedido do cliente, o WhatsApp oficial passou a ser a entrada e a resposta, e o Telegram foi removido.

## D7. Workflows gerados por código (`src/` + `build.js`)
**Contexto:** a lógica crítica (datas, lembretes) precisa de testes, e JSON de workflow editado à mão é difícil de revisar.
**Decisão:** o código dos nós "Code" fica em `src/*.js` (testável fora do n8n) e `build.js` monta os JSONs dos workflows. Os JSONs são artefatos gerados.
**Preço:** mudanças feitas direto na interface do n8n não voltam para o repositório; é preciso portá-las para `src/` e `build.js` (ver README → Desenvolvimento).

## D8. Hospedagem: Render grátis + Supabase
**Contexto:** exigência de custo zero; o webhook do WhatsApp (Meta) e o conector MCP exigem HTTPS público.
**Alternativas avaliadas:**

| Opção | Por que não |
|---|---|
| n8n Cloud | Sem plano grátis |
| PC em casa + túnel | PC desligado = lembretes parados; túnel grátis muda de endereço |
| Oracle Cloud Always Free | Melhor opção grátis em recursos, mas com pegadinhas: recolhe máquina ociosa, falta vaga em São Paulo, portas bloqueadas em dois lugares. Guia em `deploy/LEIA-ME.md`. |
| Google Cloud e2-micro | IP público pago (~US$ 3,65/mês), 1 GB de RAM |
| Render com o Postgres dele | O Postgres grátis do Render expira e apaga os dados |

**Decisão:** n8n no **Render free** + Postgres do **Supabase free** (usuário e schema exclusivos, via Session pooler, porque o Render não sai por IPv6) + **cron-job.org** batendo no `/healthz` a cada 5 min para o Render não desligar o serviço.
**Preço:** depende do cron-job.org para não dormir; 512 MB é o limite para o n8n; deploy a cada push na `main`. Saídas pagas em `OPERACAO.md`.

## D9. Imagem do n8n pelo Docker Hub
**Contexto:** o primeiro build no Render falhou com `429 Too Many Requests` ao baixar `docker.n8n.io/n8nio/n8n:stable`. O registro do n8n limita downloads por IP, e o Render usa IPs compartilhados.
**Decisão:** imagem oficial publicada no Docker Hub, com **versão fixa**: `FROM n8nio/n8n:2.42.5`. A tag `stable` mudaria a cada push, já que todo push refaz o deploy.
**Preço:** atualizar o n8n vira uma ação manual (ver `OPERACAO.md` → Atualizar o n8n).

## D10. O n8n cria o próprio schema no banco
**Contexto:** no primeiro deploy, o schema `n8n` tinha sido criado antes, à mão. O n8n conectou no banco, rodou `CREATE SCHEMA IF NOT EXISTS "n8n"` e **travou**: a resposta nunca chegou ao n8n, o processo ficou parado (CPU ~0, memória estável) e o Render derrubou o deploy por não abrir a porta. No código do driver (`@n8n/typeorm`), o próximo passo seria um `SELECT version()` na mesma conexão, que nunca foi executado.
**Causa provável:** com o schema já existente, o Postgres responde com um aviso ("already exists, skipping"), e esse aviso, passando pelo pooler do Supabase, trava a conexão.
**Confirmação (08/10/2026):** sem o schema pré-criado, o n8n criou o `n8n`, rodou todas as migrações (148 tabelas) e abriu o editor. A única variável alterada foi a existência prévia do schema.
**Decisão:** o schema criado à mão foi renomeado para `n8n_antigo` (vazio; pode ser apagado) e o usuário `n8n` ganhou permissão para criar schemas (`GRANT CREATE ON DATABASE postgres TO n8n`), de modo que o próprio n8n cria o `n8n`.
**Como recriar o banco do zero (SQL Editor do Supabase):**
```sql
create role n8n with login password 'SENHA_FORTE';
grant n8n to postgres;
grant create on database postgres to n8n;
alter role n8n set search_path = n8n;
-- NÃO crie o schema n8n: deixe o n8n criar no primeiro start.
```

## D11. Prazo maior para o executor dos nós de código
**Contexto:** no n8n 2.x, os nós **Code** rodam num processo separado (*task runner*) que se conecta ao n8n com um token de 30 segundos. Na CPU mínima do Render free, o runner levou ~36 s para iniciar, e os logs mostravam em loop `Task runner connection attempt failed: invalid or expired grant token`. O editor abria normalmente, mas **todo nó Code falharia**, e os dois workflows dependem deles.
**Decisão:** `N8N_RUNNERS_GRANT_TOKEN_TTL=180` nas variáveis do Render.
**Preço:** nenhum. O token só vale para a conexão local entre o n8n e o próprio runner (127.0.0.1).
**Lição:** "o editor abriu" não significa "está funcionando". Depois de cada deploy, confira os logs (ver `OPERACAO.md`).

## D12. Economia de memória no plano grátis
**Contexto:** em 09/10/2026, durante os testes no editor, o n8n ficou entre 440 e 487 MB, de 512 MB, e foi encerrado pelo Render (`server_failed · oomKilled 512Mi`). Ele reiniciou sozinho em 13 s, mas a página ficou fora do ar (502) por 1–2 min. Esse tipo de queda **não aparece nos logs do app**, só nos *Events* do serviço.
**Decisão:**
- limite de memória do processo principal reduzido de 380 para 300 MB (`NODE_OPTIONS=--max-old-space-size=300`);
- limite de 96 MB para o executor dos nós Code (`N8N_RUNNERS_MAX_OLD_SPACE_SIZE`);
- recursos sem uso desligados: templates, avisos de versão, personalização, IA embutida e API pública.

**Correção registrada:** a documentação dizia que o plano Starter do Render resolveria falta de memória. **Ele também tem 512 MB.** As saídas reais são uma VPS (2–4 GB) ou o Render Standard (2 GB).
**Em observação:** se aparecer `JavaScript heap out of memory` (limite baixo demais) ou novos `oomKilled` (limite alto demais), ajustar. Fora do editor, só com execuções em segundo plano, o consumo é menor que durante os testes.

## D13. WhatsApp oficial como entrada e resposta; Telegram removido
**Contexto (13/10/2026):** pedido do cliente: a entrada dos pedidos é o WhatsApp. O robô **não lê** as conversas do WhatsApp: alguém encaminha o pedido para o número do próprio robô. O Telegram sai. O cliente quer simplicidade: o alarme do Google Agenda no celular basta, e as pessoas envolvidas precisam ser avisadas por e-mail.
**Decisão:**
- Entrada pelo nó **WhatsApp Trigger** (WhatsApp Cloud API, oficial da Meta), aceitando só os números de `whatsapp_autorizados`. Gmail e formulário continuam como entradas.
- **Sem etapa de confirmação.** O evento é criado na hora: verde quando está tudo certo; vermelho, com `⚠️ VERIFICAR:` no título, quando há dúvida real sobre a data (sem horário, conflito de dia da semana, data passada ou a mais de 6 meses, IA incerta ou com ambiguidades, mensagem encaminhada com data relativa).
- Resposta na mesma conversa do WhatsApp, com a data por extenso, o trecho original e os alertas. É grátis porque é resposta dentro da janela de 24h. Se o WhatsApp falhar, o mesmo aviso vai por e-mail para a Naty. Pedido por e-mail ou formulário recebe a resposta por e-mail.
- `emails_equipe` viram convidados do evento (convite do Google) e recebem, com a Naty, lembretes por e-mail 2 dias e 1 dia antes. Os alarmes no celular (2d, 1d, 12h, 6h) ficam no próprio evento; o lembrete por e-mail do Google foi retirado para não duplicar os e-mails do workflow 2.

**Alternativas descartadas:**
- **WhatsApp não oficial (conexão por QR code):** risco de banimento do número, e não cabe nos 512 MB do Render grátis junto com o n8n.
- **Manter o Telegram:** o cliente não pediu, e seria mais um app para a Naty.
- **Lembretes no WhatsApp agora:** mensagens iniciadas pelo robô são pagas por mensagem e exigem modelo aprovado pela Meta. Ficam para a próxima fase.

**Preço:**
- Perde a confirmação explícita por botão. Compensação: data por extenso na resposta + `VERIFICAR` automático. Uma data errada que nenhuma checagem perceba nasce verde.
- Mensagem encaminhada não traz a data em que o cliente escreveu: "amanhã" é calculado a partir do encaminhamento. Por isso, encaminhada com data relativa vira `VERIFICAR`.
- Precisa de um número exclusivo para o robô, fora do app do WhatsApp.
- Configuração na Meta (app, número, token permanente de Usuário do sistema) dá mais trabalho que um bot do Telegram.
- Lacuna: os lembretes e o alerta "lembretes PARADOS" usam o mesmo acesso ao Google. Se ele cair, o alerta também não sai. Mitigação: publicar o app OAuth do Google (em *Testing* o login vence em 7 dias) e conferir as execuções toda semana (`OPERACAO.md`).

## D14. Repositório público
**Contexto (14/10/2026):** o repositório passa a ser público, como portfólio.
**Decisão:**
- Nada secreto fica no repositório: tokens, chaves e senhas estão só nas credenciais do n8n e nas variáveis do Render (conferido no histórico inteiro antes de abrir).
- O **formulário** exige usuário e senha (Basic Auth). O endereço dele está no código, e sem senha qualquer pessoa criaria eventos na agenda e gastaria a cota da IA.
- O gatilho do WhatsApp não precisa disso: o n8n confere a assinatura de cada mensagem com a chave secreta do app, e só os números de `whatsapp_autorizados` são atendidos.
- Números de telefone nos exemplos e testes são fictícios. O número real que aparecia num teste foi trocado em todo o histórico.

**Preço:** o endereço do n8n fica conhecido; a proteção do editor é a senha do dono e a do formulário, a Basic Auth.
