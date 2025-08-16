const Address = require("../../models/addressModel");
const Cart = require("../../models/cartModel");
const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const STATUS_CODES = require('../../constants/statusCodes');
const { v4: uuidv4 } = require('uuid');


const  getCheckoutPage = async (req, res) => {
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
        subtotal += item.productId.price * item.quantity;
      });

      const tax = subtotal * 0.05;
      const discount = 0; 
      const shipping = 50; 
      const finalTotal = subtotal + tax + shipping - discount;

      res.render("user/checkout", {
        userName,
        addresses,
        cartItems: cart.items,
        subtotal,
        tax,
        discount,
        shipping,
        finalTotal
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  };
  
  const placeOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { addressId } = req.body;

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
        const discount = 0;
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

const orderSuccess = async (req, res) => {
  try {
    const Id = req.params.orderId;
    const orderId = await Order.findById(Id) 
    const userName = req.user?.name || ""; 
    res.render("user/order-success", { orderId: orderId.orderId, userName });
  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

  module.exports = {
    orderSuccess,
    placeOrder,
    getCheckoutPage
  }