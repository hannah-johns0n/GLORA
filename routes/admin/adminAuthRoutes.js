const express = require('express');
const router = express.Router();
const requireAdminAuth = require('../../middileware/adminAuth');
const { upload, handleMulterErrors } = require('../../middileware/multerConfig');
const adminController = require('../../controllers/admin/adminController');
const customerController = require('../../controllers/admin/customerController');
const categoryController = require('../../controllers/admin/categoryController');
const productController = require('../../controllers/admin/productController');


router.get('/login', adminController.getAdminLogin);
router.post('/login', adminController.adminLogin);
router.post('/logout', adminController.adminLogout);


router.get('/dashboard', requireAdminAuth, adminController.getDashboard);
router.get('/user', requireAdminAuth, adminController.listCustomers);
router.get('/customer', requireAdminAuth, adminController.customerPage);
router.get('/category', requireAdminAuth, adminController.categoryPage);

router.post('/user/block', requireAdminAuth, customerController.toggleUserBlock);
router.post('/user/unblock', requireAdminAuth, customerController.toggleUserBlock);

router.post('/categories/add', requireAdminAuth, categoryController.addCategory);
router.post('/categories/edit/:id', requireAdminAuth, categoryController.editCategory);
router.post('/categories/block', requireAdminAuth, categoryController.blockCategory);
router.post('/categories/unblock', requireAdminAuth, categoryController.unblockCategory);

router.get('/products', requireAdminAuth, productController.productListPage);
router.get('/products/add', requireAdminAuth, productController.addProductPage);
router.post('/products/add', 
  requireAdminAuth, 
  (req, res, next) => {
    upload.array('images', 4)(req, res, (err) => {
      if (err) return handleMulterErrors(err, req, res, next);
      next();
    });
  },
  productController.addProduct
);

router.post('/products/edit/:id', 
  requireAdminAuth, 
  (req, res, next) => {
    upload.array('images', 4)(req, res, (err) => {
      if (err) return handleMulterErrors(err, req, res, next);
      next();
    });
  },
  productController.editProduct
);

router.get('/products/edit/:id', requireAdminAuth, productController.editProductPage);
router.post('/toggle-product-block', requireAdminAuth, productController.toggleProductBlock);

module.exports = router;
