import mongoose from 'mongoose';
import env from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
