const Wallet = require("../../models/walletModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const getWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = new Wallet({ 
        user: userId,
        balance: 0,
        transactions: []
      });
      await wallet.save();
    }

    if (!wallet.transactions) {
      wallet.transactions = [];
      await wallet.save();
    }

    const walletData = {
      ...wallet.toObject(),
      transactions: [...wallet.transactions].sort((a, b) => b.date - a.date)
    };

    res.render("user/wallet", { 
      wallet: walletData, 
      userName, 
      key_id: process.env.RAZORPAY_KEY_ID 
    });
  } catch (err) {
    console.error("Error fetching wallet:", err);
    res.status(500).send("Server Error");
  }
};

const createOrder = async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount) * 100; 
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount,
      currency: "INR",
      receipt: "wallet_rcpt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    res.status(500).json({ success: false, message: "Payment initiation failed" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      walletOrderId, 
      amount
    } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature === razorpay_signature) {

      const wallet = await Wallet.findOneAndUpdate(
        { user: req.user._id },
        { $inc: { balance: amount } },
        { new: true, upsert: true }
      );

      await Wallet.findOneAndUpdate(
        { user: req.user._id },
        {
          $push: {
            transactions: {
              type: "credit",
              amount: amount,
              description: `Wallet top-up via Razorpay (${razorpay_payment_id})`
            }
          }
        }
      );

      return res.json({
        success: true,
        redirectUrl: `/wallet?status=success`,
      });
    } else {
      return res.json({
        success: false,
        redirectUrl: `/wallet?status=failed`,
      });
    }
  } catch (err) {
    console.error("Error verifying Razorpay wallet payment:", err);
    return res.status(500).json({
      success: false,
      redirectUrl: `/wallet?status=failed`,
    });
  }
};



const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    
    let wallet = await Wallet.findOne({ user: userId });
    
    if (!wallet) {
      wallet = new Wallet({ 
        user: userId,
        balance: 0,
        transactions: []
      });
      await wallet.save();
    }
    
    res.json({
      success: true,
      balance: wallet.balance
    });
    
  } catch (err) {
    console.error("Error fetching wallet balance:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching wallet balance"
    });
  }
};

module.exports = {
  getWallet,
  createOrder,
  verifyPayment,
  getWalletBalance
};
