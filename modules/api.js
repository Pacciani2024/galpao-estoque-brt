/**
 * Módulo: API MeEventos
 * Função: Buscar metadados de eventos (nome, cliente, local, data, hora)
 */

require('dotenv').config();
const fetch = require('node-fetch');

class MeEventosAPI {
    constructor() {
        this.baseURL = process.env.MEEVENTOS_BASE_URL;
        this.apiKey = process.env.MEEVENTOS_API_KEY;
    }

    /**
     * Busca TODOS os eventos (sem filtro)
     * @returns {Array} Lista de todos eventos
     */
    async getAllEvents() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDate = new Date(today);
        futureDate.setFullYear(today.getFullYear() + 2);

        const startDate = this.formatDate(today);
        const endDate = this.formatDate(futureDate);

        let allEvents = [];
        let page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            const url = `${this.baseURL}/events?page=${page}&start=${startDate}&end=${endDate}&field_sort=dataevento&sort=asc`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.apiKey,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 449) break;
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            const pageEvents = result.data || [];

            if (pageEvents.length === 0) break;

            allEvents = allEvents.concat(pageEvents);

            const totalPages = result.total_page || 1;
            if (page >= totalPages) break;

            page++;
        }

        return allEvents;
    }

    /**
     * Busca eventos ATIVOS (últimos 30 dias + futuros)
     * Exclui: cancelados, testemake, lixo
     * @returns {Array} Lista de eventos ativos
     */
    async getUpcomingEvents() {
        const allEvents = await this.getAllEvents();

        // Data de hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Data de corte: 30 dias atrás
        const cutoffDate = new Date(today);
        cutoffDate.setDate(today.getDate() - 30);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // IDs de eventos inválidos/lixo
        const trashEventIds = ['408'];

        // Filtrar eventos ativos
        const activeEvents = allEvents.filter(event => {
            const eventDate = event.dataevento;
            const isRecent = eventDate >= cutoffDateStr;

            // Verificar se está cancelado (qualquer variação)
            const statusLower = (event.status || '').toLowerCase();
            const isNotCancelled = !statusLower.includes('cancelado');

            const isNotTest = !event.nomeevento.toLowerCase().includes('testemake');
            const isNotTrash = !trashEventIds.includes(event.id);

            return isRecent && isNotCancelled && isNotTest && isNotTrash;
        });

        // Ordenar por data (mais próximos primeiro)
        activeEvents.sort((a, b) => {
            const dateA = new Date(a.dataevento);
            const dateB = new Date(b.dataevento);
            return dateA - dateB;
        });

        return activeEvents;
    }

    /**
     * Busca evento por ID específico
     * @param {string} eventId - ID do evento
     * @returns {Object} Dados do evento ou null
     */
    async getEventById(eventId) {
        const events = await this.getUpcomingEvents();
        return events.find(e => e.id.toString() === eventId.toString()) || null;
    }

    /**
     * Busca TODOS os equipamentos/itens do inventário
     * @returns {Array} Lista completa de equipamentos
     */
    async getAllEquipment() {
        let allEquipment = [];
        let page = 1;
        let hasMorePages = true;

        console.log('📦 Buscando equipamentos da API...');

        while (hasMorePages) {
            const url = `${this.baseURL}/equipment?page=${page}&limit=200`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.apiKey,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            const pageEquipment = result.data || [];

            if (pageEquipment.length === 0) break;

            allEquipment = allEquipment.concat(pageEquipment);

            console.log(`   Página ${page}: ${pageEquipment.length} itens`);

            const totalPages = result.pagination?.total_page || 1;
            if (page >= totalPages) break;

            page++;
        }

        console.log(`✅ Total de equipamentos: ${allEquipment.length}`);
        return allEquipment;
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

module.exports = MeEventosAPI;
