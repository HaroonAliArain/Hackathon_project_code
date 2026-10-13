const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend directory or current working directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGODB_URI) {
  throw new Error('FATAL: MONGODB_URI environment variable is missing.');
}

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  APP_URL: process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  RESOURCE_REMINDERS_ENABLED: process.env.RESOURCE_REMINDERS_ENABLED === 'true',
  RESOURCE_REMINDER_INTERVAL_MINUTES: process.env.RESOURCE_REMINDER_INTERVAL_MINUTES
    ? parseInt(process.env.RESOURCE_REMINDER_INTERVAL_MINUTES, 10)
    : 15,
  RESOURCE_REMINDER_REPEAT_HOURS: process.env.RESOURCE_REMINDER_REPEAT_HOURS
    ? parseInt(process.env.RESOURCE_REMINDER_REPEAT_HOURS, 10)
    : 24,
  RECOMMENDATION_MODE: process.env.RECOMMENDATION_MODE || 'module',
  RECOMMENDATION_SERVICE_URL: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:8000',
  RESOURCE_CONFIRMED_MAX_AGE: process.env.RESOURCE_CONFIRMED_MAX_AGE
    ? parseInt(process.env.RESOURCE_CONFIRMED_MAX_AGE, 10)
    : 30,
  RESOURCE_STALE_AFTER: process.env.RESOURCE_STALE_AFTER
    ? parseInt(process.env.RESOURCE_STALE_AFTER, 10)
    : 120,
  REFERRAL_ESCALATE_AFTER: process.env.REFERRAL_ESCALATE_AFTER
    ? parseInt(process.env.REFERRAL_ESCALATE_AFTER, 10)
    : 10,
  SEED_PASSWORD: process.env.SEED_PASSWORD || 'Demo@12345'
};

module.exports = config;
