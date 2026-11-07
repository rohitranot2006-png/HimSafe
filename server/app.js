
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const SOS = require("./models/SOS");
const { authenticate, requireRole } = require("./middleware/auth");

const app = express();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const allowedOrigins = [
    ...(process.env.CLIENT_URL
        ? process.env.CLIENT_URL.split(",").map(
              (origin) => origin.trim().replace(/\/$/, "")
          )
        : []),
];

if (!IS_PRODUCTION) {
    allowedOrigins.push(
        "https://localhost:5173",
        "http://localhost:5173"
    );
}

const uniqueOrigins = [...new Set(allowedOrigins)];

// Security headers
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Restrict browser access to approved frontend origins
app.use(cors({
    origin(origin, callback) {
        if (!origin || uniqueOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));

// Limit request body size
app.use(express.json({ limit: "10kb" }));

app.use("/api/v1/auth", require("./routes/auth"));

function formatEmergency(alert) {
    return {
        _id: alert._id,
        id: alert._id.toString(),
        name: alert.name,
        phone: alert.phone,
        latitude: alert.latitude,
        longitude: alert.longitude,
        location: alert.location,
        status: alert.status,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
    };
}

function getIO(req) {
    return req.app.get("io");
}

function getUserId(req) {
    return req.user?.id || req.user?._id?.toString();
}

function isSOSOwner(alert, userId) {
    return Boolean(
        alert.userId &&
        userId &&
        alert.userId.toString() === userId.toString()
    );
}

function validCoordinates(latitude, longitude) {
    return (
        latitude !== undefined &&
        longitude !== undefined &&
        Number.isFinite(Number(latitude)) &&
        Number.isFinite(Number(longitude)) &&
        Number(latitude) >= -90 &&
        Number(latitude) <= 90 &&
        Number(longitude) >= -180 &&
        Number(longitude) <= 180
    );
}

function validLocation(location) {
    return (
        location === undefined ||
        (
            typeof location === "string" &&
            location.length <= 500
        )
    );
}

// Send updates only to authenticated responders
function notifyResponders(req, event, emergency) {
    const io = getIO(req);

    if (io) {
        io.to("responders").emit(event, emergency);
    }
}

// Public health check - reveals no sensitive information
app.get("/api/v1/health", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "HimSafe API is running",
    });
});

// Create SOS alert
app.post("/api/v1/sos", authenticate, async (req, res) => {
    try {
        const { latitude, longitude, location } = req.body;
        const userId = getUserId(req);

        if (!validCoordinates(latitude, longitude)) {
            return res.status(400).json({
                success: false,
                message: "Valid coordinates are required",
            });
        }

        if (!validLocation(location)) {
            return res.status(400).json({
                success: false,
                message: "Invalid location value",
            });
        }

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid authenticated user",
            });
        }

        if (!req.user.phone) {
            return res.status(400).json({
                success: false,
                message: "Add a mobile number to your account before sending an SOS",
            });
        }

        const alert = await SOS.create({
            userId,
            name: req.user.name,
            phone: req.user.phone,
            latitude: Number(latitude),
            longitude: Number(longitude),
            location: location || "",
            status: "active",
        });

        const emergency = formatEmergency(alert);

        notifyResponders(req, "sos:created", emergency);

        return res.status(201).json({
            success: true,
            message: "SOS alert created successfully",
            emergency,
        });
    } catch (error) {
        console.error("Create SOS error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to create SOS alert",
        });
    }
});

// Get all SOS history - responder only
app.get(
    "/api/v1/sos",
    authenticate,
    requireRole("responder"),
    async (req, res) => {
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
    }
);

// Get authenticated user's own SOS history
app.get("/api/v1/sos/mine", authenticate, async (req, res) => {
    try {
        const alerts = await SOS.find({
            userId: getUserId(req),
        })
            .sort({ createdAt: -1 })
            .limit(50);

        return res.status(200).json({
            success: true,
            count: alerts.length,
            emergencies: alerts.map(formatEmergency),
        });
    } catch (error) {
        console.error("My SOS history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch your SOS history",
        });
    }
});

// Get active emergencies - responder only
app.get(
    "/api/v1/emergencies/active",
    authenticate,
    requireRole("responder"),
    async (req, res) => {
        try {
            const alerts = await SOS.find({
                status: { $ne: "resolved" },
            }).sort({ createdAt: -1 }).limit(100);

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
    }
);

// Emergency analytics - responder only
app.get(
    "/api/v1/analytics/emergencies",
    authenticate,
    requireRole("responder"),
    async (req, res) => {
        try {
            const total = await SOS.countDocuments();
            const active = await SOS.countDocuments({
                status: { $ne: "resolved" },
            });
            const resolved = await SOS.countDocuments({
                status: "resolved",
            });

            const recentAlerts = await SOS.find()
                .sort({ createdAt: -1 })
                .limit(50);

            return res.status(200).json({
                success: true,
                analytics: {
                    total,
                    active,
                    resolved,
                    recent: recentAlerts.map(formatEmergency),
                },
            });
        } catch (error) {
            console.error("Analytics error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch emergency analytics",
            });
        }
    }
);

// Acknowledge emergency - responder only
app.patch(
    "/api/v1/sos/:id/acknowledge",
    authenticate,
    requireRole("responder"),
    async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid emergency ID",
                });
            }

            const alert = await SOS.findById(req.params.id);

            if (!alert) {
                return res.status(404).json({
                    success: false,
                    message: "Emergency not found",
                });
            }

            if (alert.status === "resolved") {
                return res.status(400).json({
                    success: false,
                    message: "This emergency is already resolved",
                });
            }

            alert.status = "acknowledged";
            await alert.save();

            const emergency = formatEmergency(alert);

            notifyResponders(req, "emergencies:updated", emergency);

            return res.status(200).json({
                success: true,
                message: "Emergency acknowledged",
                emergency,
            });
        } catch (error) {
            console.error("Acknowledge SOS error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to acknowledge emergency",
            });
        }
    }
);

// Update SOS location - owner or responder
app.patch(
    "/api/v1/sos/:id/location",
    authenticate,
    async (req, res) => {
        try {
            const { latitude, longitude, location } = req.body;

            if (!validCoordinates(latitude, longitude)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid coordinates are required",
                });
            }

            if (!validLocation(location)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid location value",
                });
            }

            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid emergency ID",
                });
            }

            const alert = await SOS.findById(req.params.id);

            if (!alert) {
                return res.status(404).json({
                    success: false,
                    message: "Emergency not found",
                });
            }

            const userId = getUserId(req);
            const isResponder = req.user.role === "responder";
            const isOwner = isSOSOwner(alert, userId);

            if (!isResponder && !isOwner) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to update this SOS",
                });
            }

            if (alert.status === "resolved") {
                return res.status(400).json({
                    success: false,
                    message: "Cannot update a resolved emergency",
                });
            }

            alert.latitude = Number(latitude);
            alert.longitude = Number(longitude);

            if (location !== undefined) {
                alert.location = location;
            }

            await alert.save();

            const emergency = formatEmergency(alert);

            notifyResponders(req, "sos:location-updated", emergency);

            return res.status(200).json({
                success: true,
                message: "Emergency location updated",
                emergency,
            });
        } catch (error) {
            console.error("Update SOS location error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to update emergency location",
            });
        }
    }
);

// Resolve SOS - owner can cancel their own SOS; responder can resolve any SOS
app.patch(
    "/api/v1/sos/:id/resolve",
    authenticate,
    async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid emergency ID",
                });
            }

            const alert = await SOS.findById(req.params.id);

            if (!alert) {
                return res.status(404).json({
                    success: false,
                    message: "Emergency not found",
                });
            }

            const userId = getUserId(req);
            const isResponder = req.user.role === "responder";
            const isOwner = isSOSOwner(alert, userId);

            if (!isResponder && !isOwner) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to resolve this SOS",
                });
            }

            if (alert.status === "resolved") {
                return res.status(400).json({
                    success: false,
                    message: "This emergency is already resolved",
                });
            }

            alert.status = "resolved";
            await alert.save();

            const emergency = formatEmergency(alert);

            notifyResponders(req, "emergencies:updated", emergency);

            return res.status(200).json({
                success: true,
                message: isResponder
                    ? "Emergency resolved successfully"
                    : "Your SOS has been cancelled",
                emergency,
            });
        } catch (error) {
            console.error("Resolve SOS error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to resolve emergency",
            });
        }
    }
);

// Handle malformed JSON and request errors
app.use((error, req, res, next) => {
    if (error.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "Request body is too large",
        });
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON request",
        });
    }

    if (error.message === "Origin not allowed by CORS") {
        return res.status(403).json({
            success: false,
            message: "Origin not allowed",
        });
    }

    console.error("Unhandled API error:", error.message);

    return res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

module.exports = app;
