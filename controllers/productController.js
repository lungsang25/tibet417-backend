import { v2 as cloudinary } from "cloudinary"
import productModel from "../models/productModel.js"
import { SEASONS } from "../constants/seasonConstants.js"

// Accepts a JSON string (multipart form) or an array (JSON body); anything
// that is not a known season is dropped.
const parseSeasons = (value) => {
    if (!value) return []
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return []
    return SEASONS.filter((season) => parsed.includes(season))
}

// function for add product
const addProduct = async (req, res) => {
    try {

        const { name, description, price, category, subCategory, sizes, bestseller, seasons } = req.body

        const image1 = req.files.image1 && req.files.image1[0]
        const image2 = req.files.image2 && req.files.image2[0]
        const image3 = req.files.image3 && req.files.image3[0]
        const image4 = req.files.image4 && req.files.image4[0]

        const images = [image1, image2, image3, image4].filter((item) => item !== undefined)

        let imagesUrl = await Promise.all(
            images.map(async (item) => {
                let result = await cloudinary.uploader.upload(item.path, { 
                    resource_type: 'image',
                    transformation: [
                        { width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
                    ]
                });
                return result.secure_url
            })
        )

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            subCategory,
            bestseller: bestseller === "true" ? true : false,
            sizes: JSON.parse(sizes),
            image: imagesUrl,
            seasons: parseSeasons(seasons),
            date: Date.now()
        }

        console.log(productData);

        const product = new productModel(productData);
        await product.save()

        res.json({ success: true, message: "Product Added" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product
const listProducts = async (req, res) => {
    try {
        
        const products = await productModel.find({});
        res.json({success:true,products})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        
        await productModel.findByIdAndDelete(req.body.id)
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for tagging an existing product with seasons
const updateProductSeasons = async (req, res) => {
    try {

        const { id, seasons } = req.body
        const product = await productModel.findByIdAndUpdate(id, { seasons: parseSeasons(seasons) }, { new: true })
        if (!product) {
            return res.json({ success: false, message: "Product not found" })
        }

        res.json({ success: true, message: "Seasons Updated", seasons: product.seasons })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        
        const { productId } = req.body
        const product = await productModel.findById(productId)
        res.json({success:true,product})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { listProducts, addProduct, removeProduct, singleProduct, updateProductSeasons }