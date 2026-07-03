import dotenv from 'dotenv';
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

class MeEventosClient {
    /**
     * ⚠️ READ-ONLY CLIENT ⚠️
     * STRICTLY FOR PULLING DATA. NEVER IMPLEMENT WRITE/POST/PUT METHODS TO THE EXTERNAL API.
     * USER DIRECTIVE: "Nossa funcao e puxar informação somente".
     */
    constructor() {
        this.baseURL = process.env.MEEVENTOS_BASE_URL;
        this.apiKey = process.env.MEEVENTOS_API_KEY;
        // Caminho absoluto para evitar erros de CWD
        this.baseLogDir = 'c:/Users/vinic/OneDrive/Documentos/controle de estoque galpao/logs';
        this.logPath = path.join(this.baseLogDir, 'eventos_processados', 'processamentos.json');
    }

    async fetchEvent(eventId) {
        // ... implementation remains same or can be updated to read from cache ...
        return this.getMockEventData(eventId);
    }

    async syncRecentEvents() {
        // Logging Helper
        const logFile = path.resolve('./client_debug.txt');
        const log = (msg) => {
            console.log(msg);
            fs.appendFileSync(logFile, msg + '\n');
        };

        log('🚀 [Sync] Iniciando sincronização...');
        log(`📂 Diretório base de logs: ${this.baseLogDir}`);

        try {
            // MAPA PRINCIPAL: ID -> Dados Unificados
            const eventosMap = new Map();

            // DESABILITADO: Steps 1-3 (Logs/Cache) - Usando apenas API com whitelist
            log(`⚠️ [Sync] Cache/Logs DESABILITADO - Usando apenas API.`);

            // 4. FETCH API REAL (Priority for Metadata: Name, Local, Client, Date)
            try {
                log('🌍 [Sync] Buscando dados da API Oficial...');
                const apiEvents = await this.fetchEventsFromApi();

                if (apiEvents && apiEvents.length > 0) {
                    log(`🌍 [Sync] ${apiEvents.length} eventos recebidos da API.`);

                    // FILTRO DE DATA: Apenas eventos de HOJE em diante
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Início do dia atual

                    let skippedPast = 0;
                    let skippedJunk = 0;

                    log(`\n📋 [Debug] Processando ${apiEvents.length} eventos da API...`);
                    log(`📅 Filtro de data: >= ${today.toLocaleDateString('pt-BR')}\n`);

                    for (const apiEvt of apiEvents) {
                        const id = apiEvt.id.toString();
                        const nome = apiEvt.nomeevento || 'Sem nome';

                        // Parse Date safely
                        let eventDate = new Date();
                        if (apiEvt.dataevento) {
                            const dateStr = apiEvt.horaevento ? `${apiEvt.dataevento}T${apiEvt.horaevento}` : apiEvt.dataevento;
                            eventDate = new Date(dateStr);
                        }

                        log(`   Evento ID ${id}: ${nome.substring(0, 30)} (${eventDate.toLocaleDateString('pt-BR')})`);

                        // FILTER 1: Skip Past Events (antes de hoje)
                        if (eventDate < today) {
                            skippedPast++;
                            log(`      ❌ REJEITADO (data passada: ${eventDate.toLocaleDateString('pt-BR')})`);
                            continue;
                        }

                        // FILTER 2: Skip 'Teste' Events (Junk Data)
                        const nameLower = (apiEvt.nomeevento || '').toLowerCase();
                        const clientLower = (apiEvt.nomeCliente || '').toLowerCase();
                        if (nameLower.includes('teste') || clientLower.includes('teste')) {
                            skippedJunk++;
                            log(`      ⚠️  REJEITADO (contém 'teste')`);
                            continue;
                        }

                        log(`      ✅ ACEITO (data válida + sem 'teste')`);

                        const existing = eventosMap.get(id) || { itens: [] };

                        eventosMap.set(id, {
                            id: id,
                            nome: apiEvt.nomeevento || existing.nome || `Evento ${id}`,
                            data: eventDate,
                            local: apiEvt.localevento || apiEvt.local || existing.local || 'Local API',
                            cliente: apiEvt.nomeCliente || apiEvt.cliente || existing.cliente || 'Cliente API',
                            itens: existing.itens || [],
                            status: apiEvt.STATUS || existing.status || 'Planejado'
                        });

                        log(`      💾 SALVO no eventosMap`);
                    }

                    log(`\n🧹 [Filter] Ignorados: ${skippedPast} passados, ${skippedJunk} testes/lixo.`);
                } else {
                    log('⚠️ [Sync] API retornou lista vazia ou falhou.');
                }
            } catch (apiErr) {
                log(`❌ [Sync] Falha na API: ${apiErr.message}`);
            }

            log(`✨ Total final de eventos para DB: ${eventosMap.size}`);

            // 5. UPSERT DATABASE (Prisma) with Priority Data
            for (const item of eventosMap.values()) {
                try {
                    // Ensure nome is present
                    if (!item.nome) item.nome = `Evento ${item.id}`;

                    // Upsert Event
                    const event = await prisma.event.upsert({
                        where: { meEventosId: item.id },
                        update: {
                            nome: item.nome,
                            dataEvento: item.data,
                            local: item.local,
                            cliente: item.cliente,
                            status: item.status
                        },
                        create: {
                            meEventosId: item.id,
                            nome: item.nome,
                            dataEvento: item.data,
                            local: item.local,
                            cliente: item.cliente,
                            status: item.status
                        }
                    });

                    // 2. Sincronizar Itens
                    if (item.itens && item.itens.length > 0) {
                        for (const eq of item.itens) {
                            const fakeId = `ITEM-${eq.nome.replace(/\s+/g, '-').toUpperCase()}`;

                            // Workaround: Schema missing unique composite key for upsert
                            const existingItem = await prisma.eventEquipment.findFirst({
                                where: {
                                    eventId: event.id,
                                    itemIdUnico: fakeId
                                }
                            });

                            if (existingItem) {
                                await prisma.eventEquipment.update({
                                    where: { id: existingItem.id },
                                    data: { quantidade: eq.quantidade }
                                });
                            } else {
                                await prisma.eventEquipment.create({
                                    data: {
                                        eventId: event.id,
                                        itemIdUnico: fakeId,
                                        quantidade: eq.quantidade,
                                        observacoes: eq.peso ? `Peso: ${eq.peso}kg` : null
                                    }
                                });
                            }
                        }
                    }
                } catch (dbErr) {
                    log(`❌ [Sync] Erro DB ID ${item.id}: ${dbErr.message}`);
                }
            }

            // STEP: Database Cleanup (remove old/test/cancelled data)
            log('🧹 [Cleanup] Removendo eventos inválidos do Banco de Dados...');

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Início do dia atual

            try {
                const deleted = await prisma.event.deleteMany({
                    where: {
                        OR: [
                            { dataEvento: { lt: today } },      // Eventos PASSADOS (antes de hoje)
                            { nome: { contains: 'teste' } },    // Test events (lower)
                            { nome: { contains: 'Teste' } },    // Test events (Title)
                            { nome: { contains: 'TESTE' } },    // Test events (Upper)
                            { status: { equals: 'Cancelado' } }, // Cancelled events
                            { status: { equals: 'cancelado' } }  // Lowercase check
                        ]
                    }
                });
                log(`🗑️ [Cleanup] ${deleted.count} eventos removidos do banco (Passados/Teste/Cancelados).`);
            } catch (delErr) {
                log(`❌ [Cleanup] Erro ao limpar banco: ${delErr.message}`);
            }

            log('✅ Sincronização unificada concluída!');
            return true;

        } catch (error) {
            log(`❌ Erro Geral Sync: ${error.message}`);
            return false;
        }
    }

    // Helper for YYYY-MM-DD
    formatDate(date) {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    async fetchEventsFromApi() {
        if (!this.baseURL || !this.apiKey) return [];

        let allEvents = [];
        let page = 1;
        let totalPages = 1;

        // Date Range: Yesterday to 2 Years Future
        const start = new Date();
        start.setDate(start.getDate() - 1);
        const end = new Date();
        end.setFullYear(end.getFullYear() + 2);

        const startStr = this.formatDate(start);
        const endStr = this.formatDate(end);

        try {
            const headers = {
                'Authorization': this.apiKey,
                'Accept': 'application/json'
            };

            // Fetch with Filters
            do {
                const url = `${this.baseURL}/events?page=${page}&start=${startStr}&end=${endStr}&field_sort=dataevento&sort=asc`;
                console.log(`🌍 [Fetch] Requesting Page ${page} (Dates: ${startStr} to ${endStr})...`);

                const response = await fetch(url, { method: 'GET', headers });

                // Handle 449 (No Data / End of Results) specifically
                if (response.status === 449) {
                    console.log(`⚠️ [Fetch] Fim dos dados na página ${page} (449).`);
                    break;
                }

                if (!response.ok) {
                    const txt = await response.text();
                    throw new Error(`API Error ${response.status} on page ${page}: ${txt}`);
                }

                const json = await response.json();
                const data = json.data || [];
                allEvents = allEvents.concat(data);

                // Check pagination
                if (json.pagination && json.pagination.total_page) {
                    totalPages = json.pagination.total_page;
                } else {
                    totalPages = 1;
                }

                page++;
            } while (page <= totalPages);

            console.log(`🌍 [Fetch] Total Fetched: ${allEvents.length} events from ${totalPages} pages.`);
            return allEvents;

        } catch (e) {
            console.error('Fetch API failed:', e);
            throw e;
        }
    }

    getMockEventData(eventId) {
        // ... (Mock implementation remains same) ...
        return {
            id: eventId,
            nome: 'Evento Festival de Música 2024',
            data: new Date('2024-12-15'),
            local: 'Arena Central',
            cliente: 'Produtora XYZ',
            equipamentos: []
        };
    }

    async testConnection() {
        try {
            // Testing with /events as health check might differ
            const response = await fetch(`${this.baseURL}/events`, {
                method: 'HEAD', // Lightweight check
                headers: {
                    'Authorization': this.apiKey
                }
            });
            return response.ok || response.status === 405; // 405 Method Not Allowed means URL exists
        } catch (error) {
            console.error('MeEventos connection test failed:', error);
            return false;
        }
    }
}

export default MeEventosClient;
