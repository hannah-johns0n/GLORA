// models/couponModel.js

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    couponCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true // Converts coupon code to uppercase automatically
    },
    description: {
        type: String,
        required: true,
    },
    discountType: {
        type: String,
        enum: ['Percentage', 'Fixed Amount'], // Type of discount
        required: true,
    },
    discountValue: { // Replaces 'offerPrice' for clarity
        type: Number,
        required: true,
    },
    minimumPurchaseAmount: {
        type: Number,
        required: true,
    },
    perUserLimit: { // Max times a single user can use this coupon
        type: Number,
        required: true,
        default: 1
    },
    maxUses: { // Max times the coupon can be used in total by all users
        type: Number,
        required: true,
    },
    expiryDate: {
        type: Date,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    // To track who has used the coupon and how many times
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        useCount: {
            type: Number,
            default: 1
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema); // Renamed for convention