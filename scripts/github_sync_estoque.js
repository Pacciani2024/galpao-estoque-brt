/**
 * ============================================================
 * GITHUB SYNC - ESTOQUE BRT GALPÃO
 * ============================================================
 * Lê o inventory_complete.json local e publica um estoque.json
 * limpo (com preços) no repositório privado do GitHub.
 *
 * Não usa git CLI — usa apenas a API REST do GitHub via fetch.
 * ============================================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

// ─── Configurações ────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'BRT-STUDIO01';
const GITHUB_REPO = 'Galpao';
const GITHUB_BRANCH = 'main';               // branch principal do repositório
const GITHUB_PATH = 'dados/estoque.json'; // caminho dentro do repo

const INVENTORY_PATH = path.join(__dirname, '../logs/inventory_complete.json');

// ─── Validação ────────────────────────────────────────────────────────────────
if (!GITHUB_TOKEN) {
    console.error('❌ [GitHub Sync] GITHUB_TOKEN não configurado no .env!');
    console.error('   Adicione: GITHUB_TOKEN=ghp_seu_token_aqui');
    process.exit(1);
}

if (!fs.existsSync(INVENTORY_PATH)) {
    console.error('❌ [GitHub Sync] inventory_complete.json não encontrado em:', INVENTORY_PATH);
    process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converte string de preço brasileira ("1.250,00") para número (1250.00).
 */
function parseBRLPrice(str) {
    if (!str || str === '' || str === '0,00') return 0;
    // Remove pontos de milhar, troca vírgula por ponto
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Busca o SHA atual do arquivo no GitHub (necessário para fazer update).
 * Retorna null se o arquivo ainda não existir (primeiro push).
 */
async function getFileSHA() {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        }
    });

    if (res.status === 404) return null; // arquivo ainda não existe
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Erro ao buscar SHA: ${res.status} — ${body}`);
    }

    const data = await res.json();
    return data.sha;
}

/**
 * Cria ou atualiza o arquivo no GitHub com o conteúdo fornecido.
 */
async function pushToGitHub(content, sha) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

    const body = {
        message: `🔄 Sync estoque — ${new Date().toLocaleString('pt-BR')}`,
        content: Buffer.from(content).toString('base64'),
        branch: GITHUB_BRANCH,
    };

    if (sha) body.sha = sha; // obrigatório para UPDATE; omitir só na criação

    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Erro ao publicar no GitHub: ${res.status} — ${err}`);
    }

    return await res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncEstoque() {
    console.log('\n📦 [GitHub Sync] Iniciando sincronização do estoque...');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));

    try {
        // 1. Lê inventário local
        const raw = fs.readFileSync(INVENTORY_PATH, 'utf-8');
        const inventory = JSON.parse(raw);
        const items = inventory.items || [];

        // 2. Gera estoque.json limpo
        //    - estoque > 0  → item próprio (disponível)
        //    - estoque = 0  → item de sublocação (sem quantidade própria)
        const estoque = {
            atualizado: new Date().toISOString(),
            totalItens: 0,
            totalProprios: 0,
            totalSublocacao: 0,
            itens: []
        };

        estoque.itens = items
            .map(item => {
                const qtd = parseInt(item.estoque) || 0;
                return {
                    id: item.id,
                    nome: item.nome ? item.nome.trim() : 'Sem nome',
                    categoria: item.categoria || '',
                    marca: item.marca || '',
                    modelo: item.modelo || '',
                    tipo: qtd > 0 ? 'proprio' : 'sublocacao',
                    disponivel: qtd,
                    precoVenda: parseBRLPrice(item.valorVenda),
                    descricao: item.descricao
                        ? item.descricao.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim()
                        : '',
                };
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        estoque.totalItens = estoque.itens.length;
        estoque.totalProprios = estoque.itens.filter(i => i.tipo === 'proprio').length;
        estoque.totalSublocacao = estoque.itens.filter(i => i.tipo === 'sublocacao').length;

        const jsonContent = JSON.stringify(estoque, null, 2);

        console.log(`📊 Total: ${estoque.totalItens} itens`);
        console.log(`   ✅ Próprios (disponíveis): ${estoque.totalProprios}`);
        console.log(`   🔄 Sublocação (estoque 0):  ${estoque.totalSublocacao}`);

        // 3. Busca SHA atual (para update) ou null (para criação)
        console.log('🔍 Buscando versão atual no GitHub...');
        const sha = await getFileSHA();
        console.log(sha ? `   ↳ Arquivo existe — SHA: ${sha.substring(0, 8)}...` : '   ↳ Arquivo não existe — criando...');

        // 4. Faz push
        console.log('🚀 Publicando no GitHub...');
        const result = await pushToGitHub(jsonContent, sha);

        const commitSha = result?.commit?.sha?.substring(0, 8) || 'N/A';
        console.log(`✅ [GitHub Sync] Estoque publicado com sucesso! Commit: ${commitSha}`);
        console.log(`   📍 github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${GITHUB_PATH}\n`);

    } catch (error) {
        console.error('❌ [GitHub Sync] Erro na sincronização:', error.message);
        // Não lança exceção — erros de sync não devem parar o servidor
    }
}

// Executar diretamente (chamado pelo scheduler ou manualmente)
syncEstoque();
