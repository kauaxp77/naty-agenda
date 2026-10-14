# Apresentação para o cliente

`como-funciona.pdf`: o fluxo em 3 páginas, sem termos técnicos, com a situação de cada parte (pronto, em montagem, depende do cliente).

Para mudar: edite `como-funciona.html` e gere o PDF de novo com o Chromium:

```bash
chromium --headless=new --no-pdf-header-footer --print-to-pdf=como-funciona.pdf como-funciona.html
```

Atualize a tabela "Situação atual" (página 3) sempre que uma parte mudar de estado.

## Guia de uso da Naty

`guia-da-naty.pdf`: 2 páginas para a Naty usar o robô no dia a dia. Explica como mandar pedidos, as três respostas, as cores na agenda, os avisos, os comandos, o que fazer quando algo dá errado e o formulário de reserva.

**Antes de entregar,** troque em `guia-da-naty.html` os dois campos em amarelo: o número do robô e o contato de suporte. Depois gere o PDF de novo, com o mesmo comando acima (trocando os nomes dos arquivos). O usuário e a senha do formulário **não** entram no guia: vão para ela à parte.
