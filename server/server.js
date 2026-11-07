
require("dotenv").config();

const dns = require("node:dns");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = require("./app");
const { verifyUserToken } = require("./middleware/auth");

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGODB_URI) {
    console.error("MONGODB_URI is not configured");
    process.exit(1);
}

if (!JWT_SECRET) {
    console.error("JWT_SECRET is not configured");
    process.exit(1);
}

// Local development DNS workaround
if (!IS_PRODUCTION) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// Production proxy configuration
if (IS_PRODUCTION) {
    app.set("trust proxy", 1);
}

// Allowed frontend origins
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

// Create server
let server;

if (IS_PRODUCTION) {
    server = http.createServer(app);
} else {
    const certDir = path.join(__dirname, "certs");

    const keyPath = path.join(certDir, "localhost-key.pem");
    const certPath = path.join(certDir, "localhost-cert.pem");

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.error("Local HTTPS certificates are missing");
        process.exit(1);
    }

    server = https.createServer(
        {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        },
        app
    );
}

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: uniqueOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

app.set("io", io);

// Authenticate Socket.IO connections
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication required"));
        }

        const user = await verifyUserToken(token);

        if (user.role !== "responder") {
            return next(new Error("Responder access required"));
        }

        socket.data.user = user;

        return next();
    } catch (error) {
        if (error.statusCode === 401) {
            return next(new Error("Invalid or expired login token"));
        }

        console.error(
            "Socket authentication error:",
            error.message
        );

        return next(new Error("Socket authentication failed"));
    }
});

// Only authenticated responders join this room
io.on("connection", (socket) => {
    socket.join("responders");

    console.log("Authenticated responder connected");

    socket.on("disconnect", () => {
        console.log("Responder disconnected");
    });
});

// Detailed MongoDB error diagnostics
function logMongoError(error) {
    console.error("\nMongoDB connection failed!");
    console.error("Error name:", error.name || "Unknown");
    console.error("Error code:", error.code || "Not available");
    console.error("Error message:", error.message);

    if (error.reason?.servers) {
        console.error("\nIndividual server errors:");

        for (const [address, server] of error.reason.servers) {
            console.error("Server:", address);

            if (server.error) {
                console.error(
                    "Server error:",
                    server.error.message
                );
            } else {
                console.error(
                    "Server state:",
                    server.type || "Unknown"
                );
            }
        }
    }

    if (error.cause) {
        console.error("Cause:", error.cause.message);
    }

    console.error(
        "\nCheck Atlas Network Access, database credentials,",
        "and MongoDB connection configuration.\n"
    );
}

// Connect MongoDB before starting server
async function startServer() {
    try {
        console.log("Connecting to MongoDB Atlas...");
        console.log("Environment:", NODE_ENV);

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 10000,
        });

        console.log("MongoDB connected successfully");

        server.listen(PORT, () => {
            console.log(
                `HimSafe ${IS_PRODUCTION ? "HTTP" : "HTTPS"} server running on port ${PORT}`
            );

            if (!IS_PRODUCTION) {
                console.log(
                    `Health check: https://localhost:${PORT}/api/v1/health`
                );
            }
        });
    } catch (error) {
        logMongoError(error);
        process.exit(1);
    }
}

startServer();
