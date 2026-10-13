/**
 * @file user.controller.js
 * @description Controller handlers for user administration with scoped hospital administration.
 */

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { createAuditEvent } = require('../middleware/audit');

const list = asyncHandler(async (req, res) => {
  const { user } = req;
  const query = {};

  if (user.role === 'hospital_admin') {
    if (!user.hospitalId) {
      throw ApiError.forbidden('No assigned hospital found for hospital admin');
    }
    query.hospitalId = user.hospitalId;
  }

  const users = await User.find(query)
    .select('-passwordHash')
    .populate('hospitalId', 'name status')
    .populate('ambulanceId', 'ambulanceId status')
    .sort({ createdAt: -1 });

  return sendSuccess(res, users);
});

const create = asyncHandler(async (req, res) => {
  const { user } = req;
  const { name, email, password, role, hospitalId, ambulanceId, accountStatus } = req.body;

  // Role permissions check
  if (user.role === 'hospital_admin') {
    // Hospital admin can only create hospital_staff for their own hospital
    if (role !== 'hospital_staff') {
      throw ApiError.forbidden('Hospital admins can only create users with hospital_staff role');
    }
    if (!user.hospitalId) {
      throw ApiError.forbidden('No assigned hospital for hospital admin');
    }
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('A user with this email address already exists');
  }

  const targetHospitalId = user.role === 'hospital_admin' ? user.hospitalId : (hospitalId || null);
  const targetAmbulanceId = user.role === 'hospital_admin' ? null : (ambulanceId || null);

  const newUser = new User({
    name,
    email: email.toLowerCase(),
    password, // Handled by User virtual setter
    role,
    hospitalId: targetHospitalId,
    ambulanceId: targetAmbulanceId,
    accountStatus: accountStatus || 'active'
  });

  await newUser.save();

  createAuditEvent({
    actorId: user._id || user.id,
    actorRole: user.role,
    eventType: 'user_created',
    recordType: 'User',
    recordId: newUser._id,
    after: {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      hospitalId: newUser.hospitalId,
      accountStatus: newUser.accountStatus
    }
  });

  const createdUser = await User.findById(newUser._id)
    .select('-passwordHash')
    .populate('hospitalId', 'name status')
    .populate('ambulanceId', 'ambulanceId status');

  return sendSuccess(res, createdUser, {}, 201);
});

const update = asyncHandler(async (req, res) => {
  const { user } = req;
  const { id } = req.params;
  const { name, role, accountStatus, hospitalId, ambulanceId, password } = req.body;

  const targetUser = await User.findById(id).select('+passwordHash');
  if (!targetUser) {
    throw ApiError.notFound('User not found');
  }

  // Hospital admin scoping check
  if (user.role === 'hospital_admin') {
    const userHospitalId = (user.hospitalId?._id || user.hospitalId)?.toString();
    const targetUserHospitalId = (targetUser.hospitalId?._id || targetUser.hospitalId)?.toString();

    if (!userHospitalId || userHospitalId !== targetUserHospitalId) {
      throw ApiError.forbidden('Hospital admins can only modify staff from their own hospital');
    }

    if (role && role !== 'hospital_staff') {
      throw ApiError.forbidden('Hospital admins cannot reassign roles beyond hospital_staff');
    }
  }

  const beforeSnapshot = {
    name: targetUser.name,
    role: targetUser.role,
    accountStatus: targetUser.accountStatus
  };

  if (name) targetUser.name = name;
  if (role) targetUser.role = role;
  if (accountStatus) targetUser.accountStatus = accountStatus;
  if (hospitalId !== undefined && user.role === 'system_admin') targetUser.hospitalId = hospitalId;
  if (ambulanceId !== undefined && user.role === 'system_admin') targetUser.ambulanceId = ambulanceId;
  if (password) targetUser.password = password;

  await targetUser.save();

  createAuditEvent({
    actorId: user._id || user.id,
    actorRole: user.role,
    eventType: 'user_updated',
    recordType: 'User',
    recordId: targetUser._id,
    before: beforeSnapshot,
    after: {
      name: targetUser.name,
      role: targetUser.role,
      accountStatus: targetUser.accountStatus
    }
  });

  const updatedUser = await User.findById(targetUser._id)
    .select('-passwordHash')
    .populate('hospitalId', 'name status')
    .populate('ambulanceId', 'ambulanceId status');

  return sendSuccess(res, updatedUser);
});

module.exports = {
  list,
  create,
  update
};
