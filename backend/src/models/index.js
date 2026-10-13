/**
 * @file index.js
 * @description Central export index for all EmergencyLink Mongoose models.
 */

const User = require('./User');
const Hospital = require('./Hospital');
const ResourceSnapshot = require('./ResourceSnapshot');
const Emergency = require('./Emergency');
const Ambulance = require('./Ambulance');
const Referral = require('./Referral');
const Assignment = require('./Assignment');
const AuditEvent = require('./AuditEvent');
const SyncEvent = require('./SyncEvent');

module.exports = {
  User,
  Hospital,
  ResourceSnapshot,
  Emergency,
  Ambulance,
  Referral,
  Assignment,
  AuditEvent,
  SyncEvent
};
