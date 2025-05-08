import CarDataService from './car-data.service.js';

class LocalDriveSimulator {
  static isSimulating = false;
  static simulationData = [];
  static currentTimeFrame = null;
  static currentRoute = null;
  static listeners = [];
  static simulationStartTimestamp = null;
  static simulationElapsedTime = 0;

  // Rutas predefinidas con características diferentes
  static routes = {
    URBAN: {
      name: 'Urban City Drive',
      description: 'Dense city traffic with stops and moderate speeds',
      averageSpeed: 35,
      maxSpeed: 60,
      trafficDensity: 'high',
      distance: 12.5,
      estimatedTime: 25, // minutos
      fuelConsumption: 'moderate',
      elevationChange: 'low',
    },
    HIGHWAY: {
      name: 'Highway Cruise',
      description: 'Fast highway driving with consistent speeds',
      averageSpeed: 85,
      maxSpeed: 110,
      trafficDensity: 'low',
      distance: 45.0,
      estimatedTime: 35, // minutos
      fuelConsumption: 'efficient',
      elevationChange: 'moderate',
    },
    MOUNTAIN: {
      name: 'Mountain Pass',
      description: 'Winding roads with elevation changes and variable speeds',
      averageSpeed: 45,
      maxSpeed: 70,
      trafficDensity: 'very low',
      distance: 28.0,
      estimatedTime: 40, // minutos
      fuelConsumption: 'high',
      elevationChange: 'high',
    },
    RURAL: {
      name: 'Country Roads',
      description: 'Relaxed driving through farmland and villages',
      averageSpeed: 55,
      maxSpeed: 80,
      trafficDensity: 'very low',
      distance: 32.0,
      estimatedTime: 35, // minutos
      fuelConsumption: 'moderate',
      elevationChange: 'moderate',
    }
  };

  static async startSimulation(routeType = 'URBAN', durationMinutes = 10) {
    if (LocalDriveSimulator.isSimulating) {
      console.log('A simulation is already running');
      return { success: false, message: 'A simulation is already running' };
    }

    if (!CarDataService.syntheticData || CarDataService.syntheticData.length === 0) {
      try {
        await CarDataService.loadSyntheticData();
      } catch (error) {
        console.error('Failed to load synthetic data:', error);
        return { success: false, message: 'Failed to load simulation data' };
      }
    }

    // Validar y seleccionar la ruta
    const route = LocalDriveSimulator.routes[routeType];
    if (!route) {
      return {
        success: false,
        message: 'Invalid route type. Choose from: ' + Object.keys(LocalDriveSimulator.routes).join(', ')
      };
    }

    LocalDriveSimulator.currentRoute = routeType;
    LocalDriveSimulator.isSimulating = true;
    LocalDriveSimulator.simulationData = [];
    LocalDriveSimulator.simulationStartTimestamp = new Date();
    LocalDriveSimulator.simulationElapsedTime = 0;

    // Configurar un intervalo para actualizar el tiempo transcurrido de la simulación
    const elapsedTimeInterval = setInterval(() => {
      if (!LocalDriveSimulator.isSimulating) {
        clearInterval(elapsedTimeInterval);
        return;
      }

      const now = new Date();
      LocalDriveSimulator.simulationElapsedTime =
        (now.getTime() - LocalDriveSimulator.simulationStartTimestamp.getTime()) / 1000;
    }, 1000);

    // Iniciar el procesamiento de datos
    const stream = CarDataService.startSimulation(1000); // 1 punto de datos por segundo

    // Procesar los datos según el tipo de ruta
    const unsubscribe = stream.subscribe((dataPoint) => {
      // Modificar los datos según la ruta seleccionada
      const modifiedData = LocalDriveSimulator.modifyDataForRoute(dataPoint, routeType);

      // Agregar a los datos de simulación
      LocalDriveSimulator.simulationData.push(modifiedData);

      // Notificar a los listeners
      LocalDriveSimulator.notifyListeners(modifiedData);

      // Comprobar si hemos completado la duración de la simulación
      const elapsedMinutes = LocalDriveSimulator.simulationData.length / 60;
      if (elapsedMinutes >= durationMinutes) {
        LocalDriveSimulator.stopSimulation();
      }
    });

    // Almacenar la función de desuscripción para limpiar más tarde
    LocalDriveSimulator.unsubscribe = unsubscribe;

    return {
      success: true,
      route: route.name,
      estimatedDuration: durationMinutes,
      message: `Started a ${route.name} simulation for ${durationMinutes} minutes`
    };
  }

  static stopSimulation() {
    if (!LocalDriveSimulator.isSimulating) {
      console.log('No simulation is running');
      return { success: false, message: 'No simulation is running' };
    }

    // Detener la simulación de datos del coche
    CarDataService.stopSimulation();

    // Limpiar nuestra suscripción
    if (LocalDriveSimulator.unsubscribe) {
      LocalDriveSimulator.unsubscribe();
    }

    const summary = LocalDriveSimulator.getSimulationSummary();

    // Restablecer el estado
    LocalDriveSimulator.isSimulating = false;

    return {
      success: true,
      message: 'Simulation completed successfully',
      summary
    };
  }

  static modifyDataForRoute(dataPoint, routeType) {
    const route = LocalDriveSimulator.routes[routeType];
    const modifiedData = { ...dataPoint };

    // Modificar velocidad según el tipo de ruta
    switch (routeType) {
      case 'URBAN':
        // Ciudad: velocidades más bajas, más variación debido a semáforos
        modifiedData.speed_kmph = Math.min(
          Math.max(15, dataPoint.speed_kmph * 0.6 + Math.random() * 20 - 10),
          route.maxSpeed
        );
        modifiedData.engine_rpm = 1000 + (modifiedData.speed_kmph * 30);
        // Más probabilidad de tener códigos DTC en ciudad (contaminación)
        if (Math.random() < 0.1) {
          modifiedData.dtc_code = Math.random() < 0.7 ? 'P0420' : 'P0171';
        }
        break;

      case 'HIGHWAY':
        // Autopista: velocidades altas y constantes
        modifiedData.speed_kmph = Math.min(
          Math.max(70, dataPoint.speed_kmph * 1.2 + Math.random() * 10 - 5),
          route.maxSpeed
        );
        modifiedData.engine_rpm = 1500 + (modifiedData.speed_kmph * 20);
        // Menos probabilidad de errores en autopista
        if (Math.random() < 0.03) {
          modifiedData.dtc_code = 'P0420';
        }
        break;

      case 'MOUNTAIN':
        // Montaña: velocidades variables, más revoluciones del motor
        modifiedData.speed_kmph = Math.min(
          Math.max(20, dataPoint.speed_kmph * 0.8 + Math.sin(Date.now() / 5000) * 25),
          route.maxSpeed
        );
        modifiedData.engine_rpm = 2000 + (modifiedData.speed_kmph * 35);
        // La temperatura del motor puede aumentar en montaña
        modifiedData.engine_temp_c = dataPoint.engine_temp_c * 1.1;
        if (Math.random() < 0.07) {
          modifiedData.dtc_code = Math.random() < 0.4 ? 'P0300' : 'P0171';
        }
        break;

      case 'RURAL':
        // Rural: velocidades medias, estables
        modifiedData.speed_kmph = Math.min(
          Math.max(40, dataPoint.speed_kmph * 0.9 + Math.random() * 15 - 5),
          route.maxSpeed
        );
        modifiedData.engine_rpm = 1200 + (modifiedData.speed_kmph * 25);
        // Condiciones rurales generalmente buenas para el motor
        if (Math.random() < 0.02) {
          modifiedData.dtc_code = 'P0171';
        }
        break;

      default:
        // Sin modificación
        break;
    }

    // Redondear valores numéricos
    modifiedData.speed_kmph = parseFloat(modifiedData.speed_kmph.toFixed(2));
    modifiedData.engine_rpm = Math.round(modifiedData.engine_rpm);
    modifiedData.engine_temp_c = parseFloat(modifiedData.engine_temp_c.toFixed(1));

    // Modificar el consumo de combustible según la velocidad y RPM
    const fuelConsumptionFactor = (modifiedData.speed_kmph > 50 && modifiedData.speed_kmph < 90) ? 0.9 : 1.2;
    modifiedData.fuel_level_pct = Math.max(
      0,
      dataPoint.fuel_level_pct - (0.01 * fuelConsumptionFactor * (modifiedData.engine_rpm / 2000))
    );
    modifiedData.fuel_level_pct = parseFloat(modifiedData.fuel_level_pct.toFixed(2));

    return modifiedData;
  }

  static subscribeToSimulation(callback) {
    if (typeof callback !== 'function') {
      console.error('Callback must be a function');
      return null;
    }

    LocalDriveSimulator.listeners.push(callback);

    // Devolver función para desuscribirse
    return () => {
      const index = LocalDriveSimulator.listeners.indexOf(callback);
      if (index !== -1) {
        LocalDriveSimulator.listeners.splice(index, 1);
      }
    };
  }

  static notifyListeners(data) {
    LocalDriveSimulator.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in simulation listener:', error);
      }
    });
  }

  static getSimulationStatus() {
    if (!LocalDriveSimulator.isSimulating) {
      return {
        isActive: false,
        message: 'No simulation running'
      };
    }

    const route = LocalDriveSimulator.routes[LocalDriveSimulator.currentRoute];
    const elapsedTime = LocalDriveSimulator.simulationElapsedTime;
    const dataPoints = LocalDriveSimulator.simulationData.length;

    // Calcular progreso estimado
    const estimatedTotalPoints = route.estimatedTime * 60; // Total de segundos
    const progress = Math.min(100, Math.round((dataPoints / estimatedTotalPoints) * 100));

    return {
      isActive: true,
      route: route.name,
      elapsedTime: elapsedTime.toFixed(0),
      elapsedMinutes: (elapsedTime / 60).toFixed(1),
      dataPoints,
      progress,
      distanceCovered: parseFloat(((dataPoints / 3600) * route.averageSpeed).toFixed(2)),
      averageSpeed: parseFloat(LocalDriveSimulator.calculateAverageSpeed().toFixed(2)),
      currentData: LocalDriveSimulator.simulationData.length > 0 ?
        LocalDriveSimulator.simulationData[LocalDriveSimulator.simulationData.length - 1] : null
    };
  }

  static getSimulationSummary() {
    if (LocalDriveSimulator.simulationData.length === 0) {
      return {
        message: 'No simulation data available'
      };
    }

    const route = LocalDriveSimulator.routes[LocalDriveSimulator.currentRoute];
    const dataPoints = LocalDriveSimulator.simulationData;
    const duration = dataPoints.length / 60; // Minutos

    // Calcular estadísticas básicas
    const avgSpeed = LocalDriveSimulator.calculateAverageSpeed();
    const maxSpeed = Math.max(...dataPoints.map(d => d.speed_kmph));
    const distance = (avgSpeed * duration) / 60; // Kilómetros (velocidad en km/h * horas)

    // Calcular consumo de combustible
    const initialFuel = dataPoints[0].fuel_level_pct;
    const finalFuel = dataPoints[dataPoints.length - 1].fuel_level_pct;
    const fuelUsed = initialFuel - finalFuel;

    // Contar códigos DTC
    const dtcOccurrences = {};
    let totalDtcCount = 0;
    dataPoints.forEach(point => {
      if (point.dtc_code && point.dtc_code.trim() !== '') {
        dtcOccurrences[point.dtc_code] = (dtcOccurrences[point.dtc_code] || 0) + 1;
        totalDtcCount++;
      }
    });

    // Calcular la recompensa potencial (tokens) para estos datos
    const potentialReward = CarDataService.getDataBatchRewardValue(dataPoints);

    // Calcular puntuación de eficiencia
    const efficiencyScore = CarDataService.getVehicleEfficiencyScore(dataPoints);

    return {
      routeName: route.name,
      durationMinutes: parseFloat(duration.toFixed(2)),
      distanceKm: parseFloat(distance.toFixed(2)),
      averageSpeedKmph: parseFloat(avgSpeed.toFixed(2)),
      maxSpeedKmph: parseFloat(maxSpeed.toFixed(2)),
      fuelUsedPercent: parseFloat(fuelUsed.toFixed(2)),
      fuelEfficiency: parseFloat(distance > 0 ? (distance / fuelUsed).toFixed(2) : 0),
      dataPointsCollected: dataPoints.length,
      diagnosticIssues: {
        totalOccurrences: totalDtcCount,
        byCode: dtcOccurrences
      },
      efficiencyScore,
      potentialReward,
      timestamp: new Date().toISOString()
    };
  }

  static calculateAverageSpeed() {
    if (LocalDriveSimulator.simulationData.length === 0) return 0;

    const sum = LocalDriveSimulator.simulationData.reduce(
      (acc, point) => acc + point.speed_kmph,
      0
    );
    return sum / LocalDriveSimulator.simulationData.length;
  }

  static getAvailableRoutes() {
    return Object.entries(LocalDriveSimulator.routes).map(([key, route]) => ({
      id: key,
      name: route.name,
      description: route.description,
      distance: route.distance,
      estimatedTime: route.estimatedTime,
      averageSpeed: route.averageSpeed
    }));
  }
}

export default LocalDriveSimulator;
