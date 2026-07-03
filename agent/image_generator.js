/**
 * Serviço de Geração de Gráficos usando Chart.js
 */

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

class ImageGenerator {
    constructor() {
        this.width = 1200;
        this.height = 800;
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: this.width,
            height: this.height,
            backgroundColour: '#000000' // Fundo preto (brandguide)
        });
        this.outputDir = path.join(__dirname, '../public/charts');

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Gera gráfico de barras horizontais (Top Itens)
     */
    async generateTopItemsChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: data.map(item => item.nome),
                datasets: [{
                    label: 'Quantidade Alocada',
                    data: data.map(item => item.quantidade),
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CCCCCC',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Top 10 Itens Mais Alocados - BRT Audiovisual',
                        color: '#FFFFFF',
                        font: {
                            family: 'Roboto',
                            size: 24,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto', size: 12 } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };

        return await this.renderChart(configuration, filename);
    }

    /**
     * Gera gráfico de linha (Timeline de Eventos)
     */
    async generateEventsTimelineChart(data, filename) {
        const configuration = {
            type: 'line',
            data: {
                labels: data.map(d => d.mes),
                datasets: [{
                    label: 'Eventos',
                    data: data.map(d => d.quantidade),
                    borderColor: '#FFFFFF',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#CCCCCC',
                    pointRadius: 5,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Eventos por Mês - BRT Audiovisual',
                        color: '#FFFFFF',
                        font: {
                            family: 'Roboto',
                            size: 24,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        labels: { color: '#FFFFFF', font: { family: 'Roboto' } }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };

        return await this.renderChart(configuration, filename);
    }

    /**
     * Gera gráfico de barras (Status do Inventário)
     */
    async generateInventoryStatusChart(data, filename) {
        const total = data.disponivel + data.alocado + data.manutencao;

        const configuration = {
            type: 'bar',
            data: {
                labels: ['Disponível', 'Alocado', 'Manutenção'],
                datasets: [{
                    label: 'Quantidade',
                    data: [data.disponivel, data.alocado, data.manutencao],
                    backgroundColor: ['#FFFFFF', '#AAAAAA', '#666666'],
                    borderColor: ['#CCCCCC', '#999999', '#555555'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Status do Inventário - Total: ${total} unidades`,
                        color: '#FFFFFF',
                        font: {
                            family: 'Roboto',
                            size: 24,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };

        return await this.renderChart(configuration, filename);
    }

    /**
     * Gera gráfico de barras empilhadas (Top Categorias)
     */
    async generateTopCategoriesChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: data.map(cat => cat.categoria),
                datasets: [
                    {
                        label: 'Alocado',
                        data: data.map(cat => cat.alocado),
                        backgroundColor: '#FFFFFF'
                    },
                    {
                        label: 'Disponível',
                        data: data.map(cat => cat.total - cat.alocado),
                        backgroundColor: '#444444'
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Top 5 Categorias Mais Usadas - BRT Audiovisual',
                        color: '#FFFFFF',
                        font: {
                            family: 'Roboto',
                            size: 24,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        labels: { color: '#FFFFFF', font: { family: 'Roboto' } }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };

        return await this.renderChart(configuration, filename);
    }

    /**
     * Gráfico: Disponível vs Tickado (QR) - Barras
     */
    async generateAvailableVsTickedChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: ['Com QR Code', 'Sem QR Code'],
                datasets: [{
                    label: 'Quantidade',
                    data: [data.tickado, data.semQR],
                    backgroundColor: ['#FFFFFF', '#666666'],
                    borderColor: ['#CCCCCC', '#555555'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Itens Disponíveis: ${data.disponivel} unidades`,
                        color: '#FFFFFF',
                        font: { family: 'Roboto', size: 24, weight: 'bold' }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };
        return await this.renderChart(configuration, filename);
    }

    /**
     * Gráfico: Luz vs Som vs Vídeo - Barras Horizontais
     */
    async generateCategoryBreakdownChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: data.map(d => d.categoria),
                datasets: [{
                    label: 'Quantidade Total',
                    data: data.map(d => d.quantidade),
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CCCCCC',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribuição por Categoria - BRT Audiovisual',
                        color: '#FFFFFF',
                        font: { family: 'Roboto', size: 24, weight: 'bold' }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };
        return await this.renderChart(configuration, filename);
    }

    /**
     * Gráfico: Taxa de Utilização - Barras Empilhadas
     */
    async generateUtilizationRateChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: ['Inventário Total'],
                datasets: [
                    {
                        label: `Em Uso (${data.taxaUso}%)`,
                        data: [data.emUso],
                        backgroundColor: '#FFFFFF'
                    },
                    {
                        label: `Disponível (${100 - data.taxaUso}%)`,
                        data: [data.disponivel],
                        backgroundColor: '#666666'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Taxa de Utilização: ${data.taxaUso}% - BRT Audiovisual`,
                        color: '#FFFFFF',
                        font: { family: 'Roboto', size: 24, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#FFFFFF', font: { family: 'Roboto', size: 14 } }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };
        return await this.renderChart(configuration, filename);
    }

    /**
     * Gráfico: Itens em Manutenção
     */
    async generateMaintenanceItemsChart(data, filename) {
        const configuration = {
            type: 'bar',
            data: {
                labels: data.map(item => item.nome),
                datasets: [{
                    label: 'Quantidade em Manutenção',
                    data: data.map(item => item.quantidade),
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CCCCCC',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Itens em Manutenção - BRT Audiovisual',
                        color: '#FFFFFF',
                        font: { family: 'Roboto', size: 24, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto' } },
                        grid: { color: '#333333' }
                    },
                    y: {
                        ticks: { color: '#FFFFFF', font: { family: 'Roboto', size: 12 } },
                        grid: { color: '#222222' }
                    }
                }
            }
        };
        return await this.renderChart(configuration, filename);
    }

    /**
     * Renderiza e salva o gráfico
     */
    async renderChart(configuration, filename) {
        try {
            const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
            const filepath = path.join(this.outputDir, filename);
            fs.writeFileSync(filepath, buffer);
            return filepath;
        } catch (error) {
            console.error('Erro ao renderizar gráfico:', error);
            throw error;
        }
    }
}

module.exports = ImageGenerator;
