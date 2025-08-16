const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const User = require('../../models/userModel');
const STATUS_CODES = require('../../constants/statusCodes');

const getAllOrders = async (req, res) => {
    try {
        let { search, status, sort, page } = req.query;

        search = search || "";
        status = status || "";
        sort = sort || "desc";
        page = parseInt(page) || 1;
        const limit = 10;

        const query = {};

        // Only add the orderId search if a search term exists
        if (search) {
            query.orderId = { $regex: search, $options: "i" };
        }
        
        // Add status filter if it exists and is not 'All Status'
        if (status) {
            query.status = status;
        }

        // Log the final query and sort objects
        console.log('MongoDB Query:', query);
        console.log('MongoDB Sort:', { createdAt: sort === "asc" ? 1 : -1 });

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
    } 
    catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

// View Order Details
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('orderItems.productId')
            .populate('addressId');

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");

        res.render('admin/orderDetails', { order });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

// Change Order Status
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id).populate('orderItems.productId');

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ message: "Order not found" });
        }

        if (order.status === "Delivered" || order.status === "Cancelled") {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Cannot change status of a delivered or cancelled order" });
        }

        if (status === "Cancelled" && order.status !== "Cancelled") {
            for (const item of order.orderItems) {
                await Product.findByIdAndUpdate(item.productId._id, { $inc: { stock: item.quantity } });
            }
        }

        if (status === "Delivered" && order.status !== "Delivered") {
            for (const item of order.orderItems) {
                await Product.findByIdAndUpdate(item.productId._id, { $inc: { stock: -item.quantity } });
            }
        }

        order.status = status;
        await order.save();
        
        // Send a success JSON response
        res.status(STATUS_CODES.SUCCESS).json({ message: "Order status updated successfully!" });

    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: "Server Error" });
    }
};

// Verify Return Request
const verifyReturnRequest = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('orderItems.productId')
            .populate('userId');

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");

        if (req.body.action === "accept") {
            for (const item of order.orderItems) {
                await Product.findByIdAndUpdate(item.productId._id, { $inc: { stock: item.quantity } });
            }

            order.status = "Returned";
        } else {
            order.status = "Return-Rejected";
        }

        await order.save();
        res.redirect('/admin/order-list');
    } 
    catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

module.exports = {
    getAllOrders,
    getOrderDetails,
    updateOrderStatus,
    verifyReturnRequest
}