const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema ({
    orderId : {
        type : String,
        unique : true,
        default: () => uuidv4(),
    },
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true,
    },
    orderItems : [{
        productId : {
        type : Schema.Types.ObjectId,
        ref: "Product",
        required : true,
    },
    quantity : {
        type : Number,
        required : true,
    },
    status: {
            type: String,
            enum: ['Pending', 'Cancelled', 'Returned', 'Delivered', 'Return-Request', 'Return-Rejected'],
            default: 'Pending'
        },
    cancelReason: {
            type: String,
            default: null
        },
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
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Return-Request', 'Return-Rejected'],
        default: 'Pending'
    },
    returnReason: {
        type: String,
        default: null
    },
    cancellationReason: {   // <-- add this at order level
        type: String,
        default: null
    }
}, { timestamps : true });

module.exports = mongoose.model("Order", orderSchema)