const express = require('express');
const router = express.Router();
const requireAdminAuth = require('../../middileware/adminAuth');
const { upload, handleMulterErrors } = require('../../middileware/multerConfig');
const adminController = require('../../controllers/admin/adminController');
const customerController = require('../../controllers/admin/customerController');
const categoryController = require('../../controllers/admin/categoryController');
const productController = require('../../controllers/admin/productController');
const orderController = require('../../controllers/admin/orderController');
const couponsController = require('../../controllers/admin/couponsController');
const offerController = require("../../controllers/admin/offerController");
const salesReportController = require("../../controllers/admin/salesReportController");


router.get('/login', adminController.getAdminLogin);
router.post('/login', adminController.adminLogin);
router.post('/logout', adminController.adminLogout);

router.use(requireAdminAuth)
router.get('/dashboard', adminController.getDashboard);
router.get('/user', adminController.listCustomers);
router.get('/customer', adminController.customerPage);
router.get('/category', adminController.categoryPage);

router.post('/user/block', customerController.toggleUserBlock);
router.post('/user/unblock', customerController.toggleUserBlock);
router.post('/categories/add', categoryController.addCategory);
router.post('/categories/edit/:id', categoryController.editCategory);
router.post('/categories/block', categoryController.blockCategory);
router.post('/categories/unblock', categoryController.unblockCategory);

router.get('/products', productController.productListPage);
router.get('/products/add', productController.addProductPage);
router.post('/products/add',
  (req, res, next) => {
    upload.array('images', 4)(req, res, (err) => {
      if (err) return handleMulterErrors(err, req, res, next);
      next();
    });
  },
  productController.addProduct
);
router.post('/products/edit/:id',
  (req, res, next) => {
    upload.array('images', 4)(req, res, (err) => {
      if (err) return handleMulterErrors(err, req, res, next);
      next();
    });
  },
  productController.editProduct
);
router.get('/products/edit/:id', productController.editProductPage);
router.post('/toggle-product-block', productController.toggleProductBlock);

router.get('/order-list', orderController.getAllOrders);
router.get('/order-list/:id', orderController.getOrderDetails);
router.post('/order-list/:id/status', orderController.updateOrderStatus);
router.all('/order-list/:id/verify-return', orderController.verifyReturnRequest);

router.get("/coupons", couponsController.getCoupons);
router.get("/coupons/add", couponsController.getAddCoupon);
router.post("/coupons/add", couponsController.postAddCoupon);
router.get("/coupons/delete/:id", couponsController.deleteCoupon);
router.get('/coupons/edit/:id', couponsController.getEditCoupon);
router.post('/coupons/edit/:id', couponsController.postEditCoupon);

router.get("/offers", offerController.getOffers);
router.get("/offers/add", offerController.getAddOffer);
router.post("/offers/add", offerController.postAddOffer);
router.get("/offers/edit/:id", offerController.getEditOffer);
router.post("/offers/edit/:id", offerController.postEditOffer);
router.get("/offers/delete/:id", offerController.deleteOffer);
router.post('/offers/delete/:id', offerController.deleteOffer);

router.get("/sales-report", salesReportController.getSalesReport);
router.get("/sales-report/pdf", salesReportController.downloadPDF);
router.get("/sales-report/excel", salesReportController.downloadExcel);

module.exports = router;