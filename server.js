require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require('path');

const userRouter = require('./routes/user/userAuthRoutes');
const adminRouter = require('./routes/admin/adminAuthRoutes');


const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use((req, res, next) => {
  res.locals.url = req.path;
  next();
});


app.use('/', userRouter);
app.use('/admin', adminRouter);

mongoose.connect(process.env.MONGODB_URL)
  .then(() => {
    app.listen(process.env.PORT, () => console.log("Server running on http://localhost:3005"));
  })
  .catch((err) => console.error(" MongoDB connection error:", err));


