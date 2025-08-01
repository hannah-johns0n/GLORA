const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new mongoose.Schema({
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true,
    },
    productId : {
        type : Schema.Types.ObjectId,
        ref: "Products",
        required : true,
    },
    varientsId : {
        type : Schema.Types.ObjectId,
        ref : "Varients",
        required : true,
    },
    totalPrice : {
        type : Number,
        required : true,
    }
}, { timestamps : true});

module.exports = mongooose.model("Cart", cartSchema)