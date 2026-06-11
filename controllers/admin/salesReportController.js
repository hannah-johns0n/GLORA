const Order  = require('../../models/orderModel');
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
    let { startDate, endDate, paymentMethod, orderStatus } = req.query;
    const filter = { status: { $in: ['Delivered', 'Returned'] } };

    if (startDate && endDate) {
      filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
    if (orderStatus   && orderStatus   !== 'all') filter.status        = orderStatus;

    const orders      = await Order.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const totalSales   = orders.reduce((s, o) => s + o.totalPrice, 0);
    const totalOrders  = orders.length;
    const avgOrder     = totalOrders > 0 ? totalSales / totalOrders : 0;
    const returnedOrders = orders.filter(o => o.status === 'Returned').length;
    const returnRate   = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

    res.render('admin/salesReport', {
      orders, totalSales, totalOrders, avgOrder, returnRate,
      filters: { startDate, endDate, paymentMethod, orderStatus }
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
    titleCell.value     = 'GLORA — Sales Report';
    titleCell.font      = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C1810' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    ws.mergeCells('A2:I2');
    const dateCell = ws.getCell('A2');
    dateCell.value     = `Generated: ${new Date().toLocaleString('en-IN')}`;
    dateCell.font      = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF666666' } };
    dateCell.alignment = { horizontal: 'right' };
    ws.getRow(2).height = 20;

    // ── Column definitions ───────────────────────────────────────────
    ws.columns = [
      { key: 'customerName',  width: 22 },
      { key: 'productName',   width: 28 },
      { key: 'variant',       width: 14 },
      { key: 'quantity',      width: 12 },
      { key: 'unitPrice',     width: 14 },
      { key: 'totalAmount',   width: 15 },
      { key: 'paymentMethod', width: 16 },
      { key: 'orderStatus',   width: 14 },
      { key: 'orderDate',     width: 18 },
    ];

    // ── Header row ───────────────────────────────────────────────────
    const headers = [
      'Customer Name', 'Product Name', 'Variant', 'Quantity',
      'Unit Price (₹)', 'Total Amount (₹)', 'Payment Method',
      'Order Status', 'Order Date'
    ];

    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font      = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A2C1A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = {
        top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right:  { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });
    headerRow.height = 28;

    let rowIndex = 0;
    orders.forEach(order => {
      if (!order.orderItems || order.orderItems.length === 0) {
        addDataRow(ws, rowIndex++, {
          customerName:  order.userId?.name  || 'N/A',
          productName:   order.orderItems?.[0]?.name || 'N/A',
          variant:       order.orderItems?.[0]?.unit || 'N/A',
          quantity:      0,
          unitPrice:     0,
          totalAmount:   order.totalPrice,
          paymentMethod: order.paymentMethod || 'N/A',
          orderStatus:   order.status,
          orderDate:     new Date(order.createdAt).toLocaleDateString('en-IN')
        });
      } else {
        order.orderItems.forEach((item, itemIdx) => {
          addDataRow(ws, rowIndex++, {
            customerName:  itemIdx === 0 ? (order.userId?.name || 'N/A') : '',
            productName:   item.name  || 'N/A',
            variant:       item.unit  || 'N/A',
            quantity:      item.quantity,
            unitPrice:     item.price || 0,
            totalAmount:   itemIdx === 0 ? order.totalPrice : '',
            paymentMethod: itemIdx === 0 ? (order.paymentMethod || 'N/A') : '',
            orderStatus:   itemIdx === 0 ? order.status : '',
            orderDate:     itemIdx === 0
              ? new Date(order.createdAt).toLocaleDateString('en-IN') : ''
          });
        });
      }
    });

    ws.addRow([]);
    const totalRow = ws.addRow([
      '', '', '', '', 'TOTAL REVENUE',
      orders.reduce((s, o) => s + o.totalPrice, 0).toFixed(2),
      '', `${orders.length} orders`, ''
    ]);
    totalRow.eachCell(cell => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    });

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
    data.unitPrice  !== '' ? Number(data.unitPrice).toFixed(2)  : '',
    data.totalAmount !== '' ? Number(data.totalAmount).toFixed(2) : '',
    data.paymentMethod,
    data.orderStatus,
    data.orderDate
  ]);

  row.height = 22;
  row.eachCell((cell, colNum) => {
    cell.font      = { name: 'Arial', size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor.slice(2) } };
    cell.alignment = {
      horizontal: [4, 5, 6].includes(colNum) ? 'right' : 'left',
      vertical:   'middle',
      wrapText:   true
    };
    cell.border = {
      top:    { style: 'hair', color: { argb: 'FFDDDDDD' } },
      bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
      left:   { style: 'hair', color: { argb: 'FFDDDDDD' } },
      right:  { style: 'hair', color: { argb: 'FFDDDDDD' } }
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
      margin:       30,
      size:         'A4',
      layout:       'landscape',
      autoFirstPage: true,
      bufferPages:  true   
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=glora-sales-report.pdf');
    doc.pipe(res);

    const pageW  = doc.page.width;
    const margin = 30;
    const tableW = pageW - margin * 2;

    const cols = [
      { label: 'Customer',    width: 90  },
      { label: 'Product',     width: 100 },
      { label: 'Variant',     width: 55  },
      { label: 'Qty',         width: 35  },
      { label: 'Unit Price',  width: 65  },
      { label: 'Total (₹)',   width: 70  },
      { label: 'Payment',     width: 65  },
      { label: 'Status',      width: 65  },
      { label: 'Date',        width: 75  },
    ];

    const rowH      = 22;
    const headerH   = 26;
    const lineColor = '#CCCCCC';
    const headerBg  = '#2C1810';
    const evenBg    = '#F9F6F4';
    const oddBg     = '#FFFFFF';

    doc.rect(0, 0, pageW, 60).fill('#2C1810');
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold')
       .text('GLORA — Sales Report', margin, 18, { align: 'center', width: tableW });
    doc.fontSize(9).font('Helvetica')
       .text(
         `Generated: ${new Date().toLocaleString('en-IN')}   |   Total Orders: ${orders.length}   |   Total Revenue: ₹${orders.reduce((s,o)=>s+o.totalPrice,0).toLocaleString('en-IN')}`,
         margin, 42, { align: 'center', width: tableW }
       );

    doc.moveDown(2);

    let y = 70;

    function drawTableHeader() {
      doc.rect(margin, y, tableW, headerH).fill(headerBg);
      let x = margin;
      cols.forEach(col => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
           .text(col.label, x + 4, y + 8, {
             width:     col.width - 8,
             align:     'center',
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
        const col     = cols[i];
        const isNum   = [3, 4, 5].includes(i);
        const textVal = val === null || val === undefined ? '' : String(val);

        doc.fillColor('#222222').fontSize(7.5).font('Helvetica')
           .text(textVal, x + 4, y + 7, {
             width:     col.width - 8,
             align:     isNum ? 'right' : 'left',
             lineBreak: false,
             ellipsis:  true
           });

        doc.moveTo(x + col.width, y).lineTo(x + col.width, y + rowH)
           .stroke(lineColor);
        x += col.width;
      });
      y += rowH;
    }

    function checkPageBreak() {
      if (y + rowH > doc.page.height - margin) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
        y = margin;
        drawTableHeader();
      }
    }

    drawTableHeader();

    let rowIndex = 0;
    orders.forEach(order => {
      const customerName  = order.userId?.name  || 'N/A';
      const paymentMethod = order.paymentMethod || 'N/A';
      const orderStatus   = order.status;
      const orderDate     = new Date(order.createdAt).toLocaleDateString('en-IN');
      const totalAmount   = '₹' + order.totalPrice.toLocaleString('en-IN');

      const items = order.orderItems && order.orderItems.length > 0
        ? order.orderItems
        : [{ name: 'N/A', unit: 'N/A', quantity: '-', price: '-' }];

      items.forEach((item, itemIdx) => {
        checkPageBreak();
        drawRow([
          itemIdx === 0 ? customerName  : '',
          item.name     || 'N/A',
          item.unit     || 'N/A',
          item.quantity != null ? item.quantity : '-',
          item.price    != null ? '₹' + Number(item.price).toLocaleString('en-IN') : '-',
          itemIdx === 0 ? totalAmount   : '',
          itemIdx === 0 ? paymentMethod : '',
          itemIdx === 0 ? orderStatus   : '',
          itemIdx === 0 ? orderDate     : ''
        ], rowIndex % 2 === 0);
        rowIndex++;
      });
    });

    checkPageBreak();
    y += 6;
    const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
    doc.rect(margin, y, tableW, 24).fill('#FFF3CD');
    doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold')
       .text(
         `Total Orders: ${orders.length}   |   Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}   |   Avg Order: ₹${(totalRevenue / (orders.length || 1)).toFixed(2)}`,
         margin + 10, y + 8, { width: tableW - 20, align: 'right' }
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
  downloadPDF };