const User = require('../../models/userModel');

const customerListPage = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = {
      isAdmin: false,
      ...(search && {
        $or: [
          { name:  { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const totalCustomers = await User.countDocuments(filter);

    const customers = await User.find(filter)
      .sort({ createdAt: -1 })  
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCustomers / limit);

    res.render("admin/customers", {
      customers,
      currentPage: page,
      totalPages,
      totalCustomers,
      search,          
    });
  } catch (error) {
    console.error("Failed to load customers:", error);
    res.status(500).send("Failed to load customers");
  }
};

const toggleUserBlock = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({ success: true, message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,isBlocked: user.isBlocked});
    } 
    catch (error) {
        console.error('Error toggling user block status:', error);
        res.status(500).json({ success: false, message: 'Failed to update user status',error: error.message });
    }
};

module.exports = {
    toggleUserBlock,
    customerListPage
};