const Wishlist = require("../../models/wishlistModel");
const Product = require("../../models/productModel");
const STATUS_CODES = require("../../constants/statusCodes");
const { setFlash, getFlash } = require("../../utils/flash");
const { getActiveOffers, getOfferPriceForProduct } = require("../../utils/discountService");

module.exports = {
getWishlist: async (req, res) => {
  try {
    const userName = req.user?.name || "User";
    const wishlistItems = await Wishlist.find({ userId: req.user._id }).populate("productId");

    const validItems = wishlistItems.filter(item => item.productId);
    const offers = await getActiveOffers();

    const wishlist = validItems.map(item => {
    const product = item.productId.toObject();
    const variantIndex = item.variantIndex || 0;
    const selectedVariant = product.variants && product.variants[variantIndex]? product.variants[variantIndex] : (product.variants && product.variants[0]);
      
    let stockStatus = "unavailable";
    if (!product.isBlocked && selectedVariant) {
      if (!selectedVariant.isBlocked && selectedVariant.quantity > 0) {
        stockStatus = "instock";
      } else {
        stockStatus = "outofstock";
      }
    }
  
    let priceInfo = null;
    if (selectedVariant) {
      const basePrice = selectedVariant.salesPrice > 0 ? selectedVariant.salesPrice : selectedVariant.regularPrice;
      const offerResult = getOfferPriceForProduct(product, basePrice, offers);
      priceInfo = { basePrice, finalPrice: offerResult.priceAfterOffer };
    }
  
    return {
      ...product,
      inWishlist: true,
      wishlistId: item._id,
      variantIndex,
      selectedVariant,
      priceInfo,
      stockStatus   
    };
  });

    res.status(STATUS_CODES.SUCCESS).render("user/wishlist", { wishlist, userName });
  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
},

  toggleWishlist: async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ redirect: '/login?redirect=' + req.originalUrl });
    }

    const { productId } = req.params;
    const userId = req.user._id;
    const variantIndex = parseInt(req.body.variantIndex) || 0;

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
        productId,
        variantIndex
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
    const variantIndex = parseInt(req.body.variantIndex) || 0;

    const exists = await Wishlist.findOne({
      userId: req.user._id,
      productId
    });

    if (exists) {
      return res.status(200).json({ success: true, message: 'Product already in wishlist' });
    }

    await Wishlist.create({
      userId: req.user._id,
      productId,
      variantIndex
    });

    res.status(200).json({ success: true, message: 'Product added to wishlist' });

  } catch (err) {
    console.error('Wishlist add error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
},


  removeFromWishlist: async (req, res) => {
  try {
    await Wishlist.findOneAndDelete({ 
      userId: req.user._id, 
      productId: req.params.id 
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
}
};
