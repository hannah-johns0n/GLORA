const Product = require('../../models/productModel');
const Cart = require('../../models/cartModel');
const Wishlist = require('../../models/wishlistModel');
const STATUS_CODES = require('../../constants/statusCodes');
const { getActiveOffers, calculateCartPricing } = require('../../utils/discountService');
const { setFlash } = require('../../utils/flash');

const MAX_QTY = 5;

const getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.render('user/cart', { cart: [], userName: req.user.name });
    }

    cart.items = cart.items.filter(item => item.productId);

    const activeOffers = await getActiveOffers();
    const pricing = calculateCartPricing(cart, activeOffers);

    const cartItems = pricing.items.map(item => {
      const product = item.productId;
      const isUnavailable = product.isBlocked
        || !item.variantIndex && item.variantIndex !== 0
        || !product.variants
        || !product.variants[item.variantIndex || 0]
        || product.variants[item.variantIndex || 0].isBlocked
        || product.variants[item.variantIndex || 0].quantity <= 0;

      return {
        productId: item.productId,
        quantity: item.quantity,
        variantIndex: item.variantIndex,
        price: item.priceAfterOffer,
        basePrice: item.basePrice,
        unit: item.unit,
        itemTotal: item.itemTotal,
        itemDiscount: item.itemDiscount,
        offerDiscount: item.offerDiscount,
        appliedOffer: item.appliedOffer || null,
        isUnavailable: isUnavailable
      };
    });

    await cart.save();

    res.status(STATUS_CODES.SUCCESS).render('user/cart', {
      cart: cartItems,
      subtotal: pricing.subtotal,
      offerDiscount: pricing.offerDiscount,
      total: pricing.priceAfterOffer,
      userName: req.user.name,
      user: req.user,
      url: req.originalUrl
    });

  } catch (err) {
    console.error('getCart error:', err);
    setFlash(res, 'error', 'Something went wrong while loading your cart');
    res.redirect('/');
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    let quantity = parseInt(req.body.quantity);
    if (isNaN(quantity)) quantity = 1;

    if (quantity < 1) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Quantity must be at least 1' });
    }

    if (quantity > MAX_QTY) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Maximum ${MAX_QTY} items allowed per product` });
    }

    let variantIndex = req.body.variantIndex !== undefined ? parseInt(req.body.variantIndex) : 0;
    if (isNaN(variantIndex) || variantIndex < 0) variantIndex = 0;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Product not found' });
    }

    if (product.isBlocked) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Product is unavailable' });
    }

    if (!product.variants || !product.variants[variantIndex]) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Selected variant is not available' });
    }

    const variant = product.variants[variantIndex];

    if (variant.isBlocked) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'This variant is unavailable' });
    }

    if (variant.quantity <= 0) {
      return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: 'This variant is out of stock' });
    }

    const price = variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(item =>
      item.productId.toString() === productId &&
      (item.variantIndex || 0) === variantIndex
    );

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;

      if (newQty > MAX_QTY) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Maximum ${MAX_QTY} items allowed per product` });
      }
      if (newQty > variant.quantity) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: 'Not enough stock available' });
      }
      existingItem.quantity = newQty;
      existingItem.totalPrice = existingItem.quantity * price;
    } else {
      if (quantity > variant.quantity) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: 'Not enough stock available' });
      }
      cart.items.push({
        productId,
        variantIndex,
        quantity,
        totalPrice: quantity * price
      });
    }

    await cart.save();
    await Wishlist.deleteOne({ userId, productId });

    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      message: 'Item added to cart',
      cartCount: cart.items.length
    });

  } catch (err) {
    console.error('addToCart error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

const incQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(i => i.productId._id.toString() === productId);
    if (!item) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Product not in cart' });
    }

    if (item.productId.isBlocked) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'This product is no longer available' });
    }

    const variantIndex = item.variantIndex || 0;
    const variant = item.productId.variants && item.productId.variants[variantIndex];
    if (!variant) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Variant not found' });
    }

    if (variant.isBlocked) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'This variant is no longer available' });
    }

    if (item.quantity + 1 > MAX_QTY) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Maximum ${MAX_QTY} items allowed` });
    }
    if (item.quantity + 1 > variant.quantity) {
      return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: 'Not enough stock available' });
    }

    const price = variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;
    item.quantity += 1;
    item.totalPrice = item.quantity * price;

    await cart.save();
    return res.status(STATUS_CODES.SUCCESS).json({ success: true });

  } catch (err) {
    console.error('incQuantity error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

const decQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(i => i.productId._id.toString() === productId);
    if (itemIndex === -1) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Product not in cart' });
    }

    const item = cart.items[itemIndex];

    if (item.quantity <= 1) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Minimum quantity is 1. Use the remove button to delete the item.'
      });
    }

    const variantIndex = item.variantIndex || 0;
    const variant = item.productId.variants && item.productId.variants[variantIndex];
    const price = variant
      ? (variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice)
      : 0;

    item.quantity -= 1;
    item.totalPrice = item.quantity * price;

    await cart.save();
    return res.status(STATUS_CODES.SUCCESS).json({ success: true });

  } catch (err) {
    console.error('decQuantity error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const result = await Cart.updateOne({ userId }, { $pull: { items: { productId } } });

    if (result.modifiedCount === 0) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Product not in cart' });
    }

    res.status(STATUS_CODES.SUCCESS).json({ success: true, message: 'Item removed from cart' });

  } catch (err) {
    console.error('removeFromCart error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

const validateCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Cart is empty' });
    }

    for (let item of cart.items) {
      const product = item.productId;
      if (!product) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: 'A product in your cart no longer exists' });
      }
      if (product.isBlocked) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: `${product.productName} is no longer available` });
      }

      const variant = product.variants && product.variants[item.variantIndex || 0];
      if (!variant || variant.isBlocked) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: `${product.productName} (${variant ? variant.unit : 'variant'}) is no longer available` });
      }
      if (variant.quantity < item.quantity) {
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: `${product.productName} only has ${variant.quantity} left in stock` });
      }
    }

    res.status(STATUS_CODES.SUCCESS).json({ success: true });

  } catch (err) {
    console.error('validateCheckout error:', err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

module.exports = {
  getCart,
  addToCart,
  incQuantity,
  decQuantity,
  removeFromCart,
  validateCheckout
}