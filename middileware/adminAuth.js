const jwt = require("jsonwebtoken");
const Admin = require("../models/userModel"); 

const requireAdminAuth = async (req, res, next) => {
  const token = req.cookies.adminJwt;

  if (!token) {
    return res.redirect("/admin/login");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.userId);

    if (!admin || admin.role !== "admin" || admin.isBlocked) {
      res.clearCookie('adminJwt');
      return res.redirect('/admin/login');
    }

    req.admin = admin; 
    next();
  }
   catch (err) {
    console.log("JWT verification failed:", err);
    res.redirect("/admin/login");
  }
};

module.exports = requireAdminAuth;