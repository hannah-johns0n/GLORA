const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const Address = require('../../models/addressModel');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const STATUS_CODES = require('../../constants/statusCodes');
const offer = require('../../models/offerModel')
const PDFDocument = require('pdfkit');
const { getFlash } = require('../../utils/flash');

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calculateItemsRefund(order, items) {
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (itemsTotal <= 0) return 0;

  const totalAfterOffer = order.subtotal - (order.offerDiscount || 0);
  const couponShare = totalAfterOffer > 0
    ? (itemsTotal / totalAfterOffer) * (order.couponDiscount || 0)
    : 0;

  return Number((itemsTotal - couponShare).toFixed(2));
}

const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;
    const search = req.query.search || '';

    const orders = await Order.find({
      userId,
      orderId: { $regex: escapeRegex(search), $options: 'i' }
    }).sort({ createdAt: -1 });

    res.render('user/my-orders', { orders, search, userName });
  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Server Error');
  }
};

const getOrderDetails = async (req, res) => {
  const userName = req.user.name;
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user.id
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
    const userId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: 'Please provide a reason for cancellation.' });
    }

    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: userId
    });

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ message: 'Order not found.' });
    }

    if (order.status !== 'Pending' && order.status !== 'Processing') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: 'Order cannot be cancelled at this stage.' });
    }

    const activeItems = order.orderItems.filter(item => item.status !== 'Cancelled');
    const activeItemsTotal = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    let refundIssued = false;

    if ((order.paymentMethod === 'Online' || order.paymentMethod === 'Wallet') && order.paymentStatus === 'Paid') {

      const refundAmount = Number((calculateItemsRefund(order, activeItems) + (order.shipping || 0)).toFixed(2));

      if (refundAmount > 0) {
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
          wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
        }

        wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
        wallet.transactions.push({
          amount: refundAmount,
          type: 'credit',
          description: `Refund for cancelled order #${order.orderId}`,
          date: new Date()
        });
        await wallet.save();
        refundIssued = true;
      }
    }

    for (const item of activeItems) {
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

    order.status = 'Cancelled';
    order.cancellationReason = reason.trim();
    await order.save();

    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      message: 'Order cancelled successfully!' + (refundIssued ? ' Refund has been processed to your wallet.' : '')
    });

  } catch (err) {
    console.error('cancelOrder error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: 'Server Error. Failed to cancel the order.' });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const { reason } = req.body;
    const { orderId, productId } = req.params;

    if (!reason || !reason.trim()) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Please provide a reason for cancellation.' });
    }

    const order = await Order.findOne({ orderId, userId: req.user.id });
    if (!order) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found' });

    const item = order.orderItems.find(i => i.productId.toString() === productId);
    if (!item) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Item not found in order' });

    const cancellableStatuses = ['Pending', 'Processing', 'Shipped'];
    if (!cancellableStatuses.includes(item.status)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'This item cannot be cancelled' });
    }

    const shouldRefund = ['Online', 'Wallet'].includes(order.paymentMethod)
      && order.paymentStatus === 'Paid';

    if (shouldRefund) {
      const refundAmount = calculateItemsRefund(order, [item]);

      if (refundAmount > 0) {
        let wallet = await Wallet.findOne({ user: req.user.id });
        if (!wallet) {
          wallet = new Wallet({ user: req.user.id, balance: 0, transactions: [] });
        }
        wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
        wallet.transactions.push({
          amount: refundAmount,
          type: 'credit',
          description: `Refund for cancelled item "${item.name}" in order #${order.orderId}`,
          date: new Date()
        });
        await wallet.save();
      }
    }

    const product = await Product.findById(item.productId);
    if (product) {
      const variantIndex = item.variantIndex || 0;
      if (product.variants[variantIndex]) {
        product.variants[variantIndex].quantity += item.quantity;
        await product.save();
      }
    }

    item.status = 'Cancelled';
    item.cancelReason = reason.trim();

    const allCancelled = order.orderItems.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.status = 'Cancelled';
      order.cancellationReason = 'All items cancelled by customer';
    }

    await order.save();

    return res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      message: 'Item cancelled successfully.' + (shouldRefund ? ' Refund credited to your wallet.' : '')
    });

  } catch (err) {
    console.error('cancelProduct error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server Error' });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Please provide a reason for return.' });
    }

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found' });
    if (order.status !== 'Delivered') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    const item = order.orderItems.find(i => i.productId.toString() === productId);
    if (!item) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Item not found' });
    if (item.status !== 'Delivered') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Item is not eligible for return' });
    }
    if (item.returnRequest && item.returnRequest.status === 'pending') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Return already requested for this item' });
    }

    item.status = 'Return-Requested';
    item.returnRequest = {
      requestedAt: new Date(),
      reason: reason.trim(),
      status: 'pending'
    };

    await order.save();
    return res.status(STATUS_CODES.SUCCESS).json({ success: true, message: 'Return request submitted for this item.' });

  } catch (err) {
    console.error('returnOrderItem error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server Error' });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Please provide a reason for return.' });
    }

    const order = await Order.findOne({ orderId, userId });

    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found' });
    }
    if (order.returnRequest && order.returnRequest.status === 'pending') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Return already requested' });
    }
    if (order.status !== 'Delivered') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    order.status = 'Return-Requested';
    order.returnRequest = {
      requestedAt: new Date(),
      status: 'pending',
      reason: reason.trim(),
      refundProcessed: false
    };
    await order.save();

    return res.status(STATUS_CODES.SUCCESS).json({ success: true, message: 'Return request submitted successfully.' });

  } catch (err) {
    console.error('returnOrder error:', err);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to process return request.' });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user._id
    })
      .populate('addressId')
      .populate('userId');

    if (!order) return res.status(STATUS_CODES.NOT_FOUND).send('Order not found');

    const isEligible = order.paymentStatus === 'Paid' || (order.paymentMethod === 'COD' && order.status === 'Delivered');
    if (!isEligible) {
      return res.status(STATUS_CODES.FORBIDDEN).send('Invoice not available for this order yet.');
    }

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 30;
    const CW = W - M * 2;

    const BROWN = '#2C1810';
    const MID_BROWN = '#4A2C1A';
    const TAN_BG = '#F5EDE8';
    const LINE_CLR = '#E0E0E0';
    const TEXT_DARK = '#1A1A1A';
    const TEXT_GREY = '#666666';
    const WHITE = '#FFFFFF';

    const headerH = 90;
    const splitX = W * 0.52;

    doc.rect(0, 0, splitX, headerH).fill(BROWN);

    doc.save();
    doc.moveTo(splitX - 30, 0)
      .lineTo(splitX + 40, 0)
      .lineTo(splitX - 30, headerH)
      .fill('#C4956A');
    doc.restore();

    doc.fillColor(WHITE).fontSize(28).font('Helvetica-Bold')
      .text('GLORA', M, 22);

    doc.fillColor('#D4B8A8').fontSize(10).font('Helvetica')
      .text('Premium Ecommerce Store', M, 56);

    doc.fillColor(TEXT_DARK).fontSize(26).font('Helvetica-Bold')
      .text('INVOICE', splitX + 50, 18, { width: W - splitX - 50 - M, align: 'right' });

    doc.fillColor(TEXT_GREY).fontSize(9).font('Helvetica')
      .text('Thank you for shopping with GLORA!', splitX + 50, 54,
        { width: W - splitX - 50 - M, align: 'right' });

    const stripY = headerH + 16;
    const stripH = 58;
    const boxW = CW / 6;

    doc.moveTo(M, stripY).lineTo(W - M, stripY)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
    doc.moveTo(M, stripY + stripH).lineTo(W - M, stripY + stripH)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();

    const infoItems = [
      { label: 'Invoice Number', value: order.orderId.slice(0, 8).toUpperCase() },
      { label: 'Order ID', value: order.orderId.slice(0, 13) + '...' },
      { label: 'Order Date', value: new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
      { label: 'Payment Method', value: order.paymentMethod || 'N/A' },
      { label: 'Payment Status', value: order.paymentStatus || 'N/A' },
      { label: 'Order Status', value: order.status || 'N/A' },
    ];

    infoItems.forEach((infoItem, i) => {
      const bx = M + i * boxW;
      if (i > 0) {
        doc.moveTo(bx, stripY + 8).lineTo(bx, stripY + stripH - 8)
          .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
      }
      doc.fillColor(TEXT_GREY).fontSize(7.5).font('Helvetica')
        .text(infoItem.label, bx + 4, stripY + 10, { width: boxW - 8, align: 'center' });
      doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica-Bold')
        .text(infoItem.value, bx + 4, stripY + 26, { width: boxW - 8, align: 'center', lineBreak: true });
    });

    const cardY = stripY + stripH + 18;
    const cardH = 125;
    const cardW = (CW - 12) / 2;

    doc.roundedRect(M, cardY, cardW, cardH, 6)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
    doc.roundedRect(M, cardY, cardW, 28, 6).fill(TAN_BG);
    doc.rect(M, cardY + 16, cardW, 12).fill(TAN_BG);

    doc.fillColor(BROWN).fontSize(10).font('Helvetica-Bold')
      .text('BILLING DETAILS', M + 12, cardY + 9);

    const billingItems = [
      { k: 'Name', v: order.userId?.name || 'N/A' },
      { k: 'Email', v: order.userId?.email || 'N/A' },
      { k: 'Phone', v: order.addressId?.phoneNumber || 'N/A' },
    ];

    billingItems.forEach((row, i) => {
      const rowY = cardY + 36 + i * 18;
      doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica-Bold')
        .text(row.k, M + 12, rowY, { continued: true });
      doc.font('Helvetica').fillColor(TEXT_GREY)
        .text(`  :  ${row.v}`);
    });

    const card2X = M + cardW + 12;

    doc.roundedRect(card2X, cardY, cardW, cardH, 6)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
    doc.roundedRect(card2X, cardY, cardW, 28, 6).fill(TAN_BG);
    doc.rect(card2X, cardY + 16, cardW, 12).fill(TAN_BG);

    doc.fillColor(BROWN).fontSize(10).font('Helvetica-Bold')
      .text('SHIPPING ADDRESS', card2X + 12, cardY + 9);

    const addr = order.addressId;
    const addrLine1 = addr?.landmark || 'N/A';
    const addrLine2 = addr?.addressType || '';
    const addrLine3 = [addr?.city, addr?.state].filter(Boolean).join(', ');
    const addrLine4 = addr?.pincode ? `PIN: ${addr.pincode}` : '';

    doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica')
      .text(addrLine1, card2X + 12, cardY + 36, { width: cardW - 24 });
    if (addrLine2) doc.text(addrLine2, card2X + 12, cardY + 51, { width: cardW - 24 });
    if (addrLine3) doc.text(addrLine3, card2X + 12, cardY + 66, { width: cardW - 24 });
    if (addrLine4) doc.text(addrLine4, card2X + 12, cardY + 81, { width: cardW - 24 });

    const tableY = cardY + cardH + 18;
    const tHdrH = 28;
    const tRowH = 24;

    const TC = {
      num: M + 5,
      prod: M + 35,
      var: M + 210,
      price: M + 285,
      qty: M + 355,
      total: M + 400,
      status: M + 455,
    };

    const statusColors = {
      'Delivered': '#1A7A1A',
      'Cancelled': '#CC0000',
      'Returned': '#CC6600',
      'Return-Requested': '#CC6600',
      'Return-Rejected': '#CC0000',
      'Shipped': '#1A5FAA',
      'Processing': '#7A5A00',
      'Pending': '#666666',
    };

    doc.rect(M, tableY, CW, tHdrH).fill(MID_BROWN);

    doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold');
    doc.text('#', TC.num, tableY + 9, { width: 25, align: 'center' });
    doc.text('PRODUCT', TC.prod, tableY + 9, { width: 168, align: 'left' });
    doc.text('VARIANT', TC.var, tableY + 9, { width: 65, align: 'left' });
    doc.text('UNIT PRICE', TC.price, tableY + 9, { width: 60, align: 'right' });
    doc.text('QTY', TC.qty, tableY + 9, { width: 30, align: 'center' });
    doc.text('ITEM TOTAL', TC.total, tableY + 9, { width: 55, align: 'right' });
    doc.text('STATUS', TC.status, tableY + 9, { width: 70, align: 'center' });

    let curY = tableY + tHdrH;

    order.orderItems.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#FAFAFA' : WHITE;
      const itemTotal = ((item.price || 0) * (item.quantity || 0)).toFixed(2);
      const itemColor = statusColors[item.status] || TEXT_DARK;

      doc.rect(M, curY, CW, tRowH).fill(bg);

      doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica');
      doc.text(String(idx + 1), TC.num, curY + 7, { width: 25, align: 'center' });
      doc.text(item.name || 'Product', TC.prod, curY + 7, { width: 168, ellipsis: true, lineBreak: false });
      doc.text(item.unit || '-', TC.var, curY + 7, { width: 65, lineBreak: false });
      doc.text(`Rs.${(item.price || 0).toFixed(2)}`, TC.price, curY + 7, { width: 60, align: 'right' });
      doc.text(String(item.quantity || 0), TC.qty, curY + 7, { width: 30, align: 'center' });
      doc.text(`Rs.${itemTotal}`, TC.total, curY + 7, { width: 55, align: 'right' });

      doc.fillColor(itemColor).fontSize(7.5).font('Helvetica-Bold')
        .text(item.status || '-', TC.status, curY + 7, { width: 70, align: 'center' });

      doc.moveTo(M, curY + tRowH).lineTo(M + CW, curY + tRowH)
        .strokeColor(LINE_CLR).lineWidth(0.5).stroke();

      curY += tRowH;
    });

    doc.rect(M, tableY, CW, curY - tableY)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();

    const bottomY = curY + 18;
    const bCardH = 140;

    doc.roundedRect(M, bottomY, cardW, bCardH, 6)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
    doc.roundedRect(M, bottomY, cardW, 28, 6).fill(TAN_BG);
    doc.rect(M, bottomY + 16, cardW, 12).fill(TAN_BG);
    doc.fillColor(BROWN).fontSize(10).font('Helvetica-Bold')
      .text('PRICE SUMMARY', M + 12, bottomY + 9);

    let priceY = bottomY + 36;

    function drawPriceLine(label, value, bold = false) {
      doc.fillColor(TEXT_DARK).fontSize(9)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, M + 12, priceY);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, M, priceY, { width: cardW - 12, align: 'right' });
      priceY += 18;
    }

    drawPriceLine('Subtotal', `Rs. ${(order.subtotal || 0).toFixed(2)}`);
    if (order.discount > 0) drawPriceLine('Product Discount', `-Rs. ${order.discount.toFixed(2)}`);
    if (order.couponDiscount > 0) drawPriceLine(`Coupon (${order.appliedCoupon || ''})`, `-Rs. ${order.couponDiscount.toFixed(2)}`);
    drawPriceLine('Shipping Charges', `Rs. ${(order.shipping || 0).toFixed(2)}`);

    doc.moveTo(M + 10, priceY + 2).lineTo(M + cardW - 10, priceY + 2)
      .strokeColor(LINE_CLR).lineWidth(0.5).stroke();
    priceY += 8;

    drawPriceLine('Grand Total', `Rs. ${(order.totalPrice || 0).toFixed(2)}`, true);

    doc.fillColor(TEXT_GREY).fontSize(7.5).font('Helvetica')
      .text('(Inclusive of all taxes)', M + 12, priceY);

    const suppX = M + cardW + 12;

    doc.roundedRect(suppX, bottomY, cardW, bCardH, 6).fill(TAN_BG);

    doc.fillColor(BROWN).fontSize(10).font('Helvetica-Bold')
      .text('We appreciate your purchase!', suppX + 12, bottomY + 14, { width: cardW - 24 });

    doc.fillColor(TEXT_GREY).fontSize(8.5).font('Helvetica')
      .text('If you have any questions, feel free to contact our support.',
        suppX + 12, bottomY + 34, { width: cardW - 24, lineBreak: true });

    doc.moveTo(suppX + 10, bottomY + 66).lineTo(suppX + cardW - 10, bottomY + 66)
      .strokeColor('#D4B8A8').lineWidth(0.5).stroke();

    const contacts = [
      { icon: 'Web  :', val: 'www.glora.com' },
      { icon: 'Email:', val: 'support@glora.com' },
      { icon: 'Ph   :', val: '+91 12345 67890' },
    ];
    contacts.forEach((c, i) => {
      doc.fillColor(TEXT_DARK).fontSize(8.5).font('Helvetica-Bold')
        .text(c.icon, suppX + 12, bottomY + 76 + i * 17, { continued: true });
      doc.font('Helvetica').fillColor(TEXT_GREY)
        .text(`  ${c.val}`);
    });

    const tyY = bottomY + bCardH + 22;

    doc.moveTo(M, tyY + 10).lineTo(M + CW * 0.35, tyY + 10)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();
    doc.moveTo(M + CW * 0.65, tyY + 10).lineTo(M + CW, tyY + 10)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();

    doc.fillColor(TEXT_DARK).fontSize(13).font('Helvetica-Bold')
      .text('Thank You!', M, tyY, { width: CW, align: 'center' });
    doc.fillColor(TEXT_GREY).fontSize(8.5).font('Helvetica')
      .text('Your trust means everything to us.', M, tyY + 18, { width: CW, align: 'center' });
    doc.text('We hope to serve you again soon!', M, tyY + 31, { width: CW, align: 'center' });

    const footerY = tyY + 62;

    doc.moveTo(M, footerY).lineTo(M + CW, footerY)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();

    const badges = [
      { title: 'Safe & Secure Payments' },
      { title: 'Quality Products You Can Trust' },
      { title: 'Easy Returns & Refunds' },
    ];

    const badgeW = CW / 3;
    badges.forEach((b, i) => {
      const bx = M + i * badgeW;
      doc.fillColor(TEXT_GREY).fontSize(8).font('Helvetica')
        .text(b.title, bx, footerY + 12, { width: badgeW, align: 'center' });
    });

    doc.moveTo(M, footerY + 34).lineTo(M + CW, footerY + 34)
      .strokeColor(LINE_CLR).lineWidth(0.8).stroke();

    doc.fillColor('#BBBBBB').fontSize(7).font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString('en-IN')}`,
        M, footerY + 40, { width: CW, align: 'center' });

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found' });

    order.paymentStatus = 'Paid';
    order.status = 'Processing';
    await order.save();

    res.status(STATUS_CODES.SUCCESS).json({ success: true, orderId: order.orderId });
  } catch (err) {
    console.error('updatePaymentStatus error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update payment status' });
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