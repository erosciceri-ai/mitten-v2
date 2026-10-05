import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import healthRoutes from './routes/healthRoutes';
import gestureRoutes from './routes/gestureRoutes';
import { getDatabase, closeDatabase } from './db';

// Validate configuration on startup
validateConfig();

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Request logging in development
if (config.nodeEnv !== 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', healthRoutes);
app.use('/api/gestures', gestureRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;

// Start server
async function start(): Promise<void> {
  try {
    // Initialize database
    await getDatabase();
    console.log('Database initialized');

    server = app.listen(config.port, () => {
      console.log(`MITTEN API v${process.env.npm_package_version || '0.1.0'} running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      closeDatabase();
      console.log('Database connection closed');
      process.exit(0);
    });
  } else {
    closeDatabase();
    process.exit(0);
  }

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('uncaughtException');
});

start();

export default app;