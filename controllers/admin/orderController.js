const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const STATUS_CODES = require('../../constants/statusCodes');

// Get all orders with pagination and filtering
const getAllOrders = async (req, res) => {
    try {
        let { search, status, sort, page } = req.query;

        search = search || "";
        status = status || "";
        sort = sort || "desc";
        page = parseInt(page) || 1;
        const limit = 10;

        const query = {};

        if (search) {
            query.orderId = { $regex: search, $options: "i" };
        }
        
        if (status) {
            query.status = status;
        }

        const totalOrders = await Order.countDocuments(query);

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: sort === "asc" ? 1 : -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.render('admin/orders', {
            orders,
            search,
            status,
            sort,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

// Get order details by ID
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('orderItems.productId')
            .populate('addressId');

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");

        res.render('admin/orderDetails', { order, req });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id).populate('orderItems.productId');

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ message: "Order not found" });
        }

        if (order.status === "Delivered" || order.status === "Cancelled") {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ 
                message: "Cannot change status of a delivered or cancelled order" 
            });
        }

        // Handle stock updates for cancelled or delivered orders
        if (status === "Cancelled" && order.status !== "Cancelled") {
            for (const item of order.orderItems) {
                await Product.findByIdAndUpdate(item.productId._id, { 
                    $inc: { stock: item.quantity } 
                });
            }
        }

        if (status === "Delivered" && order.status !== "Delivered") {
            for (const item of order.orderItems) {
                await Product.findByIdAndUpdate(item.productId._id, { 
                    $inc: { stock: -item.quantity } 
                });
            }
        }

        order.status = status;
        await order.save();
        
        res.status(STATUS_CODES.SUCCESS).json({ 
            message: "Order status updated successfully!" 
        });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ 
            message: "Server Error" 
        });
    }
};

const verifyReturnRequest = async (req, res) => {
    try {
        console.log('Verify return request for order ID:', req.params.id);
        console.log('Action:', req.query.action);
        
        const order = await Order.findById(req.params.id)
            .populate('orderItems.productId')
            .populate('userId');

        if (!order) {
            console.log('Order not found');
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: "Order not found"
            });
        }

        console.log('Order status:', order.status);
        console.log('Order return request:', order.returnRequest);

        if (order.status !== 'Return-Requested' && order.status !== 'Return-Request') {
            console.log('Invalid status for return request:', order.status);
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: `This order doesn't have a pending return request. Current status: ${order.status}`
            });
        }

        let actionTaken = null;
        const action = req.query.action || req.body.action;

        if (!action || (action !== 'accept' && action !== 'reject')) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: "Invalid or missing action parameter"
            });
        }

        if (action === "accept") {
            console.log('Accepting return request for order:', order.orderId);
            await handleReturnAccept(order);
            order.status = 'Returned';
            order.returnRequest.refundAmount = order.totalPrice;
            order.returnRequest.refundMethod = order.paymentMethod === 'Online' ? 'wallet' : 'n/a';
            actionTaken = "accepted";
        } else if (action === "reject") {
            console.log('Rejecting return request for order:', order.orderId);
            order.status = 'Return-Rejected';
            order.returnRequest = order.returnRequest || {};
            order.returnRequest.status = 'rejected';
            order.returnRequest.processedAt = new Date();
            actionTaken = "rejected";
        }

        const updatedOrder = await order.save();
        console.log('Order after return processing:', {
            orderId: updatedOrder.orderId,
            status: updatedOrder.status,
            returnRequest: updatedOrder.returnRequest,
            updatedAt: updatedOrder.updatedAt
        });
        
        return res.json({
            success: true,
            message: `Return request ${actionTaken} successfully`,
            action: actionTaken,
            order: {
                id: order._id,
                orderId: order.orderId,
                status: order.status,
                returnRequest: order.returnRequest
            }
        });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

async function handleReturnAccept(order) {
    console.log('Processing return acceptance for order:', order.orderId);
    
    order.returnRequest = order.returnRequest || {
        status: 'pending',
        requestedAt: new Date(),
        processedAt: null,
        refundAmount: 0,
        refundMethod: 'wallet' 
    };
    
    order.returnRequest.status = 'approved';
    order.returnRequest.processedAt = new Date();
    order.returnRequest.refundAmount = Number(order.totalPrice);
    order.returnRequest.refundMethod = order.paymentMethod === 'Online' ? 'wallet' : 'n/a';
    
    const shouldProcessRefund = (order.paymentMethod === 'Online' && order.paymentStatus === 'Paid') || 
                              (order.paymentMethod === 'COD');
    
    if (shouldProcessRefund) {
        const refundAmount = Number(order.totalPrice);
        
        if (isNaN(refundAmount) || refundAmount <= 0) {
            throw new Error("Invalid refund amount");
        }

        try {
            let wallet = await Wallet.findOne({ user: order.userId._id });
            
            if (!wallet) {
                wallet = new Wallet({ 
                    user: order.userId._id, 
                    balance: 0, 
                    transactions: [] 
                });
            }

            if (isNaN(wallet.balance)) {
                wallet.balance = 0;
            }

            wallet.transactions.push({
                amount: refundAmount,
                type: 'credit',
                description: `Refund for returned order #${order.orderId}`,
                date: new Date()
            });
            
            wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
            await wallet.save();
            
            console.log(`Refund of ${refundAmount} processed for order #${order.orderId}`);
            order.returnRequest.refundStatus = 'completed';
            
        } catch (walletError) {
            console.error('Error processing wallet refund:', walletError);
            order.returnRequest.refundStatus = 'failed';
            order.returnRequest.refundError = walletError.message;
        }
    } else {
        order.returnRequest.refundStatus = 'not_required';
    }
    
    for (const item of order.orderItems) {
        try {
            await Product.findByIdAndUpdate(
                item.productId._id,
                { $inc: { stock: item.quantity } },
                { new: true }
            );
        } catch (stockError) {
            console.error('Error updating product stock:', stockError);
        }
    }
    
    order.status = 'Returned';
    order.returnRequest.completedAt = new Date();
    
    await order.save();
    
    console.log(`Order ${order.orderId} marked as returned and wallet updated`);
}

module.exports = {
    getAllOrders,
    getOrderDetails,
    updateOrderStatus,
    verifyReturnRequest
};