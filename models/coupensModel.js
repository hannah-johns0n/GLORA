// models/couponModel.js

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    couponCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true 
    },
    description: {
        type: String,
        required: true,
    },
    discountType: {
        type: String,
        enum: ['Percentage', 'Fixed Amount'], 
        required: true,
    },
    discountValue: { 
        type: Number,
        required: true,
    },
    maxDiscountAmount: {
        type: Number,
        required: function () {
            return this.discountType === 'Percentage';
        }
    },
    minimumPurchaseAmount: {
        type: Number,
        required: true,
    },
    perUserLimit: { 
        type: Number,
        required: true,
        default: 1
    },
    maxUses: { 
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

module.exports = mongoose.model("Coupon", couponSchema); 