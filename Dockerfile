# Usar uma imagem base que tenha Node e Python
FROM node:18-bullseye-slim

# Instalar Python e dependências de sistema para o Puppeteer/WhatsApp
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libpango-1.0-0 libasound2 libgbm1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./
COPY requirements.txt* ./

# Instalar dependências
RUN npm install
RUN if [ -f "requirements.txt" ]; then pip3 install -r requirements.txt; fi

# Instalar PM2 globalmente para gerenciar processos dentro do container
RUN npm install pm2 -g

# Copiar o restante do código
COPY . .

# Expor a porta da API
EXPOSE 3000

# Comando para iniciar o sistema via PM2 no foreground (para o Docker não fechar)
CMD ["pm2-runtime", "ecosystem.config.js"]
