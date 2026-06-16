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

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.JWT_SECRET) {
  throw new Error('Missing required environment variables: EMAIL_USER, EMAIL_PASS or JWT_SECRET');
}

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
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


exports.getHome = async (req, res) => {
  res.render('admin/home')
}

exports.getDashboard = async (req, res) => {
  try {
    const filter = req.query.filter || 'monthly';

    const totalCustomers = await User.countDocuments({ role: 'user' });
    const totalOrders = await Order.countDocuments({ status: { $ne: 'Cancelled' } });
    const totalProducts = await Product.countDocuments();

    const totalSales = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } }
    ]);

    const recentOrders = await Order.find({ status: { $ne: 'Cancelled' } })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    let revenueTrendData;
    let dateFormat;

    if (filter === 'daily') {
      revenueTrendData = await Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              day: { $dayOfMonth: "$createdAt" }
            },
            total: { $sum: "$totalPrice" }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
      ]);
      dateFormat = 'daily';
    } else if (filter === 'weekly') {
      revenueTrendData = await Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              week: { $week: "$createdAt" }
            },
            total: { $sum: "$totalPrice" }
          }
        },
        { $sort: { "_id.year": 1, "_id.week": 1 } }
      ]);
      dateFormat = 'weekly';
    } else if (filter === 'monthly') {
      revenueTrendData = await Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            total: { $sum: "$totalPrice" }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]);
      dateFormat = 'monthly';
    } else {
      revenueTrendData = await Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        {
          $group: {
            _id: { $year: "$createdAt" },
            total: { $sum: "$totalPrice" }
          }
        },
        { $sort: { "_id": 1 } }
      ]);
      dateFormat = 'yearly';
    }

    const chartLabels = revenueTrendData.map(item => {
      if (dateFormat === 'daily') {
        return `${item._id.day}/${item._id.month}/${item._id.year}`;
      } else if (dateFormat === 'weekly') {
        return `Week ${item._id.week}/${item._id.year}`;
      } else if (dateFormat === 'monthly') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[item._id.month - 1]} ${item._id.year}`;
      } else {
        return `${item._id}`;
      }
    });

    const chartData = revenueTrendData.map(item => item.total);

    const bestSellingProducts = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: {
            productId: "$orderItems.productId",
            variantIndex: "$orderItems.variantIndex"
          },
          totalQuantity: { $sum: "$orderItems.quantity" },
          totalRevenue: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id.productId",
          foreignField: "_id",
          as: "productData"
        }
      },
      { $unwind: "$productData" },
      {
        $project: {
          _id: 0,
          productId: "$_id.productId",
          productName: "$productData.productName",
          variantIndex: "$_id.variantIndex",
          variant: {
            $arrayElemAt: ["$productData.variants", "$_id.variantIndex"]
          },
          totalQuantity: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] }
        }
      }
    ]);

    const bestSellingCategories = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },

      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.productId",
          foreignField: "_id",
          as: "productInfo"
        }
      },

      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$productInfo.category",
          totalQuantity: { $sum: "$orderItems.quantity" },
          totalRevenue: {
            $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] }
          }
        }
      },

      { $sort: { totalQuantity: -1 } },

      { $limit: 3 },

      {
        $project: {
          _id: 0,
          category: "$_id",
          totalQuantity: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] }
        }
      }
    ]);

    res.render('admin/dashboard', {
      totalCustomers,
      totalOrders,
      totalProducts,
      totalSales: totalSales.length > 0 ? totalSales[0].total : 0,
      recentOrders: recentOrders.map(order => ({
        _id: order._id,
        customerName: order.userId?.name || "Unknown",
        date: order.createdAt.toDateString(),
        status: order.status,
        total: order.totalPrice
      })),
      chartLabels,
      chartData,
      bestSellingProducts,
      bestSellingCategories,
      currentFilter: filter
    });
  } catch (error) {
    console.log(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Failed to load dashboard');
  }
};


exports.listCustomers = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = {
      role: 'user',
      ...(search && {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const totalCustomers = await User.countDocuments(filter);

    const customers = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCustomers / limit) || 1;

    res.render('admin/customer', {
      customers,
      currentPage: page,
      totalPages,
      totalCustomers,
      search,
    });

  } catch (error) {
    console.error("Failed to load customers:", error);
    res.status(500).send("Failed to load customers");
  }
};

exports.customerPage = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = {
      role: 'user',
      ...(search && {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const totalCustomers = await User.countDocuments(filter);

    const customers = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCustomers / limit) || 1;

    res.render('admin/customer', {
      customers,
      currentPage: page,
      totalPages,
      totalCustomers,
      search,
    });

  } catch (error) {
    console.error('Failed to load customer page:', error);
    res.status(500).send('Failed to load customer page');
  }
};

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

    const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('adminJwt', token, {
      httpOnly: true,
      maxAge: 3600000
    });

    res.status(200).json({ message: 'successfully logined', success: true })

  }
  catch (error) {
    console.log(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).render('admin/login', { error: 'There was an internal error. Please try again later.' });

  }
};

exports.adminLogout = (req, res) => {
  res.clearCookie("adminJwt");
  res.render('admin/login');
};

