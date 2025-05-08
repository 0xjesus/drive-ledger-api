
import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';

class CarDataService {
  static instance;
  static eventEmitter = new EventEmitter();
  static isStreaming = false;
  static currentDataIndex = 0;
  static simulationInterval = null;
  static syntheticData = [];

  static getInstance() {
    if (!CarDataService.instance) {
      CarDataService.instance = new CarDataService();
    }
    return CarDataService.instance;
  }

  static async loadSyntheticData() {
    try {
      // Cargar datos desde el archivo JSON en la raíz
      const rawData = fs.readFileSync(path.resolve('./synthetic_obd_data_24h.json'), 'utf8');
      CarDataService.syntheticData = JSON.parse(rawData);
      console.log(`Loaded ${CarDataService.syntheticData.length} data points from JSON`);
      return CarDataService.syntheticData;
    } catch (error) {
      console.error('Error loading synthetic JSON data:', error);
      // Intentar cargar desde CSV como respaldo
      try {
        await CarDataService.loadSyntheticDataFromCSV();
      } catch (csvError) {
        console.error('Error loading synthetic CSV data:', csvError);
        throw error;
      }
    }
  }

  static async loadSyntheticDataFromCSV() {
    try {
      // Cargar datos desde el archivo CSV en la raíz
      const csvData = fs.readFileSync(path.resolve('./synthetic_obd_data_24h.csv'), 'utf8');
      const lines = csvData.split('\n');
      const headers = lines[0].split('\t');

      CarDataService.syntheticData = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split('\t');
        const dataPoint = {};

        headers.forEach((header, index) => {
          let value = values[index] ? values[index].trim() : '';

          // Convertir a número si es posible
          if (['speed_kmph', 'engine_rpm', 'fuel_level_pct', 'engine_temp_c', 'lat', 'lon'].includes(header)) {
            value = parseFloat(value);
          }

          dataPoint[header] = value;
        });

        CarDataService.syntheticData.push(dataPoint);
      }

      console.log(`Loaded ${CarDataService.syntheticData.length} data points from CSV`);
      return CarDataService.syntheticData;
    } catch (error) {
      console.error('Error loading synthetic CSV data:', error);
      throw error;
    }
  }

  static startSimulation(intervalMs = 1000) {
    if (CarDataService.isStreaming) {
      console.log('Simulation already running');
      return;
    }

    if (CarDataService.syntheticData.length === 0) {
      throw new Error('No synthetic data loaded. Call loadSyntheticData first.');
    }

    CarDataService.isStreaming = true;
    console.log('Starting OBD data simulation...');

    CarDataService.simulationInterval = setInterval(() => {
      if (CarDataService.currentDataIndex >= CarDataService.syntheticData.length) {
        CarDataService.currentDataIndex = 0; // Loop back to start
      }

      const currentData = CarDataService.syntheticData[CarDataService.currentDataIndex];

      // Añadir pequeñas variaciones aleatorias para hacer la simulación más realista
      const variationData = CarDataService.addRandomVariation(currentData);

      // Emitir evento con los datos para que los oyentes puedan reaccionar
      CarDataService.eventEmitter.emit('data', variationData);

      CarDataService.currentDataIndex++;
    }, intervalMs);

    return CarDataService.getDataStream();
  }

  static stopSimulation() {
    if (!CarDataService.isStreaming) {
      console.log('No simulation is running');
      return;
    }

    clearInterval(CarDataService.simulationInterval);
    CarDataService.isStreaming = false;
    console.log('Simulation stopped');
  }

  static addRandomVariation(data) {
    // Clone the data object
    const newData = { ...data };

    // Add small random variations to numeric values
    if (newData.speed_kmph) newData.speed_kmph = parseFloat((newData.speed_kmph * (1 + (Math.random() * 0.1 - 0.05))).toFixed(2));
    if (newData.engine_rpm) newData.engine_rpm = Math.round(newData.engine_rpm * (1 + (Math.random() * 0.08 - 0.04)));
    if (newData.fuel_level_pct) newData.fuel_level_pct = parseFloat((newData.fuel_level_pct * (1 + (Math.random() * 0.02 - 0.01))).toFixed(2));
    if (newData.engine_temp_c) newData.engine_temp_c = parseFloat((newData.engine_temp_c * (1 + (Math.random() * 0.05 - 0.025))).toFixed(1));

    // Small variations in GPS for movement simulation
    if (newData.lat) newData.lat = parseFloat((parseFloat(newData.lat) + (Math.random() * 0.0002 - 0.0001)).toFixed(6));
    if (newData.lon) newData.lon = parseFloat((parseFloat(newData.lon) + (Math.random() * 0.0002 - 0.0001)).toFixed(6));

    return newData;
  }

  static getLastData() {
    if (CarDataService.syntheticData.length === 0) {
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
      }
    };
  }

  static getDiagnosticInfo(dtcCode) {
    const dtcInfo = {
      'P0420': {
        description: 'Catalyst System Efficiency Below Threshold',
        severity: 'Medium',
        impact: 'May affect emissions and fuel efficiency',
        rewardImpact: -15 // Reducción de recompensa en porcentaje
      },
      'P0171': {
        description: 'System Too Lean (Bank 1)',
        severity: 'Medium',
        impact: 'May cause rough idling and reduced fuel efficiency',
        rewardImpact: -10
      },
      'P0300': {
        description: 'Random/Multiple Cylinder Misfire Detected',
        severity: 'High',
        impact: 'Can damage catalytic converter if ignored',
        rewardImpact: -25
      }
    };

    return dtcCode && dtcInfo[dtcCode] ? dtcInfo[dtcCode] : null;
  }

  static calculateFuelConsumption(dataPoints, timeframeMinutes = 60) {
    if (!dataPoints || dataPoints.length < 2) {
      return null;
    }

    // Limitar los puntos de datos al timeframe especificado
    const limitedDataPoints = dataPoints.slice(-timeframeMinutes);

    const initialFuel = limitedDataPoints[0].fuel_level_pct;
    const finalFuel = limitedDataPoints[limitedDataPoints.length - 1].fuel_level_pct;
    const fuelUsed = initialFuel - finalFuel;

    // Estimando distancia basada en velocidad promedio y tiempo
    const totalSeconds = limitedDataPoints.length * 60; // Asumiendo intervalos de 1 minuto
    const avgSpeed = limitedDataPoints.reduce((sum, point) => sum + parseFloat(point.speed_kmph), 0) / limitedDataPoints.length;
    const distanceTraveled = (avgSpeed * totalSeconds) / 3600; // km

    return {
      fuelUsedPercent: fuelUsed > 0 ? fuelUsed : 0,
      distanceTraveled: parseFloat(distanceTraveled.toFixed(2)),
      avgConsumption: distanceTraveled > 0 ? parseFloat((fuelUsed / distanceTraveled).toFixed(2)) : 0,
      efficiency: fuelUsed > 0 ? parseFloat((distanceTraveled / fuelUsed).toFixed(2)) : 0
    };
  }

  static getVehicleEfficiencyScore(dataPoints, timeframeMinutes = 60) {
    if (!dataPoints || dataPoints.length < 5) {
      return 0;
    }

    // Limitar los puntos de datos al timeframe especificado
    const limitedDataPoints = dataPoints.slice(-timeframeMinutes);

    const avgRPM = limitedDataPoints.reduce((sum, point) => sum + parseFloat(point.engine_rpm), 0) / limitedDataPoints.length;
    const avgSpeed = limitedDataPoints.reduce((sum, point) => sum + parseFloat(point.speed_kmph), 0) / limitedDataPoints.length;
    const hasErrors = limitedDataPoints.some(point => point.dtc_code && point.dtc_code.trim() !== '');

    // Calificación basada en la relación velocidad/RPM y la presencia de errores
    let score = avgSpeed / (avgRPM / 1000) * 10; // Puntaje base

    // Penalizar por errores de diagnóstico
    if (hasErrors) {
      score *= 0.7;
    }

    return Math.min(Math.max(Math.round(score), 0), 100);
  }

  static getDataPointRewardValue(dataPoint) {
    // Base reward for providing data
    let baseReward = 0.01; // Base token reward per data point

    // Bonus for driving at fuel-efficient speeds (40-80 km/h)
    const speed = parseFloat(dataPoint.speed_kmph);
    if (speed >= 40 && speed <= 80) {
      baseReward *= 1.2;
    }

    // Bonus for engine running at efficient RPM
    const rpm = parseFloat(dataPoint.engine_rpm);
    if (rpm >= 1500 && rpm <= 2500) {
      baseReward *= 1.15;
    }

    // Penalty for DTCs (Diagnostic Trouble Codes)
    if (dataPoint.dtc_code && dataPoint.dtc_code.trim() !== '') {
      const dtcInfo = this.getDiagnosticInfo(dataPoint.dtc_code);
      if (dtcInfo && dtcInfo.rewardImpact) {
        baseReward *= (1 + dtcInfo.rewardImpact / 100);
      }
    }

    return parseFloat(baseReward.toFixed(4));
  }

  static getDataBatchRewardValue(dataPoints) {
    if (!dataPoints || dataPoints.length === 0) return 0;

    let totalReward = 0;
    for (const dataPoint of dataPoints) {
      totalReward += this.getDataPointRewardValue(dataPoint);
    }

    // Bonus for consistent data provision (more data points)
    if (dataPoints.length > 10) {
      totalReward *= 1.1;
    }

    return parseFloat(totalReward.toFixed(4));
  }
}

export default CarDataService;
