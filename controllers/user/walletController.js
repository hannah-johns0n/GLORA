const Wallet = require("../../models/walletModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const STATUS_CODES = require("../../constants/statusCodes");
const { setFlash, getFlash } = require("../../utils/flash");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const MAX_WALLET_AMOUNT = 100000;
const TRANSACTIONS_PER_PAGE = 10;

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

    const allTransactions = [...wallet.transactions].sort((a, b) => b.date - a.date);

    const page = parseInt(req.query.page) || 1;
    const totalTransactions = allTransactions.length;
    const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE) || 1;
    const currentPage = Math.min(Math.max(page, 1), totalPages);

    const startIndex = (currentPage - 1) * TRANSACTIONS_PER_PAGE;
    const paginatedTransactions = allTransactions.slice(startIndex, startIndex + TRANSACTIONS_PER_PAGE);

    const walletData = {
      ...wallet.toObject(),
      transactions: paginatedTransactions
    };

    const flash = getFlash(req, res);

    res.status(STATUS_CODES.SUCCESS).render("user/wallet", {
      wallet: walletData,
      userName,
      key_id: process.env.RAZORPAY_KEY_ID,
      currentPage,
      totalPages,
      totalTransactions,
      flash
    });
  } catch (err) {
    console.error("Error fetching wallet:", err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

const createOrder = async (req, res) => {
  try {
    const rawAmount = parseFloat(req.body.amount);

    if (!rawAmount || isNaN(rawAmount) || rawAmount <= 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Please enter a valid amount" });
    }

    if (rawAmount > MAX_WALLET_AMOUNT) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Amount cannot exceed ₹${MAX_WALLET_AMOUNT}` });
    }

    const amountInPaise = Math.round(rawAmount * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: "wallet_rcpt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.status(STATUS_CODES.CREATED).json({
      success: true,
      order,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Payment initiation failed" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Missing payment details" });
    }

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      setFlash(res, "error", "Payment verification failed");
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        redirectUrl: `/wallet`,
      });
    }

    const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    const creditedAmount = razorpayOrder.amount / 100;

    await Wallet.findOneAndUpdate(
      { user: req.user.id },
      {
        $inc: { balance: creditedAmount },
        $push: {
          transactions: {
            type: "credit",
            amount: creditedAmount,
            description: `Wallet top-up via Razorpay (${razorpay_payment_id})`
          }
        }
      },
      { new: true, upsert: true }
    );

    setFlash(res, "success", `₹${creditedAmount} added to your wallet`);
    return res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      redirectUrl: `/wallet`,
    });
  } catch (err) {
    console.error("Error verifying Razorpay wallet payment:", err);
    setFlash(res, "error", "Something went wrong while verifying payment");
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      redirectUrl: `/wallet`,
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

    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      balance: wallet.balance
    });
  } catch (err) {
    console.error("Error fetching wallet balance:", err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
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