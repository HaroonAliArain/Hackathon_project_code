const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

const config = require('./config/env');
const ApiError = require('./utils/ApiError');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimit');

const app = express();

/**
 * Helper to safely require optional routes or modules
 * @param {string} modulePath
 * @returns {any|null}
 */
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    return null;
  }
}

// 1. Helmet security headers
app.use(helmet());

// 2. CORS configuration
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    credentials: true
  })
);

// 3. Body parser with size limits
app.use(express.json({ limit: '100kb' }));

// 4. Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// 5. HTTP request logging (disabled in test mode)
if (config.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 6. Global rate limiting
app.use(globalLimiter);

// Mount API routes
const healthRoutes = safeRequire('./routes/health.routes');
if (healthRoutes) {
  app.use('/api/v1/health', healthRoutes);
}

const authRoutes = safeRequire('./routes/auth.routes');
if (authRoutes) {
  app.use('/api/v1/auth', authRoutes);
}

const emergencyRoutes = safeRequire('./routes/emergency.routes');
if (emergencyRoutes) {
  app.use('/api/v1/emergencies', emergencyRoutes);
}

const hospitalRoutes = safeRequire('./routes/hospital.routes');
if (hospitalRoutes) {
  app.use('/api/v1/hospitals', hospitalRoutes);
}

const ambulanceRoutes = safeRequire('./routes/ambulance.routes');
if (ambulanceRoutes) {
  app.use('/api/v1/ambulances', ambulanceRoutes);
}

const referralRoutes = safeRequire('./routes/referral.routes');
if (referralRoutes) {
  app.use('/api/v1/referrals', referralRoutes);
}

const assignmentRoutes = safeRequire('./routes/assignment.routes');
if (assignmentRoutes) {
  app.use('/api/v1/assignments', assignmentRoutes);
}

const recommendationRoutes = safeRequire('./routes/recommendation.routes');
if (recommendationRoutes) {
  app.use('/api/v1/recommendations', recommendationRoutes);
}

const dashboardRoutes = safeRequire('./routes/dashboard.routes');
if (dashboardRoutes) {
  app.use('/api/v1/dashboard', dashboardRoutes);
}

const auditRoutes = safeRequire('./routes/audit.routes');
if (auditRoutes) {
  app.use('/api/v1/audit-events', auditRoutes);
}

const syncRoutes = safeRequire('./routes/sync.routes');
if (syncRoutes) {
  app.use('/api/v1/sync', syncRoutes);
}

const analyticsRoutes = safeRequire('./routes/analytics.routes');
if (analyticsRoutes) {
  app.use('/api/v1/analytics', analyticsRoutes);
}

const userRoutes = safeRequire('./routes/user.routes');
if (userRoutes) {
  app.use('/api/v1/users', userRoutes);
}

// 404 Handler for undefined routes
app.use((req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
