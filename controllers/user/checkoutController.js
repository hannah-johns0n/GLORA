const Address = require("../../models/addressModel");
const Cart = require("../../models/cartModel");
const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const { v4: uuidv4 } = require('uuid');
  // Show checkout page
const  getCheckoutPage = async (req, res) => {
    try {
      const userId = req.user.id;
      const userName = req.user.name; // make sure 'name' exists in token

      // Fetch addresses
      const addresses = await Address.find({ userId });

      // Fetch cart items
      const cart = await Cart.findOne({ userId }).populate("items.productId");

      if (!cart || cart.items.length === 0) {
        return res.redirect("/cart");
      }

      // Calculate total
      let subtotal = 0;
      cart.items.forEach(item => {
        subtotal += item.productId.price * item.quantity;
      });

      const tax = subtotal * 0.05; // example 5%
      const discount = 0; // for now
      const shipping = 50; // flat shipping
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

        // --- THE MISSING LINE IS HERE ---
        // Generate a unique orderId before creating the Order object
        const orderId = uuidv4();

        // Save order
        const order = new Order({
            orderId, // Now this variable is defined and will be a unique UUID
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

        // Clear cart
        cart.items = [];
        await cart.save();

        res.redirect(`/order-success/${order._id}`);

    } catch (err) {
        console.error("Error in placeOrder controller:", err);
        res.status(500).send("Server Error");
    }
};


  // Order success page
const orderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userName = req.user?.name || ""; // Get name from decoded JWT
    res.render("user/order-success", { orderId, userName });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};




  module.exports = {
    orderSuccess,
    placeOrder,
    getCheckoutPage
  }