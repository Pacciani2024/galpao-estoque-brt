/**
 * Módulo: Integração Oficial com API MeEventos
 * Substitui ou complementa o Scraper para obter dados mais precisos (Datas, Preços)
 */

require('dotenv').config();
const axios = require('axios');

class MeEventosAPI {
    constructor() {
        this.apiKey = process.env.MEEVENTOS_API_KEY;
        // Revertendo para URL original do .env
        this.baseURL = process.env.MEEVENTOS_BASE_URL || 'https://app1.meeventos.com.br/brt/api/v1';

        if (!this.apiKey) {
            console.error('❌ ERRO: MEEVENTOS_API_KEY não configurada no .env');
        }

        // Configuração padrão do Axios
        this.client = axios.create({
            baseURL: this.baseURL,
            // Autenticação somete via Query Param para evitar conflito de cabeçalhos
            params: {
                api_token: this.apiKey, // Tentar 'api_token'
                token: this.apiKey      // E 'token' (redundância comum)
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'BRT-Integration/1.0'
            },
            timeout: 20000
        });

        // Interceptor para logs de erro
        this.client.interceptors.response.use(
            response => response,
            error => {
                const url = error.config?.url;
                if (error.response) {
                    const msg = error.response.data && error.response.data.message
                        ? error.response.data.message
                        : JSON.stringify(error.response.data).substring(0, 200);

                    console.error(`❌ API Error [${error.response.status}] em ${url}: ${msg}`);
                } else {
                    console.error(`❌ API Network Error em ${url}:`, error.message);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Busca TODOS os equipamentos (com paginação automática)
     * Endpoint: /equipment (base já tem /api/v1)
     */
    async getAllEquipment() {
        let allItems = [];
        let page = 1;
        const limit = 200;
        let hasMore = true;

        console.log(`🔄 Buscando equipamentos em: ${this.baseURL}/equipment`);

        while (hasMore) {
            try {
                console.log(`   📄 Buscando página ${page}...`);
                // Tenta endpoints diferentes se o principal falhar
                let endpoint = '/equipment';

                const response = await this.client.get(endpoint, {
                    params: { page, limit }
                });

                const data = response.data;

                if (data && Array.isArray(data.data)) {
                    allItems = allItems.concat(data.data);

                    const pagination = data.pagination;
                    if (pagination && page < pagination.total_page) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                } else {
                    if (Array.isArray(data)) {
                        allItems = allItems.concat(data);
                        hasMore = false;
                    } else {
                        console.warn('⚠️ Estrutura de resposta inesperada:', Object.keys(data));
                        hasMore = false;
                    }
                }
            } catch (error) {
                console.error(`❌ Erro na página ${page}:`, error.response ? error.response.status : error.message);
                if (page === 1) throw error;
                hasMore = false;
            }
        }

        console.log(`✅ Total de equipamentos obtidos: ${allItems.length}`);
        return allItems;
    }
}

module.exports = new MeEventosAPI();
