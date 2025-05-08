import { Primate } from '@thewebchimp/primate';
import DriveDataController from '../controllers/drive-data.controller.js';

const router = Primate.getRouter();

// Inicialización de servicios
router.post('/api/initialize', DriveDataController.initializeServices);

// Rutas para simulaciones
router.get('/api/routes', DriveDataController.getAvailableRoutes);
router.post('/api/simulations', DriveDataController.startSimulation);
router.get('/api/simulations/status', DriveDataController.getSimulationStatus);
router.post('/api/simulations/stop', DriveDataController.stopSimulation);
router.get('/api/simulations/:simulationId', DriveDataController.getSimulationDetail);

// Rutas para recompensas y tokens
router.post('/api/rewards', DriveDataController.generateReward);
router.post('/api/airdrops', DriveDataController.executeAirdrop);
router.get('/api/balances/:walletAddress', DriveDataController.getTokenBalance);

// Rutas para el marketplace - Datos generales
router.get('/api/marketplace/datatypes', DriveDataController.getDataTypes);
router.get('/api/marketplace/statistics', DriveDataController.getMarketplaceStatistics);
router.post('/api/marketplace/estimate-value', DriveDataController.estimateDataValue);

// Rutas para el marketplace - Listings
router.post('/api/marketplace/listings', DriveDataController.createListing);
router.get('/api/marketplace/listings', DriveDataController.getListings);
router.get('/api/marketplace/listings/:listingId', DriveDataController.getListingDetail);
router.put('/api/marketplace/listings/:listingId', DriveDataController.updateListing);

// Rutas para el marketplace - Suscripciones
router.post('/api/marketplace/subscriptions', DriveDataController.createSubscription);
router.post('/api/marketplace/subscriptions/:subscriptionId/rate', DriveDataController.rateDataProvider);

// Rutas para el marketplace - Transacciones
router.post('/api/marketplace/transactions/:transactionId/confirm', DriveDataController.confirmTransaction);

// Rutas para usuarios
router.get('/api/marketplace/users/:walletAddress/transactions', DriveDataController.getUserTransactions);
router.get('/api/marketplace/users/:walletAddress/subscriptions', DriveDataController.getUserSubscriptions);
router.get('/api/users/:walletAddress/simulations', DriveDataController.getUserSimulations);

// Rutas para diagnósticos
router.get('/api/diagnostics/:code', DriveDataController.getDiagnosticInfo);

export { router };
