/**
 * Módulo: Scraper de Equipamentos MeEventos
 * Baseado no scraper Python que funciona
 * URL AJAX direta - sem clicar em botões
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

class EventosScraper {
    constructor() {
        this.username = process.env.MEEVENTOS_USUARIO;
        this.password = process.env.MEEVENTOS_SENHA;
        this.baseURL = 'https://app1.meeventos.com.br/brt';
    }

    async getEquipamentos(eventId) {
        const browser = await puppeteer.launch({
            headless: true,
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
            // 1. LOGIN
            console.log('🔐 Fazendo login...');
            await page.goto(`${this.baseURL}/index.php`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await page.type('input[name="usuario"]', this.username, { delay: 30 });
            await page.type('input[name="senha"]', this.password, { delay: 30 });

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                page.click('input[type="submit"]')
            ]);

            // 2. IR DIRETO PARA URL AJAX DE EQUIPAMENTOS
            // URL EXATA do scraper Python que funciona
            const urlAjax = `${this.baseURL}/index.php?p=visualizar&pagina=busca-equipamentos_eventos_contratados&id_agenda=0&id=${eventId}`;

            console.log('📄 Acessando URL AJAX de equipamentos...');
            await page.goto(urlAjax, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Aguardar 3 segundos para AJAX completar
            console.log('⏳ Aguardando tabela carregar (3s)...');
            await new Promise(r => setTimeout(r, 3000));

            // 3. EXTRAIR EQUIPAMENTOS DA TABELA
            console.log('📦 Extraindo equipamentos...');

            const equipamentos = await page.evaluate(() => {
                const resultados = [];

                // Procurar tabela
                const tabela = document.querySelector('table.meus-itens tbody') ||
                    document.querySelector('tbody');

                if (!tabela) return { erro: 'Tabela não encontrada', dados: [] };

                const linhas = tabela.querySelectorAll('tr');

                linhas.forEach((row) => {
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

                            // Nome
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
                // Screenshot para debug
                await page.screenshot({
                    path: `./logs/screenshots/debug_${eventId}_${Date.now()}.png`,
                    fullPage: true
                });
                throw new Error(equipamentos.erro || 'Nenhum equipamento encontrado - screenshot salvo');
            }

            await browser.close();

            return {
                eventoId: eventId,
                timestamp: new Date().toISOString(),
                total: equipamentos.dados.length,
                equipamentos: equipamentos.dados
            };

        } catch (error) {
            try {
                fs.mkdirSync('./logs/screenshots', { recursive: true });
                await page.screenshot({
                    path: `./logs/screenshots/erro_${eventId}_${Date.now()}.png`,
                    fullPage: true
                });
            } catch (e) {
                // Ignorar
            }

            await browser.close();
            throw new Error(`Scraping falhou: ${error.message}`);
        }
    }

    saveToFile(eventId, data) {
        fs.mkdirSync('./logs/cache_equipamentos', { recursive: true });
        fs.writeFileSync(
            `./logs/cache_equipamentos/evento_${eventId}.json`,
            JSON.stringify(data, null, 2)
        );
    }
}

module.exports = EventosScraper;
