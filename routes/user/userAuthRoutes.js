const express = require('express');
const router = express.Router();
const userController = require("../../controllers/user/userController");
const cartController = require("../../controllers/user/cartController");
const checkoutController = require("../../controllers/user/checkoutController");
const requireAuth = require('../../middileware/userAuth');

router.get('/signup', userController.getSignup);
router.post('/signup', userController.signup);

router.get('/verify-otp', userController.getVerifyOtp);
router.post('/verify-otp', userController.postVerifyOtp);
router.get('/resend-otp', userController.resendOtp);

router.get('/login', userController.getLogin);
router.post('/login', userController.login);

router.post('/logout', userController.logout);

router.get('/shop',requireAuth, userController.getShopPage);

router.get('/product/:id', userController.getProductDetails);

router.get('/', userController.loadHomePage);

router.get('/forgot-password', userController.getForgotPassword);
router.post('/forgot-password', userController.postForgotPassword);

router.get('/forgot-password/verify', userController.verifyPasswordOtp);
router.post('/forgot-password/verify', userController.postVerifyPasswordOtp);

router.get('/reset-password',requireAuth, userController.getResetPassword);
router.post('/reset-password', userController.postResetPassword);

router.get('/profile',requireAuth,userController.getProfilePage);
router.get('/profile/edit',requireAuth, userController.getEditProfilePage);
router.post('/profile/edit', userController.updateProfile);

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

router.get('/cart', requireAuth, cartController.getCart);
router.post('/cart/add/:id', requireAuth, cartController.addToCart);
router.post('/cart/increment/:id', requireAuth, cartController.incQuantity);
router.post('/cart/decrement/:id', requireAuth, cartController.decQuantity);
router.post('/cart/remove/:id', requireAuth, cartController.removeFromCart);
router.post('/cart/validate-checkout', requireAuth, cartController.validateCheckout);

router.get("/checkout", requireAuth, checkoutController.getCheckoutPage);
router.post("/place-order", requireAuth, checkoutController.placeOrder);
router.get("/order-success/:orderId", requireAuth, checkoutController.orderSuccess);

router.get('/check-blocked', requireAuth, (req, res) => {
  res.sendStatus(200); 
});

module.exports = router;
