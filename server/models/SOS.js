
const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        location: {
            type: String,
            default: "",
            trim: true,
        },
        latitude: {
            type: Number,
            required: true,
        },
        longitude: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["active", "acknowledged", "resolved"],
            default: "active",
        },
        services: {
            police: { type: Boolean, default: true },
            ambulance: { type: Boolean, default: true },
            fire: { type: Boolean, default: true },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("SOS", sosSchema);
