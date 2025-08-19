const Product = require('../../models/productModel');
const Cart = require('../../models/cartModel');
const Wishlist = require('../../models/wishlistModel');
const STATUS_CODES = require('../../constants/statusCodes');


const MAX_QTY = 5; 

const getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.render('user/cart', { cart: [], userName: req.user.name });
    }

    res.render('user/cart', {
      cart: cart.items, 
      userName: req.user.name
    });

  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send('Server Error');
  }
};


const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found' });
    }

    if (product.isBlocked || product.quantity <= 0) {
      return res.json({ success: false, message: 'Product is unavailable' });
    }

    if (product.stock <= 0) {
      return res.json({ success: false, message: 'Product is out of stock' });
    }

    await Wishlist.updateOne({ userId }, { $pull: { products: productId } });

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(p => p.productId.toString() === productId);
    const price = product.salesPrice > 0 ? product.salesPrice : product.regularPrice;
    
    if (existingItem) {
      if (existingItem.quantity < MAX_QTY && existingItem.quantity < product.quantity) {
        existingItem.quantity += 1;
        existingItem.totalPrice = existingItem.quantity * price;
      } else {
        return res.status(500).json({ success: false, message: 'Max quantity reached' });
      }
    } else {
      cart.items.push({
        productId,
        quantity: 1,
        totalPrice: price
      });
    }

    let cartCount = cart.items.length

    await cart.save();
    res.status(200).json({ success: true, cartCount });

  } catch (err) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Something went wrong' });
  }
};

const incQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const item = cart.items.find(p => p.productId._id.toString() === productId);
    if (!item) return res.json({ success: false, message: 'Product not in cart' });

    const stock = item.productId.quantity;
    if (item.quantity + 1 <= MAX_QTY && item.quantity + 1 <= stock) {
    item.quantity += 1;
    await cart.save();
    return res.json({ success: true });
    } 
    else {
        return res.json({ success: false, message: 'Max quantity reached' });
    }
} 
catch (err) {
    res.json({ success: false, message: 'Something went wrong' });
  }
};

const decQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(p => p.productId.toString() === productId);
    if (itemIndex === -1) return res.json({ success: false, message: 'Product not in cart' });

    if (cart.items[itemIndex].quantity > 1) {
      cart.items[itemIndex].quantity -= 1;
      await cart.save();
      return res.json({ success: true });
    } else {
      return res.json({ success: false, message: 'Quantity cannot be less than 1' });
    }

  } catch (err) {
    console.error(err);
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
      if (item.productId.stock < item.quantity) {
        return res.json({  success: false,  message: `${item.productId.name} is out of stock`});
      }
    }

    res.json({ success: true });

  } catch (err) {
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