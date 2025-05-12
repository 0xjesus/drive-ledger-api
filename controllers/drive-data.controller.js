import fs from 'fs';
import path from 'path';
import DataMarketplace from '../services/data-driver-simulator.service.js';
import TokenRewardManager from '../services/token-reward-manager.service.js';
import DriveDataSimulator from '../services/car-data.service.js';

import { PrismaClient } from '@prisma/client';

const prisma = new  PrismaClient();

class DriveDataController {
  /**
   * Inicializar servicios
   * POST /api/initialize
   */
  static async initializeServices(req, res) {
    console.log('📋 initializeServices - Request body:', req.body);
    try {
      const { tokenMintAddress } = req.body;
      console.log(`📝 tokenMintAddress: ${tokenMintAddress}`);

      // Inicializar el marketplace
      console.log('🚀 Inicializando DataMarketplace');
      const marketplaceResult = await DataMarketplace.initialize({ tokenMintAddress });
      console.log('✅ DataMarketplace inicializado:', marketplaceResult);

      // Inicializar el gestor de tokens
      console.log('🚀 Inicializando TokenRewardManager');
      const tokenResult = await TokenRewardManager.initialize(tokenMintAddress);
      console.log('✅ TokenRewardManager inicializado:', tokenResult);

      // Cargar datos de simulación
      console.log('🚀 Cargando datos sintéticos');
      await DriveDataSimulator.loadSyntheticData();
      console.log(`✅ Datos sintéticos cargados: ${DriveDataSimulator.syntheticData?.length || 0} puntos`);

      const response = {
        success: true,
        data: {
          marketplace: marketplaceResult,
          tokenManager: tokenResult,
          simulator: {
            dataPointsLoaded: DriveDataSimulator.syntheticData.length
          }
        },
        message: 'All services initialized successfully'
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error initializing services:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to initialize services: ${error.message}`
      });
    }
  }

  /**
   * Obtener rutas disponibles para simulación
   * GET /api/routes
   */
  static async getAvailableRoutes(req, res) {
    console.log('📋 getAvailableRoutes - Request params:', req.params);
    console.log('📋 getAvailableRoutes - Request query:', req.query);
    try {
      // Obtener rutas desde la base de datos
      console.log('🔍 Buscando rutas en la base de datos');
      const routes = await prisma.simulationRoute.findMany();
      console.log(`✅ Encontradas ${routes.length} rutas`);

      const response = {
        success: true,
        data: routes.map(route => ({
          id: route.routeType,
          name: route.name,
          description: route.description,
          distance: route.distance,
          estimatedTime: route.estimatedTime,
          averageSpeed: route.averageSpeed,
          maxSpeed: route.maxSpeed,
          trafficDensity: route.trafficDensity,
          fuelConsumption: route.fuelConsumption,
          elevationChange: route.elevationChange
        })),
        message: `Found ${routes.length} available routes`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting routes:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get routes: ${error.message}`
      });
    }
  }

  /**
   * Iniciar simulación de conducción
   * POST /api/simulations
   */
  static async startSimulation(req, res) {
    try {
      console.log('📋 startSimulation - Request body:', req.body);
      const { routeType, durationMinutes, walletAddress } = req.body;

      console.log(`📝 Parameters: routeType=${routeType}, durationMinutes=${durationMinutes}, walletAddress=${walletAddress}`);

      if (!routeType || !durationMinutes) {
        console.log('⛔ Missing required parameters');
        return res.respond({
          success: false,
          status: 400,
          message: 'Route type and duration are required'
        });
      }

      // Buscar o crear usuario si se proporciona dirección de wallet
      let userId = null;
      if (walletAddress) {
        console.log(`🔍 Looking up user for wallet: ${walletAddress}`);
        const user = await prisma.user.upsert({
          where: { walletAddress },
          update: {},
          create: { walletAddress }
        });
        userId = user.id;
        console.log(`👤 User resolved with ID: ${userId}`);
      }

      // Verificar si ya hay una simulación en ejecución
      console.log(`🔄 Checking simulation status. Current isStreaming value: ${DriveDataSimulator.isStreaming}`);
      if (DriveDataSimulator.isStreaming) {
        console.log('⚠️ A simulation is already running');
        return res.respond({
          success: false,
          status: 400,
          message: 'A simulation is already running'
        });
      }

      // Verificar si hay datos cargados
      console.log(`📊 Checking synthetic data. Data length: ${DriveDataSimulator.syntheticData?.length || 'undefined'}`);
      if (!DriveDataSimulator.syntheticData || DriveDataSimulator.syntheticData.length === 0) {
        console.log('⚠️ No synthetic data available');
        try {
          console.log('🔄 Attempting to load synthetic data');
          await DriveDataSimulator.loadSyntheticData();
          console.log(`✅ Synthetic data loaded. Count: ${DriveDataSimulator.syntheticData.length}`);
        } catch (loadError) {
          console.error('❌ Failed to load synthetic data:', loadError);
          console.error('❌ Stack trace:', loadError.stack);
          return res.respond({
            success: false,
            status: 500,
            message: `Failed to load simulation data: ${loadError.message}`
          });
        }
      }

      // Iniciar simulación
      console.log(`🚀 Starting simulation with routeType=${routeType}, durationMinutes=${durationMinutes}`);
      let dataStream;
      try {
        // Guardamos el valor actual para comparar
        const wasStreaming = DriveDataSimulator.isStreaming;
        console.log(`👉 Before startSimulation call: isStreaming=${wasStreaming}`);

        // Verifiquemos que DriveDataSimulator y su método startSimulation existen
        console.log(`🔍 DriveDataSimulator exists: ${!!DriveDataSimulator}`);
        console.log(`🔍 startSimulation method exists: ${!!DriveDataSimulator.startSimulation}`);
        console.log(`🔍 Type of startSimulation: ${typeof DriveDataSimulator.startSimulation}`);

        // Llamamos al método con los parámetros
        dataStream = DriveDataSimulator.startSimulation(
          routeType,
          Number(durationMinutes)
        );

        // Verifiquemos el resultado
        console.log(`👉 After startSimulation call: dataStream=${!!dataStream}, type=${typeof dataStream}`);
        console.log(`👉 After startSimulation call: isStreaming=${DriveDataSimulator.isStreaming}`);

        if (!dataStream) {
          console.log('⚠️ No data stream returned from startSimulation');
          return res.respond({
            success: false,
            status: 400,
            message: 'Failed to start simulation: No data stream returned'
          });
        }

        // Si isStreaming no cambió, hay un problema en el método startSimulation
        if (wasStreaming === DriveDataSimulator.isStreaming && !DriveDataSimulator.isStreaming) {
          console.log('⚠️ startSimulation did not set isStreaming flag to true');
        }

      } catch (simError) {
        console.error('❌ Error in startSimulation call:', simError);
        console.error('❌ Stack trace:', simError.stack);
        return res.respond({
          success: false,
          status: 400,
          message: `Failed to start simulation: ${simError.message}`
        });
      }

      // Buscar la ruta para incluir detalles en la respuesta
      console.log(`🔍 Looking up route details for: ${routeType}`);
      const simulationRoute = await prisma.simulationRoute.findUnique({
        where: { routeType }
      });

      // Log del resultado de la búsqueda de ruta
      console.log(`👉 Route lookup result: ${!!simulationRoute ? 'Found' : 'Not found'}`);
      if (simulationRoute) {
        console.log(`👉 Route details: ${JSON.stringify(simulationRoute)}`);
      }

      // Si no se encuentra la ruta, mostrar un error más descriptivo
      if (!simulationRoute) {
        console.log(`⚠️ Route type "${routeType}" not found, stopping simulation`);
        try {
          DriveDataSimulator.stopSimulation(); // Detener la simulación iniciada
          console.log('✅ Simulation stopped successfully');
        } catch (stopError) {
          console.error('❌ Error stopping simulation:', stopError);
          console.error('❌ Stack trace:', stopError.stack);
        }

        return res.respond({
          success: false,
          status: 400,
          message: `Route type "${routeType}" not found`
        });
      }

      // Registrar simulación en la base de datos
      console.log('💾 Creating simulation record in database');
      const simulation = await prisma.simulation.create({
        data: {
          routeType,
          userId: userId,
          status: 'RUNNING',
          dataPointsCount: 0
        }
      });
      console.log(`✅ Simulation record created with ID: ${simulation.id}`);

      // Enriquecer la respuesta con datos adicionales
      console.log('🏁 Simulation started successfully, building response');
      const response = {
        success: true,
        data: {
          simulationId: simulation.id,
          route: simulationRoute.name,
          routeType: routeType,
          duration: Number(durationMinutes),
          routeDetails: simulationRoute,
          userId: userId,
          walletAddress: walletAddress || 'anonymous',
          startedAt: simulation.createdAt.toISOString(),
          estimatedCompletionTime: new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString()
        },
        message: 'Simulation started successfully'
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ CRITICAL ERROR in startSimulation:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to start simulation: ${error.message}`
      });
    }
  }

  /**
   * Obtener estado actual de simulación
   * GET /api/simulations/status
   */
  static async getSimulationStatus(req, res) {
    console.log('📋 getSimulationStatus - Request params:', req.params);
    console.log('📋 getSimulationStatus - Request query:', req.query);
    try {
      console.log('🔍 Getting simulation status');
      const status = DriveDataSimulator.getSimulationStatus();
      console.log('👉 Current status:', status);

      // Si hay una simulación activa, buscar su registro en la base de datos
      let dbSimulation = null;
      if (status.isActive) {
        console.log('🔍 Searching for active simulation in database');
        // Buscar simulación más reciente con estado RUNNING
        dbSimulation = await prisma.simulation.findFirst({
          where: { status: 'RUNNING' },
          orderBy: { createdAt: 'desc' }
        });
        console.log('👉 Database simulation:', dbSimulation);
      }

      const response = {
        success: true,
        data: {
          ...status,
          simulationId: dbSimulation?.id
        },
        message: status.isActive ? 'Simulation is running' : 'No simulation is running'
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting simulation status:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get simulation status: ${error.message}`
      });
    }
  }

  /**
   * Detener simulación actual
   * POST /api/simulations/stop
   */
  static async stopSimulation(req, res) {
    console.log('📋 stopSimulation - Request body:', req.body);
    try {
      console.log('🛑 Stopping simulation');
      const result = DriveDataSimulator.stopSimulation();
      console.log('👉 Stop result:', result);

      if (!result.success) {
        console.log('⚠️ Failed to stop simulation:', result.message);
        return res.respond({
          success: false,
          status: 400,
          message: result.message
        });
      }

      // Actualizar registro de simulación en la base de datos
      console.log('🔍 Looking for active simulation in database');
      const simulation = await prisma.simulation.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { createdAt: 'desc' }
      });
      console.log('👉 Found simulation:', simulation);

      if (simulation) {
        console.log(`💾 Updating simulation ${simulation.id} in database`);
        await prisma.simulation.update({
          where: { id: simulation.id },
          data: {
            status: 'COMPLETED',
            endedAt: new Date(),
            durationMinutes: result.summary.durationMinutes,
            distanceKm: result.summary.distanceKm,
            avgSpeedKmph: result.summary.averageSpeedKmph,
            maxSpeedKmph: result.summary.maxSpeedKmph,
            efficiencyScore: result.summary.efficiencyScore,
            dataPointsCount: result.summary.dataPointsCollected,
            rawData: DriveDataSimulator.simulationData.slice(0, 20), // Guardar solo algunos puntos de muestra
            diagnosticIssues: result.summary.diagnosticIssues
          }
        });
        console.log('✅ Simulation updated successfully');
      }

      const response = {
        success: true,
        data: {
          ...result,
          simulationId: simulation?.id
        },
        message: 'Simulation stopped successfully'
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error stopping simulation:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to stop simulation: ${error.message}`
      });
    }
  }

  /**
   * Generar recompensa por datos recolectados
   * POST /api/rewards
   */
  static async generateReward(req, res) {
    console.log('📋 generateReward - Request body:', req.body);
    try {
      const { walletAddress, simulationId } = req.body;
      console.log(`📝 Parameters: walletAddress=${walletAddress}, simulationId=${simulationId}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Verificar si la simulación existe
      let simulation = null;
      if (simulationId) {
        console.log(`🔍 Looking up simulation with ID: ${simulationId}`);
        simulation = await prisma.simulation.findUnique({
          where: { id: simulationId }
        });
        console.log('👉 Simulation found:', simulation);

        if (!simulation) {
          console.log(`⚠️ Simulation with ID ${simulationId} not found`);
          return res.respond({
            success: false,
            status: 404,
            message: `Simulation with ID ${simulationId} not found`
          });
        }
      }

      // Obtener datos de simulación
      console.log('🔍 Checking simulation data');
      const simulationData = DriveDataSimulator.simulationData;
      console.log(`👉 Simulation data length: ${simulationData?.length || 0}`);

      if (!simulationData || simulationData.length === 0) {
        console.log('⚠️ No simulation data available for reward');
        return res.respond({
          success: false,
          status: 400,
          message: 'No simulation data available for reward'
        });
      }

      // Calcular recompensa
      console.log('💰 Calculating reward amount');
      const rewardAmount = DriveDataSimulator.getDataBatchRewardValue(simulationData);
      console.log(`👉 Calculated reward amount: ${rewardAmount}`);

      // Generar transacción de recompensa
      console.log(`💰 Processing reward of ${rewardAmount} tokens for ${walletAddress}`);
      const rewardResult = await TokenRewardManager.mintRewardTokens(
        walletAddress,
        rewardAmount,
        simulationId
      );
      console.log('👉 Reward result:', rewardResult);

      const response = {
        success: rewardResult.success,
        data: rewardResult,
        message: rewardResult.success
          ? `Reward of ${rewardAmount} DRVL tokens processed for ${walletAddress}`
          : `Reward requires frontend signing: ${rewardAmount} DRVL tokens for ${walletAddress}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error generating reward:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to generate reward: ${error.message}`
      });
    }
  }

  /**
   * Ejecutar airdrop de tokens (solo devnet)
   * POST /api/airdrops
   */
  static async executeAirdrop(req, res) {
    console.log('📋 executeAirdrop - Request body:', req.body);
    try {
      const { walletAddress, amount } = req.body;
      console.log(`📝 Parameters: walletAddress=${walletAddress}, amount=${amount}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Ejecutar airdrop
      console.log(`💸 Executing airdrop of ${amount || 100} tokens to ${walletAddress}`);
      const airdropResult = await TokenRewardManager.airdropTokens(
        walletAddress,
        amount || 100
      );
      console.log('👉 Airdrop result:', airdropResult);

      const response = {
        success: airdropResult.success,
        data: airdropResult,
        message: airdropResult.success
          ? `Airdrop of ${amount || 100} DRVL tokens completed for ${walletAddress}`
          : `Airdrop failed: ${airdropResult.error}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error executing airdrop:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to execute airdrop: ${error.message}`
      });
    }
  }

  /**
   * Obtener balance de tokens
   * GET /api/balances/:walletAddress
   */
  static async getTokenBalance(req, res) {
    console.log('📋 getTokenBalance - Request params:', req.params);
    try {
      const { walletAddress } = req.params;
      console.log(`📝 Parameters: walletAddress=${walletAddress}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      console.log(`💼 Getting token balance for ${walletAddress}`);
      const balanceResult = await TokenRewardManager.getTokenBalance(walletAddress);
      console.log('👉 Balance result:', balanceResult);

      const response = {
        success: balanceResult.success,
        data: balanceResult,
        message: `Balance for ${walletAddress}: ${balanceResult.balance} ${balanceResult.tokenSymbol}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting token balance:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get token balance: ${error.message}`
      });
    }
  }

  /**
   * Obtener tipos de datos disponibles en el marketplace
   * GET /api/marketplace/datatypes
   */
  static async getDataTypes(req, res) {
    console.log('📋 getDataTypes - Request params:', req.params);
    console.log('📋 getDataTypes - Request query:', req.query);
    try {
      console.log('🔍 Getting available data types');
      const dataTypes = DataMarketplace.getDataTypes();
      console.log(`👉 Found ${dataTypes.length} data types:`, dataTypes);

      const response = {
        success: true,
        data: dataTypes,
        message: `Found ${dataTypes.length} data types`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting data types:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get data types: ${error.message}`
      });
    }
  }

  /**
   * Crear nuevo listado en el marketplace
   * POST /api/marketplace/listings
   */
  static async createListing(req, res) {
    console.log('📋 createListing - Request body:', req.body);
    try {
      const { walletAddress, dataType, pricePerPoint, description, samples } = req.body;
      console.log(`📝 Parameters: walletAddress=${walletAddress}, dataType=${dataType}, pricePerPoint=${pricePerPoint}`);

      if (!walletAddress || !dataType || !pricePerPoint) {
        console.log('⛔ Missing required parameters');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address, data type, and price are required'
        });
      }

      console.log('🚀 Creating new marketplace listing');
      const listing = await DataMarketplace.createListing(
        walletAddress,
        dataType,
        Number(pricePerPoint),
        description || `${dataType} vehicle data`,
        samples || []
      );
      console.log('👉 Created listing:', listing);

      const response = {
        success: true,
        data: listing,
        message: `Listing created with ID: ${listing.id}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error creating listing:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to create listing: ${error.message}`
      });
    }
  }

  /**
   * Obtener listados del marketplace con filtros
   * GET /api/marketplace/listings
   */
  static async getListings(req, res) {
    console.log('📋 getListings - Request query:', req.query);
    try {
      const filters = {
        seller: req.query.seller,
        dataType: req.query.dataType,
        active: req.query.active === 'true',
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined
      };
      console.log('📝 Filters before cleanup:', filters);

      // Eliminar filtros indefinidos
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });
      console.log('📝 Filters after cleanup:', filters);

      console.log('🔍 Getting listings with filters');
      const listings = await DataMarketplace.getListings(filters);
      console.log(`👉 Found ${listings.length} listings`);

      const response = {
        success: true,
        data: listings,
        filters: Object.keys(filters).length > 0 ? filters : 'none',
        message: `Found ${listings.length} listings${Object.keys(filters).length > 0 ? ' with applied filters' : ''}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting listings:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get listings: ${error.message}`
      });
    }
  }

  /**
   * Obtener detalle de un listado
   * GET /api/marketplace/listings/:listingId
   */
  static async getListingDetail(req, res) {
    console.log('📋 getListingDetail - Request params:', req.params);
    try {
      const { listingId } = req.params;
      console.log(`📝 Parameters: listingId=${listingId}`);

      if (!listingId) {
        console.log('⛔ Missing required parameter: listingId');
        return res.respond({
          success: false,
          status: 400,
          message: 'Listing ID is required'
        });
      }

      console.log(`🔍 Getting details for listing ${listingId}`);
      const listing = await DataMarketplace.getListingById(listingId);
      console.log('👉 Listing found:', listing);

      if (!listing) {
        console.log(`⚠️ Listing with ID ${listingId} not found`);
        return res.respond({
          success: false,
          status: 404,
          message: `Listing with ID ${listingId} not found`
        });
      }

      const response = {
        success: true,
        data: listing,
        message: `Listing details for ID: ${listingId}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting listing detail:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get listing detail: ${error.message}`
      });
    }
  }

  /**
   * Actualizar un listado
   * PUT /api/marketplace/listings/:listingId
   */
  static async updateListing(req, res) {
    console.log('📋 updateListing - Request params:', req.params);
    console.log('📋 updateListing - Request body:', req.body);
    try {
      const { listingId } = req.params;
      const updates = req.body;
      console.log(`📝 Parameters: listingId=${listingId}, updates=`, updates);

      if (!listingId) {
        console.log('⛔ Missing required parameter: listingId');
        return res.respond({
          success: false,
          status: 400,
          message: 'Listing ID is required'
        });
      }

      console.log(`🔄 Updating listing ${listingId}`);
      const updatedListing = await DataMarketplace.updateListing(listingId, updates);
      console.log('👉 Updated listing:', updatedListing);

      const response = {
        success: true,
        data: updatedListing,
        message: `Listing ${listingId} updated successfully`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error updating listing:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to update listing: ${error.message}`
      });
    }
  }

  /**
   * Crear suscripción a un listado
   * POST /api/marketplace/subscriptions
   */
  static async createSubscription(req, res) {
    console.log('📋 createSubscription - Request body:', req.body);
    try {
      const { buyerWalletAddress, listingId, durationDays, pointsPerDay } = req.body;
      console.log(`📝 Parameters: buyerWalletAddress=${buyerWalletAddress}, listingId=${listingId}, durationDays=${durationDays}, pointsPerDay=${pointsPerDay}`);

      if (!buyerWalletAddress || !listingId || !durationDays || !pointsPerDay) {
        console.log('⛔ Missing required parameters');
        return res.respond({
          success: false,
          status: 400,
          message: 'Buyer wallet address, listing ID, duration, and points per day are required'
        });
      }

      console.log('🚀 Creating new subscription');
      const subscriptionResult = await DataMarketplace.createSubscription(
        buyerWalletAddress,
        listingId,
        Number(durationDays),
        Number(pointsPerDay)
      );
      console.log('👉 Subscription result:', subscriptionResult);

      const response = {
        success: true,
        data: {
          subscription: subscriptionResult.subscription,
          transaction: subscriptionResult.transaction
        },
        message: `Subscription created with ID: ${subscriptionResult.subscription.id}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error creating subscription:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to create subscription: ${error.message}`
      });
    }
  }

  /**
   * Confirmar transacción de marketplace
   * POST /api/marketplace/transactions/:transactionId/confirm
   */
  static async confirmTransaction(req, res) {
    console.log('📋 confirmTransaction - Request params:', req.params);
    console.log('📋 confirmTransaction - Request body:', req.body);
    try {
      const { transactionId } = req.params;
      const { txHash } = req.body;
      console.log(`📝 Parameters: transactionId=${transactionId}, txHash=${txHash}`);

      if (!transactionId || !txHash) {
        console.log('⛔ Missing required parameters');
        return res.respond({
          success: false,
          status: 400,
          message: 'Transaction ID and blockchain transaction hash are required'
        });
      }

      console.log(`🔄 Confirming transaction ${transactionId} with hash ${txHash}`);
      const confirmedTx = await DataMarketplace.confirmTransaction(transactionId, txHash);
      console.log('👉 Confirmed transaction:', confirmedTx);

      const response = {
        success: true,
        data: confirmedTx,
        message: `Transaction ${transactionId} confirmed successfully`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error confirming transaction:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to confirm transaction: ${error.message}`
      });
    }
  }

  /**
   * Calificar un proveedor de datos
   * POST /api/marketplace/subscriptions/:subscriptionId/rate
   */
  static async rateDataProvider(req, res) {
    console.log('📋 rateDataProvider - Request params:', req.params);
    console.log('📋 rateDataProvider - Request body:', req.body);
    try {
      const { subscriptionId } = req.params;
      const { rating, comment } = req.body;
      console.log(`📝 Parameters: subscriptionId=${subscriptionId}, rating=${rating}, comment=${comment}`);

      if (!subscriptionId || !rating) {
        console.log('⛔ Missing required parameters');
        return res.respond({
          success: false,
          status: 400,
          message: 'Subscription ID and rating are required'
        });
      }

      console.log(`⭐ Rating provider for subscription ${subscriptionId} with ${rating} stars`);
      const ratingResult = await DataMarketplace.rateDataProvider(
        subscriptionId,
        Number(rating),
        comment || ''
      );
      console.log('👉 Rating result:', ratingResult);

      const response = {
        success: true,
        data: ratingResult,
        message: `Rated provider with ${rating} stars for subscription ${subscriptionId}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error rating provider:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to rate provider: ${error.message}`
      });
    }
  }

  /**
   * Obtener transacciones del usuario
   * GET /api/marketplace/users/:walletAddress/transactions
   */
  static async getUserTransactions(req, res) {
    console.log('📋 getUserTransactions - Request params:', req.params);
    try {
      const { walletAddress } = req.params;
      console.log(`📝 Parameters: walletAddress=${walletAddress}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      console.log(`🔍 Getting transactions for wallet ${walletAddress}`);
      const transactions = await DataMarketplace.getUserTransactions(walletAddress);
      console.log(`👉 Found ${transactions.length} transactions`);

      const response = {
        success: true,
        data: transactions,
        message: `Found ${transactions.length} transactions for wallet ${walletAddress}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting user transactions:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get user transactions: ${error.message}`
      });
    }
  }

  /**
   * Obtener suscripciones del usuario
   * GET /api/marketplace/users/:walletAddress/subscriptions
   */
  static async getUserSubscriptions(req, res) {
    console.log('📋 getUserSubscriptions - Request params:', req.params);
    try {
      const { walletAddress } = req.params;
      console.log(`📝 Parameters: walletAddress=${walletAddress}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      console.log(`🔍 Getting subscriptions for wallet ${walletAddress}`);
      const subscriptions = await DataMarketplace.getUserSubscriptions(walletAddress);
      console.log(`👉 Found ${subscriptions.length} subscriptions`);

      const response = {
        success: true,
        data: subscriptions,
        message: `Found ${subscriptions.length} subscriptions for wallet ${walletAddress}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting user subscriptions:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get user subscriptions: ${error.message}`
      });
    }
  }

  /**
   * Estimar valor de datos
   * POST /api/marketplace/estimate-value
   */
  static async estimateDataValue(req, res) {
    console.log('📋 estimateDataValue - Request body:', req.body);
    try {
      const { dataPoints, dataType } = req.body;
      console.log(`📝 Parameters: dataPoints.length=${dataPoints?.length || 0}, dataType=${dataType}`);

      if (!dataPoints || !Array.isArray(dataPoints)) {
        console.log('⛔ Missing required parameter: dataPoints array');
        return res.respond({
          success: false,
          status: 400,
          message: 'Data points array is required'
        });
      }

      console.log('💰 Estimating data value');
      const value = DataMarketplace.estimateDataValue(dataPoints, dataType || 'COMPLETE');
      console.log(`👉 Estimated value: ${value}`);

      const response = {
        success: true,
        data: {
          estimatedValue: value,
          dataType: dataType || 'COMPLETE',
          dataPointsCount: dataPoints.length
        },
        message: `Estimated value: ${value} DRVL tokens for ${dataPoints.length} data points`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error estimating data value:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to estimate data value: ${error.message}`
      });
    }
  }

  /**
   * Obtener estadísticas del marketplace
   * GET /api/marketplace/statistics
   */
  static async getMarketplaceStatistics(req, res) {
    console.log('📋 getMarketplaceStatistics - Request params:', req.params);
    console.log('📋 getMarketplaceStatistics - Request query:', req.query);
    try {
      console.log('📊 Getting marketplace statistics');
      const statistics = await DataMarketplace.getMarketStatistics();
      console.log('👉 Statistics:', statistics);

      const response = {
        success: true,
        data: statistics,
        message: 'Marketplace statistics retrieved successfully'
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting marketplace statistics:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get marketplace statistics: ${error.message}`
      });
    }
  }

  /**
   * Obtener información de diagnóstico para códigos OBD
   * GET /api/diagnostics/:code
   */
  static async getDiagnosticInfo(req, res) {
    console.log('📋 getDiagnosticInfo - Request params:', req.params);
    try {
      const { code } = req.params;
      console.log(`📝 Parameters: code=${code}`);

      if (!code) {
        console.log('⛔ Missing required parameter: code');
        return res.respond({
          success: false,
          status: 400,
          message: 'Diagnostic code is required'
        });
      }

      // Buscar código en la base de datos
      console.log(`🔍 Looking for diagnostic code ${code} in database`);
      const diagnosticCode = await prisma.diagnosticCode.findUnique({
        where: { code }
      });
      console.log('👉 Diagnostic code found:', diagnosticCode);

      if (!diagnosticCode) {
        console.log(`⚠️ Diagnostic code ${code} not found`);
        return res.respond({
          success: false,
          status: 404,
          message: `Diagnostic code ${code} not found`
        });
      }

      const response = {
        success: true,
        data: diagnosticCode,
        message: `Diagnostic information for code ${code}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting diagnostic info:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get diagnostic info: ${error.message}`
      });
    }
  }

  /**
   * Obtener las simulaciones de un usuario
   * GET /api/users/:walletAddress/simulations
   */
  static async getUserSimulations(req, res) {
    console.log('📋 getUserSimulations - Request params:', req.params);
    try {
      const { walletAddress } = req.params;
      console.log(`📝 Parameters: walletAddress=${walletAddress}`);

      if (!walletAddress) {
        console.log('⛔ Missing required parameter: walletAddress');
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Buscar usuario
      console.log(`🔍 Looking for user with wallet ${walletAddress}`);
      const user = await prisma.user.findUnique({
        where: { walletAddress }
      });
      console.log('👉 User found:', user);

      if (!user) {
        console.log(`⚠️ No user found with wallet ${walletAddress}`);
        return res.respond({
          success: true,
          data: [],
          message: `No simulations found for wallet ${walletAddress}`
        });
      }

      // Buscar simulaciones
      console.log(`🔍 Looking for simulations for user ${user.id}`);
      const simulations = await prisma.simulation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          rewards: true
        }
      });
      console.log(`👉 Found ${simulations.length} simulations`);

      const response = {
        success: true,
        data: simulations,
        message: `Found ${simulations.length} simulations for wallet ${walletAddress}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting user simulations:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get user simulations: ${error.message}`
      });
    }
  }

  /**
   * Obtener detalle de una simulación
   * GET /api/simulations/:simulationId
   */
  static async getSimulationDetail(req, res) {
    console.log('📋 getSimulationDetail - Request params:', req.params);
    try {
      const { simulationId } = req.params;
      console.log(`📝 Parameters: simulationId=${simulationId}`);

      if (!simulationId) {
        console.log('⛔ Missing required parameter: simulationId');
        return res.respond({
          success: false,
          status: 400,
          message: 'Simulation ID is required'
        });
      }

      // Buscar simulación
      console.log(`🔍 Looking for simulation with ID ${simulationId}`);
      const simulation = await prisma.simulation.findUnique({
        where: { id: simulationId },
        include: {
          rewards: true,
          user: true
        }
      });
      console.log('👉 Simulation found:', simulation);

      if (!simulation) {
        console.log(`⚠️ Simulation with ID ${simulationId} not found`);
        return res.respond({
          success: false,
          status: 404,
          message: `Simulation with ID ${simulationId} not found`
        });
      }

      const responseData = {
        ...simulation,
        walletAddress: simulation.user?.walletAddress,
        user: undefined
      };
      const response = {
        success: true,
        data: responseData,
        message: `Simulation details for ID: ${simulationId}`
      };
      console.log('📤 Respuesta:', response);
      return res.respond(response);
    } catch (error) {
      console.error('❌ Error getting simulation detail:', error);
      console.error('❌ Stack trace:', error.stack);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get simulation detail: ${error.message}`
      });
    }
  }
}

export default DriveDataController;
