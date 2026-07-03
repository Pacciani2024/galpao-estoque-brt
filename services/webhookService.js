const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/webhooks.json');
const LOG_PATH = path.join(__dirname, '../logs/webhooks_error.log');

/**
 * Serviço de Webhook para notificações assíncronas
 */
class WebhookService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
                return data.webhooks || [];
            }
        } catch (e) {
            console.error('Erro ao carregar webhooks.json:', e);
        }
        return [];
    }

    /**
     * Dispara um evento para todos os hooks configurados
     * @param {string} eventType - Nome do evento (ex: 'event.dispatched')
     * @param {object} payload - Dados principais
     * @param {object} delta - Diferença/Balanço (opcional)
     */
    async trigger(eventType, payload, delta = null) {
        // Recarregar config a cada disparo para permitir hot-reload
        const hooks = this.loadConfig().filter(h => h.events.includes(eventType));

        if (hooks.length === 0) return;

        console.log(`📡 Disparando Webhook: ${eventType} para ${hooks.length} destinos.`);

        // Estrutura Envelope Padronizada
        const envelope = {
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload,
            delta: delta
        };

        // Disparo Assíncrono (não bloqueante)
        hooks.forEach(hook => {
            this.sendWithRetry(hook.url, envelope, 3);
        });
    }

    /**
     * Envia requisição com retentativa (Exponential Backoff)
     */
    async sendWithRetry(url, data, retries, delay = 1000) {
        try {
            await axios.post(url, data, { timeout: 5000 });
            // console.log(`✅ Webhook entregue: ${url}`);
        } catch (error) {
            if (retries > 0) {
                // console.warn(`⚠️ Falha no webhook ${url}. Tentando novamente em ${delay}ms...`);
                setTimeout(() => {
                    this.sendWithRetry(url, data, retries - 1, delay * 2);
                }, delay);
            } else {
                this.logError(url, error.message, data);
            }
        }
    }

    logError(url, errorMessage, data) {
        const logEntry = `[${new Date().toISOString()}] FALHA EM ${url}: ${errorMessage}\nPAYLOAD: ${JSON.stringify(data)}\n---\n`;
        fs.appendFile(LOG_PATH, logEntry, (err) => {
            if (err) console.error('Erro ao gravar log de webhook:', err);
        });
        console.error(`❌ Webhook falhou definitivamente para ${url}: ${errorMessage}`);
    }
}

module.exports = new WebhookService();
