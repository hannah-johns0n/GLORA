const jwt = require("jsonwebtoken");

function issueOtpSession(res, cookieName, payload, maxAgeMs = 3 * 60 * 1000) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: Math.floor(maxAgeMs / 1000),
  });

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeMs,
  });
}

function readOtpSession(req, cookieName) {
  const token = req.cookies[cookieName];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function clearOtpSession(res, cookieName) {
  res.clearCookie(cookieName);
}

module.exports = { issueOtpSession, readOtpSession, clearOtpSession };