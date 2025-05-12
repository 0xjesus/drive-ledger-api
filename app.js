import { router as defaultRoutes } from './routes/default.js';
import primate from '@thewebchimp/primate';

await primate.setup();
await primate.start();

primate.app.use('/', defaultRoutes);
