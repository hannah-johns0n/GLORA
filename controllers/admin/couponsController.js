const Coupon = require("../../models/coupensModel");

const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().lean(); 
    res.render('admin/coupons', { coupons });  
  } catch (err) {
    console.error("Error fetching coupons:", err);
    res.status(500).send("Server Error");
  }
};

const getAddCoupon = (req, res) => {
  res.render("admin/addCoupon", { path: "/admin/coupons" });
};

const postAddCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive
    } = req.body;

    await Coupon.create({
      couponCode,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive: isActive === "on" ? true : false
    });

res.redirect('/admin/coupons?success=true');
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).send("Failed to create coupon");
  }
};

const getEditCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id).lean();

    if (!coupon) {
      return res.redirect('/admin/coupons?error=notfound');
    }

    res.render("admin/editCoupon", { coupon });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.redirect('/admin/coupons?error=true');
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
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive
    } = req.body;

    await Coupon.findByIdAndUpdate(id, {
      couponCode,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      expiryDate,
      perUserLimit,
      maxUses,
      isActive: isActive === "on" ? true : false
    });

    res.redirect('/admin/coupons?updated=true');
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.redirect('/admin/coupons?error=true');
  }
};


const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await Coupon.findByIdAndDelete(id);
    res.redirect('/admin/coupons?deleted=true');
  } catch (err) {
    console.error("Error deleting coupon:", err);
    res.redirect('/admin/coupons?error=true');
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
