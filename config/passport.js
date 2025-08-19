const passport = require("passport");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_AUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id
        });
        await user.save();
      }

    const token = jwt.sign({ id: user._id, role: 'user', name: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });

      done(null, { user, token });
    } catch (err) {
      done(err, null);
    }
  }
));