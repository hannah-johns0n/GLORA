const Offer = require("../../models/offerModel");
const Product = require("../../models/productModel");
const Category = require("../../models/categoryModel");
const STATUS_CODES = require("../../constants/statusCodes");
const { setFlash, getFlash } = require("../../utils/flash");

function getMinPrice(product) {
  const prices = product.variants.map(v => v.salesPrice);
  return prices.length ? Math.min(...prices) : 0;
}

function attachMinPrice(products) {
  return products.map(p => {
    const productObj = p.toObject();
    productObj.minPrice = getMinPrice(p);
    return productObj;
  });
}

async function validateOfferInput(body) {
  const { title, description, offerType, discountType, discountValue, product, category, minPurchase, totalUses, endDate } = body;

  if (!title || !title.trim()) return 'Offer title is required';
  if (!description || !description.trim()) return 'Description is required';
  if (!offerType) return 'Offer type is required';
  if (!endDate) return 'Expiry date is required';
  if (new Date(endDate) < new Date()) return 'Expiry date must be in the future';

  if (offerType === 'Product' && !product) return 'Please select a product';
  if (offerType === 'Category' && !category) return 'Please select a category';

  const discountValueNum = Number(discountValue);
  const minPurchaseNum = Number(minPurchase);
  const totalUsesNum = Number(totalUses);

  if (isNaN(discountValueNum) || discountValueNum <= 0) return 'Discount value must be greater than 0';
  if (discountType === 'Percentage' && discountValueNum >= 100) return 'Percentage discount cannot be 100% or more';
  if (isNaN(minPurchaseNum) || minPurchaseNum < 0) return 'Minimum purchase amount is invalid';
  if (isNaN(totalUsesNum) || totalUsesNum < 1) return 'Total uses must be at least 1';

  if (discountType === 'Fixed Amount' && discountValueNum >= minPurchaseNum) {
    return 'Discount amount must be less than minimum purchase amount';
  }

  if (offerType === 'Product') {
    const productDoc = await Product.findById(product);
    if (!productDoc) return 'Selected product not found';

    const minPrice = getMinPrice(productDoc);

    if (minPurchaseNum > minPrice) {
      return `Minimum purchase cannot be more than the product price (₹${minPrice})`;
    }

    if (discountType === 'Fixed Amount' && discountValueNum >= minPrice) {
      return `Discount amount must be less than the product price (₹${minPrice})`;
    }
  }

  return null;
}

const getOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOffers = await Offer.countDocuments();
    const totalPages = Math.ceil(totalOffers / limit);

    const offers = await Offer.find()
      .populate("product category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const flash = getFlash(req, res);

    res.status(STATUS_CODES.SUCCESS).render("admin/offers", {
      offers,
      currentPage: page,
      totalPages,
      totalOffers,
      flash,
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    setFlash(res, 'error', 'Something went wrong while loading offers');
    res.redirect('/admin/dashboard');
  }
};

const getAddOffer = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false });
    const categories = await Category.find({ isBlocked: false });

    res.status(STATUS_CODES.SUCCESS).render("admin/addOffer", {
      products: attachMinPrice(products) || [],
      categories: categories || []
    });
  } catch (error) {
    console.error("Error loading add offer page:", error);
    setFlash(res, 'error', 'Something went wrong while loading the page');
    res.redirect('/admin/offers');
  }
};

const postAddOffer = async (req, res) => {
  try {
    const { title, description, offerType, discountType, discountValue, product, category, minPurchase, totalUses, endDate } = req.body;

    const errorMessage = await validateOfferInput(req.body);
    if (errorMessage) {
      setFlash(res, 'error', errorMessage);
      return res.redirect('/admin/offers/add');
    }

    const newOffer = new Offer({
      title: title.trim(),
      description: description.trim(),
      offerType,
      discountType,
      discountValue: Number(discountValue),
      minPurchase: Number(minPurchase),
      totalUses: Number(totalUses),
      product: offerType === "Product" ? product : null,
      category: offerType === "Category" ? category : null,
      endDate,
    });

    await newOffer.save();
    setFlash(res, 'success', 'Offer added successfully');
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error adding offer:", error);
    setFlash(res, 'error', 'Failed to create offer');
    res.redirect('/admin/offers/add');
  }
};

const getEditOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      setFlash(res, 'error', 'Offer not found');
      return res.redirect('/admin/offers');
    }

    const products = await Product.find({ isBlocked: false });
    const categories = await Category.find({ isBlocked: false });

    res.status(STATUS_CODES.SUCCESS).render("admin/editOffer", {
      offer,
      products: attachMinPrice(products),
      categories
    });
  } catch (error) {
    console.error("Error loading edit offer:", error);
    setFlash(res, 'error', 'Something went wrong');
    res.redirect('/admin/offers');
  }
};

const postEditOffer = async (req, res) => {
  try {
    const { title, description, offerType, discountType, discountValue, product, category, totalUses, minPurchase, endDate, isActive } = req.body;

    const errorMessage = await validateOfferInput(req.body);
    if (errorMessage) {
      setFlash(res, 'error', errorMessage);
      return res.redirect(`/admin/offers/edit/${req.params.id}`);
    }

    const isActiveValue = isActive === 'on';

    await Offer.findByIdAndUpdate(req.params.id, {
      title: title.trim(),
      description: description.trim(),
      offerType,
      discountType,
      minPurchase: Number(minPurchase),
      discountValue: Number(discountValue),
      totalUses: Number(totalUses),
      product: offerType === "Product" ? product : null,
      category: offerType === "Category" ? category : null,
      endDate,
      isActive: isActiveValue,
    });

    setFlash(res, 'success', 'Offer updated successfully');
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating offer:", error);
    setFlash(res, 'error', 'Failed to update offer');
    res.redirect(`/admin/offers/edit/${req.params.id}`);
  }
};

const deleteOffer = async (req, res) => {
  try {
    const deleted = await Offer.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Offer not found' });
    }

    res.status(STATUS_CODES.SUCCESS).json({ success: true, message: 'Offer deleted successfully' });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to delete offer' });
  }
};

module.exports = {
  getOffers,
  getAddOffer,
  postAddOffer,
  getEditOffer,
  postEditOffer,
  deleteOffer
};