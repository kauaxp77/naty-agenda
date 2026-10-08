# Imagem usada pelo Render (deploy/RENDER.md). Toda a configuração vem das variáveis de ambiente.
# Docker Hub em vez de docker.n8n.io: o registro do n8n devolveu 429 (limite por IP) nos builds do Render.
# Versão fixada de propósito: atualizar é uma decisão (ver docs/OPERACAO.md → "Atualizar o n8n").
FROM n8nio/n8n:2.42.5
