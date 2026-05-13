const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const Address = require('../../models/addressModel');
const User = require('../../models/userModel');
const STATUS_CODES = require('../../constants/statusCodes');
const PDFDocument = require('pdfkit');

const getMyOrders = async (req, res) => {
  try {
    const userId   = req.user.id;
    const userName = req.user.name;
    const search   = req.query.search || '';

    const orders = await Order.find({
      userId,
      orderId: { $regex: search, $options: 'i' }
    }).sort({ createdAt: -1 });

    res.render('user/my-orders', { orders, search, userName });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const getOrderDetails = async (req, res) => {
  const userName = req.user.name;
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId:  req.user.id
    }).populate('addressId'); 
    console.log('order.shipping:', order.shipping);
console.log('order.discount:', order.discount);
console.log('order.subtotal:', order.subtotal);
console.log('first item price:', order.orderItems[0]?.price);

    if (!order) return res.status(404).send('Order not found');
    res.render('user/order-details', { order, userName });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const userId     = req.user.id; 

    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId:  userId
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (order.status !== 'Pending' && order.status !== 'Processing') {
      return res.status(400).json({ message: 'Order cannot be cancelled at this stage.' });
    }

    if ((order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')
         && order.paymentStatus === 'Paid') {
      const refundAmount = Number(order.totalPrice);

      let wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
      }

      wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
      wallet.transactions.push({
        amount:      refundAmount,
        type:        'credit',
        description: `Refund for cancelled order #${order.orderId}`,
        date:        new Date()
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

    order.status             = 'Cancelled';
    order.cancellationReason = reason || 'No reason provided';
    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully!' +
        ((order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet')
          ? ' Refund has been processed to your wallet.' : '')
    });

  } catch (err) {
    console.error('cancelOrder error:', err);
    res.status(500).json({ message: 'Server Error. Failed to cancel the order.' });
  }
};


const cancelProduct = async (req, res) => {
  try {
    const { reason }            = req.body;
    const { orderId, productId } = req.params;

    const order = await Order.findOne({
      orderId: orderId,
      userId:  req.user.id 
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.orderItems.find(i => i.productId.toString() === productId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

    if (item.status === 'Cancelled' || item.status === 'Delivered') {
      return res.status(400).json({ success: false, message: 'This item cannot be cancelled' });
    }

    const product = await Product.findById(item.productId);
    if (product) {
      const variantIndex = item.variantIndex || 0;
      if (product.variants[variantIndex]) {
        product.variants[variantIndex].quantity += item.quantity;
        await product.save();
      }
    }

    item.status       = 'Cancelled';
    item.cancelReason = reason || 'No reason provided';
    await order.save();

    res.json({ success: true });

  } catch (err) {
    console.error('cancelProduct error:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { reason }             = req.body;
    const userId                 = req.user.id;

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    const item = order.orderItems.find(i => i.productId.toString() === productId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Item is not eligible for return' });
    }
    if (item.returnRequest && item.returnRequest.status === 'pending') {
      return res.status(400).json({ success: false, message: 'Return already requested for this item' });
    }

    item.status        = 'Return-Requested';
    item.returnRequest = {
      requestedAt: new Date(),
      reason:      reason || 'No reason provided',
      status:      'pending'
    };

    await order.save();
    return res.json({ success: true, message: 'Return request submitted for this item.' });

  } catch (err) {
    console.error('returnOrderItem error:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason }  = req.body;
    const userId      = req.user.id; 

    const order = await Order.findOne({ orderId, userId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.returnRequest) {
      return res.status(400).json({ success: false, message: 'Return already requested' });
    }
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    order.status        = 'Return-Requested';
    order.returnRequest = {
      requestedAt:     new Date(),
      status:          'pending',
      reason:          reason || 'No reason provided',
      refundProcessed: false
    };
    await order.save();

    return res.json({ success: true, message: 'Return request submitted successfully.' });

  } catch (err) {
    console.error('returnOrder error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process return request.' });
  }
};


const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId:  req.user._id
    })
    .populate('addressId')
    .populate('userId');

    if (!order) return res.status(404).send('Order not found');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    doc.fontSize(28).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica')
      .text(`Order ID: `, { continued: true }).font('Helvetica-Bold').text(order.orderId);
    doc.font('Helvetica')
      .text(`Date: `, { continued: true }).font('Helvetica-Bold').text(order.createdAt.toDateString());
    doc.font('Helvetica')
      .text(`Status: `, { continued: true }).font('Helvetica-Bold').text(order.status);
    doc.font('Helvetica')
      .text(`Payment: `, { continued: true }).font('Helvetica-Bold').text(order.paymentMethod || 'N/A');
    doc.moveDown(2);

    doc.font('Helvetica-Bold').text('Shipping Address:');
    doc.font('Helvetica')
      .text(`${order.addressId?.city || 'N/A'}, ${order.addressId?.state || 'N/A'}`)
      .text(`Pincode: ${order.addressId?.pincode || 'N/A'}`)
      .text(`Phone: ${order.addressId?.phoneNumber || 'N/A'}`);
    doc.moveDown(2);

    order.orderItems.forEach(item => {
      const price    = item.price    || 0;
      const quantity = item.quantity || 0;
      doc.font('Helvetica-Bold').text(item.name || 'Product');
      doc.font('Helvetica')
        .text(`Price: ₹${price.toFixed(2)}  |  Qty: ${quantity}  |  Subtotal: ₹${(price * quantity).toFixed(2)}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(14)
      .text(`Total: ₹${order.totalPrice?.toFixed(2) || '0.00'}`, { align: 'right' });
    doc.moveDown(3);
    doc.font('Helvetica-Oblique').fontSize(10)
      .text('Thank you for shopping with us!', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId      = req.user.id; 

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.paymentStatus = 'Paid';
    order.status        = 'Processing';
    await order.save();

    res.json({ success: true, orderId: order.orderId });
  } catch (err) {
    console.error('updatePaymentStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update payment status' });
  }
};

module.exports = {
    getMyOrders,
    getOrderDetails,
    cancelOrder,
    cancelProduct,
    returnOrder,
    downloadInvoice,
    updatePaymentStatus,
    returnOrderItem
}