"use server";
import { cookies } from "next/headers";
import { Session, ISession } from "@/lib/db/models/session";

/**
 * Retrieves the current session by reading the sessionId cookie, 
 * extracting the sessionId, and then fetching the session from the database.
 * 
 * @returns {Promise<any | null>} The user object if the session is found, or null if not.
 */
async function getSession() {
    const sessionId = cookies()
        .get("sessionId")
        ?.value.split(":")[1]
        .split(".")[0];
    console.log("Session ID from cookie:", sessionId);
    const session: ISession | null = await Session.findById(sessionId);
    return session ? session.session.passport.user : null;
}

export { getSession };
