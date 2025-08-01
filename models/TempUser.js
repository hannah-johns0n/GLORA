const mongoose = require('mongoose');

const TempUser = new mongoose.Schema({
    email : {
        type : String,
        unique : true,
        required : true
    },
    phoneNumber : {
        type : Number,
        required : false
    },
    password : {
        type : String,
        required : false,
    },
    name : {
        type : String,
        required : false
    },
    otp : {
        type : String,
        required : true
    },
    otpExpires : {
        type : Date,
        required : true 
    }
});


module.exports = mongoose.model('TempUser', TempUser)