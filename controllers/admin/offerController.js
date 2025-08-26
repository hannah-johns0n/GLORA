const Offer = require("../../models/offerModel");
const Product = require("../../models/productModel");
const Category = require("../../models/categoryModel");

// 📌 GET all offers
const getOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("product category")
      .sort({ createdAt: -1 });

    res.render("admin/offers", { offers });
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).send("Server Error");
  }
};

// 📌 GET add offer page
const getAddOffer = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false });
    const categories = await Category.find({ isBlocked: false });
    
    res.render("admin/addOffer", { 
      products: products || [],
      categories: categories || [] 
    });
  } catch (error) {
    console.error("Error loading add offer page:", error);
    res.status(500).send("Server Error: " + error.message);
  }
};

const postAddOffer = async (req, res) => {
  try {
    const { title, description, offerType, discountType, discountValue, product, category, minPurchase, totalUses } = req.body;

    const newOffer = new Offer({
      title,
      description,
      offerType,
      discountType,
      discountValue,
      minPurchase,
      totalUses,
      product: offerType === "Product" ? product : null,
      category: offerType === "Category" ? category : null,
      endDate: req.body.endDate,
    });

    await newOffer.save();
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).send("Server Error");
  }
};

// 📌 GET edit offer page
const getEditOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    const products = await Product.find({ isBlocked: false });
    const categories = await Category.find({ isBlocked: false });

    res.render("admin/editOffer", { offer, products, categories });
  } catch (error) {
    console.error("Error loading edit offer:", error);
    res.status(500).send("Server Error");
  }
};

// 📌 POST update offer
const postEditOffer = async (req, res) => {
  try {
    const { title, description, offerType, discountType, discountValue, product, category, startDate, endDate } = req.body;

    await Offer.findByIdAndUpdate(req.params.id, {
      title,
      description,
      offerType,
      discountType,
      minPurchase,
      discountValue,
      totalUses,
      product: offerType === "Product" ? product : null,
      category: offerType === "Category" ? category : null,
      startDate,
      endDate,
    });

    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).send("Server Error");
  }
};

const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(500).send("Server Error");
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
