/**
 * Módulo: External APIs Helper
 * Integrações com APIs externas (clima, rotas, preços)
 */

require('dotenv').config();
const fetch = require('node-fetch');

class ExternalAPIs {
    constructor() {
        // APIs gratuitas que não precisam de key
        this.weatherAPI = 'https://wttr.in'; // Previsão do tempo
        this.geocodeAPI = 'https://nominatim.openstreetmap.org'; // Geocoding
    }

    // ====== PREVISÃO DO TEMPO ======

    /**
     * Busca previsão do tempo para São Paulo
     * @param {number} days - Número de dias (1-7)
     * @returns {Object} Previsão simplificada
     */
    async getWeather(city = 'São Paulo', days = 3) {
        try {
            const url = `${this.weatherAPI}/${encodeURIComponent(city)}?format=j1`;
            const response = await fetch(url);
            const data = await response.json();

            const current = data.current_condition[0];
            const forecast = data.weather.slice(0, days).map(day => ({
                data: day.date,
                tempMax: day.maxtempC + '°C',
                tempMin: day.mintempC + '°C',
                descricao: day.hourly[0].lang_pt[0].value,
                chuvaProbabilidade: day.hourly[4].chanceofrain + '%'
            }));

            return {
                atual: {
                    temperatura: current.temp_C + '°C',
                    sensacao: current.FeelsLikeC + '°C',
                    descricao: current.lang_pt[0].value,
                    umidade: current.humidity + '%'
                },
                previsao: forecast
            };
        } catch (error) {
            return { erro: 'Não foi possível obter previsão do tempo' };
        }
    }

    /**
     * Verifica se vai chover em uma data específica
     */
    async willRain(city = 'São Paulo', date = null) {
        const weather = await this.getWeather(city, 7);

        if (weather.erro) return null;

        if (!date) {
            // Hoje
            return parseInt(weather.previsao[0].chuvaProbabilidade) > 50;
        }

        // Buscar data específica
        const targetDate = new Date(date).toISOString().split('T')[0];
        const day = weather.previsao.find(d => d.data === targetDate.replace(/-/g, ''));

        return day ? parseInt(day.chuvaProbabilidade) > 50 : null;
    }

    // ====== ROTAS E DISTÂNCIAS ======

    /**
     * Calcula distância entre dois endereços
     * Usa geocoding + cálculo de distância
     */
    async getDistance(origem, destino) {
        try {
            const coordOrigem = await this.geocode(origem);
            const coordDestino = await this.geocode(destino);

            if (!coordOrigem || !coordDestino) {
                return { erro: 'Endereço não encontrado' };
            }

            const distKm = this.calculateDistance(
                coordOrigem.lat, coordOrigem.lon,
                coordDestino.lat, coordDestino.lon
            );

            return {
                origem: coordOrigem.display_name,
                destino: coordDestino.display_name,
                distancia: distKm.toFixed(1) + ' km',
                tempoEstimado: Math.ceil(distKm / 30) * 60 + ' min' // média 30km/h SP
            };
        } catch (error) {
            return { erro: 'Não foi possível calcular rota' };
        }
    }

    async geocode(address) {
        try {
            const url = `${this.geocodeAPI}/search?q=${encodeURIComponent(address + ', São Paulo, Brasil')}&format=json&limit=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'BRT-Audiovisual/1.0' }
            });
            const data = await response.json();

            if (data.length === 0) return null;

            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                display_name: data[0].display_name
            };
        } catch (error) {
            return null;
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    // ====== INFORMAÇÕES DA EMPRESA ======

    getFleet() {
        return {
            veiculos: [
                {
                    nome: 'Transit',
                    tipo: 'Van',
                    capacidade: '4m x 2m x 2,30m',
                    rodizio: null,
                    disponibilidade: 'Sempre disponível'
                },
                {
                    nome: 'Doblo Cargo 1',
                    tipo: 'Utilitário',
                    rodizio: 'Segunda-feira',
                    disponibilidade: 'Não usar às segundas'
                },
                {
                    nome: 'Doblo Cargo 2',
                    tipo: 'Utilitário',
                    rodizio: 'Segunda-feira',
                    disponibilidade: 'Não usar às segundas'
                },
                {
                    nome: 'Doblo Cargo 3',
                    tipo: 'Utilitário',
                    rodizio: null,
                    disponibilidade: 'Sempre disponível'
                },
                {
                    nome: 'Saveiro',
                    tipo: 'Pick-up',
                    rodizio: 'Quinta-feira',
                    disponibilidade: 'Não usar às quintas'
                }
            ],
            motoristas: {
                principal: 'Cícero',
                eventuais: ['Alexandre', 'Vinicius']
            }
        };
    }

    getTeam() {
        return {
            diretoria: [
                { nome: 'Rodrigo', cargo: 'Dono' },
                { nome: 'Marcos', cargo: 'Sócio' }
            ],
            administrativo: [
                { nome: 'Ana Lucia', cargo: 'Financeiro' }
            ],
            operacional: [
                { nome: 'Cícero', cargo: 'Motorista' },
                { nome: 'Alexandre', cargo: 'Técnico' },
                { nome: 'Vinicius', cargo: 'Técnico' },
                { nome: 'Thiago', cargo: 'Galpão/Separação' }
            ]
        };
    }

    /**
     * Verifica se veículo pode ser usado em uma data
     */
    canUseVehicle(vehicleName, date) {
        const fleet = this.getFleet();
        const vehicle = fleet.veiculos.find(v =>
            v.nome.toLowerCase().includes(vehicleName.toLowerCase())
        );

        if (!vehicle) return { pode: false, motivo: 'Veículo não encontrado' };
        if (!vehicle.rodizio) return { pode: true, motivo: 'Sem restrição' };

        const dayOfWeek = new Date(date).getDay();
        const isRestricted =
            (vehicle.rodizio === 'Segunda-feira' && dayOfWeek === 1) ||
            (vehicle.rodizio === 'Quinta-feira' && dayOfWeek === 4);

        return {
            pode: !isRestricted,
            motivo: isRestricted ? `Rodízio ${vehicle.rodizio}` : 'Disponível'
        };
    }
}

module.exports = ExternalAPIs;
