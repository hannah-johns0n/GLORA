const fs = require('fs');
const path = require('path');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const StatusCodes = require('../../constants/statusCodes');


exports.productListPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const search = req.query.search ? req.query.search.trim() : '';

        const filter = search
            ? { productName: { $regex: search, $options: 'i' } }
            : {};

        const totalProducts = await Product.countDocuments(filter); // use filter here too

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const productsWithThumb = products.map(product => {
            const productObj = product.toObject();

            const firstVariant = productObj.variants && productObj.variants.length > 0
                ? productObj.variants[0]
                : null;

            const totalQuantity = productObj.variants && productObj.variants.length > 0
                ? productObj.variants.reduce((sum, variant) => sum + variant.quantity, 0)
                : null;

            return {
                ...productObj,
                thumb: product.images && product.images.length > 0
                    ? `/uploads/products/${product.images[0]}`
                    : null,
                regularPrice: firstVariant ? firstVariant.regularPrice : null,
                salesPrice: firstVariant ? firstVariant.salesPrice : null,
                quantity: totalQuantity,
            };
        });

        const totalPages = Math.ceil(totalProducts / limit);

        res.render('admin/product', {
            products: productsWithThumb,
            currentPage: page,
            totalPages,
            totalProducts,
            search   
        });
    } catch (error) {
        console.error('Failed to load products:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Failed to load products');
    }
};

exports.editProductPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(StatusCodes.NOT_FOUND).send('Product not found');
        const categories = await Category.find({ isBlocked: false });
        res.render('admin/editProduct', { product, categories });
    } catch (error) {
        console.error('Failed to load edit product page:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Failed to load edit product page.');
    }
};

exports.editProduct = async (req, res) => {
    try {
        const { productName, category, description, variants, images, removeImages } = req.body;
        console.log("REQ BODY:", req.body);
        console.log("VARIANTS:", req.body.variants);
        console.log("TYPE:", typeof req.body.variants);

        if (!productName || !category || !description) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "All basic fields are required"
            });
        }
        let parsedVariants = [];

        if (typeof variants === "string") {
            try {
                parsedVariants = JSON.parse(variants);
            } catch (err) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Invalid variant data"
                });
            }
        } else {
            parsedVariants = variants;
        }
        if (!parsedVariants.length) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "At least one variant is required"
            });
        }
        for (let v of parsedVariants) {
            const qty = Number(v.quantity);
            if (!v.unit || !v.regularPrice || !v.salesPrice || v.quantity === undefined || v.quantity === null || v.quantity === '' || isNaN(qty) || qty < 0) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "All variant fields are required, and quantity cannot be negative"
                });
            }
            const regular = Number(v.regularPrice);
            const sale = Number(v.salesPrice);
            if (regular < sale) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Sales price cannot be greater than regular price"
                });
            }
        }
        const unitList = parsedVariants.map(v => v.unit.trim().toLowerCase());
        const uniqueUnits = new Set(unitList);

        if (uniqueUnits.size !== unitList.length) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Duplicate variant sizes are not allowed. Each variant must have a unique size/unit."
            });
        }
        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(productName.trim())) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Product name should contain only letters and spaces.' });
        }
        const existingProduct = await Product.findOne({
            _id: { $ne: req.params.id },
            productName: { $regex: new RegExp(`^${productName}$`, 'i') }
        });
        if (existingProduct) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: 'A product with this name already exists. Please use a different name.'
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: 'Product not found.'
            });
        }

        let existingImages = Array.isArray(images) ? images : [images].filter(Boolean);

        if (removeImages && removeImages.length > 0) {
            const toRemove = Array.isArray(removeImages) ? removeImages : [removeImages];

            for (const url of toRemove) {
                try {
                    const publicId = url.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
                    await cloudinary.uploader.destroy(publicId);
                } catch (err) {
                    console.error('Cloudinary delete failed:', err);
                }
            }
        }

        const updatedImages = existingImages.slice(0, 4);

        if (updatedImages.length < 3) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'At least 3 images required.' });
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

        return res.status(StatusCodes.SUCCESS).json({
            success: true,
            message: 'Product updated successfully!',
            redirect: '/admin/products'
        });

    } catch (error) {
        console.error('Failed to update product:', error);

        const message = error.message || 'Failed to update product. Please try again.';
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message
        });
    }
};

exports.addProduct = async (req, res) => {
    try {
        const { productName, category, description, variants, images } = req.body;

        if (!productName || !category || !description || !variants) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "All fields are required" });
        }

        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(productName.trim())) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Product name should contain only letters and spaces.' });
        }

        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') }
        });
        if (existingProduct) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: 'A product with this name already exists. Please use a different name.'
            });
        }

        const imageArray = Array.isArray(images) ? images : [images].filter(Boolean);

        if (imageArray.length < 3) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Minimum 3 images required" });
        }

        let parsedVariants;
        if (typeof variants === "string") {
            try {
                parsedVariants = JSON.parse(variants);
            } catch (err) {
                return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid variant data" });
            }
        } else {
            parsedVariants = variants;
        }

        if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "At least one variant is required" });
        }

        for (let v of parsedVariants) {
            const regular = Number(v.regularPrice);
            const sale = Number(v.salesPrice);
            const qty = Number(v.quantity);

            if (!v.unit || isNaN(regular) || regular <= 0 || isNaN(sale) || sale < 0 || isNaN(qty) || qty < 0) {
                return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "All variant fields are required, and values cannot be negative" });
            }
            if (regular < sale) {
                return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Sales price cannot be greater than regular price" });
            }
        }

        const unitList = parsedVariants.map(v => v.unit.trim().toLowerCase());
        const uniqueUnits = new Set(unitList);

        if (uniqueUnits.size !== unitList.length) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Duplicate variant sizes are not allowed. Each variant must have a unique size/unit."
            });
        }

        const product = new Product({
            productName: productName.trim(),
            category: category.trim(),
            description: description.trim(),
            images: imageArray.slice(0, 4),  
            variants: parsedVariants,
            isBlocked: false
        });

        await product.save();

        res.status(StatusCodes.CREATED).json({ success: true, message: "Product added successfully", redirect: "/admin/products" });

    } catch (error) {
        console.error(error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
    }
};

exports.addProductPage = async (req, res) => {
    try {
        const categories = await Category.find({ isBlocked: false });
        res.render('admin/addProduct', { categories });
    } catch (error) {
        console.error('Failed to load add product page:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Failed to load add product page');
    }
};

exports.toggleProductBlock = async (req, res) => {
    try {
        const id = req.body.id || req.query.id;
        if (!id) return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'No product ID provided' });

        const product = await Product.findById(id);
        if (!product) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Product not found' });

        const updated = await Product.updateOne(
            { _id: id },
            { $set: { isBlocked: !product.isBlocked } }
        );

        return res.status(StatusCodes.SUCCESS).json({ success: updated.modifiedCount > 0, message: product.isBlocked ? 'Product unblocked' : 'Product blocked', });
    } catch (error) {
        console.error('Toggle Block Error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to toggle product status' });
    }
};