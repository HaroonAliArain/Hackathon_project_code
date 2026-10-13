const mongoose = require('mongoose');
const config = require('./env');

/**
 * Connect to MongoDB database
 * @returns {Promise<typeof mongoose>}
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    if (config.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
