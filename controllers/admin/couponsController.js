const Coupon = require("../../models/coupensModel");
const STATUS_CODES = require("../../constants/statusCodes");
const { setFlash } = require("../../utils/flash");

function validateCouponInput(body) {
  const { couponCode, description, discountType, discountValue, maxDiscountAmount, minimumPurchaseAmount, expiryDate, perUserLimit, maxUses } = body;

  if (!couponCode || !couponCode.trim()) return 'Coupon code is required';
  if (!description || !description.trim()) return 'Description is required';
  if (!expiryDate) return 'Expiry date is required';
  if (new Date(expiryDate) < new Date()) return 'Expiry date must be in the future';

  const discountValueNum = Number(discountValue);
  const minimumPurchaseNum = Number(minimumPurchaseAmount);
  const perUserLimitNum = Number(perUserLimit);
  const maxUsesNum = Number(maxUses);

  if (isNaN(discountValueNum) || discountValueNum <= 0) return 'Discount value must be greater than 0';
  if (isNaN(minimumPurchaseNum) || minimumPurchaseNum < 0) return 'Minimum purchase amount is invalid';
  if (isNaN(perUserLimitNum) || perUserLimitNum < 1) return 'Per user limit must be at least 1';
  if (isNaN(maxUsesNum) || maxUsesNum < 1) return 'Total uses must be at least 1';

  if (discountType === 'Percentage') {
    if (discountValueNum > 100) return 'Percentage discount cannot exceed 100';
    const maxDiscountNum = Number(maxDiscountAmount);
    if (isNaN(maxDiscountNum) || maxDiscountNum <= 0) return 'Max discount amount is required for percentage coupons';
  }

  if (discountType === 'Fixed Amount' && discountValueNum >= minimumPurchaseNum) {
    return 'Fixed discount amount must be less than minimum purchase amount';
  }

  return null;
}

const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().lean();
    res.status(STATUS_CODES.SUCCESS).render('admin/coupons', { coupons });
  } catch (err) {
    console.error("Error fetching coupons:", err);
    setFlash(res, 'error', 'Something went wrong while loading coupons');
    res.redirect('/admin/dashboard');
  }
};

const getAddCoupon = (req, res) => {
  res.status(STATUS_CODES.SUCCESS).render("admin/addCoupon", { path: "/admin/coupons" });
};

const postAddCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive
    } = req.body;

    const errorMessage = validateCouponInput(req.body);
    if (errorMessage) {
      setFlash(res, 'error', errorMessage);
      return res.redirect('/admin/coupons/add');
    }

    await Coupon.create({
      couponCode: couponCode.trim().toUpperCase(),
      description: description.trim(),
      discountType,
      discountValue: Number(discountValue),
      maxDiscountAmount: discountType === 'Percentage' ? Number(maxDiscountAmount) : undefined,
      minimumPurchaseAmount: Number(minimumPurchaseAmount),
      expiryDate,
      perUserLimit: Number(perUserLimit),
      maxUses: Number(maxUses),
      isActive: isActive === "on"
    });

    setFlash(res, 'success', 'Coupon added successfully');
    res.redirect('/admin/coupons');
  } catch (error) {
    console.error("Error creating coupon:", error);
    if (error.code === 11000) {
      setFlash(res, 'error', 'A coupon with this code already exists');
    } else {
      setFlash(res, 'error', 'Failed to create coupon');
    }
    res.redirect('/admin/coupons/add');
  }
};

const getEditCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id).lean();

    if (!coupon) {
      setFlash(res, 'error', 'Coupon not found');
      return res.redirect('/admin/coupons');
    }

    res.status(STATUS_CODES.SUCCESS).render("admin/editCoupon", { coupon });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    setFlash(res, 'error', 'Something went wrong');
    res.redirect('/admin/coupons');
  }
};

const postEditCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      couponCode,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive
    } = req.body;

    const errorMessage = validateCouponInput(req.body);
    if (errorMessage) {
      setFlash(res, 'error', errorMessage);
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    await Coupon.findByIdAndUpdate(id, {
      couponCode: couponCode.trim().toUpperCase(),
      description: description.trim(),
      discountType,
      discountValue: Number(discountValue),
      maxDiscountAmount: discountType === 'Percentage' ? Number(maxDiscountAmount) : undefined,
      minimumPurchaseAmount: Number(minimumPurchaseAmount),
      expiryDate,
      perUserLimit: Number(perUserLimit),
      maxUses: Number(maxUses),
      isActive: isActive === "on"
    });

    setFlash(res, 'success', 'Coupon updated successfully');
    res.redirect('/admin/coupons');
  } catch (error) {
    console.error("Error updating coupon:", error);
    if (error.code === 11000) {
      setFlash(res, 'error', 'A coupon with this code already exists');
    } else {
      setFlash(res, 'error', 'Failed to update coupon');
    }
    res.redirect(`/admin/coupons/edit/${req.params.id}`);
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Coupon.findByIdAndDelete(id);

    if (!deleted) {
      setFlash(res, 'error', 'Coupon not found');
      return res.redirect('/admin/coupons');
    }

    setFlash(res, 'success', 'Coupon deleted successfully');
    res.redirect('/admin/coupons');
  } catch (err) {
    console.error("Error deleting coupon:", err);
    setFlash(res, 'error', 'Failed to delete coupon');
    res.redirect('/admin/coupons');
  }
};

module.exports = {
  getCoupons,
  getAddCoupon,
  postAddCoupon,
  deleteCoupon,
  getEditCoupon,
  postEditCoupon
};