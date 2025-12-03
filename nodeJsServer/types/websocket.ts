import WebSocket from "ws";

declare global {
    namespace CustomWebSocket {
        /**
         * Extends the WebSocket object with custom properties for the user.
         * 
         * @property {string} [logFileHandle] - An optional handle or identifier for a log file associated with the user.
         * @property {string} [selectedUser] - An optional identifier for the user currently selected.
         */
        export interface User extends WebSocket {
            logFileHandle?: string;
            selectedUser?: string;
        }

        namespace Client {
            /**
             * Represents the messages sent from the client to the server.
             * 
             * - `fetchData`: Requests data using the provided `json_name` (can be a string or an array of strings).
             * - `fetchUser`: Requests user data using the provided `json_name`.
             * - `sendMessageToRasa` or `sendMessageToUser`: Sends a message to Rasa or another user.
             * - `admin`: Sends an administrative command to the server.
             */
            export type ToServerMessage = {
                action: "fetchData";
                json_name: string | string[]
            } | {
                action: "fetchUser";
                json_name: string
            } | {
                action: "sendMessageToRasa" | "sendMessageToUser";
                message: string;
                currentConversationId: string;
            } | {
                action: "admin";
                command: string;
            } | {
                action: "setUpNewConversation";
                folder: string | null;
            } | {
                action: "setUpNewFolder";
                folderName: string;
            } | {
                action: "addToFolder";
                folderName: string;
                conversationId: string;
            } | {
                action: "deleteConversation";
                conversationId: string;
            } | {
                action: "deleteFolder";
                folderName: string;
            };
        }

        namespace Server {
            /**
             * Represents the messages sent from the server to the client.
             * 
             * - Includes optional fields such as `isAdmin`, `error`, `message`, `data`, `clients`, and `promptMsg`.
             * - `message`: Can be a single message or an array of messages, each containing `str` (the message text) and `srv` (a flag indicating if it's server-related).
             * - `data`: Contains optional fields `data` or `args` for additional information.
             * - `clients`: Provides lists of connected discussions and logged-in users.
             * - `promptMsg`: Contains a prompt message with a string (`str`) and an error flag.
             * - `newConversationId`: Provides a new conversation identifier when applicable.
             * - `currentConversationId`: Provides the current conversation identifier when applicable.
             */
            export type ToClientMessage = {
                isAdmin?: boolean
                error?: false;
                message?: {
                    str: string;
                    srv: boolean
                } | {
                    str: string;
                    srv: boolean
                }[];
                data?: {
                    data?: string;
                    args?: string;
                };
                clients?: {
                    connectedId: string; userLoggedList: string[]; userFolders: string[];
                };
                promptMsg?: {
                    str: string;
                    error: boolean;
                };
                newConversationId?: string
            } | {
                error: true
                message: { str: string; srv: boolean }[]
            };
        }

    }
}

// Exporting an empty object to ensure this file is treated as a module by TypeScript.
// This is necessary to extend the global namespace.
export { };