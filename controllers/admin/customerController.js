const User = require('../../models/userModel');

const customerInfo = async (req,res) =>{   
    try {

        let search = "";
        if(req.query.search){
            search = req.query.search;
        }
        let page = 1;
        if(req.query.page){
            page = req.query.page;
        }
        const limit = 3;
        const userData = await User.findOne({
            isAdmin : false,
            $or : [
                    { name : {$regex : ".*" + search + ".*"}},
                    { email : {$regex : ".*" + search + ".*"}},
            ],
        })
        .limit(limit*1)       
        .skip((page-1)*limit)
        .exec();


        const count = await User.findOne({
            isAdmin : false,
            $or : [
                { name : {$regex : ".*" + search + ".*"}},
                { email : { $regex : ".*" + search + ".*"}}
            ]
        })
        .countDocuments();

        res.render('customers')

    }
    catch(error) {

    }
}

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
    customerInfo,
    toggleUserBlock
};