const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new mongoose.Schema ({
    orderId : {
        type : String,
        unique : true,
    },
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true,
    },
    orderItems : [{
        productId : {
        type : Schema.Types.ObjectId,
        ref: "Products",
        required : true,
    },
    quantity : {
        type : Number,
        required : true,
    }
    }],
    totalPrice : {
        type : Number,
        required : true,
    },
    discount : {
        type : Number,
        default : 0,
    },
    addressId : {
        type : Schema.Types.ObjectId,
        ref : "Address",
        required : true,
    },
    status : {
        type : String,
        required : true,
        enum : ["Pending", "Processing", "Delivered", "Cancelled", "Returned", "Return-Request"],
    }
}, { timestamps : true });

module.exports = mongoose.model("Order", orderSchema)