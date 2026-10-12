
const express = require("express");
const cors = require("cors");
const SOS = require("./models/SOS");

const app = express();

app.use(cors());
app.use(express.json());

function emitEmergencyUpdate(event, emergency) {
    const io = app.get("io");

    if (io) {
        io.emit(event, emergency);
        io.emit("emergencies:updated", emergency);
    }
}

function formatEmergency(sos) {
    return {
        id: sos._id,
        latitude: sos.latitude,
        longitude: sos.longitude,
        status: sos.status,
        services: sos.services,
        createdAt: sos.createdAt,
        updatedAt: sos.updatedAt,
    };
}

// Health check
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "HimSafe API is running",
    });
});

// Create SOS
app.post("/api/v1/sos", async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (
            latitude === undefined ||
            longitude === undefined ||
            !Number.isFinite(Number(latitude)) ||
            !Number.isFinite(Number(longitude)) ||
            Number(latitude) < -90 ||
            Number(latitude) > 90 ||
            Number(longitude) < -180 ||
            Number(longitude) > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid location coordinates are required",
            });
        }

        const alert = await SOS.create({
            latitude: Number(latitude),
            longitude: Number(longitude),
            status: "ACTIVE",
        });

        const emergency = formatEmergency(alert);

        emitEmergencyUpdate("sos:created", emergency);

        return res.status(201).json({
            success: true,
            message: "SOS created successfully",
            emergency,
        });
    } catch (error) {
        console.error("SOS creation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to create SOS",
        });
    }
});

// Get SOS history
app.get("/api/v1/sos", async (req, res) => {
    try {
        const alerts = await SOS.find()
            .sort({ createdAt: -1 })
            .limit(50);

        return res.status(200).json({
            success: true,
            count: alerts.length,
            emergencies: alerts.map(formatEmergency),
        });
    } catch (error) {
        console.error("SOS history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch SOS history",
        });
    }
});

// Get active emergencies
app.get("/api/v1/emergencies/active", async (req, res) => {
    try {
        const alerts = await SOS.find({
            status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: alerts.length,
            emergencies: alerts.map(formatEmergency),
        });
    } catch (error) {
        console.error("Active emergencies error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch active emergencies",
        });
    }
});

// Get emergency analytics
app.get("/api/v1/analytics/emergencies", async (req, res) => {
    try {
        const total = await SOS.countDocuments();
        const active = await SOS.countDocuments({
            status: "ACTIVE",
        });
        const acknowledged = await SOS.countDocuments({
            status: "ACKNOWLEDGED",
        });
        const resolved = await SOS.countDocuments({
            status: "RESOLVED",
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const dailyData = await SOS.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt",
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ]);

        return res.status(200).json({
            success: true,
            analytics: {
                total,
                active,
                acknowledged,
                resolved,
                dailyData,
            },
        });
    } catch (error) {
        console.error("Analytics error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch emergency analytics",
        });
    }
});

// Acknowledge emergency
app.patch("/api/v1/sos/:id/acknowledge", async (req, res) => {
    try {
        const alert = await SOS.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "ACTIVE",
            },
            {
                status: "ACKNOWLEDGED",
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!alert) {
            const existingAlert = await SOS.findById(req.params.id);

            return res.status(existingAlert ? 409 : 404).json({
                success: false,
                message: existingAlert
                    ? "Emergency is no longer active"
                    : "SOS alert not found",
            });
        }

        const emergency = formatEmergency(alert);

        emitEmergencyUpdate("sos:acknowledged", emergency);

        return res.status(200).json({
            success: true,
            message: "Emergency acknowledged",
            emergency,
        });
    } catch (error) {
        console.error("Acknowledge error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to acknowledge emergency",
        });
    }
});

// Update live location for an existing SOS
app.patch("/api/v1/sos/:id/location", async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (
            latitude === undefined ||
            longitude === undefined ||
            !Number.isFinite(Number(latitude)) ||
            !Number.isFinite(Number(longitude)) ||
            Number(latitude) < -90 ||
            Number(latitude) > 90 ||
            Number(longitude) < -180 ||
            Number(longitude) > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid location coordinates are required",
            });
        }

        const alert = await SOS.findOneAndUpdate(
            {
                _id: req.params.id,
                status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
            },
            {
                latitude: Number(latitude),
                longitude: Number(longitude),
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!alert) {
            const existingAlert = await SOS.findById(req.params.id);

            return res.status(existingAlert ? 409 : 404).json({
                success: false,
                message: existingAlert
                    ? "Location tracking is stopped for resolved emergencies"
                    : "SOS alert not found",
            });
        }

        const emergency = formatEmergency(alert);

        emitEmergencyUpdate("sos:location-updated", emergency);

        return res.status(200).json({
            success: true,
            message: "Emergency location updated",
            emergency,
        });
    } catch (error) {
        console.error("Live location update error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to update emergency location",
        });
    }
});

// Resolve emergency
app.patch("/api/v1/sos/:id/resolve", async (req, res) => {
    try {
        const alert = await SOS.findOneAndUpdate(
            {
                _id: req.params.id,
                status: { $in: ["ACTIVE", "ACKNOWLEDGED"] },
            },
            {
                status: "RESOLVED",
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!alert) {
            const existingAlert = await SOS.findById(req.params.id);

            return res.status(existingAlert ? 409 : 404).json({
                success: false,
                message: existingAlert
                    ? "Emergency is already resolved"
                    : "SOS alert not found",
            });
        }

        const emergency = formatEmergency(alert);

        emitEmergencyUpdate("sos:resolved", emergency);

        return res.status(200).json({
            success: true,
            message: "Emergency resolved successfully",
            emergency,
        });
    } catch (error) {
        console.error("Resolve error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to resolve emergency",
        });
    }
});

module.exports = app;