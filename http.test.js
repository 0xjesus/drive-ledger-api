// test-endpoints.js - Prueba exhaustiva de TODOS los endpoints de Drive-Ledger API
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuración base para axios
const API_URL = 'http://localhost:1337';
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
  }
});

// Asegurarse de que exista el directorio para logs
const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configuración de direcciones (mismas que en test.js)
const MINT_AUTHORITY = 'FpCunABcbmfDX1TvSRHxtWQHiDnrAGCrjBLvu6WjsLvs';
const USER_1_WALLET = 'HFJEhqTUPKKWvhwVeQS5qjSP373kMUFpNuiqMMyXZ2Gr';
const USER_2_WALLET = '8zKs2Br4xFYA2pTkRGurPuYdRxtCS61ZzLUD4B6Cmpm3';
const TOKEN_MINT_ADDRESS = '2CdXTtCLWNMfG7EvuMfuQ7FNEjrneUxscg3VgpqQzgAD';

// Variables globales para almacenar IDs durante las pruebas
let simulationId = null;
let simulationData = [];
let listingId = null;
let subscriptionId = null;
let transactionId = null;
let dtcCode = 'P0420';
let testResults = [];
let logStream = null;

// Función para inicializar el archivo de log
function initializeLog() {
  const logFileName = `drive-ledger-api-test-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  const logFilePath = path.join(logDir, logFileName);
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  console.log(`📝 Log de pruebas guardado en: ${logFilePath}`);
  return logFilePath;
}

// Función para escribir en el log
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;

  if (logStream) {
    logStream.write(formattedMessage);
  }

  console.log(message);
}

/**
 * Función de utilidad para verificar si una respuesta es exitosa
 */
function isSuccessfulResponse(response) {
  return response && (response.result === "success" || response.success === true);
}

/**
 * Función para hacer peticiones HTTP y manejar errores
 */
async function makeRequest(method, endpoint, data = null, queryParams = null) {
  const testCase = {
    method: method.toUpperCase(),
    endpoint,
    data,
    queryParams,
    success: false,
    status: null,
    responseData: null,
    error: null,
    duration: 0
  };

  try {
    log(`\n🚀 ${method.toUpperCase()} ${endpoint}`);
    if (data) {
      log('📦 Datos enviados: ' + JSON.stringify(data, null, 2));
    }
    if (queryParams) {
      log('🔍 Query params: ' + JSON.stringify(queryParams, null, 2));
    }

    const startTime = Date.now();
    let response;

    switch (method.toLowerCase()) {
      case 'get':
        response = await api.get(endpoint, queryParams ? { params: queryParams } : undefined);
        break;
      case 'post':
        response = await api.post(endpoint, data);
        break;
      case 'put':
        response = await api.put(endpoint, data);
        break;
      case 'delete':
        response = await api.delete(endpoint);
        break;
      default:
        throw new Error(`Método HTTP no soportado: ${method}`);
    }

    const elapsedTime = Date.now() - startTime;
    testCase.duration = elapsedTime;

    log(`✅ Respuesta (${elapsedTime}ms):`);
    log(`🔑 Status: ${response.status}`);

    // Abreviar la respuesta si es muy grande para el log
    const responseString = JSON.stringify(response.data, null, 2);
    if (responseString.length > 2000) {
      log(`📄 Datos: [Respuesta grande - ${responseString.length} bytes] Ver el objeto retornado...`);
    } else {
      log(`📄 Datos: ${responseString}`);
    }

    // Marcar la petición como exitosa
    testCase.success = true;
    testCase.status = response.status;
    testCase.responseData = response.data;

    // También verificar si la respuesta de la API fue exitosa
    if (isSuccessfulResponse(response.data)) {
      testCase.apiSuccess = true;
    } else {
      testCase.apiSuccess = false;
      log(`⚠️ La API respondió con estructura correcta pero con estado no exitoso`);
    }

    testResults.push(testCase);
    return response.data;
  } catch (error) {
    log(`❌ Error en ${method.toUpperCase()} ${endpoint}:`);

    if (error.response) {
      // Error de respuesta del servidor
      log(`🔑 Status: ${error.response.status}`);
      log(`📄 Datos: ${JSON.stringify(error.response.data, null, 2)}`);

      testCase.status = error.response.status;
      testCase.responseData = error.response.data;
    } else if (error.request) {
      // Error de conexión
      log('⚠️ No se pudo conectar al servidor');
      testCase.error = 'Connection error';
    } else {
      // Otro tipo de error
      log(`⚠️ ${error.message}`);
      testCase.error = error.message;
    }

    testResults.push(testCase);
    return null;
  }
}

/**
 * 1. TEST DE INICIALIZACIÓN
 * Inicializar los servicios de Drive-Ledger API
 */
async function testInitialization() {
  log('\n==== 🚀 [1/12] INICIALIZACIÓN DE SERVICIOS ====');

  try {
    const result = await makeRequest('post', '/api/initialize', {
      tokenMintAddress: TOKEN_MINT_ADDRESS
    });

    // Verificar si la respuesta es exitosa, adaptado a tu estructura de respuesta
    return result?.result === "success" || result?.success === true;
  } catch (error) {
    log(`❌ Error en la inicialización: ${error.message}`);
    return false;
  }
}

/**
 * 2. TEST DE RUTAS DE SIMULACIÓN
 * Probar todas las rutas relacionadas con rutas de simulación
 */
async function testSimulationRoutes() {
  log('\n==== 🛣️ [2/12] RUTAS DE SIMULACIÓN ====');

  try {
    // 1. Obtener rutas disponibles
    log('\n> Obteniendo rutas disponibles...');
    const routes = await makeRequest('get', '/api/routes');

    if (!routes || (routes.result !== "success" && !routes.success)) {
      log('❌ Error obteniendo rutas');
      return false;
    }

    return true;
  } catch (error) {
    log(`❌ Error en rutas de simulación: ${error.message}`);
    return false;
  }
}

/**
 * 3. TEST DE SIMULACIONES
 * Probar todas las rutas relacionadas con simulaciones de conducción
 */
async function testSimulations() {
  log('\n==== 🚗 [3/12] SIMULACIONES DE CONDUCCIÓN ====');

  try {
    // 1. Obtener rutas disponibles (ya probado, pero necesitamos los datos)
    const routes = await makeRequest('get', '/api/routes');

    if (!routes || (routes.result !== "success" && !routes.success)) {
      log('❌ Error obteniendo rutas para simulación');
      return false;
    }

    // 2. Iniciar una simulación
    log('\n> Iniciando simulación...');
    // Obtener datos de rutas adaptándonos a la estructura
    const routesData = routes.data || routes.routes || routes.result?.data || [];
    const routeType = (Array.isArray(routesData) && routesData[0]?.id) ? routesData[0].id : 'URBAN';
    const simulation = await makeRequest('post', '/api/simulations', {
      routeType: routeType,
      durationMinutes: 2,
      walletAddress: USER_1_WALLET
    });

    if (!simulation || (simulation.result !== "success" && !simulation.success)) {
      log('❌ Error iniciando simulación');
      return false;
    }

    // Guardar ID de simulación para pruebas posteriores
    simulationId = simulation.data?.simulationId;
    log(`📝 Simulación ID guardado: ${simulationId}`);

    // 3. Verificar estado de simulación
    log('\n> Verificando estado de simulación...');
    await makeRequest('get', '/api/simulations/status');

    // 4. Esperar un poco para que la simulación avance
    log('\n> Esperando 5 segundos para que la simulación avance...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. Detener simulación
    log('\n> Deteniendo simulación...');
    const stopResult = await makeRequest('post', '/api/simulations/stop');

    if (stopResult && (stopResult.result === "success" || stopResult.success)) {
      // Guardar datos de simulación para usarlos posteriormente
      simulationData = stopResult.data.simulationData || [];
      log(`📝 Datos de simulación guardados: ${simulationData.length} puntos`);
    }

    // 6. Obtener detalle de la simulación
    log('\n> Obteniendo detalles de la simulación...');
    await makeRequest('get', `/api/simulations/${simulationId}`);

    return true;
  } catch (error) {
    log(`❌ Error en simulaciones: ${error.message}`);
    return false;
  }
}

/**
 * 4. TEST DE RECOMPENSAS
 * Probar todas las rutas relacionadas con recompensas
 */
async function testRewards() {
  log('\n==== 💎 [4/12] RECOMPENSAS ====');

  try {
    // 1. Generar recompensa por simulación
    log('\n> Generando recompensa...');
    const reward = await makeRequest('post', '/api/rewards', {
      walletAddress: USER_1_WALLET,
      simulationId
    });

    // Es posible que falle en un entorno de prueba sin acceso completo a Solana
    // pero seguimos con las pruebas

    return true;
  } catch (error) {
    log(`❌ Error en recompensas: ${error.message}`);
    return false;
  }
}

/**
 * 5. TEST DE AIRDROPS
 * Probar todas las rutas relacionadas con airdrops de tokens
 */
async function testAirdrops() {
  log('\n==== 💰 [5/12] AIRDROPS DE TOKENS ====');

  try {
    // 1. Ejecutar airdrop de tokens
    log('\n> Ejecutando airdrop...');
    await makeRequest('post', '/api/airdrops', {
      walletAddress: USER_1_WALLET,
      amount: 50
    });

    // También hacemos un airdrop para el usuario 2
    log('\n> Ejecutando airdrop para el usuario 2...');
    await makeRequest('post', '/api/airdrops', {
      walletAddress: USER_2_WALLET,
      amount: 100
    });

    return true;
  } catch (error) {
    log(`❌ Error en airdrops: ${error.message}`);
    return false;
  }
}

/**
 * 6. TEST DE BALANCES
 * Probar todas las rutas relacionadas con balances de tokens
 */
async function testBalances() {
  log('\n==== 💵 [6/12] BALANCES DE TOKENS ====');

  try {
    // 1. Verificar balance de tokens del usuario 1
    log('\n> Verificando balance de tokens del usuario 1...');
    await makeRequest('get', `/api/balances/${USER_1_WALLET}`);

    // 2. Verificar balance de tokens del usuario 2
    log('\n> Verificando balance de tokens del usuario 2...');
    await makeRequest('get', `/api/balances/${USER_2_WALLET}`);

    return true;
  } catch (error) {
    log(`❌ Error en balances: ${error.message}`);
    return false;
  }
}

/**
 * 7. TEST DE MARKETPLACE - DATOS GENERALES
 * Probar todas las rutas relacionadas con datos generales del marketplace
 */
async function testMarketplaceGeneral() {
  log('\n==== 🏪 [7/12] MARKETPLACE - DATOS GENERALES ====');

  try {
    // 1. Obtener tipos de datos disponibles
    log('\n> Obteniendo tipos de datos...');
    const dataTypes = await makeRequest('get', '/api/marketplace/datatypes');

    if (!dataTypes || (dataTypes.result !== "success" && !dataTypes.success)) {
      log('❌ Error obteniendo tipos de datos');
      return false;
    }

    // 2. Obtener estadísticas del marketplace
    log('\n> Obteniendo estadísticas del marketplace...');
    await makeRequest('get', '/api/marketplace/statistics');

    // 3. Estimar valor de datos
    log('\n> Estimando valor de datos...');
    await makeRequest('post', '/api/marketplace/estimate-value', {
      dataPoints: [
        { lat: 19.0413, lon: -98.2062, speed_kmph: 60, timestamp: new Date().toISOString() },
        { lat: 19.0414, lon: -98.2063, speed_kmph: 65, timestamp: new Date().toISOString() }
      ],
      dataType: 'LOCATION'
    });

    return true;
  } catch (error) {
    log(`❌ Error en marketplace general: ${error.message}`);
    return false;
  }
}

/**
 * 8. TEST DE MARKETPLACE - LISTINGS
 * Probar todas las rutas relacionadas con listings en el marketplace
 */
async function testMarketplaceListings() {
  log('\n==== 📋 [8/12] MARKETPLACE - LISTINGS ====');

  try {
    // 1. Obtener tipos de datos disponibles (ya probado, pero necesitamos los datos)
    const dataTypes = await makeRequest('get', '/api/marketplace/datatypes');

    if (!dataTypes || (dataTypes.result !== "success" && !dataTypes.success)) {
      log('❌ Error obteniendo tipos de datos para listings');
      return false;
    }

    // 2. Crear un listado
    log('\n> Creando listado...');
    // Obtener datos adaptándonos a la estructura
    const dataTypesData = dataTypes.data || dataTypes.types || dataTypes.result?.data || [];
    const dataType = (Array.isArray(dataTypesData) && dataTypesData[0]?.id) ? dataTypesData[0].id : 'LOCATION';
    const listing = await makeRequest('post', '/api/marketplace/listings', {
      walletAddress: USER_1_WALLET,
      dataType,
      pricePerPoint: 0.05,
      description: `Test listing for ${dataType} data from Drive-Ledger API`,
      samples: [
        {
          lat: 19.0413,
          lon: -98.2062,
          timestamp: new Date().toISOString(),
          speed_kmph: 65,
          engine_rpm: 2500
        }
      ]
    });

    if (!listing || (listing.result !== "success" && !listing.success)) {
      log('❌ Error creando listado');
      return false;
    }

    // Guardar ID del listado para pruebas posteriores
    listingId = listing.data?.id;
    log(`📝 Listing ID guardado: ${listingId}`);

    // 3. Obtener listados sin filtros
    log('\n> Obteniendo todos los listados...');
    await makeRequest('get', '/api/marketplace/listings');

    // 4. Obtener listados con filtros
    log('\n> Obteniendo listados con filtros...');
    await makeRequest('get', '/api/marketplace/listings', null, {
      seller: USER_1_WALLET,
      dataType: dataType,
      active: true
    });

    // 5. Obtener detalle de un listado
    log('\n> Obteniendo detalle de listado...');
    await makeRequest('get', `/api/marketplace/listings/${listingId}`);

    // 6. Actualizar listado
    log('\n> Actualizando listado...');
    await makeRequest('put', `/api/marketplace/listings/${listingId}`, {
      pricePerPoint: 0.07,
      description: 'Updated test listing from Drive-Ledger API'
    });

    return true;
  } catch (error) {
    log(`❌ Error en marketplace listings: ${error.message}`);
    return false;
  }
}

/**
 * 9. TEST DE MARKETPLACE - SUSCRIPCIONES
 * Probar todas las rutas relacionadas con suscripciones en el marketplace
 */
async function testMarketplaceSubscriptions() {
  log('\n==== 🔄 [9/12] MARKETPLACE - SUSCRIPCIONES ====');

  try {
    // 1. Crear una suscripción
    log('\n> Creando suscripción...');
    const subscription = await makeRequest('post', '/api/marketplace/subscriptions', {
      buyerWalletAddress: USER_2_WALLET,
      listingId,
      durationDays: 7,
      pointsPerDay: 100
    });

    if (!subscription || (subscription.result !== "success" && !subscription.success)) {
      log('❌ Error creando suscripción');
      return false;
    }

    // Guardar IDs de suscripción y transacción para pruebas posteriores
    subscriptionId = subscription.data?.subscription?.id;
    transactionId = subscription.data?.transaction?.id;
    log(`📝 Subscription ID guardado: ${subscriptionId}`);
    log(`📝 Transaction ID guardado: ${transactionId}`);

    // 2. Confirmar transacción (esto debe ir junto con las pruebas de suscripción)
    log('\n> Confirmando transacción...');
    await makeRequest('post', `/api/marketplace/transactions/${transactionId}/confirm`, {
      txHash: 'test-tx-hash-' + Date.now()
    });

    // 3. Calificar proveedor
    log('\n> Calificando proveedor...');
    await makeRequest('post', `/api/marketplace/subscriptions/${subscriptionId}/rate`, {
      rating: 4.5,
      comment: 'Very good data quality and responsiveness!'
    });

    return true;
  } catch (error) {
    log(`❌ Error en marketplace suscripciones: ${error.message}`);
    return false;
  }
}

/**
 * 10. TEST DE MARKETPLACE - TRANSACCIONES DE USUARIO
 * Probar todas las rutas relacionadas con transacciones de usuario
 */
async function testMarketplaceUserTransactions() {
  log('\n==== 💱 [10/12] MARKETPLACE - TRANSACCIONES DE USUARIO ====');

  try {
    // 1. Obtener transacciones del usuario 1
    log('\n> Obteniendo transacciones del usuario 1...');
    await makeRequest('get', `/api/marketplace/users/${USER_1_WALLET}/transactions`);

    // 2. Obtener transacciones del usuario 2
    log('\n> Obteniendo transacciones del usuario 2...');
    await makeRequest('get', `/api/marketplace/users/${USER_2_WALLET}/transactions`);

    return true;
  } catch (error) {
    log(`❌ Error en marketplace transacciones de usuario: ${error.message}`);
    return false;
  }
}

/**
 * 11. TEST DE MARKETPLACE - SUSCRIPCIONES DE USUARIO
 * Probar todas las rutas relacionadas con suscripciones de usuario
 */
async function testMarketplaceUserSubscriptions() {
  log('\n==== 📝 [11/12] MARKETPLACE - SUSCRIPCIONES DE USUARIO ====');

  try {
    // 1. Obtener suscripciones del usuario 1
    log('\n> Obteniendo suscripciones del usuario 1...');
    await makeRequest('get', `/api/marketplace/users/${USER_1_WALLET}/subscriptions`);

    // 2. Obtener suscripciones del usuario 2
    log('\n> Obteniendo suscripciones del usuario 2...');
    await makeRequest('get', `/api/marketplace/users/${USER_2_WALLET}/subscriptions`);

    // 3. Obtener simulaciones del usuario 1
    log('\n> Obteniendo simulaciones del usuario 1...');
    await makeRequest('get', `/api/users/${USER_1_WALLET}/simulations`);

    return true;
  } catch (error) {
    log(`❌ Error en marketplace suscripciones de usuario: ${error.message}`);
    return false;
  }
}

/**
 * 12. TEST DE DIAGNÓSTICOS
 * Probar todas las rutas relacionadas con diagnósticos
 */
async function testDiagnostics() {
  log('\n==== 🔧 [12/12] DIAGNÓSTICOS ====');

  try {
    // 1. Obtener información de código de diagnóstico
    log('\n> Obteniendo información de código de diagnóstico...');
    await makeRequest('get', `/api/diagnostics/${dtcCode}`);

    return true;
  } catch (error) {
    log(`❌ Error en diagnósticos: ${error.message}`);
    return false;
  }
}

/**
 * Función para generar reporte de pruebas
 */
function generateTestReport() {
  // 1. Calcular estadísticas
  const totalTests = testResults.length;
  const successfulTests = testResults.filter(test => test.success).length;
  const failedTests = totalTests - successfulTests;
  const successRate = (successfulTests / totalTests) * 100;

  // 2. Calcular tiempo total
  const totalDuration = testResults.reduce((sum, test) => sum + test.duration, 0);
  const averageDuration = totalDuration / totalTests;

  // 3. Agrupar por endpoint
  const endpointMap = {};
  testResults.forEach(test => {
    const endpoint = test.endpoint;
    if (!endpointMap[endpoint]) {
      endpointMap[endpoint] = {
        total: 0,
        success: 0,
        failed: 0
      };
    }

    endpointMap[endpoint].total++;
    if (test.success) {
      endpointMap[endpoint].success++;
    } else {
      endpointMap[endpoint].failed++;
    }
  });

  // 4. Generar reporte
  log('\n\n📊 REPORTE DE PRUEBAS DE API DRIVE-LEDGER 📊');
  log('===========================================================');
  log(`⏱️ Fecha y hora: ${new Date().toLocaleString()}`);
  log(`🌐 URL: ${API_URL}`);
  log('-----------------------------------------------------------');
  log(`📝 Resumen:`);
  log(`   ✅ Tests exitosos: ${successfulTests}/${totalTests} (${successRate.toFixed(2)}%)`);
  log(`   ❌ Tests fallidos: ${failedTests}/${totalTests}`);
  log(`   ⏱️ Tiempo total: ${(totalDuration / 1000).toFixed(2)} segundos`);
  log(`   ⏱️ Tiempo promedio por test: ${(averageDuration / 1000).toFixed(2)} segundos`);
  log('-----------------------------------------------------------');
  log(`📝 Resultados por endpoint:`);

  Object.keys(endpointMap).sort().forEach(endpoint => {
    const stats = endpointMap[endpoint];
    const endpointSuccessRate = (stats.success / stats.total) * 100;
    log(`   ${endpoint}: ${stats.success}/${stats.total} (${endpointSuccessRate.toFixed(2)}%)`);
  });
  log('-----------------------------------------------------------');

  // 5. Mostrar tests fallidos
  const failedTestResults = testResults.filter(test => !test.success);
  if (failedTestResults.length > 0) {
    log(`❌ Tests fallidos (${failedTestResults.length}):`);
    failedTestResults.forEach((test, index) => {
      log(`   ${index + 1}. ${test.method} ${test.endpoint}`);
      log(`      Status: ${test.status}`);
      if (test.error) {
        log(`      Error: ${test.error}`);
      }
      if (test.responseData) {
        log(`      Respuesta: ${JSON.stringify(test.responseData, null, 2)}`);
      }
    });
  } else {
    log('✅ No hay tests fallidos.');
  }
  log('===========================================================');
  log('FINALIZADO.');

  // 6. Guardar reporte completo en un archivo
  const reportFileName = `drive-ledger-api-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const reportFilePath = path.join(logDir, reportFileName);

  fs.writeFileSync(reportFilePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    apiUrl: API_URL,
    summary: {
      totalTests,
      successfulTests,
      failedTests,
      successRate,
      totalDuration,
      averageDuration
    },
    endpointStats: endpointMap,
    failedTests: failedTestResults,
    allTests: testResults
  }, null, 2));

  log(`📝 Reporte JSON completo guardado en: ${reportFilePath}`);
}

/**
 * Función principal para ejecutar todas las pruebas
 */
async function runEndpointTests() {
  // Inicializar archivo de log
  const logFilePath = initializeLog();

  log('🧪 INICIANDO PRUEBAS EXHAUSTIVAS DE API DRIVE-LEDGER');
  log(`🌐 URL: ${API_URL}`);
  log(`⏱️ ${new Date().toLocaleString()}`);
  log(`📊 Configuración de prueba:`);
  log(`   Mint Authority: ${MINT_AUTHORITY}`);
  log(`   Usuario 1: ${USER_1_WALLET}`);
  log(`   Usuario 2: ${USER_2_WALLET}`);
  log(`   Token Mint: ${TOKEN_MINT_ADDRESS}`);

  try {
    // Ejecutar todas las pruebas en secuencia
    if (!await testInitialization()) {
      log('❌ Falló la inicialización de servicios. Abortando pruebas.');
      return;
    }

    await testSimulationRoutes();
    await testSimulations();
    await testRewards();
    await testAirdrops();
    await testBalances();
    await testMarketplaceGeneral();
    await testMarketplaceListings();
    await testMarketplaceSubscriptions();
    await testMarketplaceUserTransactions();
    await testMarketplaceUserSubscriptions();
    await testDiagnostics();

    // Generar reporte de pruebas
    generateTestReport();

    log('\n✅ ¡TODAS LAS CATEGORÍAS DE PRUEBAS COMPLETADAS!');
  } catch (error) {
    log('\n❌ ERROR FATAL DURANTE LA EJECUCIÓN DE PRUEBAS:');
    log(error.stack || error.message || error);
  } finally {
    // Cerrar el archivo de log
    if (logStream) {
      logStream.end();
    }
  }
}

// Ejecutar todas las pruebas
runEndpointTests();
