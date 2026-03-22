const Order = require("../../models/orderModel");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const getSalesReport = async (req, res) => {
  try {
    let { startDate, endDate, paymentMethod, orderStatus } = req.query;

    let filter = {};

    filter.status = { $in: ["Delivered", "Returned"] };

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (paymentMethod && paymentMethod !== "all") {
      filter.paymentMethod = paymentMethod;
    }

    if (orderStatus && orderStatus !== "all") {
      filter.status = orderStatus;
    }

    const orders = await Order.find(filter)
      .populate("orderItems.productId")
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    let totalSales = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    let totalOrders = orders.length;
    let avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;

    let returnedOrders = orders.filter((o) => o.status === "Returned").length;
    let returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

    res.render("admin/salesReport", {
      orders,
      totalSales,
      totalOrders,
      avgOrder,
      returnRate,
      filters: { startDate, endDate, paymentMethod, orderStatus },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating sales report");
  }
};

const downloadExcel = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "id", width: 20 },
      { header: "Customer", key: "customer", width: 30 },
      { header: "Date", key: "date", width: 20 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Payment", key: "payment", width: 20 },
      { header: "Status", key: "status", width: 15 },
    ];

    const orders = await Order.find({ status: { $in: ["Delivered", "Returned"] } })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    orders.forEach((order) => {
      worksheet.addRow({
        id: order._id.toString(),
        customer: order.userId ? order.userId.name : "N/A",
        date: new Date(order.createdAt).toDateString(),
        amount: order.totalPrice,
        payment: order.paymentMethod,
        status: order.status,
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading Excel");
  }
};

const downloadPDF = async (req, res) => {
  try {
    const orders = await Order.find({ status: { $in: ["Delivered", "Returned"] } })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

    doc.pipe(res);

    doc.fontSize(18).text("Sales Report", { align: "center" });
    doc.moveDown();

    orders.forEach((order) => {
      doc
        .fontSize(12)
        .text(
          `Order ID: ${order._id} | Customer: ${
            order.userId ? order.userId.name : "N/A"
          } | Amount: ₹${order.totalPrice} | Status: ${
            order.status
          } | Date: ${new Date(order.createdAt).toDateString()}`
        );
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading PDF");
  }
};

module.exports = {
  getSalesReport,
  downloadExcel,
  downloadPDF,
};
