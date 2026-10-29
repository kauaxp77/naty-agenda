# Divulgação no LinkedIn

| Arquivo | Para quê |
|---|---|
| `carrossel-agenda-whatsapp.pdf` | Carrossel de 9 slides (1080×1350). No LinkedIn: novo post → **Adicionar documento** |
| `slides/slide-01.png` … `slide-09.png` | Os mesmos slides em imagem, para postar como galeria |
| `banner-1200x627.png` | Banner único, para post com uma imagem só |
| `carrossel.html`, `banner.html` | Fonte dos slides e do banner. A foto vem de `foto/avatar.jpg` |
| `gerar.js` | Gera de novo os PNGs, o PDF e o banner a partir dos HTMLs |

Os slides: 1. capa · 2. o problema · 3. como funciona · 4. a IA lê, o código confere · 5. respostas e comandos · 6. lembretes · 7. quando algo falha · 8. tecnologias, custo e testes · 9. código aberto e contato.

## Gerar de novo

Edite o HTML e rode, na raiz do repositório (precisa do Playwright com o Chromium e das fontes Inter e Noto Color Emoji instaladas):

```bash
node docs/divulgacao/linkedin/gerar.js
```

O script avisa se algum slide passar por cima do rodapé.

## Texto sugerido para o post

> Um serviço deixou de ser feito porque a data do pedido foi lida errada. Daí nasceu este projeto.
>
> Construí uma automação em n8n que transforma pedidos de serviço encaminhados no WhatsApp em eventos no Google Agenda:
> → a IA lê a mensagem e extrai serviço, órgão, data e hora
> → o código confere a data com regras fixas e, na dúvida, o evento nasce vermelho em vez de virar um chute
> → o robô responde na mesma conversa, com o dia por extenso
> → lembretes no celular e por e-mail para a equipe
> → quando algo falha, alguém fica sabendo
>
> O que mais me ensinou: a Meta aceitava as respostas e só depois avisava que não tinha entregado. Sem tratar esse aviso, a falha passava calada.
>
> Infraestrutura: R$ 0/mês nos planos gratuitos. 47 testes. Código aberto, com guia de instalação do zero: github.com/kauaxp77/Automacao_n8n
>
> #n8n #automacao #IA #whatsapp #desenvolvimento
