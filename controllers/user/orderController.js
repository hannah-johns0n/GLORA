const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const Address = require('../../models/addressModel');
const User = require('../../models/userModel');
const STATUS_CODES = require('../../constants/statusCodes');
const PDFDocument = require('pdfkit');

const getMyOrders = async (req, res) => {
    try {
        const token = req.cookies.jwt;
        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id || decoded.userId;
        
        if (!userId) {
            res.clearCookie('jwt');
            return res.redirect('/login');
        }

        const user = await User.findById(userId).select('name');
        if (!user) {
            res.clearCookie('jwt');
            return res.redirect('/login');
        }

        const search = req.query.search || "";
        const orders = await Order.find({
            userId,
            orderId: { $regex: search, $options: 'i' }
        })
        .populate('orderItems.productId')
        .sort({ createdAt: -1 });
    
        res.render('user/my-orders', { 
            orders, 
            search,  
            userName: user.name 
        });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};


const getOrderDetails = async (req, res) => {
      const userName = req.user.name;
    try {
        const order = await Order.findOne({
            orderId: req.params.orderId,
            userId: req.user.id
        })
        .populate('orderItems.productId')
        .populate('addressId');

        if (!order) return res.status(404).send("Order not found");
    
        res.render('user/order-details', { order, userName });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};


const cancelOrder = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.session.user?._id; 
        const orderId = req.params.orderId;

           console.log(orderId);

        if (!req.session.user || !req.session.user.id) {
            return res.status(401).json({ message: "User not authenticated." });
        }

        const order = await Order.findOne({
            orderId: orderId,
            userId: req.session.user.id,
        }).populate('userId');

        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }

        if (order.couponInfo) {
            return res.status(400).json({ 
                message: "Orders with applied coupons cannot be cancelled." 
            });
        }

        if (order.status !== "Pending" && order.status !== "Processing") {
            return res.status(400).json({ 
                message: "Order cannot be cancelled at this stage." 
            });
        }

        if (order.paymentMethod === 'Online' && order.paymentStatus === 'Paid') {
            const refundAmount = Number(order.totalPrice);
            if (isNaN(refundAmount) || refundAmount <= 0) {
                console.error('Invalid refund amount:', order.totalAmount);
                return res.status(400).json({ 
                    message: 'Invalid refund amount. Please contact support.' 
                });
            }
            
            let wallet = await Wallet.findOne({ user: userId });
            
            if (!wallet) {
                wallet = new Wallet({
                    user: userId,
                    balance: 0,
                    transactions: []
                });
            }
            
            if (isNaN(wallet.balance)) {
                wallet.balance = 0;
            }
            
            try {
                wallet.transactions.push({
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for cancelled order #${order.orderId}`,
                    date: new Date()
                });
                
                wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
                await wallet.save();
                
                console.log(`Successfully processed refund of ${refundAmount} to wallet for user ${userId}`);
            } catch (walletError) {
                console.error('Error updating wallet:', walletError);
                return res.status(500).json({ 
                    message: 'Error processing wallet refund. Please contact support.' 
                });
            }
        }

        for (const item of order.orderItems) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }
        }
        
        order.status = "Cancelled";
        order.cancellationReason = reason || "No reason provided";
        await order.save();

        res.status(STATUS_CODES.SUCCESS).json({ 
            message: "Order cancelled successfully!" + 
                    (order.paymentMethod === 'Online' ? ' Refund has been processed to your wallet.' : '') 
        });
    } catch (err) {
        console.error("Error during order cancellation:", err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: "Server Error. Failed to cancel the order." });
    }
};


const cancelProduct = async (req, res) => {
    try {
        const { reason } = req.body;
        const { orderId, productId } = req.params;

        const order = await Order.findOne({
            orderId: orderId,
            userId: req.session.user.id
        }).populate("orderItems.productId");

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");

        const item = order.orderItems.find(i => i.productId._id.toString() === productId);
        if (!item) return res.status(STATUS_CODES.NOT_FOUND).send("Item not found in order");

        console.log('Item status:', item.status, 'Product ID:', productId);
        if (item.status === "Cancelled" || item.status === "Delivered") {
            return res.status(STATUS_CODES.BAD_REQUEST).send("This item cannot be cancelled");
        }

        // restore stock
        await Product.findByIdAndUpdate(productId, { $inc: { stock: item.quantity } });

        // update status and reason
        item.status = "Cancelled";
        item.cancelReason = reason || "No reason provided";

        await order.save();

        res.json({ success: true });

    } catch (err) {
        console.error("Error cancelling product:", err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};


const getReturnRequestPage = async (req, res) => {
    try {
        const token = req.cookies.jwt;
        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id || decoded.userId;
        
        if (!userId) {
            res.clearCookie('jwt');
            return res.redirect('/login');
        }

        const user = await User.findById(userId).select('name');
        if (!user) {
            res.clearCookie('jwt');
            return res.redirect('/login');
        }

        const orderId = req.params.orderId;
        const order = await Order.findOne({
            orderId: orderId,
            userId: userId
        });

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");
        if (order.status !== "Delivered") return res.status(400).send("Only delivered orders can be returned");

        res.render('user/return-request', { 
            order, 
            userName: user.name 
        });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        
        // Get user ID from JWT token
        const token = req.cookies.jwt;
        if (!token) {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login Required</title>
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            icon: 'error',
                            title: 'Login Required',
                            text: 'Please log in to request a return',
                            confirmButtonText: 'Go to Login',
                            allowOutsideClick: false
                        }).then(() => {
                            window.location.href = '/login';
                        });
                    </script>
                </body>
                </html>
            `);
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id || decoded.userId;

        if (!userId) {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invalid Token</title>
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            icon: 'error',
                            title: 'Invalid Session',
                            text: 'Your session is invalid. Please log in again.',
                            confirmButtonText: 'Go to Login',
                            allowOutsideClick: false
                        }).then(() => {
                            window.location.href = '/login';
                        });
                    </script>
                </body>
                </html>
            `);
        }

        // Find the order using orderId (UUID) instead of _id
        const order = await Order.findOne({ 
            orderId: orderId, 
            userId: new mongoose.Types.ObjectId(userId) 
        });

        if (!order) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Order Not Found</title>
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            icon: 'error',
                            title: 'Order Not Found',
                            text: 'The requested order could not be found',
                            confirmButtonText: 'View My Orders',
                            allowOutsideClick: false
                        }).then(() => {
                            window.location.href = '/my-orders';
                        });
                    </script>
                </body>
                </html>
            `);
        }

        // Check if a return has already been requested
        if (order.returnRequest) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Return Already Requested</title>
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            icon: 'warning',
                            title: 'Return Already Requested',
                            text: 'A return has already been requested for this order',
                            confirmButtonText: 'View My Orders',
                            allowOutsideClick: false
                        }).then(() => {
                            window.location.href = '/my-orders';
                        });
                    </script>
                </body>
                </html>
            `);
        }

        // Check if coupon was used
        if (order.couponInfo) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Return Not Allowed</title>
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            icon: 'error',
                            title: 'Return Not Allowed',
                            text: 'Orders with applied coupons cannot be returned',
                            confirmButtonText: 'OK',
                            allowOutsideClick: false
                        }).then(() => {
                            window.history.back();
                        });
                    </script>
                </body>
                </html>
            `);
        }

        // Update order status to indicate return request
        order.status = 'Return-Requested';
        order.returnRequest = {
            requestedAt: new Date(),
            status: 'pending',
            reason: reason || 'No reason provided',
            refundProcessed: false
        };

        await order.save();
        
        // Return HTML response with SweetAlert
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Return Request Submitted</title>
                <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            </head>
            <body>
                <script>
                    Swal.fire({
                        icon: 'success',
                        title: 'Return Request Submitted',
                        text: 'Your return request has been submitted successfully! Our team will review it shortly.',
                        confirmButtonText: 'View My Orders',
                        allowOutsideClick: false
                    }).then(() => {
                        window.location.href = '/my-orders';
                    });
                </script>
            </body>
            </html>
        `);
            
            if (!wallet) {
                wallet = new Wallet({
                    user: userId,
                    balance: 0,
                    transactions: []
                });
            }
            
            // Ensure balance is a valid number
            if (isNaN(wallet.balance)) {
                wallet.balance = 0;
            }
            
            try {
                // Add transaction to wallet
                wallet.transactions.push({
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for returned order #${order.orderId}`,
                    date: new Date()
                });
                
                // Update wallet balance
                wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
                await wallet.save();
                
                console.log(`Successfully processed return refund of ${refundAmount} to wallet for user ${userId}`);
                
            } catch (walletError) {
                console.error('Error updating wallet for return:', walletError);
                return res.status(500).json({ 
                    success: false,
                    message: 'Error processing return refund. Please contact support.'
                });
            }
        
    } catch (err) {
        console.error('Error in returnOrder:', err);
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            </head>
            <body>
                <script>
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to process return request. Please try again later.',
                        confirmButtonText: 'OK',
                        allowOutsideClick: false
                    }).then(() => {
                        window.history.back();
                    });
                </script>
            </body>
            </html>
        `);
    }
};


const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.session.user.id
    })
      .populate("orderItems.productId")
      .populate("addressId")
      .populate("userId");

    if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    // ---------- HEADER ----------
    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("INVOICE", { align: "center" });
    doc.moveDown();

    // ---------- ORDER DETAILS ----------
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Order ID: `, { continued: true })
      .font("Helvetica-Bold")
      .text(`${order.orderId}`);
    doc
      .font("Helvetica")
      .text(`Date: `, { continued: true })
      .font("Helvetica-Bold")
      .text(order.createdAt.toDateString());
    doc
      .font("Helvetica")
      .text(`Status: `, { continued: true })
      .font("Helvetica-Bold")
      .text(order.status);
    doc
      .font("Helvetica")
      .text(`Payment Method: `, { continued: true })
      .font("Helvetica-Bold")
      .text(order.paymentMethod || "N/A");
    doc
      .font("Helvetica")
      .text(`Payment Status: `, { continued: true })
      .font("Helvetica-Bold")
      .text(order.paymentStatus || "N/A");
    doc.moveDown(2);

    // ---------- BILLING INFO ----------
    doc.font("Helvetica-Bold").text("Billed To:");
    doc.font("Helvetica").text(`${order.userId?.name || "N/A"}`);
    doc.text(`${order.userId?.email || "N/A"}`);
    doc.moveDown();

    // ---------- SHIPPING INFO ----------
    doc.font("Helvetica-Bold").text("Shipping Address:");
    doc.font("Helvetica").text(
      `${order.addressId?.city || "N/A"}, ${order.addressId?.state || "N/A"}`
    );
    doc.text(`Pincode: ${order.addressId?.pincode || "N/A"}`);
    doc.text(`Phone: ${order.addressId?.phoneNumber || "N/A"}`);
    doc.moveDown(2);

    // ---------- ORDER ITEMS TABLE ----------
    let grandTotal = 0;
    const table = {
      headers: ["Product", "Price", "Qty", "Subtotal"],
      rows: []
    };

    if (order.orderItems && order.orderItems.length > 0) {
      order.orderItems.forEach((item) => {
        const price = item.productId?.price || 0;
        const quantity = item.quantity || 0;
        const subtotal = price * quantity;
        grandTotal += subtotal;

        table.rows.push([
          item.productId?.name || "N/A",
          `₹${price.toFixed(2)}`,
          quantity,
          `₹${subtotal.toFixed(2)}`
        ]);
      });
    }

    await doc.table(table, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(12),
      prepareRow: (row, i) => doc.font("Helvetica").fontSize(10),
      columnSpacing: 10,
      columnsSize: [200, 100, 70, 100],
    });

    doc.moveDown(2);

    // ---------- TOTAL ----------
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(`Total Price: ₹${order.totalPrice?.toFixed(2) || "0.00"}`, {
        align: "right",
      });

    doc.moveDown(3);

    // ---------- FOOTER ----------
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text("Thank you for shopping with us!", { align: "center" });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

// Update payment status after successful retry payment
const updatePaymentStatus = async (req, res) => {
    try {
        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const userId = req.session.user?._id;

        // Find the order and verify it belongs to the user
        const order = await Order.findOne({ orderId, userId });
        
        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Update the order with payment details
        order.paymentStatus = 'Paid';
        order.paymentDetails = {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            paymentDate: new Date()
        };
        order.status = 'Processing'; // Update order status to processing
        
        await order.save();

        res.json({ 
            success: true, 
            message: 'Payment status updated successfully',
            orderId: order.orderId
        });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to update payment status',
            error: error.message
        });
    }
};

module.exports = {
    getMyOrders,
    getOrderDetails,
    cancelOrder,
    cancelProduct,
    getReturnRequestPage,
    returnOrder,
    downloadInvoice,
    updatePaymentStatus
}