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
const {
  getActiveOffers,
  calculateCartPricing,
  findValidCoupon,
  updateCouponUsage,
  calculateCouponDiscount
} = require('../../utils/discountService');

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

    const activeOffers = await getActiveOffers();
    const pricing = calculateCartPricing(cart, activeOffers);
    const shipping = pricing.priceAfterOffer >= 999 ? 0 : 100;

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (cart.appliedCoupon) {
      const coupon = await findValidCoupon(cart.appliedCoupon, userId);
      if (coupon && pricing.priceAfterOffer >= coupon.minimumPurchaseAmount) {
        couponDiscount = calculateCouponDiscount(pricing.priceAfterOffer, coupon);
        appliedCoupon = coupon;
      } else {
        cart.appliedCoupon = null;
        await cart.save();
      }
    }

    const finalTotal = pricing.priceAfterOffer + shipping - couponDiscount;

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    res.render('user/checkout', {
      userName,
      addresses,
      cartItems: pricing.items,
      subtotal: pricing.subtotal,
      offerDiscount: pricing.offerDiscount,
      priceAfterOffers: pricing.priceAfterOffer,
      couponDiscount,
      shipping,
      finalTotal,
      coupons,
      appliedCoupon: appliedCoupon ? appliedCoupon.couponCode : null
    });

  } catch (err) {
    console.error('getCheckoutPage error:', err);
    res.status(500).send('Server Error');
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod, couponCode, removeCoupon } = req.body;

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

    const activeOffers = await getActiveOffers();
    const validCart = { items: validItems };
    const pricing = calculateCartPricing(validCart, activeOffers);

    if (pricing.priceAfterOffer <= 0) {
      return res.status(400).json({ success: false, message: 'Cannot place order with zero total' });
    }

    if (removeCoupon === 'true' || removeCoupon === true) {
      cart.appliedCoupon = null;
      await cart.save();
    }

    const couponToApply = (removeCoupon === 'true' || removeCoupon === true)
      ? null
      : (couponCode || cart.appliedCoupon);

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponToApply) {
      const coupon = await findValidCoupon(couponToApply, userId);
      if (coupon && pricing.priceAfterOffer >= coupon.minimumPurchaseAmount) {
        couponDiscount = calculateCouponDiscount(pricing.priceAfterOffer, coupon);
        appliedCoupon = coupon.couponCode;
        if (cart.appliedCoupon !== appliedCoupon) {
          cart.appliedCoupon = appliedCoupon;
          await cart.save();
        }
      } else if (couponCode) {
        return res.status(400).json({ success: false, message: 'Coupon is invalid or not applicable.' });
      } else {
        cart.appliedCoupon = null;
        await cart.save();
      }
    }

    const shipping = pricing.priceAfterOffer >= 999 ? 0 : 100;
    const totalDiscount = Number((pricing.offerDiscount + couponDiscount).toFixed(2));
    const finalTotal = Number((pricing.priceAfterOffer + shipping - couponDiscount).toFixed(2));
    const orderId = uuidv4();

    const orderItems = pricing.items.map(item => ({
      productId: item.productId._id,
      variantIndex: item.variantIndex,
      quantity: item.quantity,
      price: item.priceAfterOffer,
      name: item.productId.productName,
      unit: item.productId.variants && item.productId.variants[item.variantIndex || 0]
        ? item.productId.variants[item.variantIndex || 0].unit
        : '',
      image: item.productId.images[0] || '',
      status: 'Pending',
      cancelReason: null
    }));

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
        subtotal: pricing.subtotal,
        offerDiscount: pricing.offerDiscount,
        couponDiscount,
        discount: totalDiscount,
        appliedCoupon,
        shipping,
        totalPrice: finalTotal,
        paymentMethod: 'Wallet',
        paymentStatus: 'Paid',
        status: 'Processing'
      });
      await walletOrder.save();

      for (const item of orderItems) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variantIndex = item.variantIndex || 0;
          if (product.variants[variantIndex]) {
            product.variants[variantIndex].quantity -= item.quantity;
            await product.save();
          }
        }
      }

      cart.items = [];
      cart.appliedCoupon = null;
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
      subtotal: pricing.subtotal,
      offerDiscount: pricing.offerDiscount,
      couponDiscount,
      discount: totalDiscount,
      appliedCoupon,
      shipping,
      totalPrice:    finalTotal,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      status:        'Pending'
    });

    await order.save();
    if (appliedCoupon) {
      await updateCouponUsage(appliedCoupon, userId);
    }
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variantIndex = item.variantIndex || 0;
        if (product.variants[variantIndex]) {
          product.variants[variantIndex].quantity -= item.quantity;
          await product.save();
        }
      }
    }
    cart.items = [];
    cart.appliedCoupon = null;
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

      const activeOffers = await getActiveOffers();
      const pricing = calculateCartPricing(cart, activeOffers);
      const shipping = pricing.priceAfterOffer >= 999 ? 0 : 100;

      let couponDiscount = 0;
      let appliedCoupon = null;
      if (couponCode) {
        const coupon = await findValidCoupon(couponCode);
        if (coupon && pricing.priceAfterOffer >= coupon.minimumPurchaseAmount) {
          couponDiscount = calculateCouponDiscount(pricing.priceAfterOffer, coupon);
          appliedCoupon = coupon.couponCode;
        }
      }

      const totalDiscount = Number((pricing.offerDiscount + couponDiscount).toFixed(2));
      const finalTotal = Number((pricing.priceAfterOffer + shipping - couponDiscount).toFixed(2));
      const orderId = uuidv4();

      const orderItems = pricing.items.map(item => ({
        productId: item.productId._id,
        variantIndex: item.variantIndex,
        quantity: item.quantity,
        price: item.priceAfterOffer,
        name: item.productId.productName,
        unit: item.unit || (item.productId.variants && item.productId.variants[item.variantIndex || 0]
          ? item.productId.variants[item.variantIndex || 0].unit
          : ''),
        image: item.productId.images[0] || '',
        status: 'Pending',
        cancelReason: null
      }));

      const order = new Order({
        orderId,
        userId,
        addressId,
        orderItems,
        subtotal: pricing.subtotal,
        offerDiscount: pricing.offerDiscount,
        couponDiscount,
        discount: totalDiscount,
        appliedCoupon,
        shipping,
        totalPrice: finalTotal,
        paymentMethod: 'Online',
        paymentStatus: 'Pending',
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

        if (!order) {
          return res.status(404).json({ success: false, redirectUrl: '/order-failed' });
        }

        if (order.appliedCoupon) {
          try {
            await updateCouponUsage(order.appliedCoupon, order.userId);
          } catch (couponErr) {
            console.error('Failed to update coupon usage after Razorpay payment:', couponErr);
          }
        }

        await Cart.findOneAndUpdate(
          { userId: order.userId },
          { items: [], appliedCoupon: null }
        );

        return res.json({ success: true, redirectUrl: `/order-success/${order.orderId}` });
      } else {
        await Order.findOneAndUpdate(
          { orderId },
          { paymentStatus: 'Failed', status: 'Pending' }
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

  const retryRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Load the existing failed order
    const existingOrder = await Order.findOne({ orderId, userId });
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (existingOrder.paymentMethod !== 'Online' || existingOrder.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'This order is not eligible for retry' });
    }

    // Create a fresh Razorpay order for the same amount
    const razorpayOrder = await razorpay.orders.create({
      amount:   Math.round(existingOrder.totalPrice * 100),
      currency: 'INR',
      receipt:  orderId
    });

    // Store the new razorpayOrderId on the order for verification later
    existingOrder.razorpayOrderId = razorpayOrder.id;
    await existingOrder.save();

    return res.json({
      success:        true,
      razorpayOrderId: razorpayOrder.id,
      amount:          razorpayOrder.amount,
      currency:        razorpayOrder.currency,
      orderId:         orderId,
      key:             process.env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error('retryRazorpayOrder error:', err);
    res.status(500).json({ success: false, message: 'Failed to create retry payment order' });
  }
};

const verifyRetryPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;
    const userId = req.user.id;

    // Cryptographic verification — same as normal flow
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.json({ success: false, message: 'Payment verification failed' });
    }

    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Mark as paid and restore to Processing
    order.paymentStatus = 'Paid';
    order.status        = 'Processing';
    await order.save();

    return res.json({ success: true, redirectUrl: `/order-success/${order.orderId}` });

  } catch (err) {
    console.error('verifyRetryPayment error:', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

  module.exports = {
    orderSuccess,
    placeOrder,
    createRazorpayOrder,
    verifyRazorpayOrder,
    getCheckoutPage,
    retryRazorpayOrder,   
    verifyRetryPayment 
  }

