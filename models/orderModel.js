const mongoose = require('mongoose');
const Schema   = mongoose.Schema;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema({
  orderId: {
    type:    String,
    unique:  true,
    default: () => uuidv4()
  },
  userId: {
    type:     Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  orderItems: [{
    productId: {
      type:     Schema.Types.ObjectId,
      ref:      'Product',
      required: true
    },
    variantIndex: {
      type:    Number,
      default: 0
    },
    quantity: {
      type:     Number,
      required: true
    },
    price: {
      type:    Number,
      default: 0
    },
    name: {
      type:    String,
      default: ''
    },
    unit: {
      type:    String,
      default: ''
    },
    image: {
      type:    String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Pending','Processing','Shipped','Delivered','Cancelled',
             'Return-Requested','Returned','Return-Rejected'],
      default: 'Pending'
    },
    cancelReason: { type: String, default: null },
    returnReason: { type: String, default: null },
    returnRequest: {
      requestedAt: Date,
      status: { type: String, enum: ['pending','approved','rejected'], default: null },
      reason: String,
      processedAt: Date
    }
  }],

  subtotal: {
    type:    Number,
    default: 0
  },
  shipping: {
    type:    Number,
    default: 50
  },
  discount: {
    type:    Number,
    default: 0
  },
  offerDiscount: {
    type:    Number,
    default: 0
  },
  couponDiscount: {
    type:    Number,
    default: 0
  },
  appliedCoupon: {
    type: String,
    default: null
  },
  totalPrice: {
    type:     Number,
    required: true
  },
  addressId: {
    type:     Schema.Types.ObjectId,
    ref:      'Address',
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['COD', 'Online', 'Wallet']  
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Pending', 'Failed']
  },
  status: {
    type:    String,
    enum:    ['Pending','Processing','Shipped','Delivered','Cancelled',
              'Return-Requested','Returned','Return-Rejected'],
    default: 'Pending'
  },
  razorpayOrderId:    { type: String },
  cancellationReason: { type: String, default: null },
  returnReason:       { type: String, default: null },
  returnRequest: {
    requestedAt:     Date,
    status:          { type: String, enum: ['pending','approved','rejected'] },
    reason:          String,
    refundProcessed: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);