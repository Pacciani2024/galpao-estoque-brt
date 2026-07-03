/**
 * Módulo: Estoque Manager (QR Code Control)
 * Gerencia alocações, confirmações via QR, e devoluções
 */

const fs = require('fs');
const path = require('path');

class EstoqueManager {
    constructor() {
        this.inventoryPath = './logs/inventory_complete.json';
        this.alocacoesPath = './logs/alocacoes.json';
        this.eventosPath = './logs/eventos_completos.json';
    }

    // ====== CARREGAR DADOS ======

    loadInventory() {
        const data = JSON.parse(fs.readFileSync(this.inventoryPath, 'utf-8'));
        return data.items || [];
    }

    loadAlocacoes() {
        if (!fs.existsSync(this.alocacoesPath)) {
            return { timestamp: new Date().toISOString(), alocacoes: [] };
        }
        return JSON.parse(fs.readFileSync(this.alocacoesPath, 'utf-8'));
    }

    saveAlocacoes(data) {
        fs.writeFileSync(this.alocacoesPath, JSON.stringify(data, null, 2));
    }

    loadEventos() {
        const data = JSON.parse(fs.readFileSync(this.eventosPath, 'utf-8'));
        return data.eventos || [];
    }

    // ====== CRIAR LISTA DE SEPARAÇÃO ======

    /**
     * Cria lista de separação para um evento
     * Status: 'pendente' (aguarda confirmação QR)
     */
    criarListaSeparacao(eventoId) {
        const eventos = this.loadEventos();
        const evento = eventos.find(e => e.id === eventoId);

        if (!evento) {
            throw new Error(`Evento ${eventoId} não encontrado`);
        }

        if (evento.equipamentos.length === 0) {
            throw new Error(`Evento ${eventoId} não possui equipamentos cadastrados`);
        }

        const alocacoes = this.loadAlocacoes();

        // Verificar se já existe alocação
        const jaExiste = alocacoes.alocacoes.find(a => a.eventoId === eventoId);
        if (jaExiste) {
            throw new Error(`Evento ${eventoId} já possui lista de separação`);
        }

        // Criar lista de separação
        const listaSeparacao = {
            eventoId: evento.id,
            nomeEvento: evento.nomeevento,
            dataEvento: evento.dataevento,
            dataCriacao: new Date().toISOString(),
            status: 'pendente_separacao', // pendente_separacao, separado, devolvido
            equipamentos: evento.equipamentos.map(eq => ({
                nome: eq.nome,
                categoria: eq.categoria,
                quantidadeRequerida: eq.quantidade,
                quantidadeConfirmada: 0,
                itensConfirmados: [] // [{qrCode, timestamp, usuario}]
            }))
        };

        alocacoes.alocacoes.push(listaSeparacao);
        alocacoes.timestamp = new Date().toISOString();
        this.saveAlocacoes(alocacoes);

        return listaSeparacao;
    }

    // ====== CONFIRMAR ITEM VIA QR CODE ======

    /**
     * Confirma item escaneado via QR
     * Tipo: 'saida' ou 'entrada'
     */
    confirmarItemQR(eventoId, nomeItem, qrCode, tipo = 'saida', usuario = 'funcionario') {
        const alocacoes = this.loadAlocacoes();
        const alocacao = alocacoes.alocacoes.find(a => a.eventoId === eventoId);

        if (!alocacao) {
            throw new Error(`Lista de separação não encontrada para evento ${eventoId}`);
        }

        const item = alocacao.equipamentos.find(e => e.nome === nomeItem);

        if (!item) {
            throw new Error(`Item "${nomeItem}" não encontrado na lista`);
        }

        // Validar tipo de operação
        if (tipo === 'saida' && alocacao.status !== 'pendente_separacao') {
            throw new Error('Separação já concluída ou evento já devolvido');
        }

        if (tipo === 'entrada' && alocacao.status !== 'separado') {
            throw new Error('Evento não foi separado ainda ou já foi devolvido');
        }

        // Verificar se QR já foi escaneado
        const jaConfirmado = item.itensConfirmados.find(i => i.qrCode === qrCode);
        if (jaConfirmado) {
            throw new Error(`QR Code ${qrCode} já foi confirmado`);
        }

        // Verificar limite
        if (tipo === 'saida' && item.quantidadeConfirmada >= item.quantidadeRequerida) {
            throw new Error(`Quantidade máxima alcançada (${item.quantidadeRequerida})`);
        }

        // Confirmar item
        item.itensConfirmados.push({
            qrCode,
            timestamp: new Date().toISOString(),
            usuario,
            tipo // 'saida' ou 'entrada'
        });

        if (tipo === 'saida') {
            item.quantidadeConfirmada++;
        }

        // Atualizar timestamp
        alocacoes.timestamp = new Date().toISOString();
        this.saveAlocacoes(alocacoes);

        return {
            item: nomeItem,
            confirmados: item.quantidadeConfirmada,
            requeridos: item.quantidadeRequerida,
            completo: item.quantidadeConfirmada === item.quantidadeRequerida
        };
    }

    // ====== FINALIZAR SEPARAÇÃO ======

    /**
     * Marca separação como concluída
     * Reduz estoque disponível
     */
    finalizarSeparacao(eventoId) {
        const alocacoes = this.loadAlocacoes();
        const alocacao = alocacoes.alocacoes.find(a => a.eventoId === eventoId);

        if (!alocacao) {
            throw new Error(`Lista não encontrada para evento ${eventoId}`);
        }

        if (alocacao.status !== 'pendente_separacao') {
            throw new Error('Separação já foi finalizada');
        }

        // Verificar se todos itens foram confirmados
        const todosConfirmados = alocacao.equipamentos.every(
            e => e.quantidadeConfirmada === e.quantidadeRequerida
        );

        if (!todosConfirmados) {
            const pendentes = alocacao.equipamentos.filter(
                e => e.quantidadeConfirmada < e.quantidadeRequerida
            );
            throw new Error(
                `Ainda há ${pendentes.length} itens pendentes de confirmação`
            );
        }

        alocacao.status = 'separado';
        alocacao.dataSeparacao = new Date().toISOString();
        alocacoes.timestamp = new Date().toISOString();
        this.saveAlocacoes(alocacoes);

        return alocacao;
    }

    // ====== FINALIZAR DEVOLUÇÃO ======

    /**
     * Marca devolução como concluída
     * Restaura estoque disponível
     */
    finalizarDevolucao(eventoId) {
        const alocacoes = this.loadAlocacoes();
        const alocacao = alocacoes.alocacoes.find(a => a.eventoId === eventoId);

        if (!alocacao) {
            throw new Error(`Lista não encontrada para evento ${eventoId}`);
        }

        if (alocacao.status !== 'separado') {
            throw new Error('Evento não foi separado ou já foi devolvido');
        }

        // Verificar se todos itens foram devolvidos (entrada confirmada)
        const todosDevolvidos = alocacao.equipamentos.every(e => {
            const entradasConfirmadas = e.itensConfirmados.filter(i => i.tipo === 'entrada').length;
            return entradasConfirmadas === e.quantidadeRequerida;
        });

        if (!todosDevolvidos) {
            throw new Error('Ainda há itens pendentes de devolução');
        }

        alocacao.status = 'devolvido';
        alocacao.dataDevolucao = new Date().toISOString();
        alocacoes.timestamp = new Date().toISOString();
        this.saveAlocacoes(alocacoes);

        return alocacao;
    }

    // ====== CONSULTAS ======

    getEstoqueDisponivel() {
        const inventory = this.loadInventory();
        const alocacoes = this.loadAlocacoes();

        // Calcular itens alocados
        const alocados = {};

        alocacoes.alocacoes
            .filter(a => a.status === 'separado') // apenas separados ocupam estoque
            .forEach(alocacao => {
                alocacao.equipamentos.forEach(eq => {
                    if (!alocados[eq.nome]) {
                        alocados[eq.nome] = 0;
                    }
                    alocados[eq.nome] += eq.quantidadeConfirmada;
                });
            });

        // Calcular disponível
        return inventory.map(item => ({
            nome: item.nome,
            categoria: item.categoria,
            estoqueTotal: item.estoque,
            alocado: alocados[item.nome] || 0,
            disponivel: item.estoque - (alocados[item.nome] || 0)
        }));
    }

    getListaSeparacao(eventoId) {
        const alocacoes = this.loadAlocacoes();
        return alocacoes.alocacoes.find(a => a.eventoId === eventoId) || null;
    }

    getAllListasSeparacao() {
        const alocacoes = this.loadAlocacoes();
        return alocacoes.alocacoes;
    }
}

module.exports = EstoqueManager;
