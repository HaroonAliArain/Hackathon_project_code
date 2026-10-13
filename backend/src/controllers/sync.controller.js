/**
 * @file sync.controller.js
 * @description Controller handlers for offline sync processing and conflict resolution.
 */

const syncService = require('../services/sync.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const processEvents = asyncHandler(async (req, res) => {
  const results = await syncService.processEvents(req.body.events, req.user);
  return sendSuccess(res, results);
});

const getConflicts = asyncHandler(async (req, res) => {
  const conflicts = await syncService.getConflicts(req.user);
  return sendSuccess(res, conflicts);
});

const resolveConflict = asyncHandler(async (req, res) => {
  const { resolution, note } = req.body;
  const conflict = await syncService.resolveConflict(req.params.id, resolution, note, req.user);
  return sendSuccess(res, conflict);
});

module.exports = {
  processEvents,
  getConflicts,
  resolveConflict
};
