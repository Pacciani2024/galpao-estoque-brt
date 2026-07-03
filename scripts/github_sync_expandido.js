/**
 * ============================================================
 * GITHUB SYNC EXPANDIDO - BRT GALPÃO
 * ============================================================
 * Publica 3 conjuntos de dados no GitHub:
 *
 *  dados/estoque.json       → Inventário completo com preços
 *  eventos/ativos.json      → Eventos próximos com itens e pendências
 *  saidas/despachados.json  → Eventos que saíram para a rua
 *
 * A pasta pedidos/ é lida (para o galpão processar orçamentos do
 * vendedor) mas NUNCA sobrescrita por este script.
 * ============================================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

// ─── Configurações ────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'BRT-STUDIO01';
const GITHUB_REPO = 'Galpao';
const GITHUB_BRANCH = 'main';

const LOGS = path.join(__dirname, '../logs');

const PATHS = {
    inventory: path.join(LOGS, 'inventory_complete.json'),
    eventos: path.join(LOGS, 'eventos_completos.json'),
    separations: path.join(LOGS, 'event_separations.json'),
    tickDir: path.join(LOGS, 'tick_progress'),
};

// ─── Validação ────────────────────────────────────────────────────────────────
if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN não configurado no .env!');
    process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBRLPrice(str) {
    if (!str || str === '0,00') return 0;
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function cleanText(str) {
    if (!str) return '';
    return str.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
}

function readJSON(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
    catch { return null; }
}

async function getFileSHA(githubPath) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, { headers: githubHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SHA fetch fail: ${res.status}`);
    return (await res.json()).sha;
}

async function pushFile(githubPath, content, label) {
    const sha = await getFileSHA(githubPath);
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`;
    const body = {
        message: `🔄 [${label}] Sync — ${new Date().toLocaleString('pt-BR')}`,
        content: Buffer.from(content).toString('base64'),
        branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
        method: 'PUT',
        headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Push fail [${githubPath}]: ${res.status} — ${err}`);
    }
    const data = await res.json();
    return data?.commit?.sha?.substring(0, 8) || 'OK';
}

function githubHeaders() {
    return {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * 1. dados/estoque.json
 * Todos os itens do inventário. tipo: 'proprio' | 'sublocacao'
 */
function buildEstoque() {
    const inv = readJSON(PATHS.inventory);
    const items = inv?.items || [];

    const itens = items
        .map(item => {
            const qtd = parseInt(item.estoque) || 0;
            return {
                id: item.id,
                nome: item.nome?.trim() || 'Sem nome',
                categoria: item.categoria || '',
                marca: item.marca || '',
                modelo: item.modelo || '',
                tipo: qtd > 0 ? 'proprio' : 'sublocacao',
                disponivel: qtd,
                precoVenda: parseBRLPrice(item.valorVenda),
                descricao: cleanText(item.descricao),
            };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
        atualizado: new Date().toISOString(),
        totalItens: itens.length,
        totalProprios: itens.filter(i => i.tipo === 'proprio').length,
        totalSublocacao: itens.filter(i => i.tipo === 'sublocacao').length,
        itens,
    };
}

/**
 * 2. eventos/ativos.json
 * Eventos próximos com lista de itens.
 * Inclui pendências: itens ainda não confirmados na separação.
 */
function buildEventosAtivos() {
    const data = readJSON(PATHS.eventos);
    const eventos = data?.eventos || [];

    // Carregar tick_progress para calcular pendências
    const tickMap = {};
    if (fs.existsSync(PATHS.tickDir)) {
        fs.readdirSync(PATHS.tickDir).forEach(file => {
            if (!file.endsWith('.json')) return;
            const tick = readJSON(path.join(PATHS.tickDir, file));
            if (tick?.eventId) tickMap[String(tick.eventId)] = tick;
        });
    }

    const resultado = eventos.map(ev => {
        const tick = tickMap[String(ev.id)] || null;
        const equipamentos = (ev.equipamentos || []).map(eq => {
            // Verificar se foi separado no tick_progress
            let separado = 0;
            if (tick?.separatedItems) {
                const found = tick.separatedItems.find(si =>
                    (si.nome || si.name || '').toLowerCase() === eq.nome.toLowerCase()
                );
                if (found) separado = found.qtySeparada || found.quantity || 0;
            }

            const pendente = Math.max(0, eq.quantidade - separado);
            return {
                nome: eq.nome,
                categoria: eq.categoria?.replace(/^\d+ - /, '') || '',
                quantidade: eq.quantidade,
                separado,
                pendente,
                ok: pendente === 0,
            };
        });

        const totalItens = equipamentos.length;
        const itensSeparados = equipamentos.filter(e => e.ok).length;
        const itensPendentes = equipamentos.filter(e => !e.ok).length;

        return {
            id: ev.id,
            nome: ev.nomeevento || ev.nomeCliente || '',
            cliente: ev.nomeCliente || '',
            dataEvento: ev.dataevento || '',
            horaEvento: ev.horaevento || '',
            local: ev.localevento || '',
            cidade: ev.cidade || '',
            estado: ev.estado || '',
            endereco: [ev.endereco, ev.numero, ev.complemento].filter(Boolean).join(', '),
            tipo: ev.tipoEvento || '',
            caracteristica: ev.caracteristica || '',
            datasAdicionais: ev.datasAdicionais || null,
            totalItens,
            itensSeparados,
            itensPendentes,
            percentualSeparacao: totalItens > 0 ? Math.round((itensSeparados / totalItens) * 100) : 0,
            statusSeparacao: tick?.status || 'nao_iniciado',
            equipamentos,
        };
    }).sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento));

    return {
        atualizado: new Date().toISOString(),
        totalEventos: resultado.length,
        eventos: resultado,
    };
}

/**
 * 3. saidas/despachados.json
 * Eventos que foram para a rua (status: dispatched ou returned_partial)
 * Fonte: tick_progress com status 'dispatched' | 'returned_partial' | 'returned'
 */
function buildDespachados() {
    const seps = readJSON(PATHS.separations)?.separations || [];

    // Agrupa separações por eventId — pega a mais recente de cada evento
    const byEvent = {};
    seps.forEach(sep => {
        const eid = String(sep.eventId);
        const existing = byEvent[eid];
        if (!existing || new Date(sep.completedAt) > new Date(existing.completedAt)) {
            byEvent[eid] = sep;
        }
    });

    // Carregar tick_progress para status atual
    const tickMap = {};
    if (fs.existsSync(PATHS.tickDir)) {
        fs.readdirSync(PATHS.tickDir).forEach(file => {
            if (!file.endsWith('.json')) return;
            const tick = readJSON(path.join(PATHS.tickDir, file));
            if (tick?.eventId) tickMap[String(tick.eventId)] = tick;
        });
    }

    // Filtrar apenas despachados (que tinham status dispatched/returned)
    const despachados = Object.values(byEvent)
        .filter(sep => {
            const tick = tickMap[String(sep.eventId)];
            if (!tick) return false;
            return ['dispatched', 'returned_partial', 'returned', 'completed'].includes(tick.status);
        })
        .map(sep => {
            const tick = tickMap[String(sep.eventId)];
            return {
                eventId: sep.eventId,
                nomeEvento: sep.eventName || '',
                status: tick?.status || sep.status || '',
                dataEvento: tick?.lastUpdated || sep.completedAt || '',
                totalItens: sep.totalItems || 0,
                itensSeparados: sep.completedItems || 0,
                percentual: sep.completionPercentage || 0,
                itens: (sep.separatedItems || []).map(it => ({
                    nome: it.nome || it.name || '',
                    quantidade: it.qtySeparada || it.quantity || 0,
                })),
            };
        })
        .sort((a, b) => new Date(b.dataEvento) - new Date(a.dataEvento));

    return {
        atualizado: new Date().toISOString(),
        totalDespachadados: despachados.length,
        eventos: despachados,
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncAll() {
    console.log('\n🚀 [GitHub Sync Expandido] Iniciando...');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));
    console.log('─'.repeat(60));

    const tasks = [
        {
            label: 'Estoque',
            githubPath: 'dados/estoque.json',
            builder: buildEstoque,
        },
        {
            label: 'Eventos Ativos',
            githubPath: 'eventos/ativos.json',
            builder: buildEventosAtivos,
        },
        {
            label: 'Saídas/Despachados',
            githubPath: 'saidas/despachados.json',
            builder: buildDespachados,
        },
    ];

    for (const task of tasks) {
        try {
            console.log(`\n📤 Publicando [${task.label}]...`);
            const data = task.builder();
            const content = JSON.stringify(data, null, 2);
            const commit = await pushFile(task.githubPath, content, task.label);
            console.log(`   ✅ OK — commit: ${commit}`);
            console.log(`   📍 github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${task.githubPath}`);
        } catch (err) {
            console.error(`   ❌ Erro em [${task.label}]:`, err.message);
        }
    }

    console.log('\n─'.repeat(60));
    console.log('✅ [GitHub Sync Expandido] Concluído!\n');
}

syncAll();
