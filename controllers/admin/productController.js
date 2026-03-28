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
        const { productName, category, description, variants, removeImages } = req.body;
        console.log("REQ BODY:", req.body);
        console.log("VARIANTS:", req.body.variants);
        console.log("TYPE:", typeof req.body.variants);

        if (!productName || !category || !description) {
            return res.status(400).json({
                success: false,
                message: "All basic fields are required"
            });
        }

        let parsedVariants = [];

        if (typeof variants === "string") {
            try {
                parsedVariants = JSON.parse(variants);
            } catch (err) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid variant data"
                });
            }
        } else {
            parsedVariants = variants;
        }

        if (!parsedVariants.length) {
            return res.status(400).json({
                success: false,
                message: "At least one variant is required"
            });
        }

        for (let v of parsedVariants) {
            const regular = Number(v.regularPrice);
            const sale = Number(v.salesPrice);
            const qty = Number(v.quantity);
            if (!v.unit || !v.regularPrice || !v.salesPrice || !v.quantity) {
                return res.status(400).json({
                    success: false,
                    message: "All variant fields are required"
                });
            }

            if (v.regularPrice <= v.salesPrice) {
                return res.status(400).json({
                    success: false,
                    message: "Regular price must be greater than sales price"
                });
            }
        }



        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(productName.trim())) {
            return res.status(400).json({ success: false, message: 'Product name should contain only letters and spaces.' });
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
                variants: parsedVariants,
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
        const { productName, category, description, variants } = req.body;

        if (!productName || !category || !description || !variants) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        let parsedVariants;

        if (typeof variants === "string") {
            parsedVariants = JSON.parse(variants);
        } else {
            parsedVariants = variants;
        }

        if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
            return res.status(400).json({ success: false, message: "At least one variant is required" });
        }

        const regular = Number(v.regularPrice);
        const sale = Number(v.salesPrice);

        if (regular <= sale) {
            throw new Error("Regular price must be greater than sales price");
        }

        parsedVariants.forEach(v => {
            if (!v.unit || v.regularPrice <= 0 || v.salesPrice < 0 || v.quantity <= 0) {
                throw new Error("Invalid variant data");
            }
            if (v.regularPrice <= v.salesPrice) {
                throw new Error("Regular price must be greater than sales price");
            }
        });

        if (!req.files || req.files.length < 3) {
            return res.status(400).json({ success: false, message: "Minimum 3 images required" });
        }

        const images = req.files.slice(0, 4).map(file => file.filename);

        const product = new Product({
            productName: productName.trim(),
            category: category.trim(),
            description: description.trim(),
            images,
            variants: parsedVariants,
            isBlocked: false
        });

        await product.save();

        res.json({ success: true, message: "Product added successfully", redirect: "/admin/products" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
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

        return res.json({ success: updated.modifiedCount > 0, message: product.isBlocked ? 'Product unblocked' : 'Product blocked', });
    } catch (error) {
        console.error('Toggle Block Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to toggle product status' });
    }
};