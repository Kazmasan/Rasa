import express from "express";
import fetch from "node-fetch";

const keycloakAuth = express.Router();

// Interface for Keycloak user data
interface KeycloakUserInfo {
  sub: string;
  email_verified: boolean;
  name: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
}

/**
 * Redirect route from /auth/keycloak to /auth/keycloak/login
 */
keycloakAuth.get("/", (req, res) => {
  console.log("Redirecting from /auth/keycloak to /auth/keycloak/login");
  res.redirect("/auth/keycloak/login");
});

/**
 * Route to initiate Keycloak authentication
 * Redirects to Keycloak authorization page
 */
keycloakAuth.get("/login", (req, res) => {
  console.log("Keycloak /login route called");
  console.log("KEYCLOAK_ISSUER:", process.env.KEYCLOAK_ISSUER);
  console.log("KEYCLOAK_CLIENT_ID:", process.env.KEYCLOAK_CLIENT_ID);
  
  // Validate required environment variables
  if (!process.env.KEYCLOAK_ISSUER || !process.env.KEYCLOAK_CLIENT_ID) {
    console.error("Missing Keycloak environment variables");
    return res.status(500).json({ 
      error: "Missing Keycloak configuration",
      missing: {
        KEYCLOAK_ISSUER: !process.env.KEYCLOAK_ISSUER,
        KEYCLOAK_CLIENT_ID: !process.env.KEYCLOAK_CLIENT_ID,
      }
    });
  }

  // Build base URL from the incoming request
  const baseUrl = req.protocol + '://' + req.get('host');
  const keycloakLoginURL = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth`;
  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    redirect_uri: `${baseUrl}/auth/keycloak/callback`,
    response_type: "code",
    scope: "openid email profile",
    state: Math.random().toString(36).substring(2, 15), // Security state
  });

  console.log("Redirecting to:", `${keycloakLoginURL}?${params.toString()}`);
  res.redirect(`${keycloakLoginURL}?${params.toString()}`);
});

/**
 * Callback route to handle the Keycloak response
 */
keycloakAuth.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  console.log("Keycloak callback called with code:", !!code);

  if (!code) {
    console.error("No authorization code received");
    return res.redirect("/login?error=no_code");
  }

  try {
    // Build base URL
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // Exchange authorization code for access token (same as in your next-auth flow)
    const tokenURL = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
    const tokenParams = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code: code as string,
      redirect_uri: `${baseUrl}/auth/keycloak/callback`,
    });

    console.log("Exchanging code for tokens...");
    const tokenResponse = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Error exchanging tokens:", errorData);
      throw new Error("Failed to exchange code for tokens");
    }

    const tokens = await tokenResponse.json();
    console.log("Tokens successfully obtained");

    // Fetch user info with the access token
    const userInfoURL = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`;
    const userInfoResponse = await fetch(userInfoURL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error("Error fetching user info");
      throw new Error("Failed to fetch user info");
    }

    const userInfo: KeycloakUserInfo = await userInfoResponse.json();
  console.log("User info retrieved:", userInfo.preferred_username || userInfo.email);

    // Create a user object for the Express session (compatible with your existing system)
    const tempUser = {
      _id: userInfo.sub,
      username: "guest",//userInfo.preferred_username || userInfo.email,
      email: userInfo.email,
      name: userInfo.name,
      provider: "keycloak",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      role: "guest", // Default role for Keycloak users
    };

    console.log(tempUser);

    // Log the user into the Express session
    req.login(tempUser, (err) => {
      if (err) {
        console.error("Error during login:", err);
        return res.redirect("/login?error=session_error");
      }

      console.log("User successfully logged in via Keycloak");
      // Redirect to dashboard
      res.redirect("/dashboard");
    });

  } catch (error) {
    console.error("Keycloak authentication error:", error);
    res.redirect("/login?error=auth_failed");
  }
});

/**
 * Route to log out the Keycloak user
 */
keycloakAuth.post("/logout", async (req, res) => {
  const user = req.user as any;
  console.log("Keycloak logout requested");

  if (user && user.provider === "keycloak") {
    try {
      // Log out from Keycloak (similar to your next-auth flow)
      const logoutURL = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`;
      const logoutParams = new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        refresh_token: user.refreshToken,
      });

      console.log("Logging out from Keycloak...");
      await fetch(logoutURL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: logoutParams,
      });
      console.log("Logged out from Keycloak");
    } catch (error) {
      console.error("Error during Keycloak logout:", error);
    }
  }

  // End Express session
  req.logout((err) => {
    if (err) {
      console.error("Error during Express logout:", err);
    }
    console.log("Express session ended");
    res.redirect("/login");
  });
});

export default keycloakAuth;