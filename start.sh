#!/bin/bash

echo "🚀 Ligando o sistema BRT Audiovisual..."

# Iniciar via PM2
pm2 start ecosystem.config.js

# Salvar para reiniciar com o sistema
pm2 save

echo "✅ Sistema Rodando!"
echo "--------------------------------------------------"
echo "Dashboard: http://localhost:3000"
echo "Para ver os logs, rode: pm2 logs"
echo "--------------------------------------------------"
