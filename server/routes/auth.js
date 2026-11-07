
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");

const User = require("../models/User");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Login: maximum 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Please try again after 15 minutes.",
    },
});

// Registration: maximum 5 attempts per hour per IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many registration attempts. Please try again later.",
    },
});

function normalizePhone(phone) {
    return typeof phone === "string"
        ? phone.replace(/[\s()-]/g, "")
        : "";
}

function publicUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone || "",
        email: user.email || "",
        role: user.role,
    };
}

function validPhone(phone) {
    return /^\+?[1-9]\d{9,14}$/.test(phone);
}

// Register a new account
router.post("/register", registerLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const { name, password } = body;
        const phone = normalizePhone(body.phone);

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 80 ||
            !validPhone(phone) ||
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Enter your name (maximum 80 characters), a valid mobile number, and a password of 8–72 characters",
            });
        }

        const existingUser = await User.findOne({ phone });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this mobile number already exists",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: name.trim(),
            phone,
            password: hashedPassword,
            role: "user",
        });

        return res.status(201).json({
            success: true,
            message: "Account created successfully",
            user: publicUser(user),
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this mobile number already exists",
            });
        }

        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Registration failed",
        });
    }
});

// Login using mobile number or email
router.post("/login", loginLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const { password } = body;

        const phone = normalizePhone(body.phone);

        const email =
            typeof body.email === "string"
                ? body.email.trim().toLowerCase()
                : "";

        if (
            typeof password !== "string" ||
            !password ||
            password.length > 72 ||
            (!validPhone(phone) && !email)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your mobile number or email and password",
            });
        }

        const query = validPhone(phone)
            ? { phone }
            : { email };

        const user = await User.findOne(query).select("+password");

        if (
            !user ||
            !(await bcrypt.compare(password, user.password))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid mobile number/email or password",
            });
        }

        const secret = process.env.JWT_SECRET;

        if (!secret) {
            console.error("JWT_SECRET is not configured");

            return res.status(500).json({
                success: false,
                message: "Authentication service is not configured",
            });
        }

        const token = jwt.sign(
            { userId: user._id.toString() },
            secret,
            {
                expiresIn: "8h",
                issuer: "himsafe",
                audience: "himsafe-client",
                algorithm: "HS256",
            }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: publicUser(user),
        });
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});

// Get current authenticated account
router.get("/me", authenticate, (req, res) => {
    return res.status(200).json({
        success: true,
        user: publicUser(req.user),
    });
});

module.exports = router;
