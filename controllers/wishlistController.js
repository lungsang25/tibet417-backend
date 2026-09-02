import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";

const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.body.userId;

        if (!productId) {
            return res.json({ success: false, message: "Product ID is required" });
        }

        const product = await productModel.findById(productId);
        if (!product) {
            return res.json({ success: false, message: "Product not found" });
        }

        const userData = await userModel.findById(userId);
        
        if (userData.wishlist.includes(productId)) {
            return res.json({ success: false, message: "Product already in wishlist" });
        }

        userData.wishlist.push(productId);
        await userData.save();

        res.json({ success: true, message: "Added to wishlist" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.body.userId;

        if (!productId) {
            return res.json({ success: false, message: "Product ID is required" });
        }

        const userData = await userModel.findById(userId);
        
        if (!userData.wishlist.includes(productId)) {
            return res.json({ success: false, message: "Product not in wishlist" });
        }

        userData.wishlist = userData.wishlist.filter(id => id !== productId);
        await userData.save();

        res.json({ success: true, message: "Removed from wishlist" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.body.userId;

        const userData = await userModel.findById(userId);
        const wishlistIds = userData.wishlist || [];

        const wishlistProducts = await productModel.find({
            '_id': { $in: wishlistIds }
        });

        res.json({ success: true, wishlist: wishlistProducts });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const checkWishlistStatus = async (req, res) => {
    try {
        const { productIds } = req.body;
        const userId = req.body.userId;

        const userData = await userModel.findById(userId);
        const wishlist = userData.wishlist || [];

        const status = {};
        productIds.forEach(id => {
            status[id] = wishlist.includes(id);
        });

        res.json({ success: true, status });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { addToWishlist, removeFromWishlist, getWishlist, checkWishlistStatus };
