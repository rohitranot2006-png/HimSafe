const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

class AuthenticationError extends Error {
    constructor(message = "Invalid or expired login token") {
        super(message);
        this.name = "AuthenticationError";
        this.statusCode = 401;
    }
}

// Verify token and fetch the actual user from database
async function verifyUserToken(token) {
    if (typeof token !== "string" || !token.trim()) {
        throw new AuthenticationError();
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }

    let decoded;

    try {
        decoded = jwt.verify(token, secret, {
            issuer: "himsafe",
            audience: "himsafe-client",
            algorithms: ["HS256"],
        });
    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            throw new AuthenticationError();
        }

        throw error;
    }

    if (
        !decoded ||
        typeof decoded !== "object" ||
        !mongoose.isValidObjectId(decoded.userId)
    ) {
        throw new AuthenticationError();
    }

    const user = await User.findById(decoded.userId).select(
        "_id name email phone role"
    );

    if (!user) {
        throw new AuthenticationError("User account not found");
    }

    return {
        _id: user._id,
        id: user._id.toString(),
        name: user.name,
        email: user.email || "",
        phone: user.phone || "",
        role: user.role,
    };
}

// REST API authentication
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const token = authHeader.slice(7);
        req.user = await verifyUserToken(token);

        return next();
    } catch (error) {
        if (error.statusCode === 401) {
            return res.status(401).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Authentication error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Authentication failed",
        });
    }
}

// Role-based authorization
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (
            !req.user ||
            !allowedRoles.includes(req.user.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to perform this action",
            });
        }

        return next();
    };
}

module.exports = {
    authenticate,
    requireRole,
    verifyUserToken,
};