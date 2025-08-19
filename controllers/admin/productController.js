const fs = require('fs');
const path = require('path');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');


exports.productListPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const totalProducts = await Product.countDocuments();

    const products = await Product.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const productsWithThumb = products.map(product => ({
      ...product.toObject(),
      thumb: product.images && product.images.length > 0 
        ? `/uploads/products/${product.images[0]}`
        : null
    }));

    const totalPages = Math.ceil(totalProducts / limit);

    res.render('admin/product', {
      products: productsWithThumb,
      currentPage: page,
      totalPages,
      totalProducts
    });
  } catch (error) {
    console.error('Failed to load products:', error);
    res.status(500).send('Failed to load products');
  }
};


exports.editProductPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).send('Product not found');
        const categories = await Category.find({ isBlocked: false });
        res.render('admin/editProduct', { product, categories });
    } catch (error) {
        console.error('Failed to load edit product page:', error);
        res.status(500).send('Failed to load edit product page.');
    }
};

exports.editProduct = async (req, res) => {
    try {
        const { productName, category, description, regularPrice, salesPrice, quantity, removeImages } = req.body;
        
        if (!productName || !category || !description || !regularPrice || !salesPrice || !quantity) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required.' 
            });
        }

        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(productName.trim())) {
            return res.status(400).json({success: false, message: 'Product name should contain only letters and spaces.' });
        }
        
        const existingProduct = await Product.findOne({
            _id: { $ne: req.params.id },
            productName: { $regex: new RegExp(`^${productName}$`, 'i') }
        });

        if (existingProduct) {
            return res.status(400).json({ 
                success: false, 
                message: 'A product with this name already exists. Please use a different name.' 
            });
        }

        const parsedRegularPrice = parseFloat(regularPrice);
        const parsedSalesPrice = parseFloat(salesPrice);
        const parsedQuantity = parseInt(quantity);

        if (isNaN(parsedRegularPrice) || isNaN(parsedSalesPrice) || isNaN(parsedQuantity)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Price and quantity must be valid numbers.' 
            });
        }

        if (parsedRegularPrice <= 0 || parsedSalesPrice < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Regular price must be positive and sales price cannot be negative.' 
            });
        }

        if (parsedRegularPrice <= parsedSalesPrice) {
            return res.status(400).json({ 
                success: false, 
                message: 'Regular price must be greater than sales price.' 
            });
        }

        if (parsedQuantity <= 0 || parsedQuantity > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Quantity must be between 1 and 100.' 
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found.' 
            });
        }

        let existingImages = Array.isArray(product.images) ? [...product.images] : [];
        
        if (removeImages) {
            const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
            existingImages = existingImages.filter(img => !imagesToRemove.includes(img));
        }

        let newImages = [];
        if (req.files && req.files.length) {
            newImages = req.files.map(file => file.filename);
        }
        
        const updatedImages = [...existingImages, ...newImages].slice(0, 4);
        
        if (updatedImages.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'You must have at least 3 images for a product.' 
            });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            {
                productName: productName.trim(),
                category: category.trim(),
                description: description.trim(),
                regularPrice: parsedRegularPrice,
                salesPrice: parsedSalesPrice,
                quantity: parsedQuantity,
                images: updatedImages
            },
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            throw new Error('Failed to update product');
        }

        return res.json({ 
            success: true, 
            message: 'Product updated successfully!',
            redirect: '/admin/products'
        });

    } catch (error) {
        console.error('Failed to update product:', error);
        
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const filePath = path.join(__dirname, '../../public/uploads/products', file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        const message = error.message || 'Failed to update product. Please try again.';
        return res.status(500).json({ 
            success: false, 
            message: message 
        });
    }
};

exports.addProduct = async (req, res) => {
    try {
        const { productName, category, description, regularPrice, salesPrice, quantity } = req.body;
        
        if (!productName || !category || !description || !regularPrice || !salesPrice || !quantity) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required.' 
            });
        }

        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(productName.trim())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Product name should contain only letters and spaces.' 
            });
        }
        
        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${productName}$`, 'i') }
        });

        if (existingProduct) {
            return res.status(400).json({ 
                success: false, 
                message: 'A product with this name already exists. Please use a different name.' 
            });
        }

        const parsedRegularPrice = parseFloat(regularPrice);
        const parsedSalesPrice = parseFloat(salesPrice);
        const parsedQuantity = parseInt(quantity);

        if (isNaN(parsedRegularPrice) || isNaN(parsedSalesPrice) || isNaN(parsedQuantity)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Price and quantity must be valid numbers.' 
            });
        }

        if (parsedRegularPrice <= 0 || parsedSalesPrice < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Regular price must be positive and sales price cannot be negative.' 
            });
        }

        if (parsedRegularPrice <= parsedSalesPrice) {
            return res.status(400).json({ 
                success: false, 
                message: 'Regular price must be greater than sales price.' 
            });
        }

        if (parsedQuantity <= 0 || parsedQuantity > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Quantity must be between 1 and 100.' 
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please upload at least 3 images for the product.' 
            });
        }

        const imageFilenames = req.files.map(file => file.filename);
        
        if (imageFilenames.length < 3) {
            imageFilenames.forEach(filename => {
                const filePath = path.join(__dirname, '../../public/uploads/products', filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
            
            return res.status(400).json({ 
                success: false, 
                message: 'You must upload at least 3 images for the product.' 
            });
        }

        const finalImages = imageFilenames.slice(0, 4);

        const newProduct = new Product({
            productName: productName.trim(),
            category: category.trim(),
            description: description.trim(),
            regularPrice: parsedRegularPrice,
            salesPrice: parsedSalesPrice,
            quantity: parsedQuantity,
            images: finalImages,
            isBlocked: false
        });

        await newProduct.save();

        return res.json({ 
            success: true, 
            message: 'Product added successfully!',
            redirect: '/admin/products'
        });

    } catch (error) {
        console.error('Failed to add product:', error);
        
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const filePath = path.join(__dirname, '../../public/uploads/products', file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        const message = error.message || 'Failed to add product. Please try again.';
        return res.status(500).json({ 
            success: false, 
            message: message 
        });
    }
};

exports.addProductPage = async (req, res) => {
    try {
        const categories = await Category.find({ isBlocked: false });
        res.render('admin/addProduct', { categories });
    } catch (error) {
        console.error('Failed to load add product page:', error);
        res.status(500).send('Failed to load add product page');
    }
};

exports.toggleProductBlock = async (req, res) => {
  try {
    const id = req.body.id || req.query.id;
    if (!id) return res.status(400).json({ success: false, message: 'No product ID provided' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const updated = await Product.updateOne(
      { _id: id },
      { $set: { isBlocked: !product.isBlocked } }
    );

    return res.json({success: updated.modifiedCount > 0,message: product.isBlocked ? 'Product unblocked' : 'Product blocked',});
  } catch (error) {
    console.error('Toggle Block Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle product status' });
  }
};

