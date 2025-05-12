// DataMarketplace.js
import TokenRewardManager from './token-reward-manager.service.js';
import primate from '@thewebchimp/primate';

const prisma = priamte.prisma

class DataMarketplace {
  // Tipos de datos que se pueden listar en el marketplace
  static dataTypes = {
    LOCATION: {
      name: 'Location Data',
      description: 'GPS coordinates and movement patterns',
      privacyImpact: 'High',
      baseValue: 0.05,
      fields: ['lat', 'lon', 'timestamp']
    },
    PERFORMANCE: {
      name: 'Vehicle Performance',
      description: 'Engine parameters, speed, and performance metrics',
      privacyImpact: 'Low',
      baseValue: 0.03,
      fields: ['speed_kmph', 'engine_rpm', 'timestamp']
    },
    DIAGNOSTIC: {
      name: 'Diagnostic Information',
      description: 'Engine health, error codes, and maintenance data',
      privacyImpact: 'Low',
      baseValue: 0.07,
      fields: ['engine_temp_c', 'dtc_code', 'timestamp']
    },
    FUEL: {
      name: 'Fuel Consumption',
      description: 'Fuel usage patterns and efficiency data',
      privacyImpact: 'Medium',
      baseValue: 0.04,
      fields: ['fuel_level_pct', 'speed_kmph', 'timestamp']
    },
    COMPLETE: {
      name: 'Complete Vehicle Data',
      description: 'Full vehicle dataset including all parameters',
      privacyImpact: 'Very High',
      baseValue: 0.15,
      fields: ['*']
    }
  };

  /**
   * Inicializa el marketplace
   * @param {Object} options - Opciones de inicialización
   * @returns {Object} Estado de la inicialización
   */
  static async initialize(options = {}) {
    try {
      // Inicializar el gestor de tokens si se proporciona dirección
      if (options.tokenMintAddress) {
        await TokenRewardManager.initialize(options.tokenMintAddress);
      }

      // Comprobar si ya hay rutas en la base de datos, si no, crearlas
      const routesCount = await prisma.simulationRoute.count();

      if (routesCount === 0) {
        // Crear rutas predefinidas
        const routesData = [
          {
            routeType: 'URBAN',
            name: 'Urban City Drive',
            description: 'Dense city traffic with stops and moderate speeds',
            averageSpeed: 35,
            maxSpeed: 60,
            trafficDensity: 'high',
            distance: 12.5,
            estimatedTime: 25,
            fuelConsumption: 'moderate',
            elevationChange: 'low'
          },
          {
            routeType: 'HIGHWAY',
            name: 'Highway Cruise',
            description: 'Fast highway driving with consistent speeds',
            averageSpeed: 85,
            maxSpeed: 110,
            trafficDensity: 'low',
            distance: 45.0,
            estimatedTime: 35,
            fuelConsumption: 'efficient',
            elevationChange: 'moderate'
          },
          {
            routeType: 'MOUNTAIN',
            name: 'Mountain Pass',
            description: 'Winding roads with elevation changes and variable speeds',
            averageSpeed: 45,
            maxSpeed: 70,
            trafficDensity: 'very low',
            distance: 28.0,
            estimatedTime: 40,
            fuelConsumption: 'high',
            elevationChange: 'high'
          },
          {
            routeType: 'RURAL',
            name: 'Country Roads',
            description: 'Relaxed driving through farmland and villages',
            averageSpeed: 55,
            maxSpeed: 80,
            trafficDensity: 'very low',
            distance: 32.0,
            estimatedTime: 35,
            fuelConsumption: 'moderate',
            elevationChange: 'moderate'
          }
        ];

        // Crear todas las rutas
        await prisma.simulationRoute.createMany({
          data: routesData
        });
      }

      // Comprobar si ya hay códigos de diagnóstico, si no, crearlos
      const diagCount = await prisma.diagnosticCode.count();

      if (diagCount === 0) {
        // Crear códigos de diagnóstico predefinidos
        const diagCodes = [
          {
            code: 'P0420',
            description: 'Catalyst System Efficiency Below Threshold',
            severity: 'Medium',
            impact: 'May affect emissions and fuel efficiency',
            rewardImpact: -15
          },
          {
            code: 'P0171',
            description: 'System Too Lean (Bank 1)',
            severity: 'Medium',
            impact: 'May cause rough idling and reduced fuel efficiency',
            rewardImpact: -10
          },
          {
            code: 'P0300',
            description: 'Random/Multiple Cylinder Misfire Detected',
            severity: 'High',
            impact: 'Can damage catalytic converter if ignored',
            rewardImpact: -25
          }
        ];

        await prisma.diagnosticCode.createMany({
          data: diagCodes
        });
      }

      // Contar entidades principales
      const usersCount = await prisma.user.count();
      const listingsCount = await prisma.listing.count();
      const subscriptionsCount = await prisma.subscription.count();
      const transactionsCount = await prisma.transaction.count();

      return {
        success: true,
        usersCount,
        listingsCount,
        subscriptionsCount,
        transactionsCount,
        message: 'Data Marketplace initialized successfully'
      };
    } catch (error) {
      console.error('Error initializing Data Marketplace:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Crea un nuevo listado de datos
   * @param {string} sellerWalletAddress - Dirección de wallet del vendedor
   * @param {string} dataType - Tipo de datos
   * @param {number} pricePerPoint - Precio por punto de datos
   * @param {string} description - Descripción del listado
   * @param {Array} samples - Muestras de datos
   * @returns {Object} Listado creado
   */
  static async createListing(sellerWalletAddress, dataType, pricePerPoint, description, samples) {
    try {
      if (!DataMarketplace.dataTypes[dataType]) {
        throw new Error(`Invalid data type. Available types: ${Object.keys(DataMarketplace.dataTypes).join(', ')}`);
      }

      // Buscar o crear usuario vendedor
      const seller = await prisma.user.upsert({
        where: { walletAddress: sellerWalletAddress },
        update: {},
        create: { walletAddress: sellerWalletAddress }
      });

      const typeInfo = DataMarketplace.dataTypes[dataType];

      let processedSamples;
      try {
        processedSamples = typeof samples === 'string' ? JSON.parse(samples) : samples;

        // Verificar que las muestras contienen los campos necesarios para este tipo de datos
        if (processedSamples && processedSamples.length > 0) {
          const requiredFields = typeInfo.fields;
          const sampleFields = Object.keys(processedSamples[0]);

          // Si no es tipo COMPLETE, verificar que todos los campos requeridos estén presentes
          if (dataType !== 'COMPLETE' && !requiredFields.every(field => field === 'timestamp' || sampleFields.includes(field))) {
            throw new Error(`Sample data missing required fields for type ${dataType}: ${requiredFields.join(', ')}`);
          }
        }
      } catch (error) {
        throw new Error(`Invalid sample data format: ${error.message}`);
      }

      // Limitar la cantidad de muestras para evitar datos excesivos
      const trimmedSamples = processedSamples && processedSamples.length > 3 ?
        processedSamples.slice(0, 3) : processedSamples;

      // Crear listado en la base de datos
      const listing = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          dataType,
          typeName: typeInfo.name,
          typeDescription: typeInfo.description,
          privacyImpact: typeInfo.privacyImpact,
          pricePerPoint,
          description,
          samples: trimmedSamples,
          active: true
        }
      });

      return listing;
    } catch (error) {
      console.error('Error creating listing:', error);
      throw error;
    }
  }

  /**
   * Actualiza un listado existente
   * @param {string} listingId - ID del listado
   * @param {Object} updates - Actualizaciones a aplicar
   * @returns {Object} Listado actualizado
   */
  static async updateListing(listingId, updates) {
    try {
      // Solo permitir actualizar ciertos campos
      const allowedUpdates = {
        pricePerPoint: updates.pricePerPoint,
        description: updates.description,
        active: updates.active
      };

      // Eliminar campos indefinidos
      Object.keys(allowedUpdates).forEach(key => {
        if (allowedUpdates[key] === undefined) {
          delete allowedUpdates[key];
        }
      });

      const listing = await prisma.listing.update({
        where: { id: listingId },
        data: allowedUpdates
      });

      return listing;
    } catch (error) {
      console.error('Error updating listing:', error);
      throw error;
    }
  }

  /**
   * Obtiene listados según filtros
   * @param {Object} filters - Filtros a aplicar
   * @returns {Array} Listados filtrados
   */
  static async getListings(filters = {}) {
    try {
      // Convertir filtros para Prisma
      const prismaFilters = {};

      // Filtro por vendedor (wallet address)
      if (filters.seller) {
        const seller = await prisma.user.findUnique({
          where: { walletAddress: filters.seller }
        });

        if (seller) {
          prismaFilters.sellerId = seller.id;
        } else {
          // Si el vendedor no existe, devolver array vacío
          return [];
        }
      }

      // Otros filtros
      if (filters.dataType) prismaFilters.dataType = filters.dataType;
      if (filters.active !== undefined) prismaFilters.active = filters.active;
      if (filters.minRating) prismaFilters.avgRating = { gte: filters.minRating };
      if (filters.maxPrice) prismaFilters.pricePerPoint = { lte: filters.maxPrice };

      // Obtener listados con filtros
      const listings = await prisma.listing.findMany({
        where: prismaFilters,
        include: {
          seller: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transformar para incluir wallet address del vendedor
      return listings.map(listing => ({
        ...listing,
        seller: listing.seller.walletAddress,
        sellerId: undefined // Ocultar ID interno
      }));
    } catch (error) {
      console.error('Error getting listings:', error);
      throw error;
    }
  }

  /**
   * Obtiene un listado por ID
   * @param {string} listingId - ID del listado
   * @returns {Object} Listado encontrado o null
   */
  static async getListingById(listingId) {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          seller: true,
          subscriptions: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!listing) return null;

      // Transformar para incluir wallet address del vendedor
      return {
        ...listing,
        seller: listing.seller.walletAddress,
        sellerId: undefined, // Ocultar ID interno
        subscriptionCount: listing.subscriptions.length,
        recentSubscriptions: listing.subscriptions.map(sub => ({
          id: sub.id,
          createdAt: sub.createdAt,
          status: sub.status
        }))
      };
    } catch (error) {
      console.error('Error getting listing by ID:', error);
      throw error;
    }
  }

  /**
   * Obtiene los tipos de datos disponibles
   * @returns {Array} Tipos de datos
   */
  static getDataTypes() {
    return Object.entries(DataMarketplace.dataTypes).map(([key, type]) => ({
      id: key,
      name: type.name,
      description: type.description,
      privacyImpact: type.privacyImpact,
      baseValue: type.baseValue
    }));
  }

  /**
   * Crea una suscripción a un listado
   * @param {string} buyerWalletAddress - Dirección del comprador
   * @param {string} listingId - ID del listado
   * @param {number} durationDays - Duración en días
   * @param {number} pointsPerDay - Puntos por día
   * @returns {Object} Información de la suscripción y transacción
   */
  static async createSubscription(buyerWalletAddress, listingId, durationDays, pointsPerDay) {
    try {
      // Buscar listado
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: { seller: true }
      });

      if (!listing) {
        throw new Error(`Listing with ID ${listingId} not found`);
      }

      if (!listing.active) {
        throw new Error('This listing is not active');
      }

      // Buscar o crear usuario comprador
      const buyer = await prisma.user.upsert({
        where: { walletAddress: buyerWalletAddress },
        update: {},
        create: { walletAddress: buyerWalletAddress }
      });

      // Calcular precio total de la suscripción
      const totalPoints = pointsPerDay * durationDays;
      const totalPrice = totalPoints * listing.pricePerPoint;

      // Calcular fechas
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);

      // Crear transacción en la base de datos
      const transaction = await prisma.transaction.create({
        data: {
          type: 'SUBSCRIPTION',
          senderId: buyer.id, // Comprador
          receiverId: listing.sellerId, // Vendedor
          listingId: listing.id,
          amount: totalPrice,
          pointsCount: totalPoints,
          status: 'PENDING'
        }
      });

      // Crear suscripción
      const subscription = await prisma.subscription.create({
        data: {
          buyerId: buyer.id,
          sellerId: listing.sellerId,
          listingId: listing.id,
          transactionId: transaction.id,
          pointsPerDay,
          durationDays,
          startDate,
          endDate,
          totalPrice,
          status: 'PENDING'
        }
      });

      // Generar transacción para la blockchain
      const encodedTransaction = await TokenRewardManager.generateTransferTransaction(
        buyerWalletAddress,
        listing.seller.walletAddress,
        totalPrice
      );

      // Actualizar la transacción con la transacción codificada
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          encodedTransaction: encodedTransaction.encodedTransaction
        }
      });

      return {
        subscription,
        transaction: {
          ...transaction,
          encodedTransaction: encodedTransaction.encodedTransaction
        }
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Confirma una transacción
   * @param {string} transactionId - ID de la transacción
   * @param {string} txHash - Hash de la transacción blockchain
   * @returns {Object} Transacción actualizada
   */
  static async confirmTransaction(transactionId, txHash) {
    try {
      // Actualizar transacción en la base de datos
      const confirmedTx = await TokenRewardManager.confirmTransaction(transactionId, txHash);

      if (!confirmedTx.success) {
        throw new Error(confirmedTx.error || 'Failed to confirm transaction');
      }

      // Actualizar suscripción si esta transacción corresponde a una
      const subscription = await prisma.subscription.findFirst({
        where: { transactionId }
      });

      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE' }
        });

        // Actualizar contador de compras en el listado
        await prisma.listing.update({
          where: { id: subscription.listingId },
          data: {
            purchaseCount: {
              increment: 1
            }
          }
        });
      }

      return confirmedTx;
    } catch (error) {
      console.error('Error confirming transaction:', error);
      throw error;
    }
  }

  /**
   * Califica a un proveedor de datos
   * @param {string} subscriptionId - ID de la suscripción
   * @param {number} rating - Calificación (1-5)
   * @param {string} comment - Comentario (opcional)
   * @returns {Object} Información de la calificación
   */
  static async rateDataProvider(subscriptionId, rating, comment = '') {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      // Buscar suscripción
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          buyer: true,
          seller: true
        }
      });

      if (!subscription) {
        throw new Error(`Subscription with ID ${subscriptionId} not found`);
      }

      if (subscription.status !== 'COMPLETED' && subscription.status !== 'ACTIVE') {
        throw new Error('Cannot rate an inactive or pending subscription');
      }

      // Crear calificación
      const ratingObj = await prisma.rating.create({
        data: {
          value: rating,
          comment,
          subscriptionId: subscription.id,
          giverId: subscription.buyerId,
          receiverId: subscription.sellerId
        }
      });

      // Actualizar calificación promedio en el listado
      const allRatings = await prisma.rating.findMany({
        where: {
          subscription: {
            listingId: subscription.listingId
          }
        }
      });

      // Calcular promedio
      const avgRating = allRatings.reduce((sum, r) => sum + r.value, 0) / allRatings.length;

      // Actualizar listado
      const updatedListing = await prisma.listing.update({
        where: { id: subscription.listingId },
        data: {
          avgRating,
          ratingCount: allRatings.length
        }
      });

      return {
        rating: ratingObj,
        subscription,
        listingRating: updatedListing.avgRating
      };
    } catch (error) {
      console.error('Error rating provider:', error);
      throw error;
    }
  }

  /**
   * Obtiene las suscripciones de un usuario
   * @param {string} walletAddress - Dirección del usuario
   * @returns {Array} Suscripciones del usuario
   */
  static async getUserSubscriptions(walletAddress) {
    try {
      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { walletAddress }
      });

      if (!user) return [];

      // Buscar suscripciones como comprador y como vendedor
      const subscriptions = await prisma.subscription.findMany({
        where: {
          OR: [
            { buyerId: user.id },
            { sellerId: user.id }
          ]
        },
        include: {
          buyer: true,
          seller: true,
          listing: true,
          transaction: true,
          ratings: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transformar para incluir wallet addresses
      return subscriptions.map(sub => ({
        ...sub,
        buyer: sub.buyer.walletAddress,
        seller: sub.seller.walletAddress,
        buyerId: undefined,
        sellerId: undefined,
        isSubscriber: sub.buyer.walletAddress === walletAddress,
        isProvider: sub.seller.walletAddress === walletAddress
      }));
    } catch (error) {
      console.error('Error getting user subscriptions:', error);
      throw error;
    }
  }

  /**
   * Obtiene las transacciones de un usuario
   * @param {string} walletAddress - Dirección del usuario
   * @returns {Array} Transacciones del usuario
   */
  static async getUserTransactions(walletAddress) {
    try {
      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { walletAddress }
      });

      if (!user) return [];

      // Buscar transacciones como emisor y como receptor
      const transactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { senderId: user.id },
            { receiverId: user.id }
          ]
        },
        include: {
          sender: true,
          receiver: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transformar para incluir wallet addresses
      return transactions.map(tx => ({
        ...tx,
        sender: tx.sender.walletAddress,
        receiver: tx.receiver.walletAddress,
        senderId: undefined,
        receiverId: undefined,
        isSender: tx.sender.walletAddress === walletAddress,
        isReceiver: tx.receiver.walletAddress === walletAddress
      }));
    } catch (error) {
      console.error('Error getting user transactions:', error);
      throw error;
    }
  }

  /**
   * Estima el valor potencial de los datos
   * @param {Array} dataPoints - Puntos de datos
   * @param {string} dataType - Tipo de datos
   * @returns {number} Valor estimado
   */
  static estimateDataValue(dataPoints, dataType = 'COMPLETE') {
    if (!dataPoints || dataPoints.length === 0) {
      return 0;
    }

    const typeInfo = DataMarketplace.dataTypes[dataType];
    if (!typeInfo) {
      throw new Error(`Invalid data type: ${dataType}`);
    }

    let value = dataPoints.length * typeInfo.baseValue;

    // Aplicar factores adicionales según el tipo de datos
    switch (dataType) {
      case 'LOCATION':
        // Datos de ubicación más valiosos en áreas urbanas (lat/lon con más dígitos)
        const hasUrbanData = dataPoints.some(point => {
          const lat = String(point.lat);
          const lon = String(point.lon);
          return lat.includes('.') && lon.includes('.') &&
                 lat.split('.')[1].length > 5 && lon.split('.')[1].length > 5;
        });
        if (hasUrbanData) value *= 1.3;
        break;

      case 'DIAGNOSTIC':
        // Datos de diagnóstico más valiosos si contienen códigos de error
        const hasDiagnosticCodes = dataPoints.some(point =>
          point.dtc_code && point.dtc_code.trim() !== ''
        );
        if (hasDiagnosticCodes) value *= 1.5;
        break;

      case 'PERFORMANCE':
        // Datos de rendimiento más valiosos si muestran variación
        const speeds = dataPoints.map(point => point.speed_kmph);
        const speedVariation = Math.max(...speeds) - Math.min(...speeds);
        if (speedVariation > 30) value *= 1.2;
        break;

      case 'COMPLETE':
        // Datos completos más valiosos con mayor frecuencia de muestreo
        if (dataPoints.length > 100) value *= 1.1;
        break;
    }

    return parseFloat(value.toFixed(4));
  }

  /**
   * Obtiene estadísticas del mercado
   * @returns {Object} Estadísticas generales
   */
  static async getMarketStatistics() {
    try {
      // Contar entidades principales
      const totalUsers = await prisma.user.count();
      const totalListings = await prisma.listing.count();
      const activeListings = await prisma.listing.count({ where: { active: true } });
      const totalSubscriptions = await prisma.subscription.count();
      const totalTransactions = await prisma.transaction.count();
      const completedTransactions = await prisma.transaction.count({ where: { status: 'COMPLETED' } });

      // Calcular valor total transaccionado
      const transactionsResult = await prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true }
      });
      const totalValue = transactionsResult._sum.amount || 0;

      // Calcular calificación promedio
      const ratingsResult = await prisma.rating.aggregate({
        _avg: { value: true },
        _count: true
      });
      const avgRating = ratingsResult._avg.value || null;
      const totalRatings = ratingsResult._count || 0;

      // Distribución por tipos de datos
      const typeDistribution = await prisma.listing.groupBy({
        by: ['dataType'],
        _count: true
      });

      // Formatear distribución
      const formattedTypeDistribution = {};
      typeDistribution.forEach(item => {
        formattedTypeDistribution[item.dataType] = item._count;
      });

      return {
        totalUsers,
        totalListings,
        activeListings,
        totalSubscriptions,
        totalTransactions,
        completedTransactions,
        totalValueTraded: parseFloat(totalValue.toFixed(4)),
        averageRating: avgRating !== null ? parseFloat(avgRating.toFixed(2)) : null,
        totalRatings,
        typeDistribution: formattedTypeDistribution,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting market statistics:', error);
      throw error;
    }
  }
}

export default DataMarketplace;
