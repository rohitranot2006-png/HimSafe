
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");

require("dotenv").config();

const PORT = process.env.PORT || 5000;
const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/himsafe";

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: [
            "https://localhost:5173",
            "http://localhost:5173",
        ],
        methods: ["GET", "POST", "PATCH"],
    },
});

app.set("io", io);

io.on("connection", (socket) => {
    console.log("Dashboard connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Dashboard disconnected:", socket.id);
    });
});

mongoose
    .connect(MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully");

        httpServer.listen(PORT, () => {
            console.log(
                `HimSafe server running on port ${PORT}`
            );
        });
    })
    .catch((error) => {
        console.error(
            "MongoDB connection failed:",
            error.message
        );
    });