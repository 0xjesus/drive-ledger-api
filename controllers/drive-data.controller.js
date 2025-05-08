
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import DataMarketplace from '../services/data-driver-simulator.service.js';
import TokenRewardManager from '../services/token-reward-manager.service.js';
import DriveDataSimulator from '../services/car-data.service.js';


const prisma = new PrismaClient();

class DriveDataController {
  /**
   * Inicializar servicios
   * POST /api/initialize
   */
  static async initializeServices(req, res) {
    try {
      const { tokenMintAddress } = req.body;

      // Inicializar el marketplace
      const marketplaceResult = await DataMarketplace.initialize({ tokenMintAddress });

      // Inicializar el gestor de tokens
      const tokenResult = await TokenRewardManager.initialize(tokenMintAddress);

      // Cargar datos de simulación
      await DriveDataSimulator.loadSyntheticData();

      return res.respond({
        success: true,
        data: {
          marketplace: marketplaceResult,
          tokenManager: tokenResult,
          simulator: {
            dataPointsLoaded: DriveDataSimulator.syntheticData.length
          }
        },
        message: 'All services initialized successfully'
      });
    } catch (error) {
      console.error('❌ Error initializing services:', error);
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
    try {
      // Obtener rutas desde la base de datos
      const routes = await prisma.simulationRoute.findMany();

      return res.respond({
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
      });
    } catch (error) {
      console.error('❌ Error getting routes:', error);
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
      const { routeType, durationMinutes, walletAddress } = req.body;

      if (!routeType || !durationMinutes) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Route type and duration are required'
        });
      }

      // Buscar o crear usuario si se proporciona dirección de wallet
      let userId = null;
      if (walletAddress) {
        const user = await prisma.user.upsert({
          where: { walletAddress },
          update: {},
          create: { walletAddress }
        });
        userId = user.id;
      }

      // Iniciar simulación
      const simulationResult = await DriveDataSimulator.startSimulation(
        routeType,
        Number(durationMinutes)
      );

      if (!simulationResult.success) {
        return res.respond({
          success: false,
          status: 400,
          message: simulationResult.message
        });
      }

      // Registrar simulación en la base de datos
      const simulationRoute = await prisma.simulationRoute.findUnique({
        where: { routeType }
      });

      const simulation = await prisma.simulation.create({
        data: {
          routeType,
          userId: userId,
          status: 'RUNNING',
          dataPointsCount: 0
        }
      });

      // Enriquecer la respuesta con datos adicionales
      return res.respond({
        success: true,
        data: {
          simulationId: simulation.id,
          ...simulationResult,
          routeDetails: simulationRoute,
          userId: userId,
          walletAddress: walletAddress || 'anonymous',
          startedAt: simulation.createdAt.toISOString(),
          estimatedCompletionTime: new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString()
        },
        message: 'Simulation started successfully'
      });
    } catch (error) {
      console.error('❌ Error starting simulation:', error);
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
    try {
      const status = DriveDataSimulator.getSimulationStatus();

      // Si hay una simulación activa, buscar su registro en la base de datos
      let dbSimulation = null;
      if (status.isActive) {
        // Buscar simulación más reciente con estado RUNNING
        dbSimulation = await prisma.simulation.findFirst({
          where: { status: 'RUNNING' },
          orderBy: { createdAt: 'desc' }
        });
      }

      return res.respond({
        success: true,
        data: {
          ...status,
          simulationId: dbSimulation?.id
        },
        message: status.isActive ? 'Simulation is running' : 'No simulation is running'
      });
    } catch (error) {
      console.error('❌ Error getting simulation status:', error);
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
    try {
      const result = DriveDataSimulator.stopSimulation();

      if (!result.success) {
        return res.respond({
          success: false,
          status: 400,
          message: result.message
        });
      }

      // Actualizar registro de simulación en la base de datos
      const simulation = await prisma.simulation.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { createdAt: 'desc' }
      });

      if (simulation) {
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
      }

      return res.respond({
        success: true,
        data: {
          ...result,
          simulationId: simulation?.id
        },
        message: 'Simulation stopped successfully'
      });
    } catch (error) {
      console.error('❌ Error stopping simulation:', error);
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
    try {
      const { walletAddress, simulationId } = req.body;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Verificar si la simulación existe
      let simulation = null;
      if (simulationId) {
        simulation = await prisma.simulation.findUnique({
          where: { id: simulationId }
        });

        if (!simulation) {
          return res.respond({
            success: false,
            status: 404,
            message: `Simulation with ID ${simulationId} not found`
          });
        }
      }

      // Obtener datos de simulación
      const simulationData = DriveDataSimulator.simulationData;
      if (!simulationData || simulationData.length === 0) {
        return res.respond({
          success: false,
          status: 400,
          message: 'No simulation data available for reward'
        });
      }

      // Calcular recompensa
      // Usar el método correcto de DriveDataSimulator para calcular la recompensa
      const rewardAmount = DriveDataSimulator.getDataBatchRewardValue(simulationData);

      // Generar transacción de recompensa
      const rewardResult = await TokenRewardManager.mintRewardTokens(
        walletAddress,
        rewardAmount,
        simulationId
      );

      return res.respond({
        success: rewardResult.success,
        data: rewardResult,
        message: rewardResult.success
          ? `Reward of ${rewardAmount} DRVL tokens processed for ${walletAddress}`
          : `Reward requires frontend signing: ${rewardAmount} DRVL tokens for ${walletAddress}`
      });
    } catch (error) {
      console.error('❌ Error generating reward:', error);
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
    try {
      const { walletAddress, amount } = req.body;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Ejecutar airdrop
      const airdropResult = await TokenRewardManager.airdropTokens(
        walletAddress,
        amount || 100
      );

      return res.respond({
        success: airdropResult.success,
        data: airdropResult,
        message: airdropResult.success
          ? `Airdrop of ${amount || 100} DRVL tokens completed for ${walletAddress}`
          : `Airdrop failed: ${airdropResult.error}`
      });
    } catch (error) {
      console.error('❌ Error executing airdrop:', error);
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
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      const balanceResult = await TokenRewardManager.getTokenBalance(walletAddress);

      return res.respond({
        success: balanceResult.success,
        data: balanceResult,
        message: `Balance for ${walletAddress}: ${balanceResult.balance} ${balanceResult.tokenSymbol}`
      });
    } catch (error) {
      console.error('❌ Error getting token balance:', error);
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
    try {
      const dataTypes = DataMarketplace.getDataTypes();

      return res.respond({
        success: true,
        data: dataTypes,
        message: `Found ${dataTypes.length} data types`
      });
    } catch (error) {
      console.error('❌ Error getting data types:', error);
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
    try {
      const { walletAddress, dataType, pricePerPoint, description, samples } = req.body;

      if (!walletAddress || !dataType || !pricePerPoint) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address, data type, and price are required'
        });
      }

      const listing = await DataMarketplace.createListing(
        walletAddress,
        dataType,
        Number(pricePerPoint),
        description || `${dataType} vehicle data`,
        samples || []
      );

      return res.respond({
        success: true,
        data: listing,
        message: `Listing created with ID: ${listing.id}`
      });
    } catch (error) {
      console.error('❌ Error creating listing:', error);
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
    try {
      const filters = {
        seller: req.query.seller,
        dataType: req.query.dataType,
        active: req.query.active === 'true',
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined
      };

      // Eliminar filtros indefinidos
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const listings = await DataMarketplace.getListings(filters);

      return res.respond({
        success: true,
        data: listings,
        filters: Object.keys(filters).length > 0 ? filters : 'none',
        message: `Found ${listings.length} listings${Object.keys(filters).length > 0 ? ' with applied filters' : ''}`
      });
    } catch (error) {
      console.error('❌ Error getting listings:', error);
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
    try {
      const { listingId } = req.params;

      if (!listingId) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Listing ID is required'
        });
      }

      const listing = await DataMarketplace.getListingById(listingId);

      if (!listing) {
        return res.respond({
          success: false,
          status: 404,
          message: `Listing with ID ${listingId} not found`
        });
      }

      return res.respond({
        success: true,
        data: listing,
        message: `Listing details for ID: ${listingId}`
      });
    } catch (error) {
      console.error('❌ Error getting listing detail:', error);
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
    try {
      const { listingId } = req.params;
      const updates = req.body;

      if (!listingId) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Listing ID is required'
        });
      }

      const updatedListing = await DataMarketplace.updateListing(listingId, updates);

      return res.respond({
        success: true,
        data: updatedListing,
        message: `Listing ${listingId} updated successfully`
      });
    } catch (error) {
      console.error('❌ Error updating listing:', error);
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
    try {
      const { buyerWalletAddress, listingId, durationDays, pointsPerDay } = req.body;

      if (!buyerWalletAddress || !listingId || !durationDays || !pointsPerDay) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Buyer wallet address, listing ID, duration, and points per day are required'
        });
      }

      const subscriptionResult = await DataMarketplace.createSubscription(
        buyerWalletAddress,
        listingId,
        Number(durationDays),
        Number(pointsPerDay)
      );

      return res.respond({
        success: true,
        data: {
          subscription: subscriptionResult.subscription,
          transaction: subscriptionResult.transaction
        },
        message: `Subscription created with ID: ${subscriptionResult.subscription.id}`
      });
    } catch (error) {
      console.error('❌ Error creating subscription:', error);
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
    try {
      const { transactionId } = req.params;
      const { txHash } = req.body;

      if (!transactionId || !txHash) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Transaction ID and blockchain transaction hash are required'
        });
      }

      const confirmedTx = await DataMarketplace.confirmTransaction(transactionId, txHash);

      return res.respond({
        success: true,
        data: confirmedTx,
        message: `Transaction ${transactionId} confirmed successfully`
      });
    } catch (error) {
      console.error('❌ Error confirming transaction:', error);
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
    try {
      const { subscriptionId } = req.params;
      const { rating, comment } = req.body;

      if (!subscriptionId || !rating) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Subscription ID and rating are required'
        });
      }

      const ratingResult = await DataMarketplace.rateDataProvider(
        subscriptionId,
        Number(rating),
        comment || ''
      );

      return res.respond({
        success: true,
        data: ratingResult,
        message: `Rated provider with ${rating} stars for subscription ${subscriptionId}`
      });
    } catch (error) {
      console.error('❌ Error rating provider:', error);
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
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      const transactions = await DataMarketplace.getUserTransactions(walletAddress);

      return res.respond({
        success: true,
        data: transactions,
        message: `Found ${transactions.length} transactions for wallet ${walletAddress}`
      });
    } catch (error) {
      console.error('❌ Error getting user transactions:', error);
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
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      const subscriptions = await DataMarketplace.getUserSubscriptions(walletAddress);

      return res.respond({
        success: true,
        data: subscriptions,
        message: `Found ${subscriptions.length} subscriptions for wallet ${walletAddress}`
      });
    } catch (error) {
      console.error('❌ Error getting user subscriptions:', error);
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
    try {
      const { dataPoints, dataType } = req.body;

      if (!dataPoints || !Array.isArray(dataPoints)) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Data points array is required'
        });
      }

      const value = DataMarketplace.estimateDataValue(dataPoints, dataType || 'COMPLETE');

      return res.respond({
        success: true,
        data: {
          estimatedValue: value,
          dataType: dataType || 'COMPLETE',
          dataPointsCount: dataPoints.length
        },
        message: `Estimated value: ${value} DRVL tokens for ${dataPoints.length} data points`
      });
    } catch (error) {
      console.error('❌ Error estimating data value:', error);
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
    try {
      const statistics = await DataMarketplace.getMarketStatistics();

      return res.respond({
        success: true,
        data: statistics,
        message: 'Marketplace statistics retrieved successfully'
      });
    } catch (error) {
      console.error('❌ Error getting marketplace statistics:', error);
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
    try {
      const { code } = req.params;

      if (!code) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Diagnostic code is required'
        });
      }

      // Buscar código en la base de datos
      const diagnosticCode = await prisma.diagnosticCode.findUnique({
        where: { code }
      });

      if (!diagnosticCode) {
        return res.respond({
          success: false,
          status: 404,
          message: `Diagnostic code ${code} not found`
        });
      }

      return res.respond({
        success: true,
        data: diagnosticCode,
        message: `Diagnostic information for code ${code}`
      });
    } catch (error) {
      console.error('❌ Error getting diagnostic info:', error);
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
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Wallet address is required'
        });
      }

      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { walletAddress }
      });

      if (!user) {
        return res.respond({
          success: true,
          data: [],
          message: `No simulations found for wallet ${walletAddress}`
        });
      }

      // Buscar simulaciones
      const simulations = await prisma.simulation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          rewards: true
        }
      });

      return res.respond({
        success: true,
        data: simulations,
        message: `Found ${simulations.length} simulations for wallet ${walletAddress}`
      });
    } catch (error) {
      console.error('❌ Error getting user simulations:', error);
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
    try {
      const { simulationId } = req.params;

      if (!simulationId) {
        return res.respond({
          success: false,
          status: 400,
          message: 'Simulation ID is required'
        });
      }

      // Buscar simulación
      const simulation = await prisma.simulation.findUnique({
        where: { id: simulationId },
        include: {
          rewards: true,
          user: true
        }
      });

      if (!simulation) {
        return res.respond({
          success: false,
          status: 404,
          message: `Simulation with ID ${simulationId} not found`
        });
      }

      return res.respond({
        success: true,
        data: {
          ...simulation,
          walletAddress: simulation.user?.walletAddress,
          user: undefined
        },
        message: `Simulation details for ID: ${simulationId}`
      });
    } catch (error) {
      console.error('❌ Error getting simulation detail:', error);
      return res.respond({
        success: false,
        status: 500,
        message: `Failed to get simulation detail: ${error.message}`
      });
    }
  }
}

export default DriveDataController;
