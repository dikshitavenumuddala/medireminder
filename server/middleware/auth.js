const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden, wrap } = require('../utils/errors');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Requires a valid Bearer token and attaches req.user (fresh from the DB). */
const requireAuth = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }
  const user = await db.one('users', { id: payload.sub });
  if (!user) throw unauthorized('Account no longer exists');
  req.user = user;
  next();
});

/** Is `caregiverId` linked to `patientId`? */
async function isCaregiverOf(caregiverId, patientId) {
  const row = await db.one('caregivers', { user_id: patientId, caregiver_user_id: caregiverId });
  return !!row;
}

/** Throws unless the logged-in user is `patientId` or one of their caregivers. */
async function assertCanViewPatient(user, patientId) {
  if (user.id === patientId) return;
  if (!(await isCaregiverOf(user.id, patientId))) throw forbidden('You are not linked to this patient');
}

module.exports = { signToken, requireAuth, isCaregiverOf, assertCanViewPatient };
