const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const coupensSchema = new mongoose.Schema({
    offerPrice : {
        type : Number,
        required : true,
    },
    minimumPurchaseAmount : {
        type : Number,
        required : true,
    },
    userId : {
        type : Schema.Types.ObjectId,
        ref : "User",
        required : true,
    },
    isActive : {
        type : Boolean,
        required : true,
    },
    perUseLimit : {
        type : Number,
        required : true,
    },
    description : {
        type : String,
        required : true,
    }
}, { timestamps : true});

module.exports = mongoose.model("Coupens", coupensSchema);