# Colocar o n8n no ar com HTTPS (VPS + Docker + Caddy)

O Caddy pede e renova sozinho o certificado HTTPS (Let's Encrypt). Não há certificado para configurar à mão.

## 1. Servidor

### Opção grátis: Oracle Cloud "Always Free"
1. Crie a conta em https://www.oracle.com/cloud/free/. Pede **cartão de crédito** só para verificar identidade; o plano Always Free não cobra.
2. **Região (home region):** escolha com cuidado, porque **não dá para trocar depois**. A região de São Paulo vive sem vaga para máquinas ARM ("Out of host capacity"). Se estiver lotada, Vinhedo (`sa-vinhedo-1`) ou uma região dos EUA (ex.: Ashburn) funcionam igual para o n8n.
3. **Compute → Instances → Create instance:**
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPU e 12 GB de RAM** (o limite grátis)
   - Baixe a chave SSH que ele gera e guarde.
   - Se der "Out of host capacity", tente de novo mais tarde, ou em outro "Availability Domain".
4. **Evite que a Oracle apague a máquina:** contas grátis têm instâncias **recolhidas se ficarem ociosas por 7 dias**, e um n8n de uma empresa pequena fica ocioso quase o tempo todo. Para escapar disso, faça o **upgrade para Pay As You Go** (Billing → Upgrade). Continua **sem custo** enquanto você ficar dentro dos limites grátis; só passa a cobrar se você criar coisas além deles.
   - Para não ter surpresa, crie um **orçamento com alerta de R$1** em Billing → Budgets.
5. **Liberar as portas 80 e 443** (a Oracle bloqueia em **dois lugares**):
   - No painel: Networking → Virtual Cloud Networks → sua VCN → Security Lists → Default → **Add Ingress Rules**: origem `0.0.0.0/0`, TCP, portas `80,443`.
   - Na máquina (depois do passo 3 abaixo, **no lugar do comando `ufw`**):
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
     Na Oracle, **não use `ufw`**: ele briga com as regras da própria imagem.
6. Anote o **IP público** da instância. Para ele nunca mudar, em Networking → IP Management → Reserved Public IPs, reserve um IP (grátis) e associe à instância.

Para entrar na máquina: `ssh -i caminho/da/chave ubuntu@IP` (usuário `ubuntu`, não `root`; use `sudo` nos comandos).

### Opção paga: VPS comum
- Qualquer provedor (Hostinger, Contabo, Hetzner, Magalu Cloud…), **Ubuntu 24.04**, mínimo **2 GB de RAM**.
- Anote o **IP** da VPS.

## 2. Domínio apontando para a VPS
Escolha uma opção:
- **Domínio próprio** (ex.: `n8n.suaempresa.com.br`, ~R$40/ano no registro.br): crie um registro **A** com o nome `n8n` apontando para o IP da VPS.
- **Grátis:** entre em https://www.duckdns.org com sua conta Google, crie um subdomínio (ex.: `natyagenda` → `natyagenda.duckdns.org`) e, no campo "current ip", coloque o IP público da máquina → **update ip**.

Espere alguns minutos e confira no seu PC: `ping n8n.suaempresa.com.br` deve responder com o IP da VPS.

## 3. Instalar o Docker na VPS
Entre na VPS e rode:
```bash
curl -fsSL https://get.docker.com | sudo sh
```
- **Oracle:** agora rode os comandos `iptables` do passo 1.5.
- **VPS comum:** `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable`

## 4. Subir o n8n
Copie esta pasta `deploy/` para a VPS (ex.: com WinSCP, ou `scp -r deploy ubuntu@IP:~/` na Oracle) e rode (na Oracle, ponha `sudo` antes de cada `docker`):
```bash
cd ~/deploy
cp .env.exemplo .env
openssl rand -hex 32          # copie o resultado
nano .env                     # preencha DOMINIO e cole a chave em N8N_ENCRYPTION_KEY
docker compose up -d
docker compose logs -f caddy  # espere "certificate obtained successfully" e saia com Ctrl+C
```

Abra `https://SEU-DOMINIO` no navegador e crie a conta de dono (owner). **Use uma senha forte e ative a verificação em duas etapas** (Settings → Personal → 2FA): esse n8n terá acesso ao Gmail e à agenda.

**Guarde a `N8N_ENCRYPTION_KEY` fora do servidor** (gerenciador de senhas). Sem ela, um backup do n8n não abre as credenciais.

## 5. Conferir que o HTTPS está certo
- No n8n, abra o workflow 1 → nó "Formulário: colar pedido": a URL de produção precisa começar com `https://SEU-DOMINIO/`.
- Se aparecer `http://localhost:5678`, o `WEBHOOK_URL` não foi lido: confira o `.env` e rode `docker compose up -d` de novo.

## Manutenção
- **Atualizar o n8n:** `docker compose pull && docker compose up -d`
- **Backup** (rode de vez em quando e baixe o arquivo para fora da VPS):
  `docker run --rm -v deploy_n8n_data:/d -v $PWD:/b alpine tar czf /b/backup-n8n-$(date +%F).tgz -C /d .`
- **Ver erros:** `docker compose logs --tail 100 n8n`
