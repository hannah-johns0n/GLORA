const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const User = require('../../models/userModel');
const Product = require('../../models/productModel');
const Cart = require('../../models/cartModel');
const Category = require('../../models/categoryModel');
const TempUser = require('../../models/TempUser');
dotenv.config();
const PasswordReset = require('../../models/passwordResetModel');
const Address = require('../../models/addressModel');
const STATUS_CODES = require('../../constants/statusCodes');
const fs = require('fs');


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
    expiresIn: 300,
    purpose: "verify"    
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

res.redirect("/login?signupSuccess=1",);
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
    purpose: "verify"
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

    const userName = req.user ? req.user.name : null;

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
      return res.status(404).send('Product not found');
    }

    let userName = null;
    let user = null;
    let cartCount = 0;

    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const foundUser = await User.findById(decoded.id).select('name');
        if (foundUser) {
          userName = foundUser.name;
          user = foundUser;
        }

const cart = await Cart.findOne({ userId: decoded.id });
cartCount = cart ? cart.items.reduce((sum, p) => sum + p.quantity, 0) : 0;
console.log(cart)
      } catch (err) {
        console.error("JWT error:", err);
      }
    }

    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false
    }).limit(4);

    res.render('user/productDetails', {
      product,
      relatedProducts,
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
    const { otp, email } = req.body;   
    const record = await PasswordReset.findOne({ email });
    if (!record || record.otp !== otp || record.otpExpires < Date.now()) {
      return res.render("user/otp", {
        email,
        error: "Invalid or expired OTP",
        purpose: "reset"
      });
    }

    await PasswordReset.deleteOne({ email });

    res.render("user/resetPassword", { error : null, email });

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

    await PasswordReset.deleteOne({ email }).catch(() => {});
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
    res.render('user/add-address', { userName: req.user.name, fromCheckout });
};

const postAddAddress = async (req, res) => {
  try {
const user = await User.findById(req.user._id);
const addresses = await Address.find({ userId: req.user._id });

        const fromCheckout = req.body.fromCheckout === "true"; 

    if (!req.user.id) {
      return res.redirect('/login');
    }

    const { addressType, city, landmark, state, pincode, phoneNumber } = req.body;

    const noSpecialChars = /^[a-zA-Z0-9\s]+$/;

    if (!addressType || !city || !landmark || !state || !pincode || !phoneNumber) {
      return res.render('user/add-address', { 
        userName: req.user.name, 
        error: 'All fields are required.' 
      });
    }

    if (!noSpecialChars.test(addressType) || 
        !noSpecialChars.test(city) || 
        !noSpecialChars.test(landmark) || 
        !noSpecialChars.test(state)) {
      return res.render('user/add-address', { 
        userName: req.user.name, 
        error: 'No special characters allowed in Address Type, City, Landmark, or State.' 
      });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.render('user/add-address', { 
        userName: req.user.name, 
        error: 'Pincode must be exactly 6 digits.' 
      });
    }

    if (!/^\d{10}$/.test(phoneNumber)) {
      return res.render('user/add-address', { 
        userName: req.user.name, 
        error: 'Phone number must be exactly 10 digits.' 
      });
    }

    await Address.create({
      userId: req.user.id,
      addressType,
      city,
      landmark,
      state,
      pincode,
      phoneNumber
    });

if (fromCheckout) {
      return res.redirect('/checkout');
    }

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
      error: 'Server error. Failed to add address.' 
    });
  }
};

const getEditAddressPage = async (req, res) => {
    try {
        const address = await Address.findOne({ _id: req.params.id, userId: req.user._id }).lean();

        if (!address) return res.redirect('/manage-address');
        res.render('user/edit-address', { address, userName: req.user.name });
    } 
    catch (err) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server error");
    }
};

const postEditAddress = async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(STATUS_CODES.BAD_REQUEST).send("Unauthorized");
    }

    let { addressType, city, landmark, state, pincode, phoneNumber } = req.body;
    addressType = addressType?.trim();
    city = city?.trim();
    landmark = landmark?.trim();
    state = state?.trim();
    const pincodeStr = String(pincode).trim();
    const phoneStr = String(phoneNumber).trim();

    const onlyLetters = /^[a-zA-Z\s]+$/;

    if (!addressType || !city || !landmark || !state || !pincodeStr || !phoneStr) {
      return res.render('user/edit-address', { 
        address: { ...req.body, _id: req.params.id }, 
        error: 'All fields are required.', 
        userName: req.user.name 
      });
    }

    if (
      !onlyLetters.test(addressType) || 
      !onlyLetters.test(city) || 
      !onlyLetters.test(landmark) || 
      !onlyLetters.test(state)
    ) {
      return res.render('user/edit-address', { 
        address: { ...req.body, _id: req.params.id }, 
        error: 'Address Type, City, Landmark, and State must contain letters and spaces only.', 
        userName: req.user.name 
      });
    }

    if (!/^\d{6}$/.test(pincodeStr)) {
      return res.render('user/edit-address', { 
        address: { ...req.body, _id: req.params.id }, 
        error: 'Pincode must be exactly 6 digits.', 
        userName: req.user.name 
      });
    }

    if (!/^\d{10}$/.test(phoneStr)) {
      return res.render('user/edit-address', { 
        address: { ...req.body, _id: req.params.id }, 
        error: 'Phone number must be exactly 10 digits.', 
        userName: req.user.name 
      });
    }

    await Address.updateOne(
      { _id: req.params.id, userId: req.user._id },
      { 
        addressType, 
        city, 
        landmark, 
        state, 
        pincode: Number(pincodeStr), 
        phoneNumber: Number(phoneStr) 
      }
    );

    return res.render('user/edit-address', { 
      address: { ...req.body, _id: req.params.id }, 
      success: 'Address updated successfully!', 
      userName: req.user.name 
    });

  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server error");
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

        const otp = generateOTP();
        otpStore[userId] = { otp, newEmail: email, expires: Date.now() + 5 * 60 * 1000 };

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Change Email OTP',
            text: `Your OTP is ${otp}. It will expire in 5 minutes.`
        });

        console.log(`OTP for ${email} is ${otp}`);

        res.render('user/otp', { error: null, purpose: 'changeEmail', email});
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
        const stored = otpStore[userId];
console.log(req.body)
        if (!stored) {
            return res.render('user/otp', { 
                error: 'OTP expired. Try again.', 
                purpose: 'changeEmail',
                email,
                expiresIn: 300
            });
        }

        if (stored.otp !== otp || Date.now() > stored.expires) {
            return res.render('user/otp', { error: 'Invalid or expired OTP',purpose: 'changeEmail',email: stored.newEmail,expiresIn: Math.max(0, Math.floor((stored.expires - Date.now())/1000))
            });
        }

        await User.findByIdAndUpdate(userId, { email: stored.newEmail });

        delete otpStore[userId]; 

        return res.render("user/new-email", {   error: null,   userId });    

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



