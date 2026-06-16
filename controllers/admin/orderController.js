const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const STATUS_CODES = require('../../constants/statusCodes');

const getAllOrders = async (req, res) => {
  try {
    let { search, status, sort, page } = req.query;
    search = search || '';
    status = status || '';
    sort = sort || 'desc';
    page = parseInt(page) || 1;
    const limit = 10;

    const query = {};
    if (search) query.orderId = { $regex: search, $options: 'i' };
    if (status) query.status = status;

    const totalOrders = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: sort === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.render('admin/orders', {
      orders,
      search,
      status,
      sort,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('addressId');

    if (!order) return res.status(404).send('Order not found');
    res.render('admin/orderDetails', { order, req });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedTransitions = {
      'Pending': ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
      'Processing': ['Shipped', 'Delivered', 'Cancelled'],
      'Shipped': ['Delivered', 'Cancelled'],

      // Final statuses — nothing allowed after these via dropdown
      'Delivered': [],
      'Cancelled': [],
      'Returned': [],
      'Return-Rejected': [],
      'Return-Requested': []
    };

    const order = await Order.findById(req.params.id).populate('userId', 'name email');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const currentStatus = order.status;

    const finalStatuses = ['Delivered', 'Cancelled', 'Returned', 'Return-Rejected', 'Return-Requested'];
    if (finalStatuses.includes(currentStatus)) {
      return res.status(400).json({
        message: `Order is already ${currentStatus}. No further changes are allowed.`
      });
    }

    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Cannot move order from "${currentStatus}" to "${status}". `
          + `Allowed next status: ${allowed.length ? allowed.join(', ') : 'none'}`
      });
    }

    if (status === 'Delivered') {
      order.orderItems.forEach(item => {
        if (item.status !== 'Cancelled') {
          item.status = 'Delivered';
        }
      });
    }

    if (status === 'Cancelled') {
      const shouldRefund = ['Online', 'Wallet'].includes(order.paymentMethod)
        && order.paymentStatus === 'Paid';

      if (shouldRefund) {
        const refundAmount = Number(order.totalPrice);

        let wallet = await Wallet.findOne({ user: order.userId._id });
        if (!wallet) {
          wallet = new Wallet({ user: order.userId._id, balance: 0, transactions: [] });
        }

        wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
        wallet.transactions.push({
          amount: refundAmount,
          type: 'credit',
          description: `Refund for admin-cancelled order #${order.orderId}`,
          date: new Date()
        });
        await wallet.save();
      }

      for (const item of order.orderItems) {
        if (item.status !== 'Cancelled') {
          const product = await Product.findById(item.productId);
          if (product) {
            const variantIndex = item.variantIndex || 0;
            if (product.variants[variantIndex]) {
              product.variants[variantIndex].quantity += item.quantity;
              await product.save();
            }
          }
          item.status = 'Cancelled';
        }
      }
    }

    order.status = status;
    await order.save();

    return res.status(200).json({ message: 'Order status updated successfully!' });

  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};
const verifyReturnRequest = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Return-Requested') {
      return res.status(400).json({
        success: false,
        message: `No pending return request. Current status: ${order.status}`
      });
    }

    const action = req.query.action || req.body.action;
    if (!action || (action !== 'accept' && action !== 'reject')) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (action === 'accept') {
      const paidMethods = ['Online', 'Wallet'];
      const shouldRefund = (
        (['Online', 'Wallet'].includes(order.paymentMethod) && order.paymentStatus === 'Paid')
        || order.paymentMethod === 'COD'
      );

      if (shouldRefund) {
        const refundAmount = Number(order.totalPrice);

        let wallet = await Wallet.findOne({ user: order.userId._id });
        if (!wallet) {
          wallet = new Wallet({ user: order.userId._id, balance: 0, transactions: [] });
        }

        wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
        wallet.transactions.push({
          amount: refundAmount,
          type: 'credit',
          description: `Refund for returned order #${order.orderId}`,
          date: new Date()
        });
        await wallet.save();
      }

      for (const item of order.orderItems) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variantIndex = item.variantIndex || 0;
          if (product.variants[variantIndex]) {
            product.variants[variantIndex].quantity += item.quantity;
            await product.save();
          }
        }
      }

      order.status = 'Returned';
      if (order.returnRequest) {
        order.returnRequest.status = 'approved';
        order.returnRequest.processedAt = new Date();
        order.returnRequest.refundProcessed = shouldRefund;
      }

    } else {
      order.status = 'Return-Rejected';
      if (order.returnRequest) {
        order.returnRequest.status = 'rejected';
        order.returnRequest.processedAt = new Date();
      }
    }

    await order.save();

    return res.json({
      success: true,
      message: `Return request ${action === 'accept' ? 'accepted' : 'rejected'} successfully`
    });

  } catch (err) {
    console.error('verifyReturnRequest error:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

async function handleReturnAccept(order) {
  console.log('Processing return acceptance for order:', order.orderId);

  order.returnRequest = order.returnRequest || {
    status: 'pending',
    requestedAt: new Date(),
    processedAt: null,
    refundAmount: 0,
    refundMethod: 'wallet'
  };

  order.returnRequest.status = 'approved';
  order.returnRequest.processedAt = new Date();
  order.returnRequest.refundAmount = Number(order.totalPrice);
  order.returnRequest.refundMethod = order.paymentMethod === 'Online' ? 'wallet' : 'n/a';

  const shouldProcessRefund = (order.paymentMethod === 'Online' && order.paymentStatus === 'Paid') ||
    (order.paymentMethod === 'COD');

  if (shouldProcessRefund) {
    const refundAmount = Number(order.totalPrice);

    if (isNaN(refundAmount) || refundAmount <= 0) {
      throw new Error("Invalid refund amount");
    }

    try {
      let wallet = await Wallet.findOne({ user: order.userId._id });

      if (!wallet) {
        wallet = new Wallet({
          user: order.userId._id,
          balance: 0,
          transactions: []
        });
      }

      if (isNaN(wallet.balance)) {
        wallet.balance = 0;
      }

      wallet.transactions.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for returned order #${order.orderId}`,
        date: new Date()
      });

      wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
      await wallet.save();

      console.log(`Refund of ${refundAmount} processed for order #${order.orderId}`);
      order.returnRequest.refundStatus = 'completed';

    } catch (walletError) {
      console.error('Error processing wallet refund:', walletError);
      order.returnRequest.refundStatus = 'failed';
      order.returnRequest.refundError = walletError.message;
    }
  } else {
    order.returnRequest.refundStatus = 'not_required';
  }

  for (const item of order.orderItems) {
    try {
      const product = await Product.findById(item.productId);
      if (product) {
        const variantIndex = item.variantIndex || 0;
        if (product.variants[variantIndex]) {
          product.variants[variantIndex].quantity += item.quantity;
          await product.save();
        }
      }
    } catch (stockError) {
      console.error('Error updating product stock:', stockError);
    }
  }

  order.status = 'Returned';
  order.returnRequest.completedAt = new Date();

  await order.save();

  console.log(`Order ${order.orderId} marked as returned and wallet updated`);
}

const verifyItemReturn = async (req, res) => {
  try {
    const { id, productId } = req.params;
    const action = req.query.action;

    const order = await Order.findById(id).populate('userId', 'name email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderItems.find(i => i.productId.toString() === productId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.status !== 'Return-Requested') {
      return res.status(400).json({ success: false, message: 'No pending return for this item' });
    }

    if (action === 'accept') {
      const refundAmount = item.price * item.quantity;
      const paidMethods = ['Online', 'Wallet'];

      if ((['Online', 'Wallet'].includes(order.paymentMethod) && order.paymentStatus === 'Paid') || order.paymentMethod === 'COD') {
        let wallet = await Wallet.findOne({ user: order.userId._id });
        if (!wallet) {
          wallet = new Wallet({ user: order.userId._id, balance: 0, transactions: [] });
        }
        wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
        wallet.transactions.push({
          amount: refundAmount,
          type: 'credit',
          description: `Refund for returned item in order #${order.orderId}`,
          date: new Date()
        });
        await wallet.save();
      }

      const product = await Product.findById(item.productId);
      if (product) {
        const variantIndex = item.variantIndex || 0;
        if (product.variants[variantIndex]) {
          product.variants[variantIndex].quantity += item.quantity;
          await product.save();
        }
      }

      item.status = 'Returned';
      if (!item.returnRequest) {
        item.returnRequest = {};
      }
      item.returnRequest.status = 'approved';
      item.returnRequest.processedAt = new Date();

      const activeItems = order.orderItems.filter(i => i.status !== 'Cancelled');
      const allReturned = activeItems.every(i => i.status === 'Returned');
      if (allReturned) {
        order.status = 'Returned';
        if (order.returnRequest) {
          order.returnRequest.status = 'approved';
          order.returnRequest.processedAt = new Date();
        }
      }

    } else if (action === 'reject') {
      item.status = 'Delivered';
      if (!item.returnRequest) {
        item.returnRequest = {};
      }
      item.returnRequest.status = 'rejected';
      item.returnRequest.processedAt = new Date();
    }

    await order.save();
    return res.json({ success: true, message: `Item return ${action}ed successfully` });

  } catch (err) {
    console.error('verifyItemReturn error:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  verifyReturnRequest,
  verifyItemReturn
};