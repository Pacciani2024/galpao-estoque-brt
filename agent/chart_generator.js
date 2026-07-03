/**
 * Gerador de Gráficos Dinâmicos para Mark
 * Cria visualizações de dados em tempo real
 */

const fs = require('fs');
const path = require('path');

class ChartGenerator {
    constructor() {
        this.outputDir = path.join(__dirname, '../public/charts');
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Analisa dados de alocação e retorna top itens
     */
    getTopAllocatedItems(inventory, limit = 10) {
        return inventory
            .filter(item => (item.alocado || 0) > 0)
            .sort((a, b) => (b.alocado || 0) - (a.alocado || 0))
            .slice(0, limit)
            .map(item => ({
                nome: item.nome,
                quantidade: item.alocado || 0
            }));
    }

    /**
     * Analisa eventos por mês
     */
    getEventsByMonth(events, months = 6) {
        const now = new Date();
        const monthCounts = {};

        // Inicializar últimos N meses
        for (let i = months - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthCounts[key] = 0;
        }

        // Contar eventos
        events.forEach(event => {
            const eventDate = new Date(event.dataevento);
            const key = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthCounts.hasOwnProperty(key)) {
                monthCounts[key]++;
            }
        });

        return Object.entries(monthCounts).map(([month, count]) => ({
            mes: month,
            quantidade: count
        }));
    }

    /**
     * Analisa status do inventário
     */
    getInventoryStatus(inventory) {
        let disponivel = 0;
        let alocado = 0;
        let manutencao = 0;

        inventory.forEach(item => {
            const estoque = item.estoque || 0;
            const aloc = item.alocado || 0;
            const manut = item.manutencao || 0;

            disponivel += (estoque - aloc - manut);
            alocado += aloc;
            manutencao += manut;
        });

        return { disponivel, alocado, manutencao };
    }

    /**
     * Analisa categorias mais usadas
     */
    getTopCategories(inventory, limit = 5) {
        const categoryStats = {};

        inventory.forEach(item => {
            const cat = item.categoria || 'Sem Categoria';
            if (!categoryStats[cat]) {
                categoryStats[cat] = { total: 0, alocado: 0 };
            }
            categoryStats[cat].total += (item.estoque || 0);
            categoryStats[cat].alocado += (item.alocado || 0);
        });

        return Object.entries(categoryStats)
            .sort((a, b) => b[1].alocado - a[1].alocado)
            .slice(0, limit)
            .map(([categoria, stats]) => ({
                categoria,
                alocado: stats.alocado,
                total: stats.total
            }));
    }

    /**
     * Analisa itens disponíveis vs tickados (QR escaneados)
     */
    getAvailableVsTicked(inventory) {
        let disponivel = 0;
        let tickado = 0; // Itens com QR code registrado
        let semQR = 0;

        inventory.forEach(item => {
            const estoque = item.estoque || 0;
            const alocado = item.alocado || 0;
            const manutencao = item.manutencao || 0;
            const hasQR = item.qrCodes && item.qrCodes.length > 0;

            const disp = estoque - alocado - manutencao;

            if (hasQR) {
                tickado += disp;
            } else {
                semQR += disp;
            }
            disponivel += disp;
        });

        return { disponivel, tickado, semQR };
    }

    /**
     * Analisa distribuição por categoria principal (Luz, Som, Vídeo)
     */
    getCategoryBreakdown(inventory) {
        const categories = {
            'Som': 0,
            'Iluminação': 0,
            'Vídeo': 0,
            'Estrutura': 0,
            'Outros': 0
        };

        inventory.forEach(item => {
            const cat = (item.categoria || '').toUpperCase();
            const nome = (item.nome || '').toUpperCase();
            const qty = item.estoque || 0;

            // Detectar por categoria ou nome do item
            if (cat.includes('SONORIZAÇÃO') || cat.includes('SOM') || cat.includes('AUDIO') ||
                nome.includes('CAIXA') || nome.includes('MICROFONE') || nome.includes('MESA DE SOM') ||
                nome.includes('AMPLIFICADOR') || nome.includes('SUBWOOFER')) {
                categories['Som'] += qty;
            } else if (cat.includes('ILUMINAÇÃO') || cat.includes('ILUMINACAO') || cat.includes('LUZ') ||
                nome.includes('PAR LED') || nome.includes('MOVING') || nome.includes('REFLETOR') ||
                nome.includes('BEAM') || nome.includes('STROBO') || nome.includes('RIBALTA')) {
                categories['Iluminação'] += qty;
            } else if (cat.includes('VIDEO') || cat.includes('VÍDEO') || cat.includes('PROJEÇÃO') ||
                nome.includes('TELA') || nome.includes('PROJETOR') || nome.includes('LED WALL') ||
                nome.includes('MONITOR')) {
                categories['Vídeo'] += qty;
            } else if (cat.includes('ESTRUTURA') || cat.includes('TRUSS') || cat.includes('SUPORTE') ||
                nome.includes('TRUSS') || nome.includes('TORRE') || nome.includes('SUPORTE') ||
                nome.includes('BASE')) {
                categories['Estrutura'] += qty;
            } else {
                categories['Outros'] += qty;
            }
        });

        return Object.entries(categories)
            .filter(([_, qty]) => qty > 0)
            .sort((a, b) => b[1] - a[1]) // Ordenar por quantidade
            .map(([categoria, quantidade]) => ({ categoria, quantidade }));
    }

    /**
     * Analisa taxa de utilização do estoque
     */
    getUtilizationRate(inventory) {
        let total = 0;
        let emUso = 0;

        inventory.forEach(item => {
            const estoque = item.estoque || 0;
            const alocado = item.alocado || 0;
            total += estoque;
            emUso += alocado;
        });

        const disponivel = total - emUso;
        const taxaUso = total > 0 ? Math.round((emUso / total) * 100) : 0;

        return { total, emUso, disponivel, taxaUso };
    }

    /**
     * Analisa itens em manutenção (top 10)
     */
    getMaintenanceItems(inventory, limit = 10) {
        return inventory
            .filter(item => (item.manutencao || 0) > 0)
            .sort((a, b) => (b.manutencao || 0) - (a.manutencao || 0))
            .slice(0, limit)
            .map(item => ({
                nome: item.nome,
                quantidade: item.manutencao || 0
            }));
    }

    /**
     * Gera prompt para criação de gráfico
     */
    generateChartPrompt(type, data) {
        const brandStyle = `
Style requirements (BRT AUDIOVISUAL BRAND GUIDE):
- Background: Pure black (#000000)
- Primary color: White (#FFFFFF)
- Accent color: Light gray (#CCCCCC) for secondary elements
- Font: Roboto (all text)
- Clean, minimalist, professional design
- High contrast for readability
- Modern business dashboard aesthetic`;

        const prompts = {
            'top_items': () => {
                const items = data.map((item, i) => `${i + 1}. ${item.nome}: ${item.quantidade} unidades`).join('\n');
                return `Create a modern, professional horizontal bar chart showing "Top 10 Itens Mais Alocados - BRT Audiovisual".

Data:
${items}

${brandStyle}
- White bars with subtle gradient
- Item names in white (Roboto Medium)
- Numbers on bars in black text
- Title in white (Roboto Bold)
- Grid lines in dark gray (#333333)`;
            },

            'events_timeline': () => {
                const months = data.map(d => `${d.mes}: ${d.quantidade} eventos`).join('\n');
                return `Create a modern line chart showing "Eventos por Mês - BRT Audiovisual" for the last 6 months.

Data:
${months}

${brandStyle}
- White line with smooth curve
- White dots on data points
- Month labels in white (Roboto Regular)
- Grid lines in dark gray (#222222)
- Y-axis labels in white
- Include subtle trend indicator`;
            },

            'inventory_status': () => {
                return `Create a modern donut chart showing "Status do Inventário - BRT Audiovisual".

Data:
- Disponível: ${data.disponivel} unidades
- Alocado: ${data.alocado} unidades
- Manutenção: ${data.manutencao} unidades

${brandStyle}
- Donut segments: White, Light Gray (#AAAAAA), Dark Gray (#666666)
- Center text showing total in white (Roboto Bold): ${data.disponivel + data.alocado + data.manutencao} unidades
- Percentage labels in white (Roboto Medium)
- Legend with white text
- Clean, minimal design`;
            },

            'top_categories': () => {
                const cats = data.map((cat, i) => `${i + 1}. ${cat.categoria}: ${cat.alocado}/${cat.total} alocados`).join('\n');
                return `Create a modern stacked bar chart showing "Top 5 Categorias Mais Usadas - BRT Audiovisual".

Data:
${cats}

${brandStyle}
- Allocated portion: White
- Available portion: Dark gray (#444444)
- Category names in white (Roboto Medium)
- Quantity labels in white
- Show percentage of allocation
- Legend in white text (Roboto Regular)`;
            }
        };

        return prompts[type] ? prompts[type]() : null;
    }

    /**
     * Gera nome de arquivo único
     */
    generateFilename(type) {
        const timestamp = Date.now();
        return `${type}_${timestamp}.png`;
    }
}

module.exports = ChartGenerator;
