import mongoose, { ObjectId } from "mongoose";
const Schema = mongoose.Schema;

/**
 * Interface representing a user document in MongoDB.
 * @interface IUser
 * @extends {mongoose.Document}
 */
export interface IUser extends mongoose.Document {
    userId: ObjectId; // The unique identifier for the user document
    username: string; // The user's username
    role: "guest" | "user" | "admin"; // The role of the user, which can be one of "guest", "user", or "admin"
    salt: string; // The salt used for password hashing
    hash: string; // The hashed password
    provider?: string; // Optional field to indicate the authentication provider (e.g., "keycloak")
}

/**
 * Schema for creating user documents in MongoDB.
 * @type {mongoose.Schema<IUser>}
 */
const UserSchema: mongoose.Schema<IUser> = new Schema<IUser>({
    username: {
        type: String,
        unique: true, // Ensures each username is unique
    },
    role: String,
    salt: String,
    hash: String,
});

/**
 * User model representing the 'user' collection in the MongoDB database.
 * It ensures we can interact with the 'user' collection and query or modify user data.
 * @type {mongoose.Model<IUser>}
 */
const UserModel: mongoose.Model<IUser> = (mongoose.models.user as mongoose.Model<IUser>) || mongoose.model<IUser>("user", UserSchema);

export { UserModel as User };
