const http = require('http');
const config = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const { startResourceReminderScheduler } = require('./services/resource-reminder.service');

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    return null;
  }
}

const server = http.createServer(app);

// Safe socket.io initialization
const socketSetup =
  safeRequire('./socket') ||
  safeRequire('./socket/index') ||
  safeRequire('./config/socket');

if (socketSetup) {
  if (typeof socketSetup === 'function') {
    socketSetup(server);
  } else if (typeof socketSetup.initSocket === 'function') {
    socketSetup.initSocket(server);
  } else if (typeof socketSetup.setupSocket === 'function') {
    socketSetup.setupSocket(server);
  }
}

// Process-level uncaught error handling
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...', err.message);
  if (config.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...', err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

const startServer = async () => {
  try {
    await connectDB();
    server.listen(config.PORT, () => {
      console.log(`EmergencyLink server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
      startResourceReminderScheduler();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

if (config.NODE_ENV !== 'test') {
  startServer();
}

module.exports = server;
