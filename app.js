import { router as defaultRoutes } from './routes/default.js';
import primate from '@thewebchimp/primate';

try {
  await primate.setup();
} catch (error) {
  console.error('❌ Error al inicializar Prisma, intentando sin Prisma:', error.message);
  // Reintentar sin Prisma
  await primate.setup({ usePrisma: false });
}

await primate.start();
primate.app.use('/', defaultRoutes);
