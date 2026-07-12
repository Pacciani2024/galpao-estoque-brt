# 🎙️ Como Configurar Google Cloud TTS

## Passo a Passo Completo

### 1. Criar Projeto no Google Cloud

**Acesse:** <https://console.cloud.google.com/>

1. Clique em **"Select a project"** (topo)
2. Clique em **"New Project"**
3. Nome: `brt-mark-tts` (ou qualquer nome)
4. Clique em **"Create"**

---

### 2. Ativar API Text-to-Speech

**Link direto:** <https://console.cloud.google.com/apis/library/texttospeech.googleapis.com>

1. Selecione seu projeto
2. Clique em **"Enable"** (Ativar)
3. Aguarde ~30 segundos

---

### 3. Criar Service Account (Chave)

**Link:** <https://console.cloud.google.com/iam-admin/serviceaccounts>

1. Clique em **"+ Create Service Account"**
2. **Service account name:** `mark-tts`
3. Clique em **"Create and Continue"**
4. **Role:** Selecione `Cloud Text-to-Speech API User`
5. Clique em **"Continue"** e **"Done"**

---

### 4. Gerar e Baixar Chave JSON

Ainda na página de Service Accounts:

1. Clique na service account que você criou (`mark-tts`)
2. Vá na aba **"Keys"**
3. Clique em **"Add Key"** → **"Create new key"**
4. Escolha **JSON**
5. Clique em **"Create"**
6. Arquivo JSON será baixado automaticamente!

---

### 5. Salvar Chave no Projeto

1. **Renomeie** o arquivo baixado para: `google-cloud-key.json`
2. **Mova** para a pasta raiz do projeto:

   ```
   c:/Users/vinic/OneDrive/Documentos/controle de estoque galpao/
   ```

---

### 6. Verificar .env

Arquivo `.env` já está configurado:

```env
GOOGLE_CLOUD_KEY_FILE=./google-cloud-key.json
```

---

### 7. Testar

```bash
npm start
```

Abra: `http://localhost:3000`

Digite algo e ouça a voz! 🎉

---

## 💰 Custos

**FREE TIER:**

- ✅ **1 MILHÃO de caracteres/mês GRÁTIS!**
- ✅ Neural voices incluídas
- ✅ Não precisa de cartão inicialmente

**Se ultrapassar:**

- Standard: $4.00 por 1 milhão chars
- Neural: $16.00 por 1 milhão chars

**Exemplo:** 1000 respostas de 100 chars = 100k chars = **GRÁTIS**

---

## ⚠️ IMPORTANTE

1. **NÃO** compartilhe o arquivo `google-cloud-key.json`
2. Ele já está no `.gitignore`
3. Se vazar, **delete** a service account e crie nova

---

## 🎯 Vozes Disponíveis (PT-BR)

Você pode mudar em `server.js`:

```javascript
// Feminina Neural (melhor)
name: 'pt-BR-Neural2-C'

// Masculina Neural
name: 'pt-BR-Neural2-B'

// Feminina Wavenet
name: 'pt-BR-Wavenet-A'
```

---

## ✅ Checklist

- [ ] Criar projeto Google Cloud
- [ ] Ativar Text-to-Speech API
- [ ] Criar Service Account
- [ ] Baixar chave JSON
- [ ] Salvar como `google-cloud-key.json` na raiz
- [ ] Testar `npm start`

**Qualquer dúvida, me avise!** 🚀
