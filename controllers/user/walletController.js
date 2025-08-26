const Wallet = require("../../models/walletModel");


const getWallet = async (req, res) => {
  try {
    const userId = req.user._id; 
    const userName = req.user.name;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = new Wallet({ user: userId });
      await wallet.save();
    }

    res.render("user/wallet", { wallet, userName });
  } catch (err) {
    console.error("Error fetching wallet:", err);
    res.status(500).send("Server Error");
  }
};

// 📌 POST add money
const addMoney = async (req, res) => {
  try {
    const userId = req.user._id; // ✅ use JWT user

    const amount = parseFloat(req.body.amount);

    if (isNaN(amount) || amount <= 0) {
      return res.redirect("/wallet");
    }

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({ user: userId });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      description: "Added money to wallet"
    });

    await wallet.save();
    res.redirect("/wallet");
  } catch (err) {
    console.error("Error adding money:", err);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  getWallet,
  addMoney
};
