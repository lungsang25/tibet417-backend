import { v2 as cloudinary } from 'cloudinary'
import lookModel from '../models/lookModel.js'

const parseProductIds = (value) => {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((id) => typeof id === 'string' && id))]
}

// Public: only active looks, newest first. Product ids are returned raw — the
// storefront already holds every product and resolves them itself.
const listLooks = async (req, res) => {
    try {
        const looks = await lookModel
            .find({ active: true })
            .sort({ date: -1 })
            .select('title image products')
        res.set('Cache-Control', 'public, max-age=60')
        res.json({ success: true, looks })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const adminListLooks = async (req, res) => {
    try {
        const looks = await lookModel.find({}).sort({ date: -1 })
        res.json({ success: true, looks })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const addLook = async (req, res) => {
    try {
        const { title, products, active } = req.body

        if (!req.file) {
            return res.json({ success: false, message: 'A photo is required' })
        }
        const productIds = parseProductIds(products)
        if (productIds.length === 0) {
            return res.json({ success: false, message: 'Tag at least one product' })
        }

        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'image',
            transformation: [
                { width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
            ],
        })

        const look = new lookModel({
            title: title || '',
            image: result.secure_url,
            imagePublicId: result.public_id,
            products: productIds,
            active: active !== 'false',
            date: Date.now(),
        })
        await look.save()

        res.json({ success: true, message: 'Look Added' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const updateLook = async (req, res) => {
    try {
        const { id, title, products, active } = req.body

        const update = {}
        if (title !== undefined) update.title = title
        if (active !== undefined) update.active = Boolean(active)
        if (products !== undefined) {
            const productIds = parseProductIds(products)
            if (productIds.length === 0) {
                return res.json({ success: false, message: 'Tag at least one product' })
            }
            update.products = productIds
        }

        const look = await lookModel.findByIdAndUpdate(id, update, { new: true })
        if (!look) {
            return res.json({ success: false, message: 'Look not found' })
        }

        res.json({ success: true, message: 'Look Updated', look })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const removeLook = async (req, res) => {
    try {
        const look = await lookModel.findByIdAndDelete(req.body.id)
        if (!look) {
            return res.json({ success: false, message: 'Look not found' })
        }

        if (look.imagePublicId) {
            try {
                await cloudinary.uploader.destroy(look.imagePublicId)
            } catch (destroyError) {
                console.log('Cloudinary cleanup failed:', destroyError.message)
            }
        }

        res.json({ success: true, message: 'Look Removed' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { listLooks, adminListLooks, addLook, updateLook, removeLook }
