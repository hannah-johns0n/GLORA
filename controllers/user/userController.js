const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const User = require('../../models/userModel');
const Product = require('../../models/productModel');
const Cart = require('../../models/cartModel');
const Category = require('../../models/categoryModel');
const TempUser = require('../../models/TempUser');
const Wishlist = require('../../models/wishlistModel');
const Address = require('../../models/addressModel');
const Order = require('../../models/orderModel');
const Coupon = require('../../models/coupensModel');
const STATUS_CODES = require('../../constants/statusCodes');
const Wallet = require('../../models/walletModel');
const fs = require('fs');

dotenv.config();
const PasswordReset = require('../../models/passwordResetModel');

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
  const { name, email, password, confirmPassword, phoneNumber, referralCode } = req.body;

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex  = /^[A-Za-z ]+$/;

if (!nameRegex.test(name) || name.trim().startsWith(' ')) {
  return res.render("user/signup", { error: "Invalid name. No special characters allowed." });
}

if (!emailRegex.test(email)) {
  return res.render("user/signup", { error: "Invalid email format." });
}

if (!/^\d{10}$/.test(phoneNumber)) {
  return res.render("user/signup", { error: "Phone number must be exactly 10 digits." });
}

if (password.length < 8) {
  return res.render("user/signup", { error: "Password must be at least 8 characters." });
}

    let validReferralCode = null;

    if (referralCode && referralCode.trim() !== "") {
      const referrer = await User.findOne({ referralCode: referralCode.trim().toUpperCase() });
      if (referrer) {
        validReferralCode = referralCode.trim().toUpperCase(); 
      }
    }

    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);

    await TempUser.deleteOne({ email });

    await TempUser.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      otp,
      otpExpires: expiresAt,
      referredBy: validReferralCode  
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Email",
      html: `<h2>Your OTP is <strong>${otp}</strong></h2><p>Expires in 3 minutes.</p>`
    });

    res.redirect(`/verify-otp?email=${email}`);

  } catch (error) {
    console.log("Signup error:", error);
    res.render("user/signup", { error: "Internal server error" });
  }
};

const getVerifyOtp = async (req, res) => {
  const { email } = req.query;
  const tempUser = await TempUser.findOne({ email });
  console.log(`OTP for ${email}: ${tempUser.otp}`);

  const now = Date.now();
  const expiryTime = new Date(tempUser.otpExpires).getTime();
  const remainingMs = Math.max(0, expiryTime - now);
  const remainingSeconds = Math.floor(remainingMs / 1000);

  const viewData = {
    email,
    error: null,
    expiresIn: remainingSeconds,
    purpose: "verify"
  };
  res.render("user/otp", viewData);
};

const creditWallet = async (userId, amount, description) => {
  let wallet = await Wallet.findOne({ user: userId });

  if (!wallet) {
    wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
  }

  wallet.balance += amount;
  wallet.transactions.push({
    type: "credit",
    amount: amount,
    description: description
  });

  await wallet.save();
};

const postVerifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  const tempUser = await TempUser.findOne({ email });

  if (!tempUser) {
    return res.render("user/otp", {
      email,
      error: "No OTP found for this email",
      expiresIn: 0,
      purpose: "verify"
    });
  }

  if (tempUser.otp !== otp || tempUser.otpExpires < new Date()) {
    const now = Date.now();
    const expiryTime = new Date(tempUser.otpExpires).getTime();
    const remainingMs = Math.max(0, expiryTime - now);
    const remainingSeconds = Math.floor(remainingMs / 1000);

    return res.render("user/otp", {
      email,
      error: "Invalid or expired OTP",
      expiresIn: remainingSeconds,
      purpose: "verify"
    });
  }

  const generateReferralCode = (name) => {
    const cleanName = name.replace(/\s+/g, '').toUpperCase().slice(0, 5);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return cleanName + randomNum;
  };

  const newUser = await User.create({
    name: tempUser.name,
    email: tempUser.email,
    password: tempUser.password,
    phoneNumber: tempUser.phoneNumber,
    referralCode: generateReferralCode(tempUser.name)
  });

  if (tempUser.referredBy) {
    const referrer = await User.findOne({ referralCode: tempUser.referredBy });

    if (referrer) {
      referrer.redeemedUser.push(newUser._id);
      await referrer.save();

      await creditWallet(
        referrer._id,
        200,
        `Referral reward for referring ${newUser.name}`
      );

      await creditWallet(
        newUser._id,
        80,
        "Welcome bonus for signing up via referral"
      );
    }
  }

  await TempUser.deleteOne({ email });

  res.redirect("/login?signupSuccess=1");
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

  // Calculate remaining time (5 minutes = 300 seconds)
  const remainingSeconds = 300;

  const viewData = {
    email,
    error: null,
    expiresIn: remainingSeconds,
    purpose: "verify"
  };

  await transporter.sendMail({
    to: email,
    subject: 'Resend OTP - Email Verification',
    html: `<h2>Your new OTP is: ${otp}</h2><p>Expires in 5 minutes</p>`,
  });

  res.render("user/otp", viewData);

};

const getLogin = (req, res) => {
  try {
    const signupSuccess = req.query.signupSuccess === "1";
    res.render("user/login", { signupSuccess });
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
    res.redirect('/');

    const categories = await Category.find({ isBlocked: false });
    const products = await Product.find({}).sort({ createdAt: -1 }).limit(8);

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
      } catch (err) {
        userName = null;
        user = null;
      }
    }

    const categories = await Category.find({ isBlocked: false });


let bestSellers = [];

const bestSellerAgg = await Order.aggregate([
  
  { $match: { status: { $ne: 'Cancelled' } } },
  { $unwind: '$orderItems' },
  
  { $match: { 'orderItems.status': { $nin: ['Cancelled', 'Returned', 'Return-Rejected'] } } },
  {
    $group: {
      _id: '$orderItems.productId',
      totalSold: { $sum: '$orderItems.quantity' }
    }
  },
  { $sort: { totalSold: -1 } },
  { $limit: 8 }
]);

if (bestSellerAgg.length > 0) {

  const bestSellerIds = bestSellerAgg.map(item => item._id);

  const bestSellersFromDb = await Product.find({
    _id: { $in: bestSellerIds },
    isBlocked: false
  });

  bestSellers = bestSellerIds
    .map(id => bestSellersFromDb.find(p => p._id.toString() === id.toString()))
    .filter(Boolean);
}

if (bestSellers.length === 0) {
  bestSellers = await Product.find({ isBlocked: false })
    .sort({ createdAt: -1 })
    .limit(8);
}

    const newLaunches = await Product.find({ isBlocked: false })
      .sort({ createdAt: -1 })
      .limit(8);

    res.render('user/home', {
      userName,
      user,
      categories,
      bestSellers,
      newLaunches,
      loginSuccess: false
    });

  } catch (error) {
    console.error("Home page error:", error);
    res.render("user/home", {
      userName: null,
      user: null,
      categories: [],
      bestSellers: [],
      newLaunches: [],
      loginSuccess: false
    });
  }
};

const getAbout = (req, res) => {
  let userName = null;
  const token = req.cookies.jwt;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userName = decoded.name || null;
    }
    catch (err) {
      userName = null;
      user = null;
    }
  }
  res.render("user/aboutUs"), { userName };
};

const getContact = (req, res) => {
  let userName = null;
  const token = req.cookies.jwt;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userName = decoded.name || null;
    } catch (err) {
      userName = null;
    }
  }
  res.render("user/contactUs", { userName, url: '/contact' });
};

const getShopPage = async (req, res) => {
  const sort = req.query.sort || '';

  let loggedInUserId = null;
  let userName = null;
  try {
    const token = req.cookies.jwt;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      loggedInUserId = decoded.id || null;
      userName = decoded.name || null;
    }
  } catch (e) {
  }

  try {
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const unblockedCategories = await Category.find({ isBlocked: false }).select('categoryName');
    const unblockedCategoryNames = unblockedCategories.map(c => c.categoryName);

    const filter = {
      isBlocked: { $ne: true },
      category: { $in: unblockedCategoryNames },
      'variants.salesPrice': { $gte: minPrice, ...(maxPrice !== Infinity && { $lte: maxPrice }) }
    };

    if (category !== 'all') filter.category = category;
    if (search) filter.productName = { $regex: search, $options: 'i' };

    const sortOption = {};
    if (sort === 'az') sortOption.productName = 1;
    else if (sort === 'za') sortOption.productName = -1;
    else if (sort === 'priceLowHigh') sortOption['variants.salesPrice'] = 1;
    else if (sort === 'priceHighLow') sortOption['variants.salesPrice'] = -1;

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    let products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    products = products.map(p => p.toObject());

    if (loggedInUserId) {
      const wishlistItems = await Wishlist.find({
        userId: loggedInUserId,
        productId: { $in: products.map(p => p._id) }
      });
      const wishlistSet = new Set(wishlistItems.map(i => i.productId.toString()));
      products = products.map(p => ({ ...p, inWishlist: wishlistSet.has(p._id.toString()) }));
    } else {
      products = products.map(p => ({ ...p, inWishlist: false }));
    }

    res.render('user/shop', {
      products,
      categories: unblockedCategories,
      currentPage: page,
      totalPages,
      search,
      selectedCategory: category,
      minPrice,
      maxPrice: maxPrice === Infinity ? '' : maxPrice,
      selectedSort: sort,
      sort,
      path: '/shop',
      userName,
      url: req.originalUrl
    });

  } catch (error) {
    console.error('Shop page error:', error);
    res.render('user/shop', {
      url: req.originalUrl,
      userName,
      categories: [],
      products: [],
      currentPage: 1,
      totalPages: 1,
      selectedCategory: 'all',
      selectedSort: sort,
      search: '',
      minPrice: 0,
      maxPrice: '',
      sort: ''
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product || product.isBlocked) {
      return res.status(404).send('Product not found');
    }
    let userName = null;
    let user = null;
    let cartCount = 0;
    let userId = null;

    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const foundUser = await User.findById(decoded.id).select('name');
        if (foundUser) {
          userName = foundUser.name;
          user = foundUser;
          userId = decoded.id;
        }

        const cart = await Cart.findOne({ userId: decoded.id });
        cartCount = cart ? cart.items.reduce((sum, p) => sum + p.quantity, 0) : 0;
      } catch (err) {
        console.error("JWT error:", err);
      }
    }

    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false
    }).limit(4);

    let productObj = product.toObject();
    productObj.inWishlist = false;
    let similarWithWishlist = relatedProducts.map(p => ({ ...p.toObject(), inWishlist: false }));

    if (userId) {
      const mainWishlist = await Wishlist.findOne({ userId, productId });
      productObj.inWishlist = !!mainWishlist;

      const similarIds = relatedProducts.map(p => p._id);
      const wishlistedSimilar = await Wishlist.find({
        userId,
        productId: { $in: similarIds }
      }).select('productId');

      const wishlistedSet = new Set(wishlistedSimilar.map(w => w.productId.toString()));
      similarWithWishlist = relatedProducts.map(p => ({
        ...p.toObject(),
        inWishlist: wishlistedSet.has(p._id.toString())
      }));
    }

    res.render('user/productDetails', {
      product: productObj,
      similarProducts: similarWithWishlist,
      userName,
      user,
      url: req.originalUrl,
      cartCount
    });

  } catch (error) {
    console.error('Product details error:', error);
    res.status(500).send('Internal Server Error');
  }
};

const getForgotPassword = (req, res) => {
  try {
    res.render('user/forgotPassword', { error: null });
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

    const remainingSeconds = 300;

    res.render("user/otp", {
      email,
      error: null,
      expiresIn: remainingSeconds,
      purpose: "reset"
    });

  }
  catch (error) {
    res.clearCookie("resetToken");
    res.redirect("/forgot-password");
  }
};

const postVerifyPasswordOtp = async (req, res) => {
  try {
    const { otp, email } = req.body;
    const record = await PasswordReset.findOne({ email });

    if (!record || record.otp !== otp || record.otpExpires < Date.now()) {
      let remainingSeconds = 0;
      if (record && record.otpExpires) {
        const now = Date.now();
        const remainingMs = Math.max(0, record.otpExpires - now);
        remainingSeconds = Math.floor(remainingMs / 1000);
      }

      return res.render("user/otp", {
        email,
        error: "Invalid or expired OTP",
        expiresIn: remainingSeconds,
        purpose: "reset"
      });
    }

    await PasswordReset.deleteOne({ email });

    res.render("user/resetPassword", { error: null, email });

  } catch (error) {
    console.error(error);
    res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .send("There is some internal error, so please try again later");
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
    const { email, password, confirmPassword } = req.body;

    const user = await User.findOne({ email });
    if (user && user.googleId && !user.password) {
      return res.render("user/resetPassword", {
        error: "Password reset is not available for Google-authenticated accounts.",
        email: ""
      });
    }

    if (!email) {
      return res.render("user/resetPassword", {
        error: "Time expired. Please restart the reset flow.",
        email: ""
      });
    }

    if (!password || !confirmPassword) {
      return res.render("user/resetPassword", {
        error: "Both fields are required.",
        email
      });
    }

    if (password !== confirmPassword) {
      return res.render("user/resetPassword", {
        error: "Passwords do not match.",
        email
      });
    }

    const hash = await bcrypt.hash(password, 10);

    let updated = await User.updateOne({ email }, { $set: { password: hash } });
    if (!updated.matchedCount) {
      updated = await TempUser.updateOne({ email }, { $set: { password: hash } });
      if (!updated.matchedCount) {
        return res.render("user/resetPassword", {
          error: "Account not found for this email.",
          email
        });
      }
    }

    await PasswordReset.deleteOne({ email }).catch(() => { });
    res.clearCookie("allowResetToken");
    res.clearCookie("resetToken");

    return res.render("user/resetPassword", {
      error: null,
      email: "",
      success: true
    });
  }
  catch (error) {
    console.error("postResetPassword error:", error);
    return res.render("user/resetPassword", {
      error: "Something went wrong. Please try again.",
      email: req.body.email || ""
    });
  }
};

const getProfilePage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const success = req.query.success || null;

    res.render('user/profile', {
      user,
      userName: user?.name || 'User'
    });
  } catch (err) {
    res.redirect('user/profile');
  }
};

const getEditProfilePage = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    res.render('user/editProfile', {
      user
    });
  } catch (error) {
    console.error('Error in getEditProfilePage:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Internal Server Error');
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, phoneNumber } = req.body;

    if (!name || !phoneNumber) {
      return res.status(STATUS_CODES.BAD_REQUEST).send({ success: false, message: "Name and phone are required!" });
    }

    if (phoneNumber.length !== 10 || isNaN(phoneNumber)) {
      return res.status(STATUS_CODES.BAD_REQUEST).send({ success: false, message: "Phone must be a valid 10-digit number!" });
    }

    let user = await User.findById(userId);
    user.name = name;
    user.phoneNumber = phoneNumber;
    await user.save();

    return res.json({ success: true, message: "Profile updated successfully!" });
  } catch (error) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
  }
};

const getManageAddressPage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const addresses = await Address.find({ userId: req.user._id });

    const success = req.query.deleted ? 'Address deleted successfully!' : null;

    res.render('user/manage-address', {
      user,
      userName: user.name,
      addresses,
      success
    });
  }
  catch (error) {
    res.redirect('/profile');
  }
};

const getAddAddressPage = (req, res) => {
  const fromCheckout = req.query.fromCheckout === "true";
  res.render('user/add-address', {
    userName: req.user.name,
    fromCheckout: fromCheckout ? 'true' : 'false'
  });
};

const postAddAddress = async (req, res) => {
  try {
    if (!req.user.id) return res.redirect('/login');

    const fromCheckout = req.body.fromCheckout === "true";

    const addressType  = req.body.addressType?.trim();
    const city         = req.body.city?.trim();
    const landmark     = req.body.landmark?.trim();
    const state        = req.body.state?.trim();
    const pincodeStr   = String(req.body.pincode || '').trim();
    const phoneStr     = String(req.body.phoneNumber || '').trim();

    const renderError = (error) =>
      res.render('user/add-address', {
        userName: req.user.name,
        fromCheckout: fromCheckout ? 'true' : 'false',
        formData: { addressType, city, landmark, state, pincode: pincodeStr, phoneNumber: phoneStr },
        error
      });

    if (!addressType || !city || !landmark || !state || !pincodeStr || !phoneStr) {
      return renderError('All fields are required and cannot be blank or spaces only.');
    }

    const onlyLetters = /^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/;

    if (!onlyLetters.test(addressType)) {
      return renderError('Address Type must contain letters only (no numbers or special characters).');
    }
    if (!onlyLetters.test(city)) {
      return renderError('City must contain letters only (no numbers or special characters).');
    }
    if (!onlyLetters.test(landmark)) {
      return renderError('Landmark must contain letters only (no numbers or special characters).');
    }
    if (!onlyLetters.test(state)) {
      return renderError('State must contain letters only (no numbers or special characters).');
    }

    if (!/^[1-9]\d{5}$/.test(pincodeStr)) {
      return renderError('Pincode must be exactly 6 digits and cannot start with 0.');
    }

    if (!/^[6-9]\d{9}$/.test(phoneStr)) {
      return renderError('Phone number must be 10 digits and start with 6, 7, 8, or 9.');
    }

    await Address.create({
      userId: req.user.id,
      addressType,
      city,
      landmark,
      state,
      pincode: Number(pincodeStr),
      phoneNumber: Number(phoneStr)
    });

    if (fromCheckout) return res.redirect('/checkout');

    const user      = await User.findById(req.user._id);
    const addresses = await Address.find({ userId: req.user._id });

    return res.render('user/manage-address', {
      user,
      userName: user.name,
      addresses,
      success: 'Address added successfully!'
    });

  } catch (err) {
    console.error(err);
    res.status(500).render('user/add-address', {
      userName: req.user.name,
      fromCheckout: req.body.fromCheckout || 'false',
      error: 'Server error. Please try again.'
    });
  }
};

const getEditAddressPage = async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!address) return res.redirect('/manage-address');
    res.render('user/edit-address', { address, userName: req.user.name });
  } catch (err) {
    res.status(500).send("Server error");
  }
};

const postEditAddress = async (req, res) => {
  try {
    if (!req.user._id) return res.status(401).send("Unauthorized");

    const addressType  = req.body.addressType?.trim();
    const city         = req.body.city?.trim();
    const landmark     = req.body.landmark?.trim();
    const state        = req.body.state?.trim();
    const pincodeStr   = String(req.body.pincode || '').trim();
    const phoneStr     = String(req.body.phoneNumber || '').trim();

    const renderError = (error) =>
      res.render('user/edit-address', {
        address: { ...req.body, _id: req.params.id },
        error,
        userName: req.user.name
      });

    if (!addressType || !city || !landmark || !state || !pincodeStr || !phoneStr) {
      return renderError('All fields are required and cannot be blank or spaces only.');
    }

    const onlyLetters = /^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/;

    if (!onlyLetters.test(addressType)) {
      return renderError('Address Type must contain letters only.');
    }
    if (!onlyLetters.test(city)) {
      return renderError('City must contain letters only (no numbers or special characters).');
    }
    if (!onlyLetters.test(landmark)) {
      return renderError('Landmark must contain letters only (no numbers or special characters).');
    }
    if (!onlyLetters.test(state)) {
      return renderError('State must contain letters only (no numbers or special characters).');
    }

    if (!/^[1-9]\d{5}$/.test(pincodeStr)) {
      return renderError('Pincode must be exactly 6 digits and cannot start with 0.');
    }

    if (!/^[6-9]\d{9}$/.test(phoneStr)) {
      return renderError('Phone number must be 10 digits and start with 6, 7, 8, or 9.');
    }

    await Address.updateOne(
      { _id: req.params.id, userId: req.user._id },
      { addressType, city, landmark, state, pincode: Number(pincodeStr), phoneNumber: Number(phoneStr) }
    );

    return res.render('user/edit-address', {
      address: { ...req.body, _id: req.params.id },
      success: 'Address updated successfully!',
      userName: req.user.name
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

const deleteAddress = async (req, res) => {
  try {
    await Address.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.redirect('/manage-address?deleted=true');
  }
  catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getChangeEmailPage = (req, res) => {
  if (req.user && req.user.googleId && !req.user.password) {
    return res.render('user/change-email', {
      error: 'Email change is not available for Google-authenticated accounts.'
    });
  }
  res.render('user/change-email', { error: null });
};

const getVerifyEmailOtpPage = (req, res) => {
  res.render('user/otp', { error: null });
};

let otpStore = {};

const sendChangeEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user?._id || req.user?.id;

    const user = await User.findById(userId);
    if (user && user.googleId && !user.password) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: 'Email change is not available for Google-authenticated accounts.'
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 3 * 60 * 1000;
    otpStore[userId] = { otp, newEmail: email, expires: expiresAt };

    const remainingSeconds = 180;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Change Email OTP',
      text: `Your OTP is ${otp}. It will expire in 3 minutes.`
    });

    console.log(`OTP for ${email} is ${otp}`);

    res.render('user/otp', {
      error: null,
      purpose: 'changeEmail',
      email,
      expiresIn: remainingSeconds
    });
  }
  catch (error) {
    console.error('Error sending OTP:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Error sending OTP');
  }
};

const verifyChangeEmailOtp = async (req, res) => {
  try {
    const { otp, email } = req.body;
    const userId = req.user?._id || req.user?.id;

    const user = await User.findById(userId);
    if (user && user.googleId && !user.password) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: 'Email change is not available for Google-authenticated accounts.'
      });
    }

    const stored = otpStore[userId];
    console.log(req.body)

    if (!stored) {
      return res.render('user/otp', {
        error: 'OTP expired. Try again.',
        purpose: 'changeEmail',
        email,
        expiresIn: 0
      });
    }

    if (stored.otp !== otp || Date.now() > stored.expires) {
      const now = Date.now();
      const remainingMs = Math.max(0, stored.expires - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      return res.render('user/otp', {
        error: 'Invalid or expired OTP',
        purpose: 'changeEmail',
        email: stored.newEmail,
        expiresIn: remainingSeconds
      });
    }

    await User.findByIdAndUpdate(userId, { email: stored.newEmail });

    delete otpStore[userId];

    return res.render("user/new-email", { error: null, userId });

  }
  catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Error verifying OTP');
  }
};

const saveNewEmail = async (req, res) => {
  try {
    const { newEmail, confirmEmail } = req.body;
    const userId = req.user._id;

    if (!newEmail || !confirmEmail) {
      return res.render("user/new-email", {
        error: "Both fields are required!",
        newEmail
      });
    }

    if (newEmail !== confirmEmail) {
      return res.render("user/new-email", {
        error: "Emails do not match!",
        newEmail
      });
    }

    await User.findByIdAndUpdate(userId, { email: newEmail });

    delete otpStore[userId];

    return res.redirect("/profile?success=Email changed successfully!");

  } catch (err) {
    console.error("Error saving new email:", err);
    return res.render("user/new-email", {
      error: "Something went wrong. Try again.",
      newEmail: req.body.newEmail
    });
  }
};

const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.query;

    const user = await User.findOne({ email }) || await TempUser.findOne({ email });
    if (!user) {
      return res.redirect('/forgot-password');
    }

    const otp = generateOTP();
    const otpExpires = Date.now() + 5 * 60 * 1000;
    console.log(`Generated OTP for ${email}: ${otp}`);
    await PasswordReset.updateOne(
      { email },
      { $set: { otp, otpExpires } },
      { upsert: true }
    );

    await sendOTP(email, otp);

    const remainingSeconds = 300;

    res.render("user/otp", {
      email,
      error: null,
      expiresIn: remainingSeconds,
      purpose: "reset"
    });
  } catch (error) {
    console.error(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('There is some internal error, so please try again later');
  }
};

const resendChangeEmailOtp = async (req, res) => {
  try {
    const { email } = req.query;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.redirect('/profile');
    }

    const user = await User.findById(userId);
    if (user && user.googleId && !user.password) {
      return res.render('user/change-email', {
        error: 'Email change is not available for Google-authenticated accounts.'
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 3 * 60 * 1000;
    otpStore[userId] = { otp, newEmail: email, expires: expiresAt };

    const remainingSeconds = 180;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Change Email OTP',
      text: `Your OTP is ${otp}. It will expire in 3 minutes.`
    });

    console.log(`OTP for ${email} is ${otp}`);

    res.render('user/otp', {
      error: null,
      purpose: 'changeEmail',
      email,
      expiresIn: remainingSeconds
    });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Error resending OTP');
  }
};


module.exports = {
  signup,
  getVerifyOtp,
  postVerifyOtp,
  resendOtp,
  resendForgotPasswordOtp,
  resendChangeEmailOtp,
  login,
  logout,
  loadHomePage,
  getAbout,
  getContact,
  getSignup,
  getLogin,
  getShopPage,
  getProductDetails,
  getForgotPassword,
  postForgotPassword,
  verifyPasswordOtp,
  postVerifyPasswordOtp,
  getResetPassword,
  postResetPassword,
  getProfilePage,
  getEditProfilePage,
  updateProfile,
  getManageAddressPage,
  getAddAddressPage,
  postAddAddress,
  getEditAddressPage,
  postEditAddress,
  deleteAddress,
  updateProfile,
  verifyChangeEmailOtp,
  sendChangeEmailOtp,
  getChangeEmailPage,
  getVerifyEmailOtpPage,
  saveNewEmail
};



