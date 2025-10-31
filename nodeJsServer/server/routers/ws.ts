import WebSocket from "ws";
import { Server } from "http";
import fs from "fs";
import path from "path";
import * as rasaClient from "../../lib/rasaClient";
import { getErrorMessage } from "../../lib/get-error-message";
import cookieParser from "cookie-parser";
import { Session, ISession } from "../../lib/db/models/session";
import crypto from "crypto";

// Track connected clients and admins
let clients: Map<string, CustomWebSocket.User> = new Map();
let admins: Map<string, CustomWebSocket.User> = new Map();

// List of actions that can be executed by admins
const actionsList =
    `action_change_plottype - Slot: plot_type
action_change_selectedvalue - Slot: selected_value, nat_value
action_toggle_national_value - Slot: nat_value
action_prefill_slots - Slot: plot_type, nat_value, selected_value, real_diff
action_initialise - Slot: plot_type, nat_value, selected_value
action_variable_ttest - Slot: real_diff
action_explore_effects - Slot: selected_value
action_default_fallback - Slot: fallback_triggered`;

/**
 * Helper function to send WebSocket messages to the client
 * @param ws The WebSocket connection to the client
 * @param message The message to send
 */
const sendWebSocketMessageToClient = (ws: CustomWebSocket.User, message: CustomWebSocket.Server.ToClientMessage) => {
    ws.send(JSON.stringify(message));
}

export default (server: Server) => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? process.env.NEXT_PUBLIC_BASE_PATH.toLowerCase() : "";
    const wsPath = `${basePath}/ws`;

    const wss = new WebSocket.Server({
        noServer: true,
        path: wsPath,
    });

    server.on("upgrade", (request, socket, head) => {
        if (request.url === wsPath) {
            wss.handleUpgrade(request, socket, head, (websocket) => {
                wss.emit("connection", websocket, request);
            });
        }
    });


    // Handle WebSocket connections
    wss.on('connection', async (ws: CustomWebSocket.User, request) => {
        if (!request.headers.cookie) return;
        let cookies: { [key: string]: string; } = {};

        // Parse cookies from the request header
        request.headers.cookie.split(`;`).forEach(function (cookie) {
            let [name, ...rest] = cookie.split(`=`);
            name = name?.trim();
            if (!name) return;
            const value = rest.join(`=`).trim();
            if (!value) return;
            cookies[name] = decodeURIComponent(value);
        });

        // Verify the signed cookies for session validation
        const signedCookies = cookieParser.signedCookies(cookies, process.env.AUTH_SECRET as string)
        if (!signedCookies.sessionId) return;

        // Retrieve session data using the session ID from cookies
    const sessionContent: ISession | null = await Session.findById(signedCookies.sessionId);
        if (!sessionContent) return ws.close();

    const conversationId = `${crypto.randomUUID()}`;
    const session = sessionContent.session.passport.user;
    
        ws.on('message', async (message) => {
            const parsedMessage = JSON.parse(message.toString()) as CustomWebSocket.Client.ToServerMessage;

            // Handle case when the client requests server-based JSON data
            if (parsedMessage.action === 'fetchData') {
                try {
                    console.log(`Client asking for ${Array.isArray(parsedMessage.json_name) ? parsedMessage.json_name.join(', ') : parsedMessage.json_name}.json`);

                    let data: Record<string, any> = {};
                    if (Array.isArray(parsedMessage.json_name)) {
                        parsedMessage.json_name.forEach((name: string) => {
                            const jsonData = fs.readFileSync(path.join(process.cwd(), 'server', 'data', `${name}.json`));
                            data[name] = JSON.parse(jsonData.toString());
                        });
                    } else {
                        const jsonData = fs.readFileSync(path.join(process.cwd(), 'server', 'data', `${parsedMessage.json_name}.json`));
                        data[parsedMessage.json_name] = JSON.parse(jsonData.toString());
                    };

                    // Send back the requested data
                    sendWebSocketMessageToClient(ws, {
                        error: false,
                        data: data
                    })
                } catch (error) {
                    console.error('Error reading JSON file:', error);
                    sendWebSocketMessageToClient(ws, {
                        error: true,
                        message: [{ str: `Failed to read JSON file : ${Array.isArray(parsedMessage.json_name) ? parsedMessage.json_name.join(', ') : parsedMessage.json_name}`, srv: true }]
                    })
                }
            }

            // Handle case for fetching user logs
            else if (parsedMessage.action === 'fetchUser') {
                ws.selectedUser = parsedMessage.json_name; //user selected by the admin
                console.log(`Admin asking for ${parsedMessage.json_name} logs`);
                //const jsonData = fs.readFileSync(path.join(process.cwd(), 'logs', `${parsedMessage.json_name}.json`));
                const jsonData = await rasaClient.loadConversation(parsedMessage.json_name);

                // Parse and send user logs to the admin

                const parsedMessageToSend = rasaClient.parseLogsToSend(jsonData);
                sendWebSocketMessageToClient(ws, parsedMessageToSend);
            }

            // Handle case for sending a message to Rasa
            else if (parsedMessage.action === 'sendMessageToRasa') {

                // Ensure parentheses are correct so we call the function and then chain .then()
                rasaClient.sendMessageToRasa(parsedMessage.message, parsedMessage.currentConversationId)
                    .then(response => {
                        // Log and send the response back to the client
                        rasaClient.logInteraction(
                            parsedMessage.currentConversationId,
                            session.userId
                        );
                        console.log("Response from Rasa Server:");
                        console.log(response);

                        //Sending client
                        sendWebSocketMessageToClient(ws, {
                            error: false,
                            message: response.message,
                            data: {
                                data: response.data?.data?.file_content,
                                args: response.data?.args?.file_content
                            }
                        });

                        // Notify the watching admin with the response
                        const watchingAdmin = Array.from(admins.values()).find(admin => admin.selectedUser === conversationId);
                        if (watchingAdmin) {
                            // Create a new array with parsedMessage at the start
                            const combinedMessages = [{ str: parsedMessage.message, srv: false }, ...response.message];

                            sendWebSocketMessageToClient(watchingAdmin, {
                                error: false,
                                message: combinedMessages,
                                data: {
                                    data: response.data?.data?.file_content,
                                    args: response.data?.args?.file_content
                                }
                            });
                        };

                        // Log user and Rasa interaction
                        //rasaClient.logInteraction(ws.logFileHandle as string, userTimestamp, parsedMessage.message, rasaTimestamp, response);
                    })
                    .catch(error => {
                        console.error('Error sending message to Rasa:', error);
                        sendWebSocketMessageToClient(ws, {
                            error: true,
                            message: [{ str: 'Failed to process message with Rasa', srv: true }]
                        });
                    });
            }

            else if (parsedMessage.action === 'setUpNewConversation') {
                try {
                    // Generate a new conversation ID
                    const newConversationId = `${crypto.randomUUID()}`;
                    
                    // Set up logging for the new conversation
                    rasaClient.setupLogging(session.userId, newConversationId);
                    
                    // Get updated user logs
                    const userLoggedList = await rasaClient.getUserLog(session.userId);
                    
                    // Add new conversation to clients map
                    clients.set(newConversationId, ws);
                    console.log(`New client connected with user_id: ${newConversationId}`);
                    
                    sendWebSocketMessageToClient(ws, {
                        clients: {
                            connectedId: newConversationId,
                            userLoggedList: userLoggedList
                        }
                    });

                } catch (error) {
                    console.error('Error setting up new conversation:', error);
                    sendWebSocketMessageToClient(ws, {
                        error: true,
                        message: [{ str: 'Failed to set up new conversation', srv: true }]
                    });
                }
            }

            // Handle case for sending a message to a specific user
            else if (parsedMessage.action === 'sendMessageToUser') {
                try {
                    // Find the selected user into the list of active socket and send the message
                    if (ws.selectedUser) {
                        const selectedClient = clients.get(ws.selectedUser);
                        if (selectedClient) {
                            sendWebSocketMessageToClient(selectedClient, {
                                error: false,
                                message: [{ str: parsedMessage.message, srv: true }],
                            });
                            //rasaClient.logSingleEntry(selectedClient.logFileHandle as string, parsedMessage.message, true);
                        } else {
                            throw new Error("Couldn't find selected user");
                        }
                    } else {
                        throw new Error("Couldn't send message to user without any selected");
                    }
                } catch (error) {
                    console.error('Error processing sendMessageToUser:', getErrorMessage(error));
                    sendWebSocketMessageToClient(ws, {
                        error: true,
                        message: [{ str: getErrorMessage(error), srv: true }]
                    });
                };
            }


            // Handle case for admin commands
            if (parsedMessage.action === 'admin') {
                console.log(`Received command from admin: ${parsedMessage.command}`);

                if (parsedMessage.command === "help") {
                    sendWebSocketMessageToClient(ws, {
                        promptMsg: {
                            str: "action --slot1 val1 --slot2 val2",
                            error: false,
                        }
                    });
                } else if (parsedMessage.command === "list") {
                    sendWebSocketMessageToClient(ws, {
                        promptMsg: {
                            str: actionsList,
                            error: false,
                        }
                    });
                } else {
                    try {
                        // Parse the admin command and execute the corresponding action
                        const parsedCommand = rasaClient.parseCommand(parsedMessage.command);
                        // Extract the action and slots
                        const { action, slots } = parsedCommand;

                        // Trigger the action and handle the response
                        rasaClient.triggerAction(action, slots)
                            .then(response => {
                                console.log(`Action ${action} executed successfully:`, response);

                                // Send confirmation message to the admin
                                sendWebSocketMessageToClient(ws, {
                                    promptMsg: {
                                        str: `Action ${action} executed successfully.`,
                                        error: false,
                                    },
                                    message: response.message, // Include Rasa response message
                                    data: {
                                        data: response.data?.data?.file_content,
                                        args: response.data?.args?.file_content
                                    }
                                });

                                // Send the message to the selected user if available
                                if (ws.selectedUser) {
                                    const selectedClient = clients.get(ws.selectedUser);
                                    if (selectedClient) {
                                        sendWebSocketMessageToClient(selectedClient, {
                                            error: false,
                                            message: [{ str: response.message, srv: true }]
                                        });

                                        // Log the response for the selected user
                                        //rasaClient.logSingleEntry(selectedClient.logFileHandle as string, response.message, true);
                                    } else {
                                        throw new Error("Couldn't find selected user");
                                    }
                                } else {
                                    throw new Error("No selected user to send the message to");
                                }
                            })
                            .catch(error => {
                                console.error(`Error executing action ${action}:`, error);
                                sendWebSocketMessageToClient(ws, {
                                    promptMsg: {
                                        str: `Error executing action ${action}: ${error.message}`,
                                        error: true,
                                    }
                                });
                            });
                    } catch (error) {
                        console.error(`Error parsing command:`, error);
                        sendWebSocketMessageToClient(ws, {
                            promptMsg: {
                                str: `Can't parse your command: ${getErrorMessage(error)}`,
                                error: true,
                            }
                        });
                    }
                }
            }
        }); //onmessage

        ws.on('close', () => {
            if (session.role === "admin") {
                let wasFound = admins.delete(conversationId);
                if (!wasFound) return;
                console.log(`Admin disconnected ${conversationId}`);

            } else {
                let wasFound = clients.delete(conversationId);
                if (!wasFound) return;
                console.log(`Client disconnected ${conversationId}`);


                // Send updated client list to all admins
                const userLoggedList = rasaClient.getUserLoggedList();
                const clientListMessage = {
                    clients: {
                        connectedId: conversationId,
                        userLoggedList: userLoggedList
                    }
                };
                admins.forEach(admin => {
                    if (admin.readyState === WebSocket.OPEN) {
                        sendWebSocketMessageToClient(admin, clientListMessage)
                    }
                });
            };
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        //Welcome Message
        sendWebSocketMessageToClient(ws, { message: { str: 'Hello from server', srv: true }, isAdmin: session.role === "admin" });

        const userLog = await rasaClient.getUserLog(session.userId);
        //Get latest logId on the list
        const latestLogId = userLog.length > 0 ? userLog[userLog.length - 1].id : `${crypto.randomUUID()}`;

        // Create the logging file
        //ws.logFileHandle = rasaClient.setupLogging(session.userId, conversationId);
        if (userLog.length === 0) {
            rasaClient.setupLogging(session.userId, conversationId);
        }

        if (ws.readyState !== WebSocket.OPEN) return;


        clients.set(latestLogId, ws);
        console.log(`New client connected with user_id: ${latestLogId}`);

        // Send the list of conversation IDs related to this user back to the user client
        try {
            const userClientMessage = {
                clients: {
                    connectedId: latestLogId,
                    userLoggedList: userLog
                }
            };
            if (ws.readyState === WebSocket.OPEN) sendWebSocketMessageToClient(ws, userClientMessage);
        } catch (err) {
            console.error('Failed to send user conversation list to client:', err);
        }
    });
};