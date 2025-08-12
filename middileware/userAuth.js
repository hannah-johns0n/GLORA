const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const requireAuth = async (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    
    return res.redirect("/login");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    if (!userId) {
      res.clearCookie("jwt");
      return res.redirect("/login");
    }
    
    const user = await User.findById(userId).select("name email role isBlocked");

    if (!user || user.role !== "user") {
      res.clearCookie("jwt");
      return res.redirect("/login");
    }

    if (user.isBlocked) {
      res.clearCookie("jwt");
      return res.redirect("/login?blocked=1");
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("JWT verification failed:", error.message);
    res.clearCookie("jwt");
    return res.redirect("/login");
  }
};

module.exports = requireAuth;
