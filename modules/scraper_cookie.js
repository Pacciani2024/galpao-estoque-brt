/**
 * Módulo: Scraper de Equipamentos MeEventos
 * Versão DEBUG - Com logs extensivos
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

class EventosScraper {
    constructor() {
        this.email = process.env.MEEVENTOS_USUARIO;
        this.senha = process.env.MEEVENTOS_SENHA;
        this.baseURL = 'https://app1.meeventos.com.br/brt';
        this.loginURL = 'https://app1.meeventos.com.br/brt/index.php';
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    async initialize() {
        if (this.browser) return;

        console.log('🌐 Iniciando browser...');
        this.browser = await puppeteer.launch({
            headless: true, // Modo invisível (produção)
            // Flags de estabilidade em container (Railway/Docker):
            // --disable-dev-shm-usage é CRÍTICO (/dev/shm ~64MB → Chromium crasha).
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

        this.page = await this.browser.newPage();
        await this.doLogin();
    }

    async doLogin() {
        console.log('🔑 Fazendo login com email/senha...');

        if (!this.email || !this.senha) {
            throw new Error('MEEVENTOS_USUARIO e MEEVENTOS_SENHA devem estar no .env');
        }

        await this.page.goto(this.loginURL, { waitUntil: 'load', timeout: 60000 });
        await this.page.waitForSelector('input[name="usuario"]', { visible: true, timeout: 10000 });
        await this.page.type('input[name="usuario"]', this.email);
        await this.page.type('input[name="senha"]', this.senha);
        await this.page.click('input[name="login"][type="submit"]');

        await this.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 2000));

        this.isLoggedIn = true;
        console.log('✅ Login realizado!\n');
    }

    async getEquipamentos(eventId) {
        if (!this.isLoggedIn) {
            await this.initialize();
        }

        try {
            console.log(`📄 Abrindo evento ${eventId}...`);
            await this.page.goto(`${this.baseURL}/index.php?p=eventos&acao=visualizar&id=${eventId}`, {
                waitUntil: 'load',
                timeout: 45000
            });
            await new Promise(r => setTimeout(r, 2000));

            // DEBUG: Verificar se botão existe
            console.log('🔍 Debug: Verificando botões disponíveis...');
            const buttons = await this.page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.map(img => img.src).filter(src => src).slice(0, 10);
            });
            console.log('Botões encontrados:', buttons);

            // Tentar diferentes seletores (em ordem de prioridade)
            console.log('📷 Procurando botão "Meus Itens"...');
            let clicked = false;

            const selectors = [
                'img[src*="photo-camera.png"]',
                'img[src*="camera"]',
                'a[href*="meus-itens"]',
                'img[alt*="meus itens"]',
                'a[href*="itens"]',                      // href genérico com "itens"
                'a[href*="equipamentos"]',               // link de equipamentos
                'button[data-target*="itens"]',          // botão com data-target
                'span.meus-itens',                       // span com classe
                'li a[href*="item"]',                    // menu com item
            ];

            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { visible: true, timeout: 2000 });
                    console.log(`✓ Encontrado com seletor: ${selector}`);
                    await this.page.click(selector);
                    clicked = true;
                    break;
                } catch (e) {
                    console.log(`✗ Não encontrado: ${selector}`);
                }
            }

            // Fallback: buscar por texto "Meus Itens" ou "Itens" em qualquer link
            if (!clicked) {
                console.log('🔍 Fallback: buscando por texto do link...');
                clicked = await this.page.evaluate(() => {
                    const allLinks = Array.from(document.querySelectorAll('a, button, span, li'));
                    const target = allLinks.find(el => {
                        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                        return t === 'meus itens' || t === 'itens' || t === 'equipamentos';
                    });
                    if (target) {
                        console.log('✓ Botão encontrado por texto:', target.innerText);
                        target.click();
                        return true;
                    }
                    return false;
                });
                if (clicked) console.log('✓ Clicado via fallback de texto');
            }

            if (!clicked) {
                console.log('⚠️  Botão "Meus Itens" não encontrado - evento pode não ter equipamentos\n');
                return {
                    eventoId: eventId,
                    timestamp: new Date().toISOString(),
                    total: 0,
                    equipamentos: []
                };
            }

            // Aguardar tabela
            console.log('⏳ Aguardando tabela...');
            await new Promise(r => setTimeout(r, 5000)); // Espera fixa de 5s

            // Verificar se tabela existe
            const temTabela = await this.page.evaluate(() => {
                return document.querySelector('table.meus-itens tbody tr') !== null;
            });

            if (!temTabela) {
                console.log('ℹ️  Sem tabela de equipamentos\n');
                return {
                    eventoId: eventId,
                    timestamp: new Date().toISOString(),
                    total: 0,
                    equipamentos: []
                };
            }

            console.log('✅ Tabela encontrada! Extraindo...\n');

            const resultado = await this.page.evaluate(() => {
                const items = [];
                const rows = document.querySelectorAll('table.meus-itens tbody tr');

                rows.forEach(row => {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 2) {
                        const col0Text = tds[0].innerText;
                        const lines = col0Text.split('\n');
                        let nome = lines[0].trim().split('(')[0].trim();

                        const bold = tds[0].querySelector('b');
                        let categoria = 'DIVERSOS';
                        if (bold) {
                            const catMatch = bold.innerText.match(/\((.+)\)/);
                            if (catMatch) categoria = catMatch[1].trim();
                        }

                        const col1Text = tds[1].innerText;
                        const qtdMatch = col1Text.match(/(\d+)\s*un/i);
                        const quantidade = qtdMatch ? parseInt(qtdMatch[1]) : 0;

                        if (nome && quantidade > 0) {
                            items.push({ nome, quantidade, categoria });
                        }
                    }
                });

                return items;
            });

            console.log(`✅ ${resultado.length} equipamentos extraídos!\n`);

            return {
                eventoId: eventId,
                timestamp: new Date().toISOString(),
                total: resultado.length,
                equipamentos: resultado
            };

        } catch (error) {
            try {
                fs.mkdirSync('./logs/screenshots', { recursive: true });
                await this.page.screenshot({
                    path: `./logs/screenshots/erro_${eventId}_${Date.now()}.png`,
                    fullPage: true
                });
                console.log('📸 Screenshot salvo');
            } catch (e) { }

            throw new Error(`Scraping falhou: ${error.message}`);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
            console.log('\n🔒 Browser fechado');
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
