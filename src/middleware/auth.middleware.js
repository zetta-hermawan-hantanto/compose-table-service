// *************** IMPORT LIBRARY ***************
const jwt = require('jsonwebtoken');

// *************** IMPORT MODULE ***************
const ErrorLogModel = require('../models/error_log.model');

/**
 * AuthMiddleware validates the Authorization header, decodes the JWT, and attaches the user ID.
 * Rejects the request immediately if the header, token, or decoded payload is invalid and logs the error.
 * @param {import('express').Request} req - Incoming Express request containing Authorization header.
 * @param {import('express').Response} res - Express response used to send error messages.
 * @param {import('express').NextFunction} next - Callback to transfer control when authentication succeeds.
 * @returns {Promise<void>} - Resolves when middleware finishes validation or responds with 401.
 */
const AuthMiddleware = async function (req, res, next) {
  try {
    // *************** Extract auth header from request
    const authHeader = req.cookies['authorization'];

    // *************** Validate presence of auth header
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
    }

    // *************** Extract token from auth header
    const token = authHeader.split(' ')[1];

    // *************** Validate presence of token
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing token' });
    }

    // *************** Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // *************** Validate decoded payload
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }

    // *************** Attach user ID to request object
    req.userId = decoded.userId;

    // *************** Proceed to next middleware or route handler
    next();
  } catch (error) {
    // *************** Log error to ErrorLogModel
    await ErrorLogModel.create({
      function_name: 'AuthMiddleware',
      error: error.message,
      path: 'src/middleware/auth.middleware.js',
    });

    // *************** Respond with 401 Unauthorized
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing token' });
  }
};

// *************** EXPORT MODULE ***************
module.exports = { AuthMiddleware };
