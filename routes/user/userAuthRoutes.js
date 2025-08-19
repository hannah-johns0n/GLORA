const express = require('express');
const router = express.Router();
const userController = require("../../controllers/user/userController");
const cartController = require("../../controllers/user/cartController");
const checkoutController = require("../../controllers/user/checkoutController");
const orderController = require("../../controllers/user/orderController")
const {requireAuth, isUserLoggedIn} = require('../../middileware/userAuth');
const cartModel = require('../../models/cartModel');
const jwt = require('jsonwebtoken');
const passport = require('passport');
require('../../config/passport')

router.use(async (req, res, next) => {
  const token = req.cookies.jwt;
  let cartCount = 0;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id || decoded.userId;

      if (userId) {
        const cart = await cartModel.findOne({ userId: userId });
        if (cart && cart.items) {
          cartCount = cart.items.length;
        }
      }
    } catch (err) {
      console.error("Cart middleware error:", err.message);
    }
  }

  res.locals.cartCount = cartCount;
  next();
});


router.get('/signup', isUserLoggedIn , userController.getSignup);
router.post('/signup', isUserLoggedIn, userController.signup);

router.get('/verify-otp', userController.getVerifyOtp);
router.post('/verify-otp', userController.postVerifyOtp);
router.get('/resend-otp', userController.resendOtp);

router.get('/login', isUserLoggedIn, userController.getLogin);
router.post('/login', isUserLoggedIn , userController.login);

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const { token } = req.user;
    res.cookie('jwt', token, 
      { 
        httpOnly: true ,
         maxAge: 60 * 60 * 1000 

      });
    res.redirect('/');
  }
);


router.post('/logout', userController.logout);

router.get('/shop',requireAuth, userController.getShopPage);

router.get('/product/:id', userController.getProductDetails);

router.get('/', userController.loadHomePage);

router.get('/forgot-password', userController.getForgotPassword);
router.post('/forgot-password', userController.postForgotPassword);

router.get('/forgot-password/verify', userController.verifyPasswordOtp);
router.post('/forgot-password/verify', userController.postVerifyPasswordOtp);

router.get('/reset-password',requireAuth, userController.getResetPassword);
router.post('/reset-password', requireAuth, userController.postResetPassword);

router.get('/profile',requireAuth,userController.getProfilePage);
router.get('/profile/edit',requireAuth, userController.getEditProfilePage);
router.post('/profile/edit',requireAuth, userController.updateProfile);

router.get('/manage-address', requireAuth, userController.getManageAddressPage);

router.get('/add-address', requireAuth, userController.getAddAddressPage);
router.post('/add-address', requireAuth, userController.postAddAddress);

router.get('/edit-address/:id', requireAuth, userController.getEditAddressPage);
router.post('/edit-address/:id', requireAuth, userController.postEditAddress);

router.post('/delete-address/:id',requireAuth, userController.deleteAddress);

router.get('/change-email', requireAuth, userController.getChangeEmailPage);
router.get('/verify-change-email-otp', requireAuth, userController.getVerifyEmailOtpPage);
router.post('/send-change-email-otp', userController.sendChangeEmailOtp);
router.post('/verify-change-email-otp', userController.verifyChangeEmailOtp);
router.post('/save-new-email', requireAuth, userController.saveNewEmail);

router.get('/cart', requireAuth, cartController.getCart);
router.post('/cart/add/:id', requireAuth, cartController.addToCart);
router.post('/cart/increment/:id', requireAuth, cartController.incQuantity);
router.post('/cart/decrement/:id', requireAuth, cartController.decQuantity);
router.post('/cart/remove/:id', requireAuth, cartController.removeFromCart);
router.post('/cart/validate-checkout', requireAuth, cartController.validateCheckout);

router.get("/checkout", requireAuth, checkoutController.getCheckoutPage);
router.post("/place-order", requireAuth, checkoutController.placeOrder);
router.get("/order-success/:orderId", requireAuth, checkoutController.orderSuccess);

router.get('/my-orders', requireAuth, orderController.getMyOrders);
router.get('/my-orders/:orderId', requireAuth, orderController.getOrderDetails);
router.post('/my-orders/:orderId/cancel', requireAuth, orderController.cancelOrder);
router.post('/my-orders/:orderId/cancel-product/:productId', requireAuth, orderController.cancelProduct);
router.get('/my-orders/:orderId/return-request', requireAuth, orderController.getReturnRequestPage);
router.post('/my-orders/:orderId/return', requireAuth, orderController.returnOrder);
router.get('/my-orders/:orderId/invoice', requireAuth, orderController.downloadInvoice);

router.get('/check-blocked', requireAuth, (req, res) => {
    res.sendStatus(200); 
});

module.exports = router;