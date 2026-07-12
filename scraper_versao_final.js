/**
 * SCRAPER VERSÃO FINAL - Com URL AJAX direta
 * Baseado no JavaScript descoberto no HTML
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

const USERNAME = process.env.MEEVENTOS_USUARIO;
const PASSWORD = process.env.MEEVENTOS_SENHA;
const BASE_URL = 'https://app1.meeventos.com.br/brt';

async function scrapingVersaoFinal(eventoId = '566') {
    console.log(`\n🎯 SCRAPING EVENTO ${eventoId} (Versão Final)\n`);
    console.log('═'.repeat(70) + '\n');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox'],
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    try {
        // LOGIN
        console.log('[1/3] 🔐 Login...');
        await page.goto(`${BASE_URL}/index.php`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[name="usuario"]', USERNAME, { delay: 30 });
        await page.type('input[name="senha"]', PASSWORD, { delay: 30 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            page.click('input[type="submit"]')
        ]);
        console.log('      ✅ Login bem-sucedido\n');

        // ESTRATÉGIA 1: Tentar URL AJAX direta
        console.log('[2/3] 📄 Tentando URL AJAX direta...');

        const urlAjax = `${BASE_URL}/index.php?p=visualizar&pagina=busca-equipamentos_eventos_contratados&id_agenda=0&id=${eventoId}`;

        await page.goto(urlAjax, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        console.log('      ✅ URL AJAX carregada\n');

        // Aguardar 2 segundos extras
        await new Promise(r => setTimeout(r, 2000));

        // ESTRATÉGIA 2: Se não funcionar, ir para página normal e aguardar mais
        let tabelaEncontrada = await page.$('table.meus-itens tbody');

        if (!tabelaEncontrada) {
            console.log('      ⚠️  Tabela não em URL AJAX, tentando página normal...\n');

            await page.goto(`${BASE_URL}/index.php?p=eventos&acao=visualizar&id=${eventoId}`, {
                waitUntil: 'networkidle2'
            });

            // Aguardar 10 segundos para JavaScript carregar
            console.log('      ⏳ Aguardando 10s para AJAX...');
            await new Promise(r => setTimeout(r, 10000));

            tabelaEncontrada = await page.$('table.meus-itens tbody');
        }

        if (!tabelaEncontrada) {
            throw new Error('Tabela não encontrada após tentativas');
        }

        // EXTRAÇÃO
        console.log('[3/3] 📦 Extraindo equipamentos...\n');

        const equipamentos = await page.evaluate(() => {
            const resultados = [];

            // Procurar tabela
            const tabela = document.querySelector('table.meus-itens tbody') ||
                document.querySelector('#carregalistaint table tbody') ||
                document.querySelector('tbody');

            if (!tabela) return { erro: 'tbody não encontrado', dados: [] };

            const linhas = tabela.querySelectorAll('tr');

            linhas.forEach((row, index) => {
                const colunas = row.querySelectorAll('td');

                if (colunas.length >= 2) {
                    try {
                        const col0 = colunas[0];
                        const textoCompleto = col0.textContent || '';

                        // Categoria
                        const boldElement = col0.querySelector('b');
                        let categoria = 'DIVERSOS';
                        if (boldElement) {
                            const match = boldElement.textContent.match(/\(([^)]+)\)/);
                            if (match) categoria = match[1].trim();
                        }

                        // Nome (texto antes do <b>, limpo)
                        let nome = textoCompleto
                            .replace(boldElement?.textContent || '', '')
                            .split('\n')[0]
                            .trim()
                            .replace(/\s+/g, ' ');

                        // Quantidade
                        const col1Text = colunas[1].textContent.trim();
                        const qtdMatch = col1Text.match(/(\d+)\s*un/i);
                        const quantidade = qtdMatch ? parseInt(qtdMatch[1], 10) : 0;

                        if (nome && quantidade > 0 && nome.length > 2) {
                            resultados.push({
                                nome: nome.substring(0, 150),
                                quantidade: quantidade,
                                categoria: categoria
                            });
                        }
                    } catch (e) {
                        // Pular linha com erro
                    }
                }
            });

            return { erro: null, dados: resultados };
        });

        if (equipamentos.erro || equipamentos.dados.length === 0) {
            throw new Error(equipamentos.erro || 'Nenhum equipamento extraído');
        }

        console.log(`      ✅ ${equipamentos.dados.length} itens extraídos!\n`);

        // Exibir primeiros 10
        console.log('📋 Equipamentos extraídos:\n');
        equipamentos.dados.slice(0, 10).forEach((item, i) => {
            console.log(`   ${i + 1}. ${item.nome}`);
            console.log(`      Qtd: ${item.quantidade} | Categoria: ${item.categoria}\n`);
        });

        if (equipamentos.dados.length > 10) {
            console.log(`   ... e mais ${equipamentos.dados.length - 10} itens\n`);
        }

        // Salvar
        const resultado = {
            eventoId: eventoId,
            timestamp: new Date().toISOString(),
            total: equipamentos.dados.length,
            equipamentos: equipamentos.dados
        };

        fs.writeFileSync(`./logs/cache_equipamentos/evento_${eventoId}.json`, JSON.stringify(resultado, null, 2));
        console.log('═'.repeat(70));
        console.log(`\n✅ SUCESSO! Salvo em: logs/cache_equipamentos/evento_${eventoId}.json\n`);

        return equipamentos.dados;

    } catch (error) {
        console.error(`\n❌ ERRO: ${error.message}\n`);

        // Screenshot
        await page.screenshot({ path: `./logs/screenshots/erro_versao_final_${Date.now()}.png`, fullPage: true });
        console.log('📸 Screenshot de erro salvo\n');

        return [];
    } finally {
        await browser.close();
    }
}

module.exports = { scrapingVersaoFinal };

if (require.main === module) {
    const eventoId = process.argv[2] || '566';
    scrapingVersaoFinal(eventoId).then((equipamentos) => {
        if (equipamentos.length > 0) {
            console.log('🎯 SCRAPING COMPLETO!\n');
            process.exit(0);
        } else {
            console.log('❌ Falha no scraping\n');
            process.exit(1);
        }
    });
}
