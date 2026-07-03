// Dashboard Main
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadEventos();
    loadTicker();
});

// --- TICKER & ALERTS LOGIC (Agent Console) ---
const thresholds = {
    'Fita isolante': { critical: 6, warn: 10, unit: 'rolos' },
    'Fita crepe preta 48mm x 50m': { critical: 12, unit: 'rolos' },
    'Liquido de Fumaça': { critical: 3, unit: 'galões' },
    'Pilhas AA': { critical: 20, unit: 'un' }
};

async function loadTicker() {
    try {
        const [msgRes, invRes] = await Promise.all([
            fetch('/api/dashboard/messages'),
            fetch('/api/inventario')
        ]);

        const messages = await msgRes.json();
        const inventory = await invRes.json();

        const alerts = generateAlerts(inventory.items);
        const allItems = [
            ...messages.map(m => ({ ...m, category: 'message' })),
            ...alerts.map(a => ({ ...a, category: 'alert' }))
        ];

        renderTicker(allItems);

    } catch (error) {
        console.error('Erro ao carregar ticker:', error);
        const container = document.getElementById('tickerContent');
        if (container) container.innerHTML = '<div class="ticker-item error">Erro de conexão</div>';
    }
}

function generateAlerts(items) {
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

            const rule = thresholds[check.key];
            if (rule) {
                if (totalStock <= rule.critical) {
                    alerts.push({ type: 'critical', title: check.key, text: `Estoque Crítico: ${totalStock} ${rule.unit}`, icon: '🚨' });
                } else if (rule.warn && totalStock <= rule.warn) {
                    alerts.push({ type: 'warning', title: check.key, text: `Estoque Baixo: ${totalStock} ${rule.unit}`, icon: '⚠️' });
                } else {
                    alerts.push({ type: 'success', title: check.key, text: `Estoque Saudável: ${totalStock} ${rule.unit}`, icon: '✅' });
                }
            }
        }
    });
    return alerts;
}

function renderTicker(items) {
    const container = document.getElementById('tickerContent');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div class="ticker-item">Tudo tranquilo! 🦗</div>';
        return;
    }

    let currentIndex = 0;

    if (window.tickerInterval) clearInterval(window.tickerInterval);

    function showItem() {
        // --- STINGER CHECK ---
        const stingerCmd = items.find(i => i.type === 'stinger_cmd');
        if (stingerCmd) {
            triggerDashboardStinger(stingerCmd.id);
            // Remover da lista para não tentar renderizar como texto
            const idx = items.indexOf(stingerCmd);
            if (idx > -1) items.splice(idx, 1);
        }

        if (items.length === 0) {
            container.innerHTML = '<div class="ticker-item">Tudo tranquilo! 🦗</div>';
            return;
        }

        const item = items[currentIndex];
        const icon = item.icon || (item.category === 'message' ? '💬' : '⚠️');

        // Formata o sender se for mensagem manual
        const title = item.category === 'message' && item.sender ? item.sender : (item.title || 'Aviso');

        container.innerHTML = `
            <div class="ticker-item fade-in">
                <div class="ticker-icon">${icon}</div>
                <div class="ticker-text">
                    <strong>${title}</strong>: ${item.text}
                </div>
            </div>
        `;

        currentIndex = (currentIndex + 1) % items.length;
    }

    showItem();
    window.tickerInterval = setInterval(showItem, 8000);
}

// --- STINGER LOGIC (Contained in Agent Console) ---
async function triggerDashboardStinger(cmdId) {
    const consoleBox = document.querySelector('.agent-console');
    if (!consoleBox) return;

    // Verificar se já tem overlay
    let overlay = consoleBox.querySelector('.stinger-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'stinger-overlay';
        overlay.innerHTML = '<img src="/img/logo-full.png" class="stinger-img">';
        consoleBox.appendChild(overlay);
    }

    // Play Animation
    overlay.classList.add('active');

    // Cleanup Command
    if (cmdId) {
        try { await fetch('/api/dashboard/messages/' + cmdId, { method: 'DELETE' }); }
        catch (e) { }
    }

    // Reset after animation
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 4000);
}

// Auto-Trigger Stinger every 5 minutes (300000ms)
setInterval(() => {
    triggerDashboardStinger();
}, 300000);

// --- STANDARD EXPORTS ---

// Carregar Estatísticas
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        updateStat('totalItens', data.totalItens);
        updateStat('emUso', data.emUso || 0);
        updateStat('estoqueDisponivel', data.disponivel || 0);
        updateStat('manutencao', data.manutencao || 0);
    } catch (error) { console.error('Erro stats:', error); }
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Carregar Eventos
async function loadEventos() {
    try {
        const response = await fetch('/api/eventos');
        const data = await response.json();
        const tbody = document.getElementById('eventosTable');

        if (!data.eventos || data.eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sem eventos próximos</td></tr>';
            return;
        }

        tbody.innerHTML = data.eventos.slice(0, 5).map(e => `
            <tr>
                <td><strong>${e.nomeevento}</strong></td>
                <td>${formatDate(e.dataevento)}</td>
                <td>${e.localevento}</td>
                <td>${e.totalEquipamentos} itens</td>
                <td><span class="badge badge-${e.totalEquipamentos > 0 ? 'success' : 'warning'}">
                    ${e.totalEquipamentos > 0 ? 'Pronto' : 'Pendente'}
                </span></td>
            </tr>
        `).join('');
    } catch (error) { console.error('Erro eventos:', error); }
}

function formatDate(dateStr) {
    if (!dateStr) return '--/--/----';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}
