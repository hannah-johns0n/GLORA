const mongoose = require('mongoose');

// Simple schema just to keep OTPs for password reset. Keeps validation minimal and avoids
// the full `User` or `TempUser` requirements.
const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
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

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
