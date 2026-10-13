const mongoose = require('mongoose');

const resourceReminderSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
      unique: true
    },
    lastSentAt: {
      type: Date,
      default: null
    },
    lockUntil: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ResourceReminder', resourceReminderSchema);
