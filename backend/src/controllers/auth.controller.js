const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * Controller handling user login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  return sendSuccess(res, result, {}, 200);
});

/**
 * Controller retrieving current authenticated user's profile
 */
const getMe = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const user = await authService.getMe(userId);
  return sendSuccess(res, user, {}, 200);
});

module.exports = {
  login,
  getMe
};
