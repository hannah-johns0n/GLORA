const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new mongoose.Schema({
    productName : {
        type : String,
        required : true,
    },
    category : {
        type : String,
        required : true,
    },
    description : {
        type : String,
        required : true,
    },
    images : {
        type : [String],
        required : true,
    },
    regularPrice: {
        type: Number,
        required: true,
    },
    salesPrice: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    isBlocked: {
        type: Boolean,
        default: false,
    }
},{ timestamps : true });

module.exports = mongoose.model('Product', productSchema)