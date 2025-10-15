import express from "express";
import type { Express } from "express";
import passport from "passport";

// Create a router for authentication-related routes
const auth = express.Router();

// Import the registration route
import register from "./auth/register";
import keycloakAuth from "./auth/keycloak";

/**
 * Handle the login process with passport local strategy
 */
auth.post("/", function (req, res, next) {
    passport.authenticate(
        "local",
        function (err: Error, user: boolean, info: { message: string }) {
            // If authentication fails (user is false), redirect to login page with error
            if (user === false) {
                res.redirect("/login?a=2");
            } else {
                // If authentication is successful, log the user in
                req.login(user, function (err) {
                    if (err) {
                        // If there is an error during login, pass it to the next middleware
                        next(err);
                    }
                    // Check if the "rememberMe" option is selected
                    else if (req.body.rememberMe) {
                        // If rememberMe is true, set the session cookie expiration to 30 days
                        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                    } else {
                        // If rememberMe is not selected, set the session cookie to expire at the end of the session
                        req.session.cookie.expires = undefined;
                    };
                    // Redirect the user to the dashboard after successful login
                    res.redirect(`/dashboard`);
                });
            }
        }
    )(req, res, next); // Call passport authentication
});

/**
 * Route pour vérifier la session courante
 */
auth.get("/session", (req, res) => {
    if (req.user) {
        res.json({
            authenticated: true,
            user: req.user
        });
    } else {
        res.json({
            authenticated: false,
            user: null
        });
    }
});

/**
 * Route de test pour vérifier que les routes auth fonctionnent
 */
auth.get("/test", (req, res) => {
    console.log("🧪 Route de test /auth/test appelée");
    res.json({ 
        message: "Routes auth fonctionnent correctement!",
        timestamp: new Date().toISOString(),
        user: req.user || null
    });
});

/**
 * Handle logging in as a guest user. This does not require user credentials.
 */
auth.get("/as-guest", (req, res, next) => {
    // If the user is not logged in, log in as a guest
    if (!req.user) {
        req.login({ userId: "0", username: "guest" }, (err) => {
            if (err) next(err)
            else {
                req.session.cookie.expires = undefined;
                res.redirect("/dashboard")
            };
        });
    }
    else res.redirect("/dashboard");
});

/**
 * Handle user logout
 */
auth.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            next(err);
        } else {
            res.json({ success: true, message: "Déconnecté avec succès" });
        }
    });
});

// Use the "register" route for handling user registration
auth.use("/register", register);

// Use the "keycloak" route for handling Keycloak authentication
auth.use("/keycloak", keycloakAuth);

/**
 * Export a function to add the authentication routes to the server
 * @param {Express} server - The Express server instance.
 */
export default (server: Express) => {
    server.use("/auth", auth);
};