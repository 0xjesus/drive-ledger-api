import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';

class CarDataService {
	static instance;
	static eventEmitter = new EventEmitter();
	static isStreaming = false;
	static currentDataIndex = 0;
	static simulationInterval = null;
	static simulationTimeout = null;
	static syntheticData = [];
	static simulationData = []; // Array para almacenar datos de la simulación actual
	static simulationStartTime = null;
	static simulationEndTime = null;
	static simulationRouteType = null;
	static simulationDuration = 0;

	static getInstance() {
		if(!CarDataService.instance) {
			CarDataService.instance = new CarDataService();
		}
		return CarDataService.instance;
	}

	static async loadSyntheticData() {
		console.log('📂 loadSyntheticData - Cargando datos sintéticos');
		try {
			// Cargar datos desde el archivo JSON en la raíz
			const rawData = fs.readFileSync(path.resolve('./synthetic_obd_data_24h.json'), 'utf8');
			CarDataService.syntheticData = JSON.parse(rawData);
			console.log(`✅ Loaded ${ CarDataService.syntheticData.length } data points from JSON`);
			return CarDataService.syntheticData;
		} catch(error) {
			console.error('❌ Error loading synthetic JSON data:', error);
			// Intentar cargar desde CSV como respaldo
			try {
				await CarDataService.loadSyntheticDataFromCSV();
			} catch(csvError) {
				console.error('❌ Error loading synthetic CSV data:', csvError);
				throw error;
			}
		}
	}

	static async loadSyntheticDataFromCSV() {
		console.log('📂 loadSyntheticDataFromCSV - Cargando datos desde CSV');
		try {
			// Cargar datos desde el archivo CSV en la raíz
			const csvData = fs.readFileSync(path.resolve('./synthetic_obd_data_24h.csv'), 'utf8');
			const lines = csvData.split('\n');
			const headers = lines[0].split('\t');

			CarDataService.syntheticData = [];

			for(let i = 1; i < lines.length; i++) {
				if(!lines[i].trim()) continue;

				const values = lines[i].split('\t');
				const dataPoint = {};

				headers.forEach((header, index) => {
					let value = values[index] ? values[index].trim() : '';

					// Convertir a número si es posible
					if([ 'speed_kmph', 'engine_rpm', 'fuel_level_pct', 'engine_temp_c', 'lat', 'lon' ].includes(header)) {
						value = parseFloat(value);
					}

					dataPoint[header] = value;
				});

				CarDataService.syntheticData.push(dataPoint);
			}

			console.log(`✅ Loaded ${ CarDataService.syntheticData.length } data points from CSV`);
			return CarDataService.syntheticData;
		} catch(error) {
			console.error('❌ Error loading synthetic CSV data:', error);
			throw error;
		}
	}

	/**
	 * Iniciar simulación de conducción
	 * @param {string} routeType - Tipo de ruta (URBAN, HIGHWAY, etc.)
	 * @param {number} durationMinutes - Duración de la simulación en minutos
	 * @param {number} intervalMs - Intervalo de emisión de datos en milisegundos (por defecto: 1000ms)
	 * @returns {Object} Stream de datos para suscripción
	 */
	static startSimulation(routeType = 'URBAN', durationMinutes = 5, intervalMs = 1000) {
		console.log(`🚀 startSimulation - Iniciando simulación: routeType=${ routeType }, durationMinutes=${ durationMinutes }, intervalMs=${ intervalMs }`);

		// Verificar si ya hay una simulación en curso
		if(CarDataService.isStreaming) {
			console.log('⚠️ Simulation already running');
			return null;
		}

		// Verificar si hay datos cargados
		if(CarDataService.syntheticData.length === 0) {
			console.error('❌ No synthetic data loaded');
			throw new Error('No synthetic data loaded. Call loadSyntheticData first.');
		}

		// Inicializar variables de simulación
		CarDataService.isStreaming = true;
		CarDataService.currentDataIndex = 0;
		CarDataService.simulationStartTime = new Date();
		CarDataService.simulationRouteType = routeType;
		CarDataService.simulationDuration = durationMinutes;
		CarDataService.simulationEndTime = new Date(CarDataService.simulationStartTime.getTime() + (durationMinutes * 60 * 1000));

		// Inicializar array para almacenar datos de esta simulación
		CarDataService.simulationData = [];

		console.log(`📊 Simulation parameters: routeType=${ routeType }, duration=${ durationMinutes } minutes, end time=${ CarDataService.simulationEndTime }`);

		// Determinar punto de inicio en los datos sintéticos según tipo de ruta
		switch(routeType) {
			case 'HIGHWAY':
				// Buscar sección con velocidades más altas
				CarDataService.currentDataIndex = CarDataService.findDataSegment('speed_kmph', 80, 120);
				break;
			case 'URBAN':
				// Buscar sección con velocidades de ciudad
				CarDataService.currentDataIndex = CarDataService.findDataSegment('speed_kmph', 20, 60);
				break;
			case 'MOUNTAIN':
				// Buscar sección con cambios de altitud
				CarDataService.currentDataIndex = CarDataService.findDataSegment('altitude', 300, 1000);
				break;
			default:
				// Inicio aleatorio para otros tipos
				CarDataService.currentDataIndex = Math.floor(Math.random() * (CarDataService.syntheticData.length / 2));
		}

		console.log(`📌 Starting data from index: ${ CarDataService.currentDataIndex }`);

		// Configurar temporizador para detener automáticamente
		CarDataService.simulationTimeout = setTimeout(() => {
			console.log(`⏱️ Simulation duration (${ durationMinutes } minutes) reached, stopping...`);
			CarDataService.stopSimulation();
		}, durationMinutes * 60 * 1000);

		// Configurar intervalo para emitir datos
		CarDataService.simulationInterval = setInterval(() => {
			if(CarDataService.currentDataIndex >= CarDataService.syntheticData.length) {
				CarDataService.currentDataIndex = 0; // Loop back to start
			}

			// Obtener datos actuales y aplicar variaciones
			const currentData = CarDataService.syntheticData[CarDataService.currentDataIndex];
			const variationData = CarDataService.addRandomVariation(currentData);

			// Añadir datos específicos de esta simulación
			variationData.timestamp = new Date().toISOString();
			variationData.routeType = routeType;
			variationData.simulationElapsed = Math.floor((new Date() - CarDataService.simulationStartTime) / 1000);

			// Añadir códigos de diagnóstico aleatorios según el tipo de ruta
			if(Math.random() < 0.05) { // 5% de probabilidad
				const dtcCodes = [ 'P0420', 'P0171', 'P0300' ];
				variationData.dtc_code = dtcCodes[Math.floor(Math.random() * dtcCodes.length)];
			}

			// Almacenar dato en la colección de esta simulación
			CarDataService.simulationData.push(variationData);

			// Emitir evento con los datos
			CarDataService.eventEmitter.emit('data', variationData);

			CarDataService.currentDataIndex++;
		}, intervalMs);

		console.log('✅ Simulation started successfully');

		// Devolver objeto para suscripción
		return CarDataService.getDataStream();
	}

	/**
	 * Detener simulación actual y devolver resumen
	 * @returns {Object} Resumen de la simulación
	 */
	static stopSimulation() {
		console.log('🛑 stopSimulation - Deteniendo simulación');

		if(!CarDataService.isStreaming) {
			console.log('⚠️ No simulation is running');
			return {
				success: false,
				message: 'No simulation is running',
				summary: null,
			};
		}

		// Detener temporizadores
		if(CarDataService.simulationInterval) {
			clearInterval(CarDataService.simulationInterval);
			CarDataService.simulationInterval = null;
		}

		if(CarDataService.simulationTimeout) {
			clearTimeout(CarDataService.simulationTimeout);
			CarDataService.simulationTimeout = null;
		}

		// Marcar como detenida
		CarDataService.isStreaming = false;

		// Calcular estadísticas de la simulación
		const summary = CarDataService.generateSimulationSummary();

		console.log('✅ Simulation stopped successfully');
		console.log('📊 Simulation summary:', summary);

		return {
			success: true,
			message: 'Simulation stopped successfully',
			summary: summary,
		};
	}

	/**
	 * Obtener estado actual de la simulación
	 * @returns {Object} Estado de la simulación
	 */
	static getSimulationStatus() {
		console.log('🔍 getSimulationStatus - Verificando estado de simulación');

		// Preparar la respuesta base
		const status = {
			isActive: CarDataService.isStreaming,
			currentIndex: CarDataService.currentDataIndex,
			totalDataPoints: CarDataService.syntheticData.length,
			progress: 0,
			lastData: null,
		};

		// Calcular progreso si hay datos
		if(CarDataService.syntheticData.length > 0) {
			status.progress = parseFloat(((CarDataService.currentDataIndex / CarDataService.syntheticData.length) * 100).toFixed(2));
			status.lastData = CarDataService.getLastData();
		}

		// Añadir datos adicionales si la simulación está activa
		if(CarDataService.isStreaming) {
			status.startedAt = CarDataService.simulationStartTime || new Date();
			status.elapsedSeconds = Math.floor((new Date() - status.startedAt) / 1000);

			// Calcular métricas de rendimiento si hay suficientes datos
			if(CarDataService.simulationData && CarDataService.simulationData.length > 0) {
				const recentData = CarDataService.simulationData.slice(-10); // Últimos 10 puntos
				status.recentMetrics = {
					avgSpeed: parseFloat((recentData.reduce((sum,
						point) => sum + parseFloat(point.speed_kmph || 0), 0) / recentData.length).toFixed(2)),
					avgRPM: Math.round(recentData.reduce((sum,
						point) => sum + parseFloat(point.engine_rpm || 0), 0) / recentData.length),
					efficiencyScore: CarDataService.getVehicleEfficiencyScore(recentData),
				};
			}
		}

		console.log('✅ Estado de simulación:', status);
		return status;
	}

	/**
	 * Método auxiliar para encontrar un segmento de datos que cumpla ciertos criterios
	 * @param {string} field - Campo a evaluar
	 * @param {number} minValue - Valor mínimo
	 * @param {number} maxValue - Valor máximo
	 * @returns {number} Índice de inicio del segmento
	 */
	static findDataSegment(field, minValue, maxValue) {
		if(!CarDataService.syntheticData || CarDataService.syntheticData.length === 0) {
			return 0;
		}

		// Buscar un punto que cumpla los criterios
		for(let i = 0; i < CarDataService.syntheticData.length - 1; i++) {
			const point = CarDataService.syntheticData[i];
			if(point[field] && point[field] >= minValue && point[field] <= maxValue) {
				return i;
			}
		}

		// Si no se encuentra, devolver un índice aleatorio
		return Math.floor(Math.random() * (CarDataService.syntheticData.length / 2));
	}

	/**
	 * Generar resumen estadístico de la simulación
	 * @returns {Object} Estadísticas de la simulación
	 */
	static generateSimulationSummary() {
		// Si no hay datos de simulación, devolver resumen vacío
		if(!CarDataService.simulationData || CarDataService.simulationData.length === 0) {
			return {
				dataPointsCollected: 0,
				durationMinutes: 0,
				distanceKm: 0,
				averageSpeedKmph: 0,
				maxSpeedKmph: 0,
				efficiencyScore: 0,
				diagnosticIssues: [],
			};
		}

		// Calcular tiempo transcurrido
		const startTime = CarDataService.simulationStartTime || new Date(Date.now() - 3600000); // 1 hora por defecto
		const endTime = new Date();
		const durationMinutes = parseFloat(((endTime - startTime) / (1000 * 60)).toFixed(2));

		// Calcular distancia (basada en velocidad y tiempo)
		let totalSpeed = 0;
		let maxSpeed = 0;

		// Recopilar códigos de diagnóstico únicos
		const diagnosticCodes = new Set();

		// Procesar cada punto de datos
		CarDataService.simulationData.forEach(point => {
			const speed = parseFloat(point.speed_kmph || 0);
			totalSpeed += speed;
			maxSpeed = Math.max(maxSpeed, speed);

			// Recopilar códigos de diagnóstico
			if(point.dtc_code && point.dtc_code.trim() !== '') {
				diagnosticCodes.add(point.dtc_code);
			}
		});

		// Calcular velocidad promedio
		const avgSpeed = parseFloat((totalSpeed / CarDataService.simulationData.length).toFixed(2));

		// Calcular distancia aproximada (velocidad promedio * tiempo)
		const distanceKm = parseFloat(((avgSpeed * durationMinutes) / 60).toFixed(2));

		// Calcular puntuación de eficiencia
		const efficiencyScore = CarDataService.getVehicleEfficiencyScore(CarDataService.simulationData);

		// Detalles de problemas de diagnóstico
		const diagnosticIssues = Array.from(diagnosticCodes).map(code => {
			const info = CarDataService.getDiagnosticInfo(code);
			return {
				code: code,
				description: info ? info.description : 'Unknown issue',
				severity: info ? info.severity : 'Unknown',
				impact: info ? info.impact : 'Unknown',
			};
		});

		return {
			routeType: CarDataService.simulationRouteType || 'UNKNOWN',
			dataPointsCollected: CarDataService.simulationData.length,
			durationMinutes: durationMinutes,
			distanceKm: distanceKm,
			averageSpeedKmph: avgSpeed,
			maxSpeedKmph: maxSpeed,
			efficiencyScore: efficiencyScore,
			diagnosticIssues: diagnosticIssues,
			startTime: startTime.toISOString(),
			endTime: endTime.toISOString(),
		};
	}

	static addRandomVariation(data) {
		// Clone the data object
		const newData = { ...data };

		// Add small random variations to numeric values
		if(newData.speed_kmph) newData.speed_kmph = parseFloat((newData.speed_kmph * (1 + (Math.random() * 0.1 - 0.05))).toFixed(2));
		if(newData.engine_rpm) newData.engine_rpm = Math.round(newData.engine_rpm * (1 + (Math.random() * 0.08 - 0.04)));
		if(newData.fuel_level_pct) newData.fuel_level_pct = parseFloat((newData.fuel_level_pct * (1 + (Math.random() * 0.02 - 0.01))).toFixed(2));
		if(newData.engine_temp_c) newData.engine_temp_c = parseFloat((newData.engine_temp_c * (1 + (Math.random() * 0.05 - 0.025))).toFixed(1));

		// Small variations in GPS for movement simulation
		if(newData.lat) newData.lat = parseFloat((parseFloat(newData.lat) + (Math.random() * 0.0002 - 0.0001)).toFixed(6));
		if(newData.lon) newData.lon = parseFloat((parseFloat(newData.lon) + (Math.random() * 0.0002 - 0.0001)).toFixed(6));

		return newData;
	}

	static getLastData() {
		// Si hay datos de simulación, usar el último
		if(CarDataService.simulationData && CarDataService.simulationData.length > 0) {
			return CarDataService.simulationData[CarDataService.simulationData.length - 1];
		}

		// Si no hay datos de simulación, usar el último punto de datos sintéticos
		if(CarDataService.syntheticData.length === 0) {
			return null;
		}

		const index = CarDataService.currentDataIndex > 0 ?
			CarDataService.currentDataIndex - 1 :
			CarDataService.syntheticData.length - 1;

		return CarDataService.syntheticData[index];
	}

	static getDataStream() {
		return {
			subscribe: (callback) => {
				CarDataService.eventEmitter.on('data', callback);
				// Devuelve una función para desuscribirse
				return () => {
					CarDataService.eventEmitter.off('data', callback);
				};
			},
		};
	}

	static getDiagnosticInfo(dtcCode) {
		const dtcInfo = {
			'P0420': {
				description: 'Catalyst System Efficiency Below Threshold',
				severity: 'Medium',
				impact: 'May affect emissions and fuel efficiency',
				rewardImpact: -15, // Reducción de recompensa en porcentaje
			},
			'P0171': {
				description: 'System Too Lean (Bank 1)',
				severity: 'Medium',
				impact: 'May cause rough idling and reduced fuel efficiency',
				rewardImpact: -10,
			},
			'P0300': {
				description: 'Random/Multiple Cylinder Misfire Detected',
				severity: 'High',
				impact: 'Can damage catalytic converter if ignored',
				rewardImpact: -25,
			},
		};

		return dtcCode && dtcInfo[dtcCode] ? dtcInfo[dtcCode] : null;
	}

	static calculateFuelConsumption(dataPoints, timeframeMinutes = 60) {
		if(!dataPoints || dataPoints.length < 2) {
			return null;
		}

		// Limitar los puntos de datos al timeframe especificado
		const limitedDataPoints = dataPoints.slice(-timeframeMinutes);

		const initialFuel = limitedDataPoints[0].fuel_level_pct;
		const finalFuel = limitedDataPoints[limitedDataPoints.length - 1].fuel_level_pct;
		const fuelUsed = initialFuel - finalFuel;

		// Estimando distancia basada en velocidad promedio y tiempo
		const totalSeconds = limitedDataPoints.length * 60; // Asumiendo intervalos de 1 minuto
		const avgSpeed = limitedDataPoints.reduce((sum,
			point) => sum + parseFloat(point.speed_kmph), 0) / limitedDataPoints.length;
		const distanceTraveled = (avgSpeed * totalSeconds) / 3600; // km

		return {
			fuelUsedPercent: fuelUsed > 0 ? fuelUsed : 0,
			distanceTraveled: parseFloat(distanceTraveled.toFixed(2)),
			avgConsumption: distanceTraveled > 0 ? parseFloat((fuelUsed / distanceTraveled).toFixed(2)) : 0,
			efficiency: fuelUsed > 0 ? parseFloat((distanceTraveled / fuelUsed).toFixed(2)) : 0,
		};
	}

	static getVehicleEfficiencyScore(dataPoints, timeframeMinutes = 60) {
		if(!dataPoints || dataPoints.length < 5) {
			return 0;
		}

		// Limitar los puntos de datos al timeframe especificado
		const limitedDataPoints = dataPoints.slice(-timeframeMinutes);

		const avgRPM = limitedDataPoints.reduce((sum,
			point) => sum + parseFloat(point.engine_rpm), 0) / limitedDataPoints.length;
		const avgSpeed = limitedDataPoints.reduce((sum,
			point) => sum + parseFloat(point.speed_kmph), 0) / limitedDataPoints.length;
		const hasErrors = limitedDataPoints.some(point => point.dtc_code && point.dtc_code.trim() !== '');

		// Calificación basada en la relación velocidad/RPM y la presencia de errores
		let score = avgSpeed / (avgRPM / 1000) * 10; // Puntaje base

		// Penalizar por errores de diagnóstico
		if(hasErrors) {
			score *= 0.7;
		}

		return Math.min(Math.max(Math.round(score), 0), 100);
	}

	static getDataPointRewardValue(dataPoint) {
		// Base reward for providing data
		let baseReward = 0.01; // Base token reward per data point

		// Bonus for driving at fuel-efficient speeds (40-80 km/h)
		const speed = parseFloat(dataPoint.speed_kmph);
		if(speed >= 40 && speed <= 80) {
			baseReward *= 1.2;
		}

		// Bonus for engine running at efficient RPM
		const rpm = parseFloat(dataPoint.engine_rpm);
		if(rpm >= 1500 && rpm <= 2500) {
			baseReward *= 1.15;
		}

		// Penalty for DTCs (Diagnostic Trouble Codes)
		if(dataPoint.dtc_code && dataPoint.dtc_code.trim() !== '') {
			const dtcInfo = this.getDiagnosticInfo(dataPoint.dtc_code);
			if(dtcInfo && dtcInfo.rewardImpact) {
				baseReward *= (1 + dtcInfo.rewardImpact / 100);
			}
		}

		return parseFloat(baseReward.toFixed(4));
	}

	static getDataBatchRewardValue(dataPoints) {
		if(!dataPoints || dataPoints.length === 0) return 0;

		let totalReward = 0;
		for(const dataPoint of dataPoints) {
			totalReward += this.getDataPointRewardValue(dataPoint);
		}

		// Bonus for consistent data provision (more data points)
		if(dataPoints.length > 10) {
			totalReward *= 1.1;
		}

		return parseFloat(totalReward.toFixed(4));
	}
}

export default CarDataService;
