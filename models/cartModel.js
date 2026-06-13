const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new mongoose.Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    appliedCoupon: {
        type: String,
        default: null
    },
    items: [
        {
            productId: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },
            variantIndex: {
                type: Number, 
                default: 0
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            totalPrice: {
                type: Number,
                required: true
            }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model("Cart", cartSchema);
