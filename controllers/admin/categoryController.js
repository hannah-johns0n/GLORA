const Category = require('../../models/categoryModel');
const STATUS_CODES = require('../../constants/statusCodes');
 
const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
 
    const categoryDate = await Category.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
 
    const totalCategory = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategory / limit);
 
    res.render('admin/category', {
      categories: categoryDate,
      currentPage: page,
      totalPages: totalPages,
      totalCategory: totalCategory
    });
  } catch (error) {
    console.error(error);
    res.redirect('/pageerror');
  }
};
 
const addCategory = async (req, res) => {
  const { name, description, image } = req.body;
 
  if (!name) {
    return res.status(400).json({ success: false, message: 'Category name is required' });
  }
 
  const categoryName = name.trim();
 
  if (categoryName.length < 3 || categoryName.length > 50) {
    return res.status(400).json({
      success: false,
      message: 'Category name must be between 3 and 50 characters'
    });
  }
 
  const invalidChars = /[0-9_!@#$%^&*()\[\]{};:'"\\|<>\/=+]/;
  if (invalidChars.test(categoryName)) {
    return res.status(400).json({ success: false, message: 'Category name can only contain letters, spaces, and hyphens' });
  }
 
  if (/\s{2,}|-{2,}/.test(categoryName)) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Category name cannot contain consecutive spaces or hyphens' });
  }
 
  try {
    const existingCategory = await Category.findOne({ categoryName: name });
    if (existingCategory) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Category "${existingCategory.categoryName}" already exists` });
    }
 
    const newCategory = new Category({
      categoryName: categoryName,
      description: (description || '').trim(),
      image: image || '',
      isBlocked: false
    });
 
    await newCategory.save();
    return res.json({ success: true, message: `Category "${categoryName}" added successfully`, category: newCategory });
  } catch (error) {
    console.error('Add Category Error:', error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'An internal server error occurred while adding the category' });
  }
};
 
const editCategory = async (req, res) => {
  const categoryId = req.params.id;
  const { name, description, image } = req.body;
 
  if (!name || !name.trim()) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Category name is required' });
  }
 
  const categoryName = name.trim();
 
  if (categoryName.length < 3 || categoryName.length > 50) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      message: 'Category name must be between 3 and 50 characters'
    });
  }
 
  const invalidChars = /[0-9_!@#$%^&*()\[\]{};:'"\\|<>\/=+]/;
  if (invalidChars.test(categoryName)) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      message: 'Category name can only contain letters, spaces, and hyphens'
    });
  }
 
  if (/\s{2,}|-{2,}/.test(categoryName)) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      message: 'Category name cannot contain consecutive spaces or hyphens'
    });
  }
 
  try {
    const existingCategory = await Category.findOne({
      _id: { $ne: categoryId },
      categoryName: { $regex: new RegExp(`^${name}$`, 'i') }
    });
 
    if (existingCategory) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: `Category "${existingCategory.categoryName}" already exists`
      });
    }
 
    // Build update object — only update image if a new one was provided
    const updateData = {
      categoryName: categoryName,
      description: (description || '').trim()
    };
    if (image && image.trim()) {
      updateData.image = image.trim();
    }
 
    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      updateData,
      { new: true, runValidators: false }  // runValidators: false so missing image on old docs doesn't throw
    );
 
    if (!updatedCategory) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Category not found' });
    }
 
    return res.json({
      success: true,
      message: `Category "${categoryName}" updated successfully`,
      category: updatedCategory
    });
  } catch (error) {
    console.error('Edit Category Error:', error);
    return res.status(500).json({ success: false, message: 'An internal server error occurred while updating the category' });
  }
};
 
const getListCatergory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect('/admin/category');
  } catch (error) {
    res.redirect('/pageerror');
  }
};
 
const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect('/admin/category');
  } catch (error) {
    res.redirect('/pageerror');
  }
};
 
const getEditCategory = async (req, res) => {
  try {
    let id = req.query.id;
    const category = await Category.findOne({ _id: id });
    res.render('/edit-category', { category: category });
  } catch (error) {
    res.redirect('/pageerror');
  }
};
 
const blockCategory = async (req, res) => {
  try {
    const id = req.body.id || req.query.id;
    if (!id) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'No category id provided' });
    }
    const result = await Category.updateOne({ _id: id }, { $set: { isBlocked: true } });
    return res.json({
      success: result.modifiedCount > 0,
      message: result.modifiedCount > 0 ? 'Category blocked successfully' : 'No category updated'
    });
  } catch (error) {
    console.error('[BlockCategory] Error:', error);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to block category', error: error.message });
  }
};
 
const unblockCategory = async (req, res) => {
  try {
    const id = req.body.id || req.query.id;
    const result = await Category.updateOne({ _id: id }, { $set: { isBlocked: false } });
    return res.json({
      success: result.modifiedCount > 0,
      message: result.modifiedCount > 0 ? 'Category unblocked successfully' : 'No category updated'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to unblock category' });
  }
};
 
module.exports = {
  categoryInfo,
  addCategory,
  getListCatergory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  blockCategory,
  unblockCategory
};
