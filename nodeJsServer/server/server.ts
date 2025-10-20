import dotenv from "dotenv";
dotenv.config(); // Load environment variables from a .env file

/**
 * Validates the `NEXT_PUBLIC_BASE_PATH` environment variable if provided.
 * 
 * Ensures that the base path follows a valid pattern (e.g., `/api/v1`).
 * Throws an error if the base path is invalid.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? process.env.NEXT_PUBLIC_BASE_PATH.toLowerCase() : undefined;

if (basePath) {
    const regex = /^(\/[a-zA-Z0-9_\-]+)+$/;

    if (!regex.test(basePath)) {
        throw new Error("Invalid url NEXT_PUBLIC_BASE_PATH!");
    };
};

import express from "express";
import session from "express-session";
import passport from "passport";
import passportLocal from "passport-local";
import helmet from "helmet";
const LocalStrategy = passportLocal.Strategy;

// Import user model for authentication and session handling
import { User, IUser } from "../lib/db/models/user";

// Connect to MongoDB using Mongoose
import MongoStore from "connect-mongo";
import mongoose from "mongoose";

/**
 * Throws an error if the MONGODB_URI environment variable is missing.
 * Connects to MongoDB using Mongoose with the provided URI.
 */
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI environment variable is missing");
mongoose.connect(process.env.MONGODB_URI); // Establish a database connection with MongoDB URI

// Import route and websocket setup functions
import { setupRoutes, setupWebsocket } from "./setup-server";

import bodyParser from "body-parser";
import next from "next";
import { authenticate } from "../lib/auth/authenticate";

// Check if running in development mode
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

/**
 * Prepare the Next.js application and start the Express server.
 * - Initializes the app, configures the server, sets up routes, and starts listening for requests.
 */
app.prepare()
    .then(() => {
        if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is missing");
        const server = express();

        // Parse incoming JSON and URL-encoded payloads
        server.use(bodyParser.json());
        server.use(bodyParser.urlencoded({ extended: true }));

        /**
         * Configure session middleware with MongoDB storage.
         * - Session data will be stored in MongoDB with a session ID.
         * - Encrypts session ID using the provided `AUTH_SECRET`.
         */
        server.use(
            session({
                secret: process.env.AUTH_SECRET, // Secret for encrypting session ID
                name: "sessionId", // Name of the session cookie
                resave: false, // Prevents resaving sessions that haven't changed
                saveUninitialized: false, // Save new sessions even if uninitialized
                store: new MongoStore({ // Use MongoDB to store sessions
                    mongoUrl: process.env.MONGODB_URI,
                    stringify: false,
                }),
                cookie: {
                    httpOnly: true, // Restrict cookie access
                },
            })
        );

        /**
        * Set up the local authentication strategy using Passport.
        * - Uses `LocalStrategy` and `authenticate` function for login.
        */
        const strategy = new LocalStrategy(authenticate);
        passport.use(strategy);

        /**
         * Serialize user information to save in the session.
         * - If the user is a "guest", saves a special session value.
         * - Otherwise, saves the user's ID and role.
         */
        //@ts-ignore
        passport.serializeUser((user: IUser, cb) => {
            user.username === "guest" ? cb(null, { userId: "-1", role: "guest" }) :
                cb(null, {
                    userId: user.userId.valueOf(),
                    role: user.role,
                    provider: user.provider
                });
        });

        /**
         * Deserialize user information from session and retrieve user data.
         * - If the user is a "guest", the deserialized session is initialized as a guest.
         * - Otherwise, fetches the user from the database using the user ID.
         */
        passport.deserializeUser((session: { userId: string, username?: string , provider?: string}, cb) => {

            // Keep guest logic unchanged
            if (session.userId === "-1") {
                return cb(null, { userId: session.userId, username: "Guest", role: "guest" });
            }

            // If the user was authenticated by Keycloak, the session may contain a provider-specific id
            // that is not a MongoDB ObjectId (for example a UUID). In that case, avoid calling
            // User.findById which will try to cast to ObjectId and fail. Instead, return the session
            // payload directly as the deserialized user object.
            if (session.provider && session.provider.toLowerCase() === "keycloak") {
                return cb(null, { userId: session.userId, username: session.username, provider: session.provider, role: "user" });
            }

            // Default behavior: lookup user in MongoDB by ObjectId
            User.findById(session.userId)
                .then((user) => cb(null, user))
                .catch(cb);
        });

        // Initialize Passport middleware and session support
        server.use(passport.initialize());
        server.use(passport.session());

        /**
         * Add security headers with Helmet.
         * - Disables content security policy (CSP) for Next.js compatibility.
         */
        server.use(helmet({
            contentSecurityPolicy: false,
        }));

        // Disable the 'x-powered-by' header for security reasons
        server.disable('x-powered-by');

        // Set up routes for API and other server endpoints
        setupRoutes(server);

        // Handle all remaining requests with Next.js
        server.get("*", (req, res) => {
            if (basePath && !req.url.startsWith(basePath)) req.url = basePath + req.url;
            return handle(req, res);
        });

        /**
         * Start the Express server and listen for requests.
         * - The server listens on the specified port, defaulting to 3000.
         */
        const port = process.env.PORT && !isNaN(Number(process.env.PORT)) ? Number(process.env.PORT) : 3000;
        let httpServer = server.listen(port, () => {
            console.log(`> Ready on http://localhost:${port}`);
        });

        // Set up WebSocket server
        setupWebsocket(httpServer);
    })
    .catch((ex) => {
        console.error(ex.stack); // Log any startup errors and exit
        process.exit(1);
    });