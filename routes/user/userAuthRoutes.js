const express = require('express');
const router = express.Router();
const userController = require("../../controllers/user/userController");
const requireAuth = require('../../middileware/userAuth');

router.get('/signup', userController.getSignup);
router.post('/signup', userController.signup);

router.get('/verify-otp', userController.getVerifyOtp);
router.post('/verify-otp', userController.postVerifyOtp);
router.get('/resend-otp', userController.resendOtp);

router.get('/login', userController.getLogin);
router.post('/login', userController.login);

router.post('/logout', userController.logout);

router.get('/shop', userController.getShopPage);

router.get('/product/:id', userController.getProductDetails);

router.get('/', userController.loadHomePage);

router.get('/forgot-password', userController.getForgotPassword);
router.post('/forgot-password', userController.postForgotPassword);

router.get('/forgot-password/verify', userController.verifyPasswordOtp);
router.post('/forgot-password/verify', userController.postVerifyPasswordOtp);

router.get('/reset-password',requireAuth, userController.getResetPassword);
router.post('/reset-password', userController.postResetPassword);

router.get('/profile',requireAuth,userController.getProfilePage);
router.get('/profile/edit', userController.getEditProfilePage);
router.post('/profile/edit', userController.updateProfile);

router.get('/check-blocked', requireAuth, (req, res) => {
  res.sendStatus(200); 
});

module.exports = router;
