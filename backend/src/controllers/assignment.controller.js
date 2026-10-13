/**
 * @file assignment.controller.js
 * @description Controller handlers for ambulance assignments.
 */

const assignmentService = require('../services/assignment.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.create(req.body, req.user);
  return sendSuccess(res, assignment, {}, 201);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const assignment = await assignmentService.updateStatus(req.params.id, status, req.user);
  return sendSuccess(res, assignment);
});

const list = asyncHandler(async (req, res) => {
  const assignments = await assignmentService.list(req.user, req.query);
  return sendSuccess(res, assignments);
});

module.exports = {
  create,
  updateStatus,
  list
};
