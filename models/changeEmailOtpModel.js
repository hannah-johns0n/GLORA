const mongoose = require("mongoose");

const changeEmailOtpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  newEmail: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  otpExpires: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model("ChangeEmailOtp", changeEmailOtpSchema);