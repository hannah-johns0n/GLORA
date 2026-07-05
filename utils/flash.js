const FLASH_COOKIE = "flash";

function setFlash(res, type, message) {
  const payload = JSON.stringify({ type, message });

  res.cookie(FLASH_COOKIE, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 1000, 
  });
}

function getFlash(req, res) {
  const raw = req.cookies[FLASH_COOKIE];
  if (!raw) return null;

  res.clearCookie(FLASH_COOKIE);

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

module.exports = { setFlash, getFlash };