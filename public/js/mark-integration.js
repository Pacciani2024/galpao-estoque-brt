// --- KIRA AI INTELLIGENCE (Contextual/Conversational) ---

const KIRA_MEMORY = {
    lastContext: null,
    lastMessageId: null,      // ID do ultimo postado pela Kira (autopost)
    lastFoundMessages: [],    // IDs dos avisos encontrados
    foundSystemAlerts: [],    // Alertas de sistema encontrados (não podem ser apagados)
    weatherState: 'chuvoso'
};

// Thresholds copiados do dashboard.js para consciência de sistema
const SYSTEM_THRESHOLDS = {
    'Fita isolante': { critical: 6, warn: 10, unit: 'rolos' },
    'Fita crepe preta 48mm x 50m': { critical: 12, unit: 'rolos' },
    'Liquido de Fumaça': { critical: 3, unit: 'galões' },
    'Pilhas AA': { critical: 20, unit: 'un' }
};

async function processMarkCommand(text) {
    const lower = text.toLowerCase();

    // 1. CONTEXT SEARCH ("Sabe o aviso...", "Tem algum aviso sobre...")
    if (matchAny(lower, ['sabe o aviso', 'sabe do aviso', 'conhece o aviso', 'vê se tem', 've se tem', 'procura por', 'tem aviso de', 'leia avisos de'])) {
        return await handleContextSearch(text);
    }

    // 0. DELETION (High Priority - Contextual)
    if (matchAny(lower, ['retire', 'tire', 'remova', 'apague', 'deleta', 'exclua', 'exclui'])) {
        return await handleDeleteCommand(text);
    }

    // STINGER (Top Priority Visual)
    // Refined regex to catch "rode o logo", "mande o logo", "mostra no telao o logo"
    if (/(rode|roda|mostra|solta|bota|mande|puxa).*(logo|vinheta|stinger)/i.test(lower)) {
        return await handleStingerCommand();
    }

    // 2. LIST ALL
    if (matchAny(lower, ['quais avisos', 'o que tem no telão', 'listar avisos', 'ler avisos', 'o que esta no painel'])) {
        return await handleListCommand();
    }

    // 3. POST TO TICKER
    if (matchAny(lower, ['coloque na tela', 'avisa no telão', 'avise no telão', 'mostra no painel', 'põe no telão', 'mande para'])) {
        return await handleTickerCommand(text);
    }

    // 4. INVENTORY
    if (matchAny(lower, ['quantos', 'tem fita', 'tem cabo', 'estoque de', 'puxe quantidade'])) {
        return await handleInventoryQuery(text);
    }

    // 5. WEATHER
    if (matchAny(lower, ['tempo', 'chuva', 'previsão', 'clima'])) {
        return handleWeatherQuery();
    }

    // 7. NAVIGATION
    if (lower.includes('eventos') || lower.includes('jogo')) {
        if (lower.includes('ir para') || lower.includes('abre')) {
            window.location.href = '/eventos';
            return 'Abrindo eventos...';
        }
    }

    return 'Estou ouvindo. Posso verificar estoque, avisos ou clima.';
}

// --- HANDLERS ---

async function handleContextSearch(text) {
    const clean = text.replace(/sabe o aviso|sabe do aviso|conhece o aviso|vê se tem|ve se tem|procura por|tem aviso de|leia avisos de|kira/gi, '').trim();
    const term = clean.replace(/^do |^da |^de |^sobre /i, '').trim();

    if (!term) return 'O que devo procurar no painel?';

    try {
        const [msgRes, invRes] = await Promise.all([
            fetch('/api/dashboard/messages'),
            fetch('/api/inventario')
        ]);

        const messages = await msgRes.json();
        const inventory = await invRes.json();
        const sysAlerts = generateSystemAlerts(inventory.items || []);

        // Busca em Mensagens Manuais
        const foundMsgs = messages.filter(m => m.text.toLowerCase().includes(term.toLowerCase()));

        // Busca em Alertas de Sistema
        const foundSys = sysAlerts.filter(a => a.text.toLowerCase().includes(term.toLowerCase()) || a.title.toLowerCase().includes(term.toLowerCase()));

        KIRA_MEMORY.lastFoundMessages = foundMsgs.map(m => m.id);
        KIRA_MEMORY.foundSystemAlerts = foundSys;

        let responseParts = [];

        if (foundMsgs.length > 0) {
            const preview = foundMsgs.map(m => `"${m.text}"`).join(', ');
            responseParts.push(`Encontrei mensagens manuais: ${preview}.`);
        }

        if (foundSys.length > 0) {
            const preview = foundSys.map(a => `"${a.title}: ${a.text}"`).join(', ');
            responseParts.push(`Encontrei alertas do sistema: ${preview}.`);
        }

        if (responseParts.length === 0) {
            return `Não encontrei nada sobre "${term}".`;
        }

        return responseParts.join('<br>') + " <br>Posso apagar as manuais, mas as de sistema dependem do estoque.";

    } catch (e) { return 'Erro ao ler painel.'; }
}

async function handleDeleteCommand(text) {
    const foundMsgs = KIRA_MEMORY.lastFoundMessages || [];
    const foundSys = KIRA_MEMORY.foundSystemAlerts || [];

    // Se encontrou alertas de sistema E mensagens manuais, prioriza manuais mas avisa
    if (foundSys.length > 0 && foundMsgs.length === 0) {
        return "Não posso apagar esses alertas sozinha. Eles são automáticos porque o estoque está baixo. Reponha os itens para eles sumirem.";
    }

    // Se tem manuais para apagar
    if (foundMsgs.length > 0) {
        let msg = "";
        for (const id of foundMsgs) {
            await fetch('/api/dashboard/messages/' + id, { method: 'DELETE' });
        }
        msg = `Apaguei ${foundMsgs.length} mensagem(ns) manual(ais).`;

        if (foundSys.length > 0) {
            msg += "<br>Os alertas de sistema sobre estoque baixo continuam lá até repor.";
        }

        KIRA_MEMORY.lastFoundMessages = [];
        return msg;
    }

    // Fallback original (se não houve busca prévia)
    let idToDelete = KIRA_MEMORY.lastMessageId;
    if (!idToDelete) {
        // Tenta achar ultimo da Kira
        const res = await fetch('/api/dashboard/messages');
        const msgs = await res.json();
        const last = msgs.find(m => m.sender === 'Kira AI');
        if (last) idToDelete = last.id;
    }

    if (idToDelete) {
        await fetch('/api/dashboard/messages/' + idToDelete, { method: 'DELETE' });
        KIRA_MEMORY.lastMessageId = null;
        return 'Apaguei a última mensagem que eu coloquei.';
    }

    return 'Não encontrei mensagem manual para apagar. Se for alerta de sistema, precisa repor o estoque.';
}

async function handleTickerCommand(text) {
    let content = text.replace(/coloque na tela|avisa no telão|avise no telão|mostra no painel|põe no telão|mande para o telao|mande para o telão|mande para a central|kira/gi, '').trim();
    if (content.substring(0, 4) === 'que ') content = content.substring(4);

    if (content.includes('jogo')) content = ' ' + content;
    if (content.includes('reunião')) content = ' ' + content;

    try {
        const res = await fetch('/api/dashboard/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content, type: 'urgent', sender: 'Kira AI' })
        });
        const data = await res.json();
        if (data.id) KIRA_MEMORY.lastMessageId = data.id;
        return 'Feito! Coloquei no painel: "' + content + '"';
    } catch (e) { return 'Erro ao conectar.'; }
}

async function handleStingerCommand() {
    // Se estiver na própria página do monitor, roda direto (sem lag)
    if (window.triggerStinger) {
        window.triggerStinger();
        return 'Rodando vinheta agora! ⚽';
    }

    // Se estiver remoto, manda comando via API
    try {
        await fetch('/api/dashboard/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'CMD_STINGER', type: 'stinger_cmd', sender: 'Kira AI' })
        });
        return 'Mandei o comando para o painel. A vinheta deve rodar na próxima atualização (30s).';
    } catch (e) { return 'Erro ao enviar comando.'; }
}

async function handleListCommand() {
    try {
        const [msgRes, invRes] = await Promise.all([
            fetch('/api/dashboard/messages'),
            fetch('/api/inventario')
        ]);

        const msgs = await msgRes.json();
        const inventory = await invRes.json();
        const sysAlerts = generateSystemAlerts(inventory.items || []);

        if (msgs.length === 0 && sysAlerts.length === 0) return 'O painel está limpo. Zero avisos.';

        let out = '<strong>No Painel Agora:</strong><br>';

        if (sysAlerts.length > 0) {
            out += '<br> <em>Sistema (Estoque):</em><br>' + sysAlerts.map(a => `- ${a.title}: ${a.text}`).join('<br>');
        }

        if (msgs.length > 0) {
            out += '<br><br> <em>Mensagens:</em><br>' + msgs.map(m => `- ${m.text}`).join('<br>');
        }

        return out;
    } catch (e) { return 'Erro ao ler painel.'; }
}

async function handleInventoryQuery(text) {
    try {
        const res = await fetch('/api/inventario');
        const data = await res.json();
        const clean = text.replace(/quantos|tem|estoque|de|kira/gi, '').trim();
        const term = clean.split(' ')[0];

        const found = (data.items || []).filter(i => i.nome.toLowerCase().includes(term));

        if (!found.length) return `Não achei nada de "${term}".`;

        const total = found.reduce((acc, i) => acc + (parseInt(i.estoque) || 0), 0);
        let msg = `Total de ${total} unidades de ${term}.`;
        if (total < 5) msg += '<br> <strong>Crítico!</strong>';

        return msg;
    } catch (e) { return 'Erro no estoque.'; }
}

function handleWeatherQuery() {
    return ' <strong>Análise:</strong> Chuva prevista. Proteja equipamentos.';
}

function generateSystemAlerts(items) {
    const alerts = [];
    const checks = [
        { match: 'Fita isolante', key: 'Fita isolante' },
        { match: 'Fita crepe', key: 'Fita crepe preta 48mm x 50m' },
        { match: 'Fumaça', key: 'Liquido de Fumaça' },
        { match: 'Pilhas AA', key: 'Pilhas AA' }
    ];

    checks.forEach(check => {
        const foundItems = items.filter(i => i.nome.toLowerCase().includes(check.match.toLowerCase()));
        if (foundItems.length > 0) {
            let totalStock = 0;
            foundItems.forEach(i => totalStock += (parseInt(i.estoque) || 0));

            const rule = SYSTEM_THRESHOLDS[check.key];
            if (rule) {
                if (totalStock <= rule.critical) {
                    alerts.push({ type: 'critical', title: check.key, text: `Crítico (${totalStock} ${rule.unit})` });
                } else if (rule.warn && totalStock <= rule.warn) {
                    alerts.push({ type: 'warning', title: check.key, text: `Baixo (${totalStock} ${rule.unit})` });
                }
            }
        }
    });
    return alerts;
}

function matchAny(text, keywords) {
    return keywords.some(k => text.includes(k));
}

// DOM INTEGRATION
const markInputRef = document.getElementById('markInput');
const markMessages = document.getElementById('markMessages');

if (markInputRef) {
    markInputRef.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const val = markInputRef.value;
            if (!val) return;
            markInputRef.value = '';
            markInputRef.value = '';
            addMessage(val, 'user');
            const resp = await processMarkCommand(val);
            setTimeout(() => addMessage(resp, 'assistant'), 400);
        }
    });
}

// function addMessage replaced by addMessageToUI and wrapper
function addMessageToUI(text, type, save = true) {
    const markMessages = document.getElementById('markMessages') || document.getElementById('chatContainer');
    if (!markMessages) return;

    const d = document.createElement('div');
    d.className = 'mark-message ' + type;
    d.innerHTML = text;
    markMessages.appendChild(d);
    markMessages.scrollTop = markMessages.scrollHeight;

    if (save) {
        saveChatHistory(text, type);
    }
}

// Wrapper to maintain compatibility with existing code
function addMessage(text, type) {
    // Map 'user'/'assistant' types if needed, or pass through
    // The existing code uses 'user' and 'mark' (or 'assistant' in CSS). 
    // Let's normalize to 'user' and 'assistant' for consistency with CSS
    let uiType = type;
    if (type === 'mark') uiType = 'assistant';
    addMessageToUI(text, uiType, true);
}

function sendToMark() {
    const i = document.getElementById('markInput');
    if (i && i.value) i.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'Enter' }));
}
window.sendToMark = sendToMark;

// --- UI TOGGLE LOGIC ---
function toggleMark() {
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');

    const icon = document.getElementById('markToggleIcon');
    if (icon) {
        icon.textContent = isCollapsed ? '▶' : '◀';
    }

    localStorage.setItem('markSidebarState', isCollapsed ? 'collapsed' : 'expanded');
}

// Restore State on Load
document.addEventListener('DOMContentLoaded', () => {
    const state = localStorage.getItem('markSidebarState');
    const sidebar = document.getElementById('markSidebar');
    const icon = document.getElementById('markToggleIcon');
    const chatContainer = document.getElementById('chatContainer') || document.getElementById('markMessages'); // Support both IDs

    // 1. Sidebar State Restore handled by HEAD script (Critical Path)
    if (state === 'collapsed') {
        document.body.classList.add('sidebar-collapsed');
        if (icon) icon.textContent = '▶';
    } else {
        if (icon) icon.textContent = '◀';
    }

    // 2. Enable Animations after repaint
    setTimeout(() => {
        document.body.classList.add('animated-transitions');
    }, 100);

    // 3. Restore Chat History
    loadChatHistory();
});

function loadChatHistory() {
    const history = JSON.parse(localStorage.getItem('markChatHistory') || '[]');
    const chatContainer = document.getElementById('chatContainer') || document.getElementById('markMessages');

    if (!chatContainer) return;

    if (history.length > 0) {
        // Clear default greeting if history exists, but keep structure if needed
        chatContainer.innerHTML = '';
        history.forEach(msg => {
            addMessageToUI(msg.text, msg.type, false); // false = don't save again
        });
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        // If no history, ensure default greeting is there (it usually is by HTML)
    }
}

function saveChatHistory(text, type) {
    const history = JSON.parse(localStorage.getItem('markChatHistory') || '[]');
    history.push({ text, type });
    // Keep last 50 messages to save space
    if (history.length > 50) history.shift();
    localStorage.setItem('markChatHistory', JSON.stringify(history));
}

function clearChatHistory() {
    localStorage.removeItem('markChatHistory');
    const chatContainer = document.getElementById('chatContainer') || document.getElementById('markMessages');
    if (chatContainer) {
        chatContainer.innerHTML = '<div class="mark-message assistant">Histórico limpo! Como posso ajudar?</div>';
    }
}
window.clearChatHistory = clearChatHistory;


window.toggleMark = toggleMark;
