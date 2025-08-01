const mongoose = require(' mongoose ');
const Schema = mongoose.Schema;

const varientSchema = mongoose.Schema({
    productId : {
        type : Schema.Types.ObjectId,
        ref : "Products"
    },
    salePrice : {
        type : Number,
        required : false,
        min : ['0'],
    },
    regularPrice : {
        type : Number,
        required : true,
    },
    inStock : {
        type : Boolean,
        required : true,
        min : ['0'],
        default : 0,
    },
    quantity : {
        type : Number,
        required : true,
    },
    isBlock : {
        type : Boolean,
        required : true,
    },
    size : {
        type : String,
        required : true,
    },
    colour : {
        type : String,
        required : true,
    }
}, { timestamps : true });

module.exports = mongoose.model("Varients", varientSchema)