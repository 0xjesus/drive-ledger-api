import TokenRewardService from './token-reward.service.js';

class MarketplaceService {
  static listings = [];
  static subscriptions = [];
  static transactions = [];
  static lastListingId = 0;
  static lastSubscriptionId = 0;
  static lastTransactionId = 0;

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

  // Crear un listado para vender datos
  static createListing(userAddress, dataType, pricePerPoint, description, samplesJson) {
    if (!MarketplaceService.dataTypes[dataType]) {
      throw new Error(`Invalid data type. Available types: ${Object.keys(MarketplaceService.dataTypes).join(', ')}`);
    }

    const listingId = ++MarketplaceService.lastListingId;
    const typeInfo = MarketplaceService.dataTypes[dataType];

    let samples;
    try {
      samples = typeof samplesJson === 'string' ? JSON.parse(samplesJson) : samplesJson;

      // Verificar que las muestras contienen los campos necesarios para este tipo de datos
      if (samples && samples.length > 0) {
        const requiredFields = typeInfo.fields;
        const sampleFields = Object.keys(samples[0]);

        // Si no es tipo COMPLETE, verificar que todos los campos requeridos estén presentes
        if (dataType !== 'COMPLETE' && !requiredFields.every(field => field === 'timestamp' || sampleFields.includes(field))) {
          throw new Error(`Sample data missing required fields for type ${dataType}: ${requiredFields.join(', ')}`);
        }
      }
    } catch (error) {
      throw new Error(`Invalid sample data format: ${error.message}`);
    }

    // Limitar la cantidad de muestras para evitar datos excesivos
    const trimmedSamples = samples && samples.length > 3 ? samples.slice(0, 3) : samples;

    const listing = {
      id: listingId,
      seller: userAddress,
      dataType,
      typeName: typeInfo.name,
      typeDescription: typeInfo.description,
      privacyImpact: typeInfo.privacyImpact,
      pricePerPoint,
      description,
      samples: trimmedSamples,
      active: true,
      createdAt: new Date().toISOString(),
      purchaseCount: 0,
      rating: null,
      ratingCount: 0
    };

    MarketplaceService.listings.push(listing);
    return listing;
  }

  static updateListing(listingId, updates) {
    const listing = MarketplaceService.listings.find(l => l.id === listingId);
    if (!listing) {
      throw new Error(`Listing with ID ${listingId} not found`);
    }

    // Solo permitir actualizar ciertos campos
    const allowedUpdates = ['pricePerPoint', 'description', 'active'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        listing[key] = updates[key];
      }
    });

    listing.updatedAt = new Date().toISOString();
    return listing;
  }

  static getListings(filters = {}) {
    let filteredListings = [...MarketplaceService.listings];

    // Aplicar filtros
    if (filters.active !== undefined) {
      filteredListings = filteredListings.filter(l => l.active === filters.active);
    }

    if (filters.seller) {
      filteredListings = filteredListings.filter(l => l.seller === filters.seller);
    }

    if (filters.dataType) {
      filteredListings = filteredListings.filter(l => l.dataType === filters.dataType);
    }

    if (filters.maxPrice) {
      filteredListings = filteredListings.filter(l => l.pricePerPoint <= filters.maxPrice);
    }

    if (filters.minRating) {
      filteredListings = filteredListings.filter(
        l => l.rating !== null && l.rating >= filters.minRating
      );
    }

    // Ordenar por fecha de creación (más recientes primero)
    filteredListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return filteredListings;
  }

  static getListingById(listingId) {
    return MarketplaceService.listings.find(l => l.id === listingId) || null;
  }

  // Crear una suscripción a un listado
  static async createSubscription(buyerAddress, listingId, durationDays, pointsPerDay, payerAddress) {
    const listing = MarketplaceService.getListingById(listingId);
    if (!listing) {
      throw new Error(`Listing with ID ${listingId} not found`);
    }

    if (!listing.active) {
      throw new Error('This listing is not active');
    }

    // Calcular precio total de la suscripción
    const totalPoints = pointsPerDay * durationDays;
    const totalPrice = totalPoints * listing.pricePerPoint;

    // Crear la transacción para transferir tokens como pago
    const encodedTransaction = await TokenRewardService.transferToken(
      payerAddress,
      buyerAddress,
      listing.seller,
      TokenRewardService.tokenMintAddress,
      totalPrice
    );

    const subscriptionId = ++MarketplaceService.lastSubscriptionId;
    const transactionId = ++MarketplaceService.lastTransactionId;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Registrar la transacción
    const transaction = {
      id: transactionId,
      type: 'SUBSCRIPTION',
      buyer: buyerAddress,
      seller: listing.seller,
      listingId,
      amount: totalPrice,
      pointsCount: totalPoints,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      encodedTransaction
    };

    // Crear la suscripción
    const subscription = {
      id: subscriptionId,
      listingId,
      dataType: listing.dataType,
      buyer: buyerAddress,
      seller: listing.seller,
      pointsPerDay,
      durationDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalPrice,
      status: 'PENDING',
      transactionId,
      createdAt: new Date().toISOString()
    };

    MarketplaceService.transactions.push(transaction);
    MarketplaceService.subscriptions.push(subscription);

    return {
      subscription,
      transaction,
      encodedTransaction
    };
  }

  static confirmTransaction(transactionId, txHash) {
    const transaction = MarketplaceService.transactions.find(t => t.id === transactionId);
    if (!transaction) {
      throw new Error(`Transaction with ID ${transactionId} not found`);
    }

    // Actualizar el estado de la transacción
    transaction.status = 'COMPLETED';
    transaction.completedAt = new Date().toISOString();
    transaction.blockchainTxHash = txHash;

    // Si la transacción está relacionada con una suscripción, actualizar la suscripción
    if (transaction.type === 'SUBSCRIPTION') {
      const subscription = MarketplaceService.subscriptions.find(s => s.transactionId === transactionId);
      if (subscription) {
        subscription.status = 'ACTIVE';

        // Actualizar el contador de compras en el listado
        const listing = MarketplaceService.getListingById(subscription.listingId);
        if (listing) {
          listing.purchaseCount++;
        }
      }
    }

    return transaction;
  }

  static getUserSubscriptions(userAddress) {
    return MarketplaceService.subscriptions.filter(
      s => s.buyer === userAddress || s.seller === userAddress
    );
  }

  static getUserTransactions(userAddress) {
    return MarketplaceService.transactions.filter(
      t => t.buyer === userAddress || t.seller === userAddress
    );
  }

  static rateDataProvider(subscriptionId, rating, comment = '') {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const subscription = MarketplaceService.subscriptions.find(s => s.id === subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription with ID ${subscriptionId} not found`);
    }

    if (subscription.status !== 'COMPLETED' && subscription.status !== 'ACTIVE') {
      throw new Error('Cannot rate an inactive or pending subscription');
    }

    subscription.rating = rating;
    subscription.ratingComment = comment;
    subscription.ratedAt = new Date().toISOString();

    // Actualizar la calificación promedio en el listing
    const listing = MarketplaceService.getListingById(subscription.listingId);
    if (listing) {
      // Recalcular promedio
      listing.ratingCount++;
      if (listing.rating === null) {
        listing.rating = rating;
      } else {
        // Fórmula para actualizar el promedio
        listing.rating = ((listing.rating * (listing.ratingCount - 1)) + rating) / listing.ratingCount;
        listing.rating = parseFloat(listing.rating.toFixed(1));
      }
    }

    return {
      subscription,
      listingRating: listing ? listing.rating : null
    };
  }

  static getDataTypes() {
    return Object.entries(MarketplaceService.dataTypes).map(([key, type]) => ({
      id: key,
      name: type.name,
      description: type.description,
      privacyImpact: type.privacyImpact,
      baseValue: type.baseValue
    }));
  }

  // Estima el valor potencial de los datos de un usuario
  static estimateDataValue(dataPoints, dataType = 'COMPLETE') {
    if (!dataPoints || dataPoints.length === 0) {
      return 0;
    }

    const typeInfo = MarketplaceService.dataTypes[dataType];
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
}

export default MarketplaceService;
