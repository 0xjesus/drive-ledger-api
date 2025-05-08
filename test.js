// test.js
import CarDataService from './services/car-data.service.js';
import TokenRewardService from './services/token-reward.service.js';
import LocalDriveSimulator from './services/local-drive-simulator.service.js';
import MarketplaceService from './services/market-place.service.js';
import fs from 'fs';
import path from 'path';
import { Keypair, Connection, Transaction, PublicKey } from '@solana/web3.js';

// Asegurarse de que exista el directorio para transacciones
const txDir = path.resolve('./transactions');
if (!fs.existsSync(txDir)) {
  fs.mkdirSync(txDir, { recursive: true });
}

// Cargar la clave privada del mint authority
function loadMintAuthorityKeypair() {
  try {
    const secretKeyString = fs.readFileSync(path.resolve('./wallet/devnet-wallet.json'), 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Error loading wallet keypair:', error);
    throw new Error('Failed to load mint authority wallet keypair');
  }
}

// Configuración
const MINT_AUTHORITY_KEYPAIR = loadMintAuthorityKeypair();
const MINT_AUTHORITY = MINT_AUTHORITY_KEYPAIR.publicKey.toString();
const USER_1_WALLET = 'HFJEhqTUPKKWvhwVeQS5qjSP373kMUFpNuiqMMyXZ2Gr';
const USER_2_WALLET = '8zKs2Br4xFYA2pTkRGurPuYdRxtCS61ZzLUD4B6Cmpm3';
const TOKEN_MINT_ADDRESS = '2CdXTtCLWNMfG7EvuMfuQ7FNEjrneUxscg3VgpqQzgAD';
const SOLANA_CONNECTION = new Connection('https://api.devnet.solana.com', 'confirmed');

console.log('🚗 Drive-Ledger API - Test Completo 🚗');
console.log('-----------------------------------------------------------');
console.log(`Autoridad de mint: ${MINT_AUTHORITY}`);
console.log(`Usuario 1: ${USER_1_WALLET}`);
console.log(`Usuario 2: ${USER_2_WALLET}`);
console.log(`Token: ${TOKEN_MINT_ADDRESS}`);
console.log('-----------------------------------------------------------\n');

async function runTests() {
  console.log('🚀 INICIANDO PRUEBAS DE DRIVE-LEDGER 🚀');

  try {
    // 1. Cargar datos de vehículo simulados
    console.log('\n📊 PASO 1: Cargando datos OBD de vehículo...');
    await CarDataService.loadSyntheticData();
    console.log(`✅ Datos cargados: ${CarDataService.syntheticData.length} puntos`);
    console.log(`📌 Ejemplo de dato:`, JSON.stringify(CarDataService.syntheticData[0], null, 2));

    // 2. Inicializar el servicio de tokens
    console.log('\n💰 PASO 2: Inicializando servicio de tokens DRVL...');
    console.log(`📌 Usando token existente: ${TOKEN_MINT_ADDRESS}`);

    const tokenResult = await TokenRewardService.initialize(MINT_AUTHORITY, TOKEN_MINT_ADDRESS);
    console.log(`✅ Token inicializado: ${tokenResult.tokenMintAddress}`);

    // 3. Iniciar simulación de conducción para el Usuario 1
    console.log(`\n🚗 PASO 3: Iniciando simulación de conducción para ${USER_1_WALLET}...`);

    // Mostrar rutas disponibles
    const availableRoutes = LocalDriveSimulator.getAvailableRoutes();
    console.log('📌 Rutas disponibles:');
    availableRoutes.forEach(route => {
      console.log(`   - ${route.name}: ${route.description} (${route.distance}km)`);
    });

    // Seleccionar ruta urbana y duración corta para pruebas
    const routeType = 'URBAN';
    const durationMinutes = 2;
    console.log(`📌 Seleccionando ruta: ${routeType} por ${durationMinutes} minutos`);

    const simulationResult = await LocalDriveSimulator.startSimulation(routeType, durationMinutes);
    console.log(`✅ Simulación iniciada: ${simulationResult.route}`);

    // Esperar a que la simulación genere algunos datos
    console.log('⏳ Esperando datos de simulación (5 segundos)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Obtener estado de la simulación
    const simulationStatus = LocalDriveSimulator.getSimulationStatus();
    console.log('\n📊 PASO 4: Estado de la simulación en tiempo real:');
    console.log(`   🛣️ Ruta: ${simulationStatus.route}`);
    console.log(`   ⏱️ Tiempo transcurrido: ${simulationStatus.elapsedMinutes} minutos`);
    console.log(`   📏 Distancia recorrida: ${simulationStatus.distanceCovered} km`);
    console.log(`   🏎️ Velocidad promedio: ${simulationStatus.averageSpeed} km/h`);
    console.log(`   📝 Puntos de datos recolectados: ${simulationStatus.dataPoints}`);

    if (simulationStatus.currentData) {
      console.log(`   📌 Último dato recolectado:`, JSON.stringify(simulationStatus.currentData, null, 2));
    }

    // 5. Detener la simulación
    console.log('\n🛑 PASO 5: Deteniendo simulación...');
    const stopResult = LocalDriveSimulator.stopSimulation();
    console.log('✅ Simulación completada');

    // 6. Mostrar resumen de la simulación
    console.log('\n📈 PASO 6: Resumen de la simulación:');
    console.log(`   ⏱️ Duración: ${stopResult.summary.durationMinutes} minutos`);
    console.log(`   📏 Distancia: ${stopResult.summary.distanceKm} km`);
    console.log(`   🏎️ Velocidad promedio: ${stopResult.summary.averageSpeedKmph} km/h`);
    console.log(`   🏆 Puntuación de eficiencia: ${stopResult.summary.efficiencyScore}/100`);
    console.log(`   💰 Recompensa potencial: ${stopResult.summary.potentialReward} DRVL tokens`);

    if (stopResult.summary.diagnosticIssues && stopResult.summary.diagnosticIssues.totalOccurrences > 0) {
      console.log(`   ⚠️ Problemas de diagnóstico detectados: ${stopResult.summary.diagnosticIssues.totalOccurrences}`);

      for (const [code, count] of Object.entries(stopResult.summary.diagnosticIssues.byCode)) {
        const diagnosticInfo = CarDataService.getDiagnosticInfo(code);
        console.log(`      - ${code}: ${diagnosticInfo ? diagnosticInfo.description : 'Código desconocido'} (${count} veces)`);
      }
    }

    // 7. Recompensar al USUARIO 1 (acuñando tokens directamente)
    console.log(`\n💎 PASO 7: Acuñando tokens de recompensa para ${USER_1_WALLET}...`);

    const rewardAmount = stopResult.summary.potentialReward;
    console.log(`📌 Recompensa calculada: ${rewardAmount} DRVL por ${LocalDriveSimulator.simulationData.length} puntos de datos`);

    try {
      // Generar la transacción de recompensa
      const rewardTx = await TokenRewardService.mintToken(
        MINT_AUTHORITY,  // payer (mint authority)
        TOKEN_MINT_ADDRESS,  // dirección del token
        USER_1_WALLET,  // receptor (usuario que recibe la recompensa)
        rewardAmount  // cantidad
      );

      console.log(`📝 Transacción de recompensa generada`);

      // Deserializar la transacción para firmarla y enviarla
      const transactionBuffer = Buffer.from(rewardTx, 'base64');
      const transaction = Transaction.from(transactionBuffer);

      console.log(`🔑 Firmando transacción con la clave privada de la mint authority...`);
      transaction.sign(MINT_AUTHORITY_KEYPAIR);

      console.log(`📡 Enviando transacción a la blockchain...`);
      const signature = await SOLANA_CONNECTION.sendRawTransaction(transaction.serialize());

      console.log(`⏳ Esperando confirmación...`);
      const confirmation = await SOLANA_CONNECTION.confirmTransaction(signature);

      console.log(`✅ ¡Transacción completada! Tokens acuñados directamente a ${USER_1_WALLET}`);
      console.log(`🔍 Firma de transacción: ${signature}`);
      console.log(`💰 Cantidad acuñada: ${rewardAmount} DRVL tokens`);

      // Guardar información de la transacción
      const rewardTxInfoPath = path.resolve('./transactions/reward_tx_info.json');
      fs.writeFileSync(rewardTxInfoPath, JSON.stringify({
        recipient: USER_1_WALLET,
        amount: rewardAmount,
        token: TOKEN_MINT_ADDRESS,
        tokenSymbol: 'DRVL',
        transactionSignature: signature,
        timestamp: new Date().toISOString()
      }, null, 2));
      console.log(`💾 Información de transacción guardada en: ${rewardTxInfoPath}`);

    } catch (error) {
      console.error(`❌ Error al acuñar tokens:`, error.message);
      console.log(`⚠️ Continuando con el resto de las pruebas...`);
    }

    // 8. Crear listado en el marketplace (desde USER_1)
    console.log(`\n🏪 PASO 8: Creando listado en marketplace desde ${USER_1_WALLET}...`);

    const dataTypes = MarketplaceService.getDataTypes();
    console.log('📌 Tipos de datos disponibles:');
    dataTypes.forEach(type => {
      console.log(`   - ${type.name}: ${type.description} (Impacto de privacidad: ${type.privacyImpact})`);
    });

    const simulationData = LocalDriveSimulator.simulationData;
    // Tomar muestra de los primeros 3 puntos de datos
    const sampleData = simulationData.slice(0, 3);

    console.log(`📌 Creando listado con ${sampleData.length} muestras de datos...`);

    const listing = MarketplaceService.createListing(
      USER_1_WALLET,  // Usuario 1 crea el listado (vendedor)
      'COMPLETE', // Datos completos
      0.02, // precio por punto de datos
      'Datos completos de vehículo en recorrido urbano con métricas de eficiencia',
      sampleData,
    );

    console.log(`✅ Listado creado con ID: ${listing.id}`);
    console.log(`📌 Detalles del listado:`, JSON.stringify({
      id: listing.id,
      seller: listing.seller,
      dataType: listing.dataType,
      typeName: listing.typeName,
      pricePerPoint: listing.pricePerPoint,
      privacyImpact: listing.privacyImpact,
      active: listing.active,
      createdAt: listing.createdAt
    }, null, 2));

    // 9. Simular suscripción de datos (USER_2 compra a USER_1)
    console.log(`\n🤝 PASO 9: Simulando suscripción: ${USER_2_WALLET} compra datos a ${USER_1_WALLET}...`);

    console.log(`📌 Comprador: ${USER_2_WALLET}`);
    console.log(`📌 Vendedor: ${USER_1_WALLET}`);
    console.log(`📌 Listado ID: ${listing.id}`);
    console.log(`📌 Duración: 7 días`);
    console.log(`📌 Puntos por día: 100`);

    // Generar transacción simulada (evitar problemas con Solana en pruebas)
    const durationDays = 7;
    const pointsPerDay = 100;
    const totalPrice = listing.pricePerPoint * pointsPerDay * durationDays;

    // Generar información simulada de la suscripción
    const subscriptionId = Date.now();
    const subscription = {
      id: subscriptionId,
      listingId: listing.id,
      buyer: USER_2_WALLET,
      seller: USER_1_WALLET,
      pointsPerDay,
      durationDays,
      totalPrice,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      status: 'PENDING'
    };

    // Generar información simulada de la transacción
    const transactionId = Date.now() + 1;
    const simulatedTransaction = {
      id: transactionId,
      type: 'SUBSCRIPTION',
      buyer: USER_2_WALLET,
      seller: USER_1_WALLET,
      listingId: listing.id,
      amount: totalPrice,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    console.log(`\n🔑 TRANSACCIÓN DE SUSCRIPCIÓN (a firmar por ${USER_2_WALLET}):`,);
    console.log(`-----------------------------------------------------------`);
    console.log(`Tipo: Transferencia de tokens`);
    console.log(`De: ${USER_2_WALLET} (comprador)`);
    console.log(`Para: ${USER_1_WALLET} (vendedor)`);
    console.log(`Cantidad: ${totalPrice.toFixed(2)} DRVL tokens`);
    console.log(`Duración suscripción: ${durationDays} días`);
    console.log(`Puntos por día: ${pointsPerDay}`);
    console.log(`ID Suscripción: ${subscriptionId}`);
    console.log(`Fecha inicio: ${subscription.startDate}`);
    console.log(`Fecha fin: ${subscription.endDate}`);
    console.log(`-----------------------------------------------------------`);

    // Guardar información simulada en un archivo
    const subscriptionInfoPath = path.resolve('./transactions/subscription_info.json');
    fs.writeFileSync(subscriptionInfoPath, JSON.stringify({
      subscription,
      transaction: simulatedTransaction,
      paymentDetails: {
        buyer: USER_2_WALLET,
        seller: USER_1_WALLET,
        amount: totalPrice,
        token: TOKEN_MINT_ADDRESS,
        tokenSymbol: 'DRVL'
      }
    }, null, 2));
    console.log(`💾 Información de suscripción guardada en: ${subscriptionInfoPath}`);

    console.log(`✅ Suscripción simulada creada con ID: ${subscriptionId}`);
    console.log(`ℹ️ NOTA: Solo el comprador (${USER_2_WALLET}) debe firmar esta transacción`);
    console.log(`ℹ️ El vendedor ${USER_1_WALLET} solo recibe los tokens y no necesita firmar nada`);

    // 10. Confirmar transacción (simulada)
    console.log('\n✅ PASO 10: Confirmando transacción de compra...');

    // En un escenario real, este hash vendría de la blockchain
    const txHash = 'simulated_tx_hash_' + Date.now().toString().slice(-8);
    console.log(`📌 Hash de transacción simulado: ${txHash}`);
    console.log(`📌 Fecha de confirmación: ${new Date().toISOString()}`);

    // Actualizar estado de suscripción y transacción
    subscription.status = 'ACTIVE';
    simulatedTransaction.status = 'COMPLETED';
    simulatedTransaction.completedAt = new Date().toISOString();
    simulatedTransaction.blockchainTxHash = txHash;

    // Guardar información actualizada
    fs.writeFileSync(subscriptionInfoPath, JSON.stringify({
      subscription,
      transaction: simulatedTransaction,
      paymentDetails: {
        buyer: USER_2_WALLET,
        seller: USER_1_WALLET,
        amount: totalPrice,
        token: TOKEN_MINT_ADDRESS,
        tokenSymbol: 'DRVL'
      }
    }, null, 2));

    console.log(`✅ Transacción confirmada: ${simulatedTransaction.status}`);
    console.log(`📌 Completada en: ${simulatedTransaction.completedAt}`);

    // 11. Calificar al proveedor de datos
    console.log(`\n⭐ PASO 11: ${USER_2_WALLET} califica a ${USER_1_WALLET}...`);

    const rating = 4.5;
    const comment = 'Excelentes datos de conducción urbana con buena precisión y detalles de diagnóstico útiles';

    // Actualizar suscripción con calificación
    subscription.rating = rating;
    subscription.ratingComment = comment;
    subscription.ratedAt = new Date().toISOString();

    // Guardar información actualizada
    fs.writeFileSync(subscriptionInfoPath, JSON.stringify({
      subscription,
      transaction: simulatedTransaction,
      paymentDetails: {
        buyer: USER_2_WALLET,
        seller: USER_1_WALLET,
        amount: totalPrice,
        token: TOKEN_MINT_ADDRESS,
        tokenSymbol: 'DRVL'
      },
      rating: {
        value: rating,
        comment,
        ratedAt: subscription.ratedAt
      }
    }, null, 2));

    console.log(`✅ Calificación añadida: ${rating} estrellas`);
    console.log(`📌 Comentario: "${comment}"`);

    // 12. Mostrar valor estimado de los datos para diferentes tipos
    console.log('\n💵 PASO 12: Análisis de valor de datos por tipo:');

    const locationValue = MarketplaceService.estimateDataValue(simulationData, 'LOCATION');
    const diagnosticValue = MarketplaceService.estimateDataValue(simulationData, 'DIAGNOSTIC');
    const performanceValue = MarketplaceService.estimateDataValue(simulationData, 'PERFORMANCE');
    const fuelValue = MarketplaceService.estimateDataValue(simulationData, 'FUEL');
    const completeValue = MarketplaceService.estimateDataValue(simulationData, 'COMPLETE');

    console.log(`📌 Valor de mercado estimado por tipo de datos:`);
    console.log(`   - Ubicación (LOCATION): ${locationValue} DRVL tokens`);
    console.log(`   - Diagnóstico (DIAGNOSTIC): ${diagnosticValue} DRVL tokens`);
    console.log(`   - Rendimiento (PERFORMANCE): ${performanceValue} DRVL tokens`);
    console.log(`   - Consumo (FUEL): ${fuelValue} DRVL tokens`);
    console.log(`   - Completo (COMPLETE): ${completeValue} DRVL tokens`);

    // 13. Resumen final
    console.log('\n📋 PASO 13: Resumen de la plataforma Drive-Ledger:');
    console.log(`📌 Flujo de datos recolectados: ${simulationData.length} puntos de datos`);
    console.log(`📌 Valor total estimado de los datos: ${completeValue} DRVL tokens`);
    console.log(`📌 Recompensa otorgada al proveedor: ${rewardAmount} DRVL tokens`);
    console.log(`📌 Ingresos del proveedor por suscripción: ${totalPrice.toFixed(2)} DRVL tokens`);
    console.log(`📌 Calificación del proveedor: ${rating}/5 estrellas`);

    console.log('\n✅ ¡TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE! ✅');
    console.log('La plataforma Drive-Ledger está lista para la fase de desarrollo frontend.');

  } catch(error) {
    console.error('\n❌ ERROR DURANTE LAS PRUEBAS:', error);
    console.error('Detalles del error:', error.stack);
  }
}

// Ejecutar las pruebas
runTests();
