const Address = require("../../models/addressModel");
const Cart = require("../../models/cartModel");
const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const Wallet = require("../../models/walletModel");
const STATUS_CODES = require('../../constants/statusCodes');
const Coupon = require("../../models/coupensModel")
const razorpay = require("../../config/razorpay")
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const shipping = 50;

function getVariantPrice(item) {
  const variantIndex = item.variantIndex || 0;
  const variant = item.productId.variants && item.productId.variants[variantIndex]
    ? item.productId.variants[variantIndex]
    : item.productId.variants && item.productId.variants[0];
  if (!variant) return 0;
  return variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;
}

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;

    const addresses = await Address.find({ userId });
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    cart.items.forEach(item => {
      const price = getVariantPrice(item);
      subtotal += price * item.quantity;
    });
    console.log('subtotal in controller:', subtotal);


    const discount = 0;
    const finalTotal = subtotal + shipping - discount;
    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    res.render('user/checkout', {
      userName,
      addresses,
      cartItems: cart.items,
      subtotal,
      discount,
      shipping,
      finalTotal,
      coupons
    });

  } catch (err) {
    console.error('getCheckoutPage error:', err);
    res.status(500).send('Server Error');
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod, couponCode } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: 'Please select a shipping address' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: 'Please select a payment method' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    const validItems = cart.items.filter(item => item.productId && !item.productId.isBlocked);
    if (validItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid items in cart' });
    }

    let subtotal = 0;
    validItems.forEach(item => {
      const price = getVariantPrice(item);
      subtotal += price * item.quantity;
    });

    if (subtotal <= 0) {
      return res.status(400).json({ success: false, message: 'Cannot place order with zero total' });
    }

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({
        couponCode,
        isActive: true,
        expiryDate: { $gte: new Date() }
      });
      if (coupon) {
        if (coupon.discountType === 'Percentage') {
          discount = (subtotal * coupon.discountValue) / 100;
        } else if (coupon.discountType === 'Fixed Amount') {
          discount = coupon.discountValue;
        }
      }
    }

    const finalTotal = subtotal + shipping - discount;
    const orderId = uuidv4();

    const orderItems = validItems.map(item => {
      const variantIndex = item.variantIndex || 0;
      const variant = item.productId.variants[variantIndex] || item.productId.variants[0];
      const price = variant
        ? (variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice)
        : 0;
      return {
        productId: item.productId._id,
        variantIndex: variantIndex,
        quantity: item.quantity,
        price: price,
        name: item.productId.productName,
        unit: variant ? variant.unit : '',
        image: item.productId.images[0] || '',
        status: 'Pending',
        cancelReason: null
      };
    });

if (paymentMethod === 'wallet') {
  const wallet = await Wallet.findOne({ user: userId });

  if (!wallet) {
    return res.status(400).json({ success: false, message: 'Wallet not found' });
  }
  if (wallet.balance < finalTotal) {
    return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
  }

  wallet.balance -= finalTotal;
  wallet.transactions.push({
    type:        'debit',
    amount:      finalTotal,
    description: `Order payment for #${orderId}`,
    orderId:     orderId,
    date:        new Date()
  });
  await wallet.save();

  try {
    const walletOrder = new Order({
      orderId,
      userId,
      addressId,
      orderItems,
      subtotal,
      discount,
      shipping,
      totalPrice:    finalTotal,
      paymentMethod: 'Wallet',
      paymentStatus: 'Paid',
      status:        'Processing'
    });
    await walletOrder.save();

    cart.items = [];
    await cart.save();

    return res.json({ success: true, orderId: walletOrder.orderId });

  } catch (orderErr) {
    console.error('Order save failed after wallet debit — refunding:', orderErr);
    wallet.balance += finalTotal;
    wallet.transactions.push({
      type:        'credit',
      amount:      finalTotal,
      description: `Refund for failed order #${orderId}`,
      date:        new Date()
    });
    await wallet.save();

    return res.status(500).json({
      success: false,
      message: 'Order creation failed. Your wallet has been refunded.'
    });
  }
}

    const order = new Order({
      orderId,
      userId,
      addressId,
      orderItems,
      subtotal,
      discount,
      shipping,
      totalPrice:    finalTotal,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      status:        'Pending'
    });

    await order.save();
    cart.items = [];
    await cart.save();

    return res.json({ success: true, orderId: order.orderId });

  } catch (err) {
    console.error('placeOrder error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

  const createRazorpayOrder = async (req, res) => {
    try {
      const userId = req.user._id;
      const { addressId, couponCode } = req.body;

      if (!addressId) {
        return res.status(400).json({ success: false, message: 'Please select a shipping address' });
      }

      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }

      let subtotal = 0;
      cart.items.forEach(item => {
        const price = getVariantPrice(item);
        subtotal += price * item.quantity;
      });

      let discount = 0;
      if (couponCode) {
        const coupon = await Coupon.findOne({
          couponCode,
          isActive: true,
          expiryDate: { $gte: new Date() }
        });
        if (coupon) {
          discount = coupon.discountType === 'Percentage'
            ? (subtotal * coupon.discountValue) / 100
            : coupon.discountValue;
        }
      }

      const finalTotal = subtotal + shipping - discount;
      const orderId = uuidv4();

      const orderItems = cart.items.map(item => {
        const variantIndex = item.variantIndex || 0;
        const variant = item.productId.variants[variantIndex] || item.productId.variants[0];
        const price = variant
          ? (variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice)
          : 0;
        return {
          productId: item.productId._id,
          variantIndex: variantIndex,
          quantity: item.quantity,
          price: price,
          name: item.productId.productName,
          unit: variant ? variant.unit : '',
          image: item.productId.images[0] || '',
          status: 'Pending',
          cancelReason: null
        };
      });

      const order = new Order({
        orderId,
        userId,
        addressId,
        orderItems,
        subtotal,
        discount,
        shipping,
        totalPrice: finalTotal,
        paymentMethod: 'Online',
        paymentStatus: 'Failed',  
        status: 'Pending'
      });
      await order.save();

      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(finalTotal * 100),
        currency: 'INR',
        receipt: orderId
      });

      return res.json({
        success: true,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId,
        key: process.env.RAZORPAY_KEY_ID
      });

    } catch (err) {
      console.error('createRazorpayOrder error:', err);
      res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
  };

  const verifyRazorpayOrder = async (req, res) => {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

      const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
      hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
      const generatedSignature = hmac.digest('hex');

      if (generatedSignature === razorpay_signature) {
        const order = await Order.findOneAndUpdate(
          { orderId },
          { paymentStatus: 'Paid', status: 'Processing' },
          { new: true }
        );

        await Cart.findOneAndUpdate(
          { userId: order.userId },
          { items: [] }
        );

        return res.json({ success: true, redirectUrl: `/order-success/${order.orderId}` });

      } else {
        await Order.findOneAndUpdate(
          { orderId },
          { paymentStatus: 'Failed', status: 'Cancelled' }
        );
        return res.json({ success: false, redirectUrl: '/order-failed' });
      }

    } catch (err) {
      console.error('verifyRazorpayOrder error:', err);
      return res.status(500).json({ success: false, redirectUrl: '/order-failed' });
    }
  };

  const orderSuccess = async (req, res) => {
    try {
      const order = await Order.findOne({ orderId: req.params.orderId });
      const userName = req.user?.name || '';
      res.render('user/order-success', { orderId: order.orderId, userName });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  };

  module.exports = {
    orderSuccess,
    placeOrder,
    createRazorpayOrder,
    verifyRazorpayOrder,
    getCheckoutPage
  }

