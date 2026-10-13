# Apresentação para o cliente

`como-funciona.pdf`: o fluxo em 3 páginas, sem termos técnicos, com a situação de cada parte (pronto, em montagem, depende do cliente).

Para mudar: edite `como-funciona.html` e gere o PDF de novo com o Chromium:

```bash
chromium --headless=new --no-pdf-header-footer --print-to-pdf=como-funciona.pdf como-funciona.html
```

Atualize a tabela "Situação atual" (página 3) sempre que uma parte mudar de estado.
