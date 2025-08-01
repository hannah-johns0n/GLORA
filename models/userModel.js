const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true,
    },
    email : {
        type : String,
        required : true,
        unique : true,
        lowercase : true,
    },
    phoneNumber : {
        type : String,
        required : true,
    },
    password : {
        type : String,
        required : true,
    },
    isBlocked : {
        type : Boolean,
        default : false,
    },
    role: {
        type : String,
        enum:['user','admin'],
        default : 'user',
    },

    cart : [{
        type : Schema.Types.ObjectId,
        ref : "Cart",
    }],
    wallet : {
        type : Number,
        default : 0,
    },
    wishlist : [{
        type : Schema.Types.ObjectId,
        ref : "Wishlist",
    }],
    orderHistory : [{
        type : Schema.Types.ObjectId,
        ref : "Order",
    }],
    createdOn : {
        type : Date,
        default : Date.now,
    },
    referralCode : {
        type : String,
    },
    redeemed : {
        type : Boolean,
        default : false,
    },
    redeemedUser : [{
        type : Schema.Types.ObjectId,
        ref : "User"
    }],
}, {timestamps : true});

module.exports = mongoose.model('User', userSchema)