import mongoose from 'mongoose'

// A "look" is a model photo plus the store products worn in it. Product ids are
// plain strings (same convention as user.wishlist) and are resolved by the
// storefront; ids of products deleted later are simply skipped there.
const lookSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    image: { type: String, required: true },
    imagePublicId: { type: String, default: '' },
    products: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    date: { type: Number, required: true },
})

const lookModel = mongoose.models.look || mongoose.model('look', lookSchema)

export default lookModel
