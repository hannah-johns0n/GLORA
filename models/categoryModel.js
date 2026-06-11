const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  categoryName: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
    default: '',
  },
  categoryOffer: {
    type: Number,
    default: 0,
  },
  image: {
    type: String,
    default: '',     
  },
  isBlocked: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);