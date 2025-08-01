const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const addressSchema = new mongoose.Schema({
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true
    },
    addressType : {
        type : String,
        required : true
    },
    city : {
        type : String,
        required : true
    },
    landmark : {
        type : String,
        required : true
    },
    state : {
        type : String,
        required : true
    },
    pincode : {
        type : Number,
        required : true,
    },
    phoneNumber : {
        type : Number,
        required : true
    },
    isDefault : {
        type : Boolean,
        default : false
    }
}, { timestamps : true });

module.exports = mongoose.model('Address',addressSchema)