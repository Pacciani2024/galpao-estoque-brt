#!/bin/bash

echo "🚀 Iniciando instalação do BRT Audiovisual no Ubuntu..."

# 1. Atualizar sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js 18
echo "📦 Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Instalar PM2 globalmente
echo "⚙️ Instalando PM2..."
sudo npm install pm2 -g

# 4. Instalar dependências de sistema (Chromium/Puppeteer/WhatsApp)
echo "🌐 Instalando bibliotecas para o Navegador/WhatsApp..."
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libpango-1.0-0 libasound2 libgbm1 libasound2

# 5. Instalar dependências do projeto (Node)
echo "🛠️ Instalando dependências do Node.js..."
npm install

# 6. Instalar dependências do Python (Mark Ears)
echo "🎤 Configurando Python (Mark Ears)..."
if [ -f "requirements.txt" ]; then
    pip3 install -r requirements.txt
else
    # Fallback caso não tenha requirements.txt
    pip3 install google-cloud-text-to-speech google-generative-ai axios
fi

echo "✅ Instalação concluída!"
echo "👉 Agora rode o comando: sh start.sh"
