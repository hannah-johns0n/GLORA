const mongoose = require('mongoose');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const Address = require('../../models/addressModel');
const PDFDocument = require('pdfkit');
const STATUS_CODES = require('../../constants/statusCodes');


const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const userName = req.user.name;
        const search = req.query.search || "";

        const orders = await Order.find({
            userId,
            orderId: { $regex: search, $options: 'i' }
        })
        .populate('orderItems.productId')
        .sort({ createdAt: -1 });

        res.render('user/my-orders', { orders, search,  userName });
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
        const userId = req.user.id; 
        const orderId = req.params.orderId;

           console.log(orderId);

        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "User not authenticated." });
        }

        const order = await Order.findOne({
        orderId: orderId, // use your UUID field
        userId: req.user.id,
        })

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({ message: "Order not found or you do not have permission to cancel it." });
        }

        if (order.status === "Delivered" || order.status === "Cancelled" || order.status === "Returned") {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ message: `This order is already ${order.status} and cannot be cancelled.` });
        }

        for (const item of order.orderItems) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }
        }
        
        order.status = "Cancelled";
order.cancellationReason = req.body.reason || "No reason provided";
await order.save();

        res.status(STATUS_CODES.SUCCESS).json({ message: "Order cancelled successfully!" });
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
            userId: req.user.id
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
        const orderId = req.params.orderId;
        const userName = req.user.name;

        const order = await Order.findOne({
            orderId: orderId,
            userId: req.user.id
        });

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");
        if (order.status !== "Delivered") return res.status(400).send("Only delivered orders can be returned");

        res.render('user/return-request', { order, userName });
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};


const returnOrder = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(STATUS_CODES.BAD_REQUEST).send("Return reason is required");

        const order = await Order.findOne({
            orderId: req.params.orderId,
            userId: req.user.id
        });

        if (!order) return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");
        if (order.status !== "Delivered") return res.status(STATUS_CODES.BAD_REQUEST).send("Only delivered orders can be returned");

        order.status = "Return-Request";
        order.returnReason = reason; 
        await order.save();

        res.redirect('/my-orders');
    } catch (err) {
        console.error(err);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Server Error");
    }
};

const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user.id
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

module.exports = { downloadInvoice };

module.exports = {
    getMyOrders,
    getOrderDetails,
    cancelOrder,
    cancelProduct,
    getReturnRequestPage,
    returnOrder,
    downloadInvoice
}