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

    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    doc.rect(margin, 40, contentWidth, 60).fill('#2C1810');
    doc.fillColor('#FFFFFF')
      .fontSize(24).font('Helvetica-Bold')
      .text('GLORA', margin + 20, 50);
    doc.fontSize(11).font('Helvetica')
      .text('Premium Ecommerce Store', margin + 20, 80);

    const rightColX = pageWidth - margin - 150;
    doc.fillColor('#000000')
      .fontSize(16).font('Helvetica-Bold')
      .text('INVOICE', margin, 115);

    doc.fontSize(9).font('Helvetica');
    const invoiceDetailY = 115;
    doc.text(`Invoice #: ${order.orderId.slice(0, 8).toUpperCase()}`, rightColX, invoiceDetailY);
    doc.text(`Order ID: ${order.orderId}`, rightColX, invoiceDetailY + 16);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, rightColX, invoiceDetailY + 32);
    doc.text(`Status: ${order.status}`, rightColX, invoiceDetailY + 48);

    doc.moveDown(4);

    const sectionY = doc.y;
    const colWidth = (contentWidth - 10) / 2;

    doc.fontSize(11).font('Helvetica-Bold').text('CUSTOMER DETAILS', margin, sectionY);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Name: ${order.userId?.name || 'N/A'}`, margin, sectionY + 20);
    doc.text(`Email: ${order.userId?.email || 'N/A'}`, margin, sectionY + 36);
    doc.text(`Phone: ${order.addressId?.phoneNumber || 'N/A'}`, margin, sectionY + 52);

    const rightX = margin + colWidth + 10;
    doc.fontSize(11).font('Helvetica-Bold').text('SHIPPING ADDRESS', rightX, sectionY);
    doc.fontSize(9).font('Helvetica');
    doc.text(`${order.addressId?.address || 'N/A'}`, rightX, sectionY + 20);
    doc.text(`${order.addressId?.city || 'N/A'}, ${order.addressId?.state || 'N/A'} ${order.addressId?.pincode || 'N/A'}`, rightX, sectionY + 36);

    doc.moveDown(5);

    const orderInfoY = doc.y;
    doc.fontSize(11).font('Helvetica-Bold').text('ORDER INFORMATION', margin);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, margin, orderInfoY + 20);
    doc.text(`Payment Method: ${order.paymentMethod || 'N/A'}`, margin, orderInfoY + 36);
    doc.text(`Payment Status: ${order.paymentStatus || 'N/A'}`, rightX, orderInfoY + 20);
    doc.text(`Order Status: ${order.status}`, rightX, orderInfoY + 36);

    doc.moveDown(3);

    const tableY = doc.y;
    const tableHeaderBg = '#4A2C1A';
    const tableHeaderHeight = 24;
    const tableRowHeight = 22;

    doc.rect(margin, tableY, contentWidth, tableHeaderHeight).fill(tableHeaderBg);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');

    const col1 = margin + 5;
    const col2 = col1 + 180;
    const col3 = col2 + 70;
    const col4 = col3 + 60;
    const col5 = col4 + 60;
    const col6 = col5 + 65;

    doc.text('Product', col1, tableY + 6);
    doc.text('Variant', col2, tableY + 6);
    doc.text('Unit Price', col3, tableY + 6);
    doc.text('Qty', col4, tableY + 6);
    doc.text('Item Total', col5, tableY + 6);

    let currentY = tableY + tableHeaderHeight;
    let rowIndex = 0;

    order.orderItems.forEach(item => {
      const rowBg = rowIndex % 2 === 0 ? '#F9F6F4' : '#FFFFFF';
      doc.rect(margin, currentY, contentWidth, tableRowHeight).fill(rowBg);

      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      const itemTotal = (item.price * item.quantity).toFixed(2);

      doc.text(item.name || 'Product', col1, currentY + 7, { width: 175, ellipsis: true });
      doc.text(item.unit || 'N/A', col2, currentY + 7, { width: 65, ellipsis: true });
      doc.text(`₹${(item.price || 0).toFixed(2)}`, col3, currentY + 7, { align: 'right', width: 55 });
      doc.text(item.quantity, col4, currentY + 7, { align: 'center', width: 55 });
      doc.text(`₹${itemTotal}`, col5, currentY + 7, { align: 'right', width: 60 });

      doc.strokeColor('#DDDDDD').lineWidth(0.5);
      doc.rect(margin, currentY, contentWidth, tableRowHeight).stroke();

      currentY += tableRowHeight;
      rowIndex++;
    });

    doc.moveDown(2);

    const summaryX = pageWidth - margin - 180;
    const summaryY = doc.y + 20;

    doc.fontSize(9).font('Helvetica');
    doc.text('Subtotal:', summaryX, summaryY);
    doc.text(`₹${(order.subtotal || 0).toFixed(2)}`, summaryX + 100, summaryY, { align: 'right', width: 70 });

    if (order.discount && order.discount > 0) {
      doc.text('Product Discount:', summaryX, summaryY + 18);
      doc.text(`-₹${order.discount.toFixed(2)}`, summaryX + 100, summaryY + 18, { align: 'right', width: 70 });
    }

    doc.text('Shipping:', summaryX, summaryY + (order.discount > 0 ? 36 : 18));
    doc.text(`₹${(order.shipping || 0).toFixed(2)}`, summaryX + 100, summaryY + (order.discount > 0 ? 36 : 18), { align: 'right', width: 70 });

    const grandTotalY = summaryY + (order.discount > 0 ? 54 : 36);
    doc.rect(summaryX - 10, grandTotalY, 190, 24).fill('#FFF3CD');
    doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold');
    doc.text('Grand Total:', summaryX, grandTotalY + 6);
    doc.text(`₹${(order.totalPrice || 0).toFixed(2)}`, summaryX + 100, grandTotalY + 6, { align: 'right', width: 70 });

    doc.moveDown(6);

    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    doc.text('Thank you for shopping with GLORA!', { align: 'center' });
    doc.fontSize(8).fillColor('#999999');
    doc.text('This is an electronically generated invoice and does not require a physical signature.', { align: 'center' });

    doc.fontSize(8).fillColor('#CCCCCC');
    doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`,
      margin, pageHeight - 40, { align: 'center' });

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