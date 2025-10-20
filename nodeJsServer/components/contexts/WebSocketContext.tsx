"use client";

import { createContext, useState, useEffect, ReactNode, useRef } from 'react';
import { getErrorMessage } from "@/lib/get-error-message";
import { ChartTypeRegistry } from 'chart.js';

/**
 * Represents a message exchanged in the chat.
 */
interface IMessage {
    content: string;
    type: "server" | "client" | "error";
};

/**
 * Represents the data structure used in the chatbot charts.
 */
type ChatbotChartData = {
    YQ: string;
    Value: number;
    nat_value?: number;
};

/**
 * Represents the arguments for the chart visualization.
 */
type ChatbotChartArgs =
    {
        visualization: {
            show_nat_val: false;
            type: keyof ChartTypeRegistry;
        };
    } | {
        visualization: {
            show_nat_val: true;
            type: keyof ChartTypeRegistry;
        }
    }

type ChatbotChart = {
    data: {
        YQ: string;
        Value: number;
    }[];
    args: {
        visualization: {
            show_nat_val: false;
            type: keyof ChartTypeRegistry;
        };
    };
    image?: string;
} | {
    data: {
        YQ: string;
        Value: number;
        nat_value: number;
    }[];
    args: {
        visualization: {
            show_nat_val: true;
            type: keyof ChartTypeRegistry;
        };
    };
    image?: string;
};

/**
 * Represents a command sent to or from the server.
 */
interface ICommand {
    type: "server" | "client" | "error";
    content: string;
};

/**
 * The structure of the WebSocket context used across the application.
 */
type WebSocketContextType = {
    messages: IMessage[];
    sendMessage: (message: string) => void;
    charts: ChatbotChart[];
    currentChart: ChatbotChart | null;
    setChartFromHistory: (chartIndex: ChatbotChart) => void;
    setImageForChart: (chart: ChatbotChart, image: string) => void;
    openConversationIdsList: string[]
    conversationIdsList: string[];
    currentConversationId: string;
    setCurrentConversation: (conversationId: string) => void;
    commands: ICommand[];
    sendCommand: (command: string) => void;
};

/**
 * Create a WebSocket context for managing WebSocket communications and application state.
 */
const WebSocketContext = createContext<WebSocketContextType>({
    messages: [],
    sendMessage: () => { },
    charts: [],
    currentChart: null,
    setChartFromHistory: () => { },
    setImageForChart: () => { },
    openConversationIdsList: [],
    conversationIdsList: [],
    currentConversationId: "",
    setCurrentConversation: () => { },
    commands: [],
    sendCommand: () => { }
});

/**
 * WebSocketProvider component to manage WebSocket connection and provide context.
 * @param {ReactNode} children - The children components wrapped by the provider.
 */
export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
    const socket = useRef<WebSocket | null>(null);
    const socketState = useRef<"waiting" | "connected">("waiting");
    const isAdmin = useRef<boolean>(false);

    // State hooks for various application data
    const [chatMessages, setChatMessages] = useState<IMessage[]>([]);
    const [charts, setCharts] = useState<ChatbotChart[]>([]);
    const [currentChart, setCurrentChart] = useState<ChatbotChart | null>(null);
    const [openConversationIdsList, setOpenConversationIdsList] = useState<string[]>([]);
    const [conversationIdsList, setConversationIdsList] = useState<string[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string>("");
    const lastChartDatasRef = useRef<{ data: null | ChatbotChartData[], args: null | ChatbotChartArgs }>({ data: null, args: null });
    const maxCharts = 5;
    const [commands, setCommands] = useState<ICommand[]>([]);

    // Function to send a WebSocket message to the server
    function sendWebSocketMessageToServer(message: CustomWebSocket.Client.ToServerMessage) {
        try {
            if (socket.current && socket.current.readyState === WebSocket.OPEN) {
                socket.current.send(JSON.stringify(message));
            } else {
                console.log(socket.current, socket.current?.readyState)
                throw new Error('WebSocket is not connected');
            }
        } catch (error) {
            console.error('Error sending message:', getErrorMessage(error));
        };
    };

    async function handleIncommingMessage(message: CustomWebSocket.Server.ToClientMessage) {
        //Handle potential errors
        if (message.error) {
            message.message.forEach((errorMsg) => {
                printMessage({ str: errorMsg.str, srv: true }, true);
            });
        }
        else {
            //Handle incomming message
            console.log("Handling message");
            console.log(message);
            if (message.message) {
                if (!Array.isArray(message.message) && message.message.str === "Hello from server" && socketState.current === "waiting" && "isAdmin" in message) {
                    socketState.current = "connected";
                    isAdmin.current = message.isAdmin === true;
                    printMessage(message.message);
                    return getInitialsData();
                };

                //Make single entries into array to be processed by forEach
                const messages = Array.isArray(message.message) ? message.message : [message.message];

                //Make printFunction functor
                //If admin print user message into server and opposite for user
                //set pintFunction either printServerMessage or printUserMessage
                messages.forEach((entrie) => {
                    printMessage(entrie);
                });
            }
            //Handle incomming data
            if (message.data) {
                const json = message.data;
                //Received compressed jsons
                if (typeof json.data === 'string' && typeof json.args === 'string') {
                    printMessage({ str: 'Received both data and args, Creating a new chart....', srv: true });
                    const dataJson = await retrieveFileContent(json.data);
                    const argsJson = await retrieveFileContent(json.args);
                    createNewLineChart(dataJson, argsJson);
                }
                else if (typeof json.data === 'string') {
                    printMessage({ str: 'Received only data, Creating a new chart....', srv: true });
                    const dataJson = await retrieveFileContent(json.data);
                    createNewLineChart(dataJson, undefined);
                }
                else if (typeof json.args === 'string') {
                    printMessage({ str: 'Received only args, Creating a new chart....', srv: true });
                    const argsJson = await retrieveFileContent(json.args);
                    createNewLineChart(undefined, argsJson);
                }
                //Received clean jsons
                else if (json.data !== null && json.args !== null) {
                    printMessage({ str: 'Received both data and args, Creating a new chart....', srv: true });
                    createNewLineChart(json.data, json.args);
                }
                else { console.error("Received empty data field"); }
            }
            //If the admin receive the list of users
            if (message.clients) {
                updateClientList(message.clients);
            }
            //answer of a bash request
            if (message.promptMsg) {
                printCommand({ content: message.promptMsg.str, type: message.promptMsg.error ? "error" : "server" });
            }
        }
    };

    async function getInitialsData() {
        if (!isAdmin.current) fetchData(["data", "args"]);
    };

    // Function to create the line chart
    async function createNewLineChart(data = null, args = null) {
        if (data && args) {
            lastChartDatasRef.current.data = data;
            lastChartDatasRef.current.args = args;
            console.log("Creating new chart from new data & args");
            console.log("data :");
            console.log(lastChartDatasRef.current.data);
            console.log("args :");
            console.log(lastChartDatasRef.current.args);
        }
        else if (data) {
            lastChartDatasRef.current.data = data;
            console.log("Creating new chart from new data");
            console.log("data :");
            console.log(lastChartDatasRef.current.data);
        }
        else if (args) {
            lastChartDatasRef.current.args = args;
            console.log("Creating new chart from new args");
            console.log("args :");
            console.log(lastChartDatasRef.current.args);
        }

        if (lastChartDatasRef.current.data && lastChartDatasRef.current.args) {
            const newChart: ChatbotChart = { data: lastChartDatasRef.current.data, args: lastChartDatasRef.current.args } as ChatbotChart;
            setCharts(prevCharts => {
                const updatedCharts = [newChart, ...prevCharts];
                while (updatedCharts.length > maxCharts) updatedCharts.pop();
                return updatedCharts;
            });
            setCurrentChart(newChart);
        } else {
            console.error('Data or args are not defined. Cannot create chart.');
        }
    }

    // Fetch one or multiple jsons
    function fetchData(json_name: string[] | string) {
        sendWebSocketMessageToServer({ action: 'fetchData', json_name });
    };

    // Directory of the server and json name
    function fetchUser(json_name: string) {
        sendWebSocketMessageToServer({ action: 'fetchUser', json_name });
    };

    // Function to send a message to the server
    function sendMessageServer(message: string) {
        sendWebSocketMessageToServer({ action: 'sendMessageToRasa', message });
    };

    // Function to send a message to the selected user via the server
    function sendMessageToUser(message: string) {
        sendWebSocketMessageToServer({ action: 'sendMessageToUser', message });
    };

    //Decompress the filecontent encapsulated by the server
    async function retrieveFileContent(fileContent: string) {
        const base64ToUint8Array = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const compressedData = base64ToUint8Array(fileContent);

        const decompressedStream = new DecompressionStream('gzip');
        const decompressedWriter = decompressedStream.writable.getWriter();
        decompressedWriter.write(compressedData);
        decompressedWriter.close();

        const stream = decompressedStream.readable.pipeThrough(new TextDecoderStream());

        let jsonString = '';
        const reader = stream.getReader();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            jsonString += value;
        }
        return JSON.parse(jsonString);
    }

    function sendAdminActionRequests(command: string) {
        sendWebSocketMessageToServer({ action: 'admin', command });
    };

    function printMessage({ str, srv }: { str: string, srv: boolean }, isErrorMessage: boolean = false) {
        console.log("Message:", { str, srv });
        if (isErrorMessage) setChatMessages((prevMessages) => [...prevMessages, { content: str, type: "error" }]);
        else setChatMessages((prevMessages) => [...prevMessages, { content: str, type: srv != isAdmin.current ? "server" : "client" }]);
    };

    function printCommand(command: { content: string, type: "client" | "server" | "error" }) {
        setCommands((prevCommands) => [...prevCommands, command]);
    };

    function updateClientList({ connectedList, userLoggedList }: { connectedList: string[], userLoggedList: string[] }) {
        setCurrentConversation("");
        setConversationIdsList(userLoggedList);
        setOpenConversationIdsList(connectedList);
    };

    const sendMessage = (message: string) => {
        if (isAdmin.current) {
            //Send the string into the selected client
            try {
                printMessage({ str: message, srv: true });
                sendMessageToUser(message);
            } catch (error) {
                console.error(error);
            }
        }
        else {
            //Send the string into the nodejs server
            try {
                printMessage({ str: message, srv: false });
                sendMessageServer(message);
            } catch (error) {
                console.error(error);
            }
        }
    };

    const setChartFromHistory = (chart: ChatbotChart) => {
        console.log(chart, currentChart);
        if (chart !== currentChart) setCurrentChart(chart);
    };

    const setImageForChart = (chart: ChatbotChart, image: string) => {
        setCharts(prevCharts => {
            const updatedCharts = prevCharts.map(c => {
                if (c === chart) {
                    c.image = image;
                }
                return c;
            });
            return updatedCharts;
        });
    };

    const setCurrentConversation = (conversationId: string) => {
        if (conversationId === "") return;
        try {
            console.log('Selected client:', conversationId);
            setCurrentConversationId(conversationId);
            setChatMessages([]);
            setCurrentChart(null);
            setCharts([]);
            lastChartDatasRef.current = { data: null, args: null };
            fetchUser(conversationId);
        } catch (error) {
            console.log(error);
        };
    };

    const sendCommand = (command: string) => {
        printCommand({ content: command, type: "client" });
        sendAdminActionRequests(command);
    };

    useEffect(() => {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? process.env.NEXT_PUBLIC_BASE_PATH.toLowerCase() : "";
        const ws = new WebSocket(`${basePath}/ws`);
        socket.current = ws;

        ws.onopen = () => {
            console.log("Connected to the WebSocket server!");
        };

        ws.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            handleIncommingMessage(data);
        };

        ws.onclose = () => console.log('Disconnected from the WebSocket server');

        ws.onerror = (error) => console.log('WebSocket error', error);

        return () => ws.close();
    }, []);

    return (
        <WebSocketContext.Provider value={{ messages: chatMessages, sendMessage, charts, currentChart, setChartFromHistory, setImageForChart, openConversationIdsList, conversationIdsList, currentConversationId, setCurrentConversation, commands, sendCommand }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export { WebSocketContext };