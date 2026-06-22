const Order = require('../../models/orderModel');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function fetchOrders(query = {}) {
  const { startDate, endDate, paymentMethod, orderStatus } = query;

  const filter = { status: { $in: ['Delivered', 'Returned'] } };

  if (startDate && endDate) {
    filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  if (paymentMethod && paymentMethod !== 'all') {
    filter.paymentMethod = paymentMethod;
  }

  if (orderStatus && orderStatus !== 'all') {
    filter.status = orderStatus;
  }

  return Order.find(filter)
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .lean();
}

const getSalesReport = async (req, res) => {
  try {
    let { startDate, endDate, paymentMethod, orderStatus, page } = req.query;
    const filter = { status: { $in: ['Delivered', 'Returned'] } };

    if (startDate && endDate) {
      filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
    if (orderStatus && orderStatus !== 'all') filter.status = orderStatus;

    const currentPage = Math.max(parseInt(page) || 1, 1);
    const limit = 8;
    const skip = (currentPage - 1) * limit;

    const allOrders = await Order.find(filter).lean();

    const totalSales = allOrders.reduce((s, o) => s + o.totalPrice, 0);
    const totalOrders = allOrders.length;
    const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const returnedOrders = allOrders.filter(o => o.status === 'Returned').length;
    const returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

    const totalOfferDiscount = allOrders.reduce((s, o) => s + (o.offerDiscount || 0), 0);
    const totalCouponDiscount = allOrders.reduce((s, o) => s + (o.couponDiscount || 0), 0);
    const totalDiscount = allOrders.reduce((s, o) => s + (o.discount || 0), 0);

    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(filter)
      .populate('userId', 'name email')
      .populate('orderItems.productId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.render('admin/salesReport', {
      orders, totalSales, totalOrders, avgOrder, returnRate,
      totalOfferDiscount, totalCouponDiscount, totalDiscount,
      filters: { startDate, endDate, paymentMethod, orderStatus },
      currentPage, totalPages, limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating sales report');
  }
};

const downloadExcel = async (req, res) => {
  try {
    const orders = await fetchOrders(req.query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GLORA Admin';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Sales Report', {
      pageSetup: { fitToPage: true, fitToWidth: 1 }
    });

    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'GLORA - Sales Report';   // no ₹ in title so fine
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C1810' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 40;

    ws.mergeCells('A2:I2');
    const dateCell = ws.getCell('A2');
    dateCell.value = `Generated: ${new Date().toLocaleString('en-IN')}   |   Total Orders: ${orders.length}   |   Total Revenue: Rs. ${orders.reduce((s, o) => s + o.totalPrice, 0).toLocaleString('en-IN')}`;
    dateCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF888888' } };
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F0EE' } };
    dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(2).height = 22;

    ws.columns = [
      { key: 'customerName', width: 20 },
      { key: 'productName', width: 35 },
      { key: 'variant', width: 12 },
      { key: 'quantity', width: 10 },
      { key: 'unitPrice', width: 16 },
      { key: 'offerDiscount', width: 16 },
      { key: 'coupon', width: 14 },
      { key: 'couponDiscount', width: 16 },
      { key: 'totalAmount', width: 16 },
      { key: 'paymentMethod', width: 16 },
      { key: 'orderStatus', width: 16 },
      { key: 'orderDate', width: 16 },
    ];

    const headers = [
      'Customer Name', 'Product Name', 'Variant', 'Quantity',
      'Unit Price (Rs.)', 'Offer Disc. (Rs.)', 'Coupon Code', 'Coupon Disc. (Rs.)',
      'Total Amount (Rs.)', 'Payment Method', 'Order Status', 'Order Date'
    ];

    const headerRow = ws.addRow(headers);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A2C1A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });

    // ── Freeze top 3 rows (title + date + header stay visible on scroll) ──
    ws.views = [{ state: 'frozen', ySplit: 3 }];

    let rowIndex = 0;

    orders.forEach(order => {
      const items = order.orderItems && order.orderItems.length > 0
        ? order.orderItems
        : [{ name: 'N/A', unit: 'N/A', quantity: 0, price: 0, status: order.status }];

      items.forEach((item, itemIdx) => {
        const isEven = rowIndex % 2 === 0;
        const bgColor = isEven ? 'FFF9F6F4' : 'FFFFFFFF';

        const row = ws.addRow([
          itemIdx === 0 ? (order.userId?.name || 'N/A') : '',
          item.name || 'N/A',
          item.unit || 'N/A',
          item.quantity ?? 0,
          item.price != null ? Number(item.price) : 0,
          
          itemIdx === 0 ? (order.offerDiscount || 0) : '',
          itemIdx === 0 ? (order.appliedCoupon || '—') : '',
          itemIdx === 0 ? (order.couponDiscount || 0) : '',
          
          itemIdx === 0 ? order.totalPrice : '',
          itemIdx === 0 ? (order.paymentMethod || 'N/A') : '',
          item.status || order.status,
          itemIdx === 0
            ? new Date(order.createdAt).toLocaleDateString('en-IN')
            : ''
        ]);

        row.height = 22;

        row.eachCell((cell, colNum) => {
          
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF222222' } };

          const isNumCol = [4, 5, 6, 8, 9].includes(colNum); // Qty, Unit Price, Total
          cell.alignment = {
            horizontal: isNumCol ? 'right' : 'left',
            vertical: 'middle',
            wrapText: false    
          };

          cell.border = {
            top: { style: 'hair', color: { argb: 'FFDDDDDD' } },
            bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
            left: { style: 'hair', color: { argb: 'FFDDDDDD' } },
            right: { style: 'hair', color: { argb: 'FFDDDDDD' } }
          };
        });

        [5, 6, 8, 9].forEach(function (colNum) {
          var cell = row.getCell(colNum);
          if (cell.value !== '' && cell.value != null) {
            cell.numFmt = '#,##0.00';
          }
        });

        const statusCell = row.getCell(11);
        const statusValue = statusCell.value;
        if (statusValue === 'Delivered') {
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1A7A1A' } };
        } else if (statusValue === 'Returned' || statusValue === 'Return-Requested') {
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC6600' } };
        } else if (statusValue === 'Cancelled') {
          statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFCC0000' } };
        }

        rowIndex++;
      });
    });

    ws.addRow([]);

    const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
    const totalRow = ws.addRow([
      '', '', '', '',
      '', '', '', 
      'TOTAL REVENUE',
      totalRevenue,
      '', `${orders.length} orders`, ''
    ]);
    totalRow.height = 26;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      cell.alignment = { horizontal: colNum === 9 ? 'right' : 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFCCAA00' } },
        bottom: { style: 'medium', color: { argb: 'FFCCAA00' } },
      };
    });
    // Format the total revenue cell as a number too
    const totalRevenueCell = totalRow.getCell(6);
    totalRevenueCell.numFmt = '#,##0.00';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=glora-sales-report.xlsx');
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Error downloading Excel');
  }
};

function addDataRow(ws, rowIndex, data) {
  const isEven = rowIndex % 2 === 0;
  const bgColor = isEven ? 'FFFAFAFA' : 'FFFFFFFF';

  const row = ws.addRow([
    data.customerName,
    data.productName,
    data.variant,
    data.quantity,
    data.unitPrice !== '' ? Number(data.unitPrice).toFixed(2) : '',
    data.totalAmount !== '' ? Number(data.totalAmount).toFixed(2) : '',
    data.paymentMethod,
    data.orderStatus,
    data.orderDate
  ]);

  row.height = 22;
  row.eachCell((cell, colNum) => {
    cell.font = { name: 'Arial', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor.slice(2) } };
    cell.alignment = {
      horizontal: [4, 5, 6].includes(colNum) ? 'right' : 'left',
      vertical: 'middle',
      wrapText: true
    };
    cell.border = {
      top: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      left: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      right: { style: 'hair', color: { argb: 'FFDDDDDD' } }
    };
  });

  const statusCell = row.getCell(8);
  if (data.orderStatus === 'Delivered') {
    statusCell.font = { color: { argb: 'FF1A7A1A' }, bold: true, size: 10 };
  } else if (data.orderStatus === 'Returned') {
    statusCell.font = { color: { argb: 'FFCC6600' }, bold: true, size: 10 };
  }
}

const downloadPDF = async (req, res) => {
  try {
    const orders = await fetchOrders(req.query);

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      autoFirstPage: true,
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=glora-sales-report.pdf');
    doc.pipe(res);

    const pageW = doc.page.width;   
    const margin = 30;
    const tableW = pageW - margin * 2;

    const cols = [
      { label: 'Customer', width: 110 }, 
      { label: 'Product', width: 160 },  
      { label: 'Variant', width: 65 },
      { label: 'Qty', width: 40 },
      { label: 'Unit Price', width: 75 },
      { label: 'Total (Rs.)', width: 80 },
      { label: 'Payment', width: 70 },
      { label: 'Status', width: 75 },
      { label: 'Date', width: 106 },  
    ];
   

    const rowH = 24;
    const headerH = 28;
    const lineColor = '#CCCCCC';
    const headerBg = '#2C1810';
    const evenBg = '#F9F6F4';
    const oddBg = '#FFFFFF';

    doc.rect(0, 0, pageW, 62).fill('#2C1810');
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold')
      .text('GLORA - Sales Report', margin, 16, { align: 'center', width: tableW });

    const totalRevSummary = orders.reduce((s, o) => s + o.totalPrice, 0);
    doc.fontSize(9).font('Helvetica')
      .text(
        `Generated: ${new Date().toLocaleString('en-IN')}   |   Total Orders: ${orders.length}   |   Total Revenue: Rs. ${totalRevSummary.toLocaleString('en-IN')}`,
        margin, 44, { align: 'center', width: tableW }
      );

    let y = 72; // start table just below banner

    function drawTableHeader() {
      doc.rect(margin, y, tableW, headerH).fill(headerBg);
      let x = margin;
      cols.forEach(col => {
        doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
          .text(col.label, x + 4, y + 9, {
            width: col.width - 8,
            align: 'center',
            lineBreak: false
          });
        x += col.width;
      });
      y += headerH;
    }

    function drawRow(rowData, isEven) {
      const bg = isEven ? evenBg : oddBg;

      doc.rect(margin, y, tableW, rowH).fill(bg);
      
      doc.rect(margin, y, tableW, rowH).stroke(lineColor);

      let x = margin;
      rowData.forEach((val, i) => {
        const col = cols[i];
        
        const isNum = [3, 4, 5].includes(i);
        const textVal = val === null || val === undefined ? '' : String(val);

        let textColor = '#222222';
        if (i === 7) {
          if (textVal === 'Delivered') textColor = '#1A7A1A';
          else if (textVal === 'Cancelled') textColor = '#CC0000';
          else if (textVal === 'Returned') textColor = '#CC6600';
        }

        doc.fillColor(textColor).fontSize(7.5).font('Helvetica')
          .text(textVal, x + 5, y + 8, {
            width: col.width - 10,
            align: isNum ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true
          });

        doc.moveTo(x + col.width, y)
          .lineTo(x + col.width, y + rowH)
          .stroke(lineColor);

        x += col.width;
      });
      y += rowH;
    }

    function checkPageBreak() {
      if (y + rowH > doc.page.height - margin - 30) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
        y = margin;
        drawTableHeader();
      }
    }

    drawTableHeader();

    let rowIndex = 0;
    orders.forEach(order => {
      const customerName = order.userId?.name || 'N/A';
      const paymentMethod = order.paymentMethod || 'N/A';
      const orderStatus = order.status;
      const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN');

      const totalAmount = 'Rs. ' + order.totalPrice.toLocaleString('en-IN');

      const items = order.orderItems && order.orderItems.length > 0
        ? order.orderItems
        : [{ name: 'N/A', unit: 'N/A', quantity: '-', price: '-', status: orderStatus }];

      items.forEach((item, itemIdx) => {
        checkPageBreak();
        drawRow([
          itemIdx === 0 ? customerName : '',
          item.name || 'N/A',
          item.unit || 'N/A',
          item.quantity != null ? item.quantity : '-',
          item.price != null ? 'Rs. ' + Number(item.price).toLocaleString('en-IN') : '-',
          itemIdx === 0 ? totalAmount : '',
          itemIdx === 0 ? paymentMethod : '',
          item.status || orderStatus,           
          itemIdx === 0 ? orderDate : ''
        ], rowIndex % 2 === 0);
        rowIndex++;
      });
    });

    checkPageBreak();
    y += 6;
    const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
    doc.rect(margin, y, tableW, 26).fill('#FFF3CD');
    doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold')
      .text(
        `Total Orders: ${orders.length}   |   Total Revenue: Rs. ${totalRevenue.toLocaleString('en-IN')}   |   Avg Order: Rs. ${(totalRevenue / (orders.length || 1)).toFixed(2)}`,
        margin + 10, y + 8,
        { width: tableW - 20, align: 'right' }
      );

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Error downloading PDF');
  }
};

module.exports = {
  getSalesReport,
  downloadExcel,
  downloadPDF
};