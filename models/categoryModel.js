const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const categorySchema = new mongoose.Schema({
    categoryName : {
        type : String,
        required : true,
        unique : true,
    },
    description : {
        type : String,
        required : true,
    },
    categoryOffer : {
        type : Number,
        default : 0,
    },
    image : {
        type : String,
        required : true,
    },
    isBlocked : {
        type : Boolean,
        required : true,
    }
}, { timestamps : true });

module.exports = mongoose.model("Category", categorySchema);