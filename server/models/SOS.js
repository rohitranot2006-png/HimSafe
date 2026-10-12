const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema(
    {
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
            enum: ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"],
            default: "ACTIVE",
        },

        services: {
            police: {
                type: Boolean,
                default: true,
            },

            ambulance: {
                type: Boolean,
                default: true,
            },

            fire: {
                type: Boolean,
                default: true,
            },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("SOS", sosSchema);