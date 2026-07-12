# Configuração do Ambiente no Ubuntu

## 1. Instalar Node.js e Dependências do Sistema

Como o `npm` não está instalado, você precisa configurar o ambiente. Rode estes comandos no terminal do Ubuntu:

```bash
# Atualizar lista de pacotes
sudo apt update

# Instalar curl (necessário para baixar o instalador do Node)
sudo apt install -y curl

# Adicionar repositório do Node.js 18 (versão recomendada)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Instalar Node.js e ferramentas de compilação
sudo apt install -y nodejs build-essential

# Instalar dependências para o Canvas e Puppeteer (usados no projeto)
sudo apt install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libgbm-dev
```

## 2. Atualizar Arquivos do Projeto (`dev.sh` e `package.json`)

Você recebeu o erro `dev.sh: Arquivo ou diretório inexistente` porque eu acabei de criar esse arquivo no Windows, e ele **ainda não está na sua pasta do Ubuntu**.

Você precisa copiar o `dev.sh` e o `package.json` atualizado do Windows para o Ubuntu.

Se você estiver usando **WSL**, pode copiar direto:

```bash
cp /mnt/c/Users/vinic/OneDrive/Documentos/controle\ de\ estoque\ galpao/dev.sh .
cp /mnt/c/Users/vinic/OneDrive/Documentos/controle\ de\ estoque\ galpao/package.json .
```

Se for outra máquina, transfira os arquivos manualmente.

## 3. Instalar Dependências do Projeto e Rodar

Depois de copiar os arquivos e instalar o Node, rode na pasta do projeto:

```bash
# Instalar dependências do projeto
npm install

# Dar permissão de execução
chmod +x dev.sh

# Iniciar o sistema
./dev.sh
```

Isso vai iniciar:

- **Kira Voice** (em background)
- **Sincronização de Inventário**
- **Servidor Web** (com auto-reload)
