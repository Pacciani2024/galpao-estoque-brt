/**
 * Configuração do Agente Mark
 */

require('dotenv').config();

module.exports = {
    // Gemini API
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',

    // Agente
    agentName: 'Kira',
    agentCompany: 'BRT Audiovisual',

    // Parâmetros do modelo
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.95,
    topK: 40,

    // Caminhos de dados
    paths: {
        inventory: './logs/inventory_complete.json',
        events: './logs/eventos_completos.json',
        eventEquipment: './logs/cache_equipamentos/',
        systemPrompt: './agent/system_prompt.txt'
    }
};
