const express = require('express');
const router = express.Router();
const requireAdminAuth = require('../../middileware/adminAuth');
const { upload, handleMulterErrors } = require('../../middileware/multerConfig');
const adminController = require('../../controllers/admin/adminController');
const customerController = require('../../controllers/admin/customerController');
const categoryController = require('../../controllers/admin/categoryController');
const productController = require('../../controllers/admin/productController');
const orderController = require('../../controllers/admin/orderController');


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
router.get('/order-list/:id/verify-return', orderController.verifyReturnRequest);


module.exports = router;