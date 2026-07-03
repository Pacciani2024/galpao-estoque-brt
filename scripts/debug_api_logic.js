
const fs = require('fs');
const path = require('path');
const API = require('../modules/api');

async function debugLogic() {
    const api = new API();
    const targetDateStr = '2026-02-12';

    const normalizeName = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, ' ') : '';
    let eventCommitments = {};

    try {
        const eventsData = await api.getUpcomingEvents();
        console.log(`Found ${eventsData.length} upcoming events.`);

        eventsData.forEach(event => {
            const isMainDate = event.dataevento === targetDateStr;
            const targetDateObj = new Date(targetDateStr + 'T00:00:00');
            const nextDayObj = new Date(targetDateObj);
            nextDayObj.setDate(nextDayObj.getDate() + 1);
            const nextDayStr = nextDayObj.toISOString().split('T')[0];
            const isAutoSetupDay = (event.dataevento === nextDayStr);

            const dateParts = targetDateStr.split('-');
            const brazilianDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            const textToSearch = ((event.observacao || '') + (event.informacoes || '') + (event.nomeevento || '')).toLowerCase();
            const isTextMentioned = textToSearch.includes(targetDateStr) || textToSearch.includes(brazilianDate);

            let isAdditionalDate = false;

            if (event.datasAdicionais && Array.isArray(event.datasAdicionais)) {
                isAdditionalDate = event.datasAdicionais.some(d => {
                    const start = d.inicio ? d.inicio.split(' ')[0] : '';
                    const end = d.fim ? d.fim.split(' ')[0] : '';
                    return (targetDateStr >= start && targetDateStr <= end);
                });
            }

            if (isMainDate || isAdditionalDate || isTextMentioned || isAutoSetupDay) {
                console.log(`MATCHED: Event ${event.id} (${event.dataevento}) - ${event.nomeevento} [Reason: ${isMainDate ? 'Main' : isAdditionalDate ? 'Additional' : isAutoSetupDay ? 'Auto Setup' : 'Text Mention'}]`);

                const cacheFile = `./logs/cache_equipamentos/evento_${event.id}.json`;
                if (fs.existsSync(cacheFile)) {
                    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                    const cacheEq = cacheData.equipamentos || [];
                    console.log(`   - Found ${cacheEq.length} items in cache.`);

                    cacheEq.forEach(eq => {
                        const normName = normalizeName(eq.nome);
                        const qty = parseInt(eq.quantidade) || 0;
                        if (normName) {
                            eventCommitments[normName] = (eventCommitments[normName] || 0) + qty;
                            if (normName.includes('pioneer') || normName.includes('transformador')) {
                                console.log(`      + Added ${qty} for ${normName}. Total now: ${eventCommitments[normName]}`);
                            }
                        }
                    });
                } else {
                    console.log(`   - CACHE MISS for event ${event.id}`);
                }
            }
        });

        console.log('\n--- FINAL RESULTS ---');
        console.log('TRANSFORMADOR DE ENERGIA 220V 5KVA:', eventCommitments[normalizeName('TRANSFORMADOR DE ENERGIA 220V 5KVA')] || 0);
        console.log('CONTROLADORA PIONEER XZ:', eventCommitments[normalizeName('CONTROLADORA PIONEER XZ')] || 0);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugLogic();
