/**
 * Script: Listar TODOS os eventos da API para identificar IDs corretos
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BASE_URL = process.env.MEEVENTOS_BASE_URL;
const API_KEY = process.env.MEEVENTOS_API_KEY;

async function listAllEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setFullYear(today.getFullYear() + 2);

    const startDate = formatDate(today);
    const endDate = formatDate(futureDate);

    let allEvents = [];
    let page = 1;
    let hasMorePages = true;

    console.log('\n🔍 LISTANDO TODOS OS EVENTOS DA API\n');
    console.log('═'.repeat(100));

    while (hasMorePages) {
        const url = `${BASE_URL}/events?page=${page}&start=${startDate}&end=${endDate}&field_sort=dataevento&sort=asc`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': API_KEY,
                'Accept': 'application/json'
            }
        });

        if (response.status === 449) break;
        if (!response.ok) {
            console.error(`Erro na página ${page}: ${response.status}`);
            break;
        }

        const result = await response.json();
        const pageEvents = result.data || [];

        if (pageEvents.length === 0) break;

        allEvents = allEvents.concat(pageEvents);

        const totalPages = result.total_page || 1;
        if (page >= totalPages) break;

        page++;
    }

    console.log(`\n📊 Total de eventos: ${allEvents.length}\n`);
    console.log('─'.repeat(100));
    console.log('ID     | Data       | Nome do Evento');
    console.log('─'.repeat(100));

    allEvents.forEach(e => {
        const id = String(e.id).padEnd(7);
        const data = (e.dataevento || 'N/A').padEnd(12);
        const nome = (e.nomeevento || 'Sem nome').substring(0, 70);
        console.log(`${id}| ${data}| ${nome}`);
    });

    console.log('─'.repeat(100));
    console.log(`\n🎯 Procurando por eventos específicos:\n`);

    const targets = [
        { date: '2025-12-22', name: 'Iulia Jockey' },
        { date: '2026-01-10', name: 'Casamento Eduarda' }
    ];

    targets.forEach(target => {
        const found = allEvents.filter(e =>
            e.dataevento === target.date ||
            (e.nomeevento && e.nomeevento.toLowerCase().includes(target.name.toLowerCase()))
        );

        if (found.length > 0) {
            console.log(`✅ ${target.name} (${target.date}):`);
            found.forEach(e => {
                console.log(`   → ID ${e.id}: ${e.nomeevento}`);
            });
        } else {
            console.log(`❌ ${target.name} (${target.date}): NÃO ENCONTRADO`);
        }
    });

    console.log('\n');
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

listAllEvents().catch(console.error);
