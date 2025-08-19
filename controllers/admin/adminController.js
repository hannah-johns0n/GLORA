const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../../models/userModel');
const TempUser = require('../../models/TempUser');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const Order = require('../../models/orderModel');
const STATUS_CODES = require('../../constants/statusCodes');
const categoryController = require('./categoryController');

if(!process.env.EMAIL_USER || !process.env.EMAIL_PASS ||!process.env.JWT_SECRET){
    throw new Error('Missing required environment variables: EMAIL_USER, EMAIL_PASS or JWT_SECRET');
}

const transporter = nodemailer.createTransport({
    service : 'Gmail',
    auth : {
        user : process.env.EMAIL_USER,
        pass : process.env.EMAIL_PASS,
    },
});

exports.getAdminLogin = (req, res) => {
  try {
    res.render('admin/login');
  } catch (error) {
    console.log(error);
    res.status(STATUS_CODES.BAD_REQUEST).send("Login page not found");
  }
};


exports.getHome = async (req,res) => {
    res.render('admin/home')
}

exports.getDashboard = async (req, res) => {
  try {
    res.render('admin/dashboard', {
      totalCustomers: 0,
      totalOrders: 0,
      totalProducts: 0,
      totalSales: 0,
      recentOrders: []
    });
  } 
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Failed to load dashboard');
  }
}

exports.listCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    
    const totalCustomers = await User.countDocuments({ role: 'user' });
    const totalPages = Math.ceil(totalCustomers / limit);
    
    const customers = await User.find({ role: 'user' }).skip(skip).limit(limit).lean();
      
    res.render('admin/customer', { 
      customers,
      currentPage: page,
      totalPages,
      totalCustomers
    });
  } 
  catch (error) {
    console.error('Error fetching customers:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Failed to load customers');
  }
}

exports.customerPage = async (req, res) => {
  try {
    res.render('admin/customer', { customers: [] }); 
  } 
  catch (error) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Failed to load customer page');
  }
}

exports.categoryPage = async (req, res) => {
  try {
    await categoryController.categoryInfo(req, res);
  } 
  catch (error) {
    console.log(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Failed to load category page');
  }
}


exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(req.body);
    

    if (!email || !password) {
      return res.render('admin/login', { error: 'Email and password are required' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.render('admin/login', { error: 'Invalid email format' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.render('admin/login', { error: 'Invalid Credentials' });
    };

    if (user.role !== 'admin') {
      return res.render('admin/login', { error: 'Admin access required' });
    }

    if (user.isBlocked) {
      return res.render('admin/login', { error: 'Your account has been blocked' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('admin/login', { error: 'Invalid Credentials' });
    }

    const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin },process.env.JWT_SECRET,{ expiresIn: '1h' });

    res.cookie('adminJwt', token, {
      httpOnly: true,
      maxAge: 3600000 
    });

    res.status(200).json({ message: 'successfully logined' , success: true })

  } 
  catch (error) {
     console.log(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).render('admin/login', {error: 'There was an internal error. Please try again later.'});
   
  }
};

exports.adminLogout = (req, res) => {
    res.clearCookie("adminJwt");
    res.render('admin/login');
};

