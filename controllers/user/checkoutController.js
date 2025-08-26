const Address = require("../../models/addressModel");
const Cart = require("../../models/cartModel");
const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const STATUS_CODES = require('../../constants/statusCodes');
const Coupon = require("../../models/coupensModel")
const razorpay = require("../../config/razorpay")
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;
    const addresses = await Address.find({ userId });
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    let subtotal = 0;
    cart.items.forEach(item => {
      const price = (item.productId.salesPrice && item.productId.salesPrice > 0)
        ? item.productId.salesPrice
        : item.productId.regularPrice;

      subtotal += price * item.quantity;
    });


    const tax = subtotal * 0.05;
    const discount = 0;
    const shipping = 50;
    const finalTotal = subtotal + tax + shipping - discount;
    const coupons = await Coupon.find({ isActive: true, expiryDate: { $gte: new Date() } });


    res.render("user/checkout", {
      userName,
      addresses,
      cartItems: cart.items,
      subtotal,
      tax,
      discount,
      coupons,
      shipping,
      finalTotal,
      coupons
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, couponCode, paymentMethod  } = req.body;

    if (!addressId) {
      return res.status(STATUS_CODES.BAD_REQUEST).send("Please select a shipping address");
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    let subtotal = 0;
    cart.items.forEach(item => {
      if (item.productId && typeof item.productId.salesPrice === 'number') {
        subtotal += item.productId.salesPrice * item.quantity;
      } else {
        console.error(`Invalid product or price for productId:`, item.productId);
      }
    });

    if (subtotal <= 0) {
      console.error("Could not place order because subtotal is zero. Check cart items and price fields.");
      return res.redirect('/cart?error=invalid_items');
    }

    const tax = subtotal * 0.05;
    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true, expiryDate: { $gte: new Date() } });
      if (coupon) {
        discount = (subtotal * coupon.discountPercentage) / 100;
      }
    }
    const shipping = 50;
    const finalTotal = subtotal + tax + shipping - discount;

    console.log("subtotal", subtotal);
    console.log("final total", finalTotal);

    const orderId = uuidv4();

    if (paymentMethod === "razorpay") {
      const razorpay = require("../../config/razorpay");

      const razorpayOrder = await razorpay.orders.create({
        amount: finalTotal * 100, // in paise
        currency: "INR",
        receipt: orderId,
      });

      // Don’t save COD order yet, just return order details to frontend
      return res.json({
        success: true,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId, // our own order reference
      });
    }

    const order = new Order({
      orderId,
      userId,
      addressId,
      orderItems: cart.items.map(i => ({
        productId: i.productId._id,
        quantity: i.quantity
      })),
      discount,
      totalPrice: finalTotal,
      status: "Pending"
    });

    await order.save();

    cart.items = [];
    await cart.save();

    res.redirect(`/order-success/${order._id}`);

  } catch (err) {
    console.error("Error in placeOrder controller:", err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId, couponCode, paymentMethod  } = req.body;

    if (!addressId) {
      return res.status(STATUS_CODES.BAD_REQUEST).send("Please select a shipping address");
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    let subtotal = 0;
    cart.items.forEach(item => {
      if (item.productId && typeof item.productId.salesPrice === 'number') {
        subtotal += item.productId.salesPrice * item.quantity;
      } else {
        console.error(`Invalid product or price for productId:`, item.productId);
      }
    });

    if (subtotal <= 0) {
      console.error("Could not place order because subtotal is zero. Check cart items and price fields.");
      return res.redirect('/cart?error=invalid_items');
    }

    const tax = subtotal * 0.05;
    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true, expiryDate: { $gte: new Date() } });
      if (coupon) {
        discount = (subtotal * coupon.discountPercentage) / 100;
      }
    }
    const shipping = 50;
    const finalTotal = subtotal + tax + shipping - discount;

    console.log("subtotal", subtotal);
    console.log("final total", finalTotal);

    const orderId = uuidv4();

    const order = new Order({
      orderId,
      userId,
      addressId,
      orderItems: cart.items.map(i => ({
        productId: i.productId._id,
        quantity: i.quantity
      })),
      discount,
      totalPrice: finalTotal,
      status: "Pending",
      paymentMethod: 'Online',
      paymentStatus: 'Pending'
    });

    await order.save();

    cart.items = [];
    await cart.save();

    if (paymentMethod === "razorpay") {
      const razorpay = require("../../config/razorpay");

      const razorpayOrder = await razorpay.orders.create({
        amount: finalTotal * 100, // in paise
        currency: "INR",
        receipt: orderId,
      });

      // Don’t save COD order yet, just return order details to frontend
      return res.json({
        success: true,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId, // our own order reference
        key: process.env.RAZORPAY_KEY_ID
      });
    }

    console.log(order)
    res.status(200).json({order, success: true, key: process.env.RAZORPAY_KEY_ID});
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    res.status(500).json({success : false});
  }
};

const verifyRazorpayOrder = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderId, // our own DB orderId you sent from createRazorpayOrder
    } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature === razorpay_signature) {
      // ✅ Signature verified, payment successful
      const order = await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "Paid", status: "Processing" },
        { new: true }
      );

      return res.json({
        success: true,
        redirectUrl: `/order-success/${order._id}`,
      });
    } else {
      // ❌ Invalid signature → Payment failed
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "Failed", status: "Cancelled" }
      );

      return res.json({
        success: false,
        redirectUrl: `/order-failed`,
      });
    }
  } catch (err) {
    console.error("Error verifying Razorpay payment:", err);
    return res.status(500).json({
      success: false,
      redirectUrl: `/order-failed`,
    });
  }
};



const orderSuccess = async (req, res) => {
  try {
    const Id = req.params.orderId;
    const order = await Order.findOne({ orderId: Id }); 
    const userName = req.user?.name || "";
    res.render("user/order-success", { orderId: order.orderId, userName });
  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};


// verifyRazorpayOrder
// if payment success signature verified then make the peyemtn sytus of the order paid
//  if failure then json pass redirecrturl to order dfailed 


module.exports = {
  orderSuccess,
  placeOrder,
  createRazorpayOrder,
  verifyRazorpayOrder,
  getCheckoutPage
}