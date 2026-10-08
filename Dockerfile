# Imagem usada pelo Render (deploy/RENDER.md). Toda a configuração vem das variáveis de ambiente.
# Docker Hub em vez de docker.n8n.io: o registro do n8n devolveu 429 (limite por IP) nos builds do Render.
FROM n8nio/n8n:stable
