const Product = require('../../models/productModel');
const Cart = require('../../models/cartModel');
const Wishlist = require('../../models/wishlistModel');
const STATUS_CODES = require('../../constants/statusCodes');
const { getActiveOffers, calculateCartPricing } = require('../../utils/discountService');


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

    res.render('user/cart', {
      cart: cartItems,
      subtotal: pricing.subtotal,
      offerDiscount: pricing.offerDiscount,
      total: pricing.priceAfterOffer,
      userName: req.user.name,
      user: req.user,
      url: req.originalUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const variantIndex = parseInt(req.body.variantIndex) || 0;

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found' });
    }

    if (product.isBlocked) {
      return res.json({ success: false, message: 'Product is unavailable' });
    }

    const variant = product.variants && product.variants[variantIndex]
      ? product.variants[variantIndex]
      : product.variants && product.variants[0];

    if (!variant) {
      return res.json({ success: false, message: 'Variant not found' });
    }

    if (variant.isBlocked) {
      return res.json({ success: false, message: 'This variant is unavailable' });
    }

    if (variant.quantity <= 0) {
      return res.json({ success: false, message: 'This variant is out of stock' });
    }

    const price = variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;

    await Wishlist.deleteOne({ userId, productId });

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(item =>
      item.productId.toString() === productId &&
      (item.variantIndex || 0) === variantIndex
    );

    if (existingItem) {
      if (existingItem.quantity >= MAX_QTY) {
        return res.status(400).json({ success: false, message: `Maximum ${MAX_QTY} items allowed per product` });
      }
      if (existingItem.quantity >= variant.quantity) {
        return res.status(400).json({ success: false, message: 'Not enough stock available' });
      }
      existingItem.quantity += 1;
      existingItem.totalPrice = existingItem.quantity * price;
    } else {
      cart.items.push({
        productId,
        variantIndex,
        quantity: 1,
        totalPrice: price
      });
    }

    await cart.save();

    res.status(200).json({
      success: true,
      cartCount: cart.items.length
    });

  } catch (err) {
    console.error('addToCart error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

const incQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const item = cart.items.find(i => i.productId._id.toString() === productId);
    if (!item) return res.json({ success: false, message: 'Product not in cart' });

    const variantIndex = item.variantIndex || 0;
    const variant = item.productId.variants && item.productId.variants[variantIndex];
    if (!variant) return res.json({ success: false, message: 'Variant not found' });

    const stock = variant.quantity;

    if (item.quantity + 1 > MAX_QTY) {
      return res.json({ success: false, message: `Maximum ${MAX_QTY} items allowed` });
    }
    if (item.quantity + 1 > stock) {
      return res.json({ success: false, message: 'Not enough stock available' });
    }

    const price = variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;
    item.quantity += 1;
    item.totalPrice = item.quantity * price;

    await cart.save();
    return res.json({ success: true });

  } catch (err) {
    console.error('incQuantity error:', err);
    res.json({ success: false, message: 'Something went wrong' });
  }
};

const decQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(i => i.productId._id.toString() === productId);
    if (itemIndex === -1) return res.json({ success: false, message: 'Product not in cart' });

    const item = cart.items[itemIndex];

    if (item.quantity <= 1) {
      return res.json({
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
    return res.json({ success: true });

  } catch (err) {
    console.error('decQuantity error:', err);
    res.json({ success: false, message: 'Something went wrong' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    await Cart.updateOne({ userId }, { $pull: { items: { productId } } });
    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, message: 'Something went wrong' });
  }
};

const validateCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: 'Cart is empty' });
    }

    for (let item of cart.items) {
      const product = item.productId;
      if (!product) {
        return res.json({ success: false, message: 'A product in your cart no longer exists' });
      }
      if (product.isBlocked) {
        return res.json({ success: false, message: `${product.productName} is no longer available` });
      }

      const variant = product.variants && product.variants[item.variantIndex || 0];
      if (!variant || variant.isBlocked) {
        return res.json({ success: false, message: `${product.productName} (${variant ? variant.unit : 'variant'}) is no longer available` });
      }
      if (variant.quantity < item.quantity) {
        return res.json({ success: false, message: `${product.productName} only has ${variant.quantity} left in stock` });
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error('validateCheckout error:', err);
    res.json({ success: false, message: 'Something went wrong' });
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