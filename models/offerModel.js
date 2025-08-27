const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
  },
  offerType: {
    type: String,
    enum: ["Product", "Category", "Global"], 
    required: true,
  },
  discountType: {
    type: String,
    enum: ["Percentage", "Fixed Amount"],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
  },
  minPurchase : {
    type : Number,
    required : true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: function () {
      return this.offerType === "Product";
    }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: function () {
      return this.offerType === "Category";
    }
  },
  totalUses : {
    type : Number,
    required : true,
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("Offer", offerSchema);
