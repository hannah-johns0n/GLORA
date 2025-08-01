const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();
const Category = require('../../models/categoryModel');
const Product = require('../../models/productModel');
const User = require('../../models/userModel');
const TempUser = require('../../models/TempUser');
const PasswordReset = require('../../models/passwordResetModel');
const STATUS_CODES = require('../../constants/statusCodes');


const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();


const sendOTP = async (email, otp) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Password Reset OTP",
    html: `<h2>Your OTP is <strong>${otp}</strong></h2><p>Expires in 5 minutes.</p>`
  });
};

const getSignup = (req, res) => {
  try {
    res.render("user/signup", { error: null });
  } catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const signup = async (req, res) => {
  const { name, email, password, confirmPassword, phoneNumber } = req.body;

  try {
    if (!email || !password || !confirmPassword || !name || !phoneNumber) {
      return res.render("user/signup", { error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.render("user/signup", { error: "Passwords do not match" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.render("user/signup", { error: "Email already registered" });
    }

    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await TempUser.deleteOne({ email });

    await TempUser.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      otp,
      otpExpires: expiresAt
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Email",
      html: `<h2>Your OTP is <strong>${otp}</strong></h2><p>Expires in 5 minutes.</p>`
    });

    res.redirect(`/verify-otp?email=${email}`);
  } 
  
  catch (error) {
    res.render("user/signup", { error: "Internal server error" });
  }
};

const getVerifyOtp = async (req, res) => {
  const { email } = req.query;
  const tempUser = await TempUser.findOne({ email });
  console.log(`OTP for ${email}: ${tempUser.otp}`);

  const viewData = {
    email,
    error: null,
    expiresIn: 300 
  };
  res.render("user/otp", viewData);
};

const postVerifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  const tempUser = await TempUser.findOne({ email });

  if (!tempUser) {
    return res.render("user/otp", { email, error: "No OTP found for this email", expiresIn: 300 });
  }

  if (tempUser.otp !== otp || tempUser.otpExpires < new Date()) {
    return res.render("user/otp", { email, error: "Invalid or expired OTP", expiresIn: 300 });
  }

  await User.create({
    name: tempUser.name,
    email: tempUser.email,
    password: tempUser.password,
    phoneNumber: tempUser.phoneNumber
  });

  await TempUser.deleteOne({ email });

  res.redirect("/login");
};

const resendOtp = async (req, res) => {
  const { email } = req.query;

  const tempUser = await TempUser.findOne({ email });
  if (!tempUser) return res.redirect('/signup');

  const otp = generateOTP(); 
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
  console.log(`OTP for ${email}: ${otp}`);

  tempUser.otp = otp;
  tempUser.otpExpires = otpExpires;
  await tempUser.save();

  const viewData = { 
    email,
    error: null,
    OTP : otp,
    ExpiresAt : otpExpires,
  };

  await transporter.sendMail({
    to: email,
    subject: 'Resend OTP - Email Verification',
    html: `<h2>Your new OTP is: ${otp}</h2><p>Expires in 10 minutes</p>`,
  });

  res.render("user/otp", viewData);

};

const getLogin = (req, res) => {
  try {
    res.render("user/login");
  } catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const login = async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("user/login", { error: "Enter all credentials" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("user/login", { error: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.render("user/login", { error: "Invalid credentials" });
    }

    if (user.role === 'admin') {
      return res.render("user/login", { error: "Admins cannot log in from the user side." });
    }

    const token = jwt.sign({ id: user._id, role: 'user', name: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.cookie("jwt", token, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000 
    });

    const categories = await Category.find({ isBlocked: false });
    const products = await Product.find({}).sort({ createdAt: -1 }).limit(8);
  
     res.render("user/home", {
      userName: user.name,
      user: user,
      categories,
      products,
      loginSuccess: true
    });

  } 
  catch (error) {
    return res.render("user/login", { error: "Something went wrong so please try again later" });
  }
};

const logout = (req, res) => {
res.clearCookie("jwt")
res.redirect('/')
};

const loadHomePage = async (req, res) => {
  try {
    let userName = null;
    let user = null;
    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userName = decoded.name || null;
        user = decoded;
      }
       catch (err) {
        userName = null;
        user = null;
      }
    }
    const categories = await Category.find({ isBlocked: false });
    const products = await Product.find({ isBlocked: false }).sort({ createdAt: -1 }).limit(8);

    res.render("user/home", { userName, user, categories, products });
  } 
  catch (error) {
    res.render("user/home", { userName: null, user: null, categories: [] });
  }
};

const getShopPage = async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const minPrice = parseFloat(req.query.minPrice) || 0;       
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
    const sort = req.query.sort || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = {
      salesPrice: { $gte: minPrice, $lte: maxPrice }, 
      isBlocked: { $ne: true } 
    };

    if (category !== 'all') {
      filter.category = category; 
    }

    if (search) {
      filter.productName = { $regex: search, $options: 'i' };
    }

      const sortOption = {};
        
      if (sort === 'az') {
        sortOption.productName = 1; 
      } else if (sort === 'za') {
        sortOption.productName = -1; 
      } else if (sort === 'priceLowHigh') {
        sortOption.salesPrice = 1; 
      } else if (sort === 'priceHighLow') {
        sortOption.salesPrice = -1; 
      }


    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const categories = await Category.find({ isBlocked: false });

    const userName = req.session?.userName || null;
    const url = req.originalUrl;

    res.render('user/shop', {
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      selectedCategory: category,
      minPrice,
      maxPrice,
      selectedSort: sort,
      sort,
      path: '/shop',
      userName,       
      url
    });

  } 
  catch (error) {
    res.render('user/shop', {
      url: req.originalUrl,   
      userName: null,
      categories: [],
      products: [],
      currentPage: 1,
      totalPages: 1,
      selectedCategory: 'all',
      selectedSort: sort,
      search: '',
      minPrice: 0,
      maxPrice: 0,
      sort: ''
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product || product.isBlocked) {
      return res.status(STATUS_CODES.NOT_FOUND).send('Product not found');
    }

    let userName = null;
    let user = null;
    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userName = decoded.name || null;
        user = decoded;
      } catch (err) {
        userName = null;
        user = null;
      }
    }

    const relatedProducts = await Product.find({category: product.category,_id: { $ne: product._id },isBlocked: false}).limit(4);

    res.render('user/productDetails', {
      product,
      relatedProducts,
      userName,
      user,
      url: req.originalUrl,
    });
  } 
  catch (error) {
    console.error('Product details error:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Internal Server Error');
  }
};

const getForgotPassword = (req, res) => {
  try {
    res.render('user/forgotPassword', {error : null});
  }
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('There is some internal error, so please try again later');
  }
};

const postForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email }) || await TempUser.findOne({ email });

    if (!user) {
      return res.render('user/forgotPassword', { error: 'Email not found' });
    }

   const otp = generateOTP();
   console.log("Generated OTP:", otp);
    const otpExpires = Date.now() + 5 * 60 * 1000;

    await PasswordReset.updateOne(
      { email },
      { $set: { otp, otpExpires } },
      { upsert: true }
    )
    await sendOTP(email, otp);

    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "5m" });

    res.cookie("resetToken", resetToken, { httpOnly: true, maxAge: 5 * 60 * 1000 });

    res.redirect('/forgot-password/verify');
  }
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('There is some internal error, so please try again later');
  }
};

const verifyPasswordOtp = (req, res) => {
  try {
    const token = req.cookies.resetToken;
    if (!token) return res.redirect("/forgot-password");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    res.render("user/otp", { email, error: null, purpose: "reset" });

  }
  catch (error) {
    res.clearCookie("resetToken");
    res.redirect("/forgot-password");
  }
};

const postVerifyPasswordOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const token = req.cookies.resetToken;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const record = await PasswordReset.findOne({ email });
    if (!record || record.otp !== otp || record.otpExpires < Date.now()) {
      return res.render("user/otp", {email,error: "Invalid or expired OTP",purpose: "reset"});
    }

    await PasswordReset.deleteOne({ email });

    const allowResetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "10m" });
    res.cookie("allowResetToken", allowResetToken, { httpOnly: true, maxAge: 10 * 60 * 1000 });

    res.redirect("/reset-password");

  }
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('There is some internal error, so please try again later');
  }
};

const getResetPassword = (req, res) => {
  try {
    const token = req.cookies.allowResetToken;
    if (!token) return res.redirect("/forgot-password");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.render("user/resetPassword", { error: null });
  }
  catch (error) {
    res.clearCookie("allowResetToken");
    res.redirect("/forgot-password");
  }
};

const postResetPassword = async (req, res) => {
  try {
    const token = req.cookies.allowResetToken;
    const { email } = jwt.verify(token, process.env.JWT_SECRET);

    const { password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      return res.render("user/resetPassword", { error: "Passwords do not match" });
    }

    const hash = await bcrypt.hash(password, 10);
    await User.updateOne({ email }, { $set: { password: hash } });

    await TempUser.deleteOne({ email });
    res.clearCookie("allowResetToken");
    res.clearCookie("resetToken");

    res.redirect("/login");

  }
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('There is some internal error, so please try again later');
  }
};

module.exports = {
  signup,
  getVerifyOtp,
  postVerifyOtp,
  resendOtp,
  login,
  logout,
  loadHomePage,
  getSignup,
  getLogin,
  getShopPage,
  getProductDetails,
  getForgotPassword,
  postForgotPassword,
  verifyPasswordOtp,
  postVerifyPasswordOtp,
  getResetPassword,
  postResetPassword
};



