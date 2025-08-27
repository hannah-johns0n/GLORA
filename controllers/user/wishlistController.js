const Wishlist = require("../../models/wishlistModel");
const Product = require("../../models/productModel");

module.exports = {
  getWishlist: async (req, res) => {
  try {
    const userName = req.user?.name || "User";
    const wishlistItems = await Wishlist.find({ userId: req.user._id })
      .populate("productId");

    const wishlist = wishlistItems.map(item => {
      const product = item.productId.toObject();
      return {
        ...product,
        inWishlist: true,
        wishlistId: item._id  
      };
    });

    res.render("user/wishlist", { wishlist, userName });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
},


  toggleWishlist: async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ redirect: '/login?redirect=' + req.originalUrl });
    }

    const { productId } = req.params;
    const userId = req.user._id;

    const existingItem = await Wishlist.findOne({
      userId,
      productId
    });

    let action;
    if (existingItem) {
      await Wishlist.findByIdAndDelete(existingItem._id);
      action = 'removed';
    } else {
      await Wishlist.create({
        userId,
        productId
      });
      action = 'added';
    }

    res.status(200).json({ success: true, action: action });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
},

 addToWishlist: async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  try {
    const productId = req.params.id;

    const exists = await Wishlist.findOne({
      userId: req.user._id,
      productId
    });

    if (exists) {
      return res.status(200).json({ success: true, message: 'Product already in wishlist' });
    }

    await Wishlist.create({
      userId: req.user._id,
      productId
    });

    res.status(200).json({ success: true, message: 'Product added to wishlist' });

  } catch (err) {
    console.error('Wishlist add error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
},


  removeFromWishlist: async (req, res) => {
    try {
      await Wishlist.findByIdAndDelete(req.params.id);
      res.redirect("/wishlist");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
};
