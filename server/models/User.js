
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
            default: undefined,
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
            required: false,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            select: false,
        },

        role: {
            type: String,
            enum: ["user", "responder"],
            default: "user",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);
