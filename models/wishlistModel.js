const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const wishlistSchema = new mongoose.Schema({
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true,
    },
    productId : {
        type : Schema.Types.ObjectId,
        ref: "Product",
        required : true,
    },
    variantIndex: {
        type: Number,
        default: 0
    },
}, { timestamps : true });

module.exports = mongoose.model("Wishlist", wishlistSchema );