/**
 * Módulo: Inventory Scraper - VERSÃO FINAL
 * Scraper com paginação detectada dinamicamente
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

class InventoryScraper {
    constructor() {
        this.sessionCookie = process.env.MEEVENTOS_COOKIE_MANUAL;
        this.baseURL = 'https://app1.meeventos.com.br/brt';
    }

    async getInventory() {
        const browser = await puppeteer.launch({
            headless: true, // container não tem display
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ],
            defaultViewport: { width: 1920, height: 1080 }
        });

        const page = await browser.newPage();

        try {
            // 1. COOKIE
            console.log('🔐 Configurando cookie...');

            if (!this.sessionCookie) {
                throw new Error('MEEVENTOS_COOKIE_MANUAL não configurado');
            }

            await page.goto(this.baseURL, { waitUntil: 'domcontentloaded' });
            await page.setCookie({
                name: 'PHPSESSID',
                value: this.sessionCookie,
                domain: 'app1.meeventos.com.br',
                path: '/',
                httpOnly: true
            });

            console.log('✅ Cookie configurado!');

            // 2. IR PARA INVENTÁRIO
            console.log('📦 Navegando para inventário...\n');
            await page.goto(`${this.baseURL}/index.php?p=equipamentos`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await new Promise(r => setTimeout(r, 2000));

            let allItems = [];
            let currentPage = 1;
            let hasNextPage = true;

            // 3. PERCORRER TODAS AS PÁGINAS (detectado dinamicamente)
            while (hasNextPage) {
                console.log(`📖 Processando página ${currentPage}...`);

                // Extrair dados da página atual
                const items = await page.evaluate(() => {
                    const resultados = [];
                    const rows = document.querySelectorAll('table tbody tr');

                    rows.forEach(row => {
                        const tds = row.querySelectorAll('td');

                        if (tds.length >= 10) {
                            try {
                                // td[2]: Nome
                                const nomeCompleto = tds[2]?.innerText.trim() || '';
                                const nome = nomeCompleto.split('\n')[0].trim();

                                // td[3]: Categoria
                                const categoria = tds[3]?.innerText.trim() || '';

                                // td[5]: Marca
                                const marca = tds[5]?.innerText.trim() || '';

                                // td[6]: Modelo
                                const modelo = tds[6]?.innerText.trim() || '';

                                // td[7]: Estoque
                                const estoqueText = tds[7]?.innerText.trim() || '0 un';
                                const estoqueMatch = estoqueText.match(/(\d+)\s*un/i);
                                const estoque = estoqueMatch ? parseInt(estoqueMatch[1]) : 0;

                                // td[8]: Valor Custo
                                const custText = tds[8]?.innerText.trim() || 'R$ 0,00';
                                const valorCusto = custText.replace('R$', '').trim();

                                // td[9]: Valor Venda
                                const vendaText = tds[9]?.innerText.trim() || 'R$ 0,00';
                                const valorVenda = vendaText.replace('R$', '').trim();

                                if (nome) {
                                    resultados.push({
                                        nome,
                                        categoria,
                                        marca,
                                        modelo,
                                        estoque,
                                        valorCusto,
                                        valorVenda
                                    });
                                }
                            } catch (e) {
                                // Pular linha com erro
                            }
                        }
                    });

                    return resultados;
                });

                allItems = allItems.concat(items);
                console.log(`   → ${items.length} itens (Total acumulado: ${allItems.length})`);

                // Verificar se existe botão "próxima página" (»)
                hasNextPage = await page.evaluate(() => {
                    const nextButtons = document.querySelectorAll('.pagination li a.paginacao');
                    for (let btn of nextButtons) {
                        if (btn.textContent.trim() === '»') {
                            // Verificar se não está desabilitado
                            const parent = btn.closest('li');
                            if (!parent.classList.contains('disabled')) {
                                return true;
                            }
                        }
                    }
                    return false;
                });

                if (hasNextPage) {
                    try {
                        // Clicar no botão »
                        await page.evaluate(() => {
                            const nextButtons = document.querySelectorAll('.pagination li a.paginacao');
                            for (let btn of nextButtons) {
                                if (btn.textContent.trim() === '»') {
                                    btn.click();
                                    return;
                                }
                            }
                        });

                        await new Promise(r => setTimeout(r, 2000));
                        await page.waitForSelector('table tbody tr', { timeout: 5000 });
                        currentPage++;
                    } catch (e) {
                        console.log('   ⚠️ Erro ao navegar:', e.message);
                        hasNextPage = false;
                    }
                }
            }

            console.log(`\n✅ Total: ${allItems.length} itens de ${currentPage} páginas!\n`);

            // Mostrar amostra
            if (allItems.length > 0) {
                console.log('📦 Primeiros 10 itens:\n');
                allItems.slice(0, 10).forEach((item, i) => {
                    console.log(`${i + 1}. ${item.nome}`);
                    console.log(`   Cat: ${item.categoria} | Estoque: ${item.estoque} un`);
                    console.log(`   Marca: ${item.marca || 'N/A'} | Venda: R$ ${item.valorVenda}\n`);
                });

                if (allItems.length > 10) {
                    console.log(`... e mais ${allItems.length - 10} itens\n`);
                }
            }

            await browser.close();

            return {
                timestamp: new Date().toISOString(),
                totalPaginas: currentPage,
                total: allItems.length,
                items: allItems
            };

        } catch (error) {
            try {
                fs.mkdirSync('./logs/screenshots', { recursive: true });
                await page.screenshot({
                    path: `./logs/screenshots/inventory_error_${Date.now()}.png`,
                    fullPage: true
                });
            } catch (e) { }

            await browser.close();
            throw new Error(`Scraping falhou: ${error.message}`);
        }
    }

    saveToFile(data) {
        fs.mkdirSync('./logs', { recursive: true });
        fs.writeFileSync(
            './logs/inventory_complete.json',
            JSON.stringify(data, null, 2)
        );
    }
}

module.exports = InventoryScraper;
