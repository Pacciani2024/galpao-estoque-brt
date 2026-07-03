/**
 * Singleton: Gerenciador de Scraper Persistente
 * Mantém sessão do MeEventos aberta enquanto o servidor estiver rodando
 */

const EventosScraper = require('../modules/scraper_cookie');

class ScraperManager {
    constructor() {
        this.scraper = null;
        this.lastActivity = null;
    }

    async getScraper() {
        // Se não existe ou ficou inativo por muito tempo (2 horas), reiniciar
        const TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 horas
        const now = Date.now();

        if (!this.scraper || (this.lastActivity && (now - this.lastActivity) > TIMEOUT_MS)) {
            if (this.scraper) {
                console.log('⚠️ Sessão expirada, reiniciando...');
                await this.scraper.close();
            }

            console.log('🌐 Inicializando scraper persistente...');
            this.scraper = new EventosScraper();
            await this.scraper.initialize();
            console.log('✅ Scraper pronto e sessão ativa!\n');
        }

        this.lastActivity = now;
        return this.scraper;
    }

    async close() {
        if (this.scraper) {
            await this.scraper.close();
            this.scraper = null;
            this.lastActivity = null;
        }
    }
}

// Singleton global
const manager = new ScraperManager();

module.exports = manager;
