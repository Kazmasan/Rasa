"use client";

import { useContext, useEffect, useState, useRef } from "react";
import { RobotIcon } from "@/components/icons/robot";
import { WaveAsset } from "@/components/assets/wave";
import { SendIcon } from "@/components/icons/send";
import { ChatMessage } from "@/components/chat-message";
import { WebSocketContext } from "@/components/contexts/WebSocketContext";
import { UserSelect as Select } from "@/components/inputs/user-select";
import { cn } from "@/lib/utils";
import { extractAutocompleteTarget } from "@/lib/autocomplete-utils";
import Fuse from "fuse.js";

/**
 * Chatbot component for interacting with the RESQ backend.
 * This component integrates:
 * - WebSocket-based message exchange
 * - Autocompletion for clinical data column names
 * - Context-based message display and conversation handling
 */
export function Chatbot({ userIsAdmin }: { userIsAdmin?: boolean } = { userIsAdmin: false }) {
    // WebSocket context to handle live chat and conversation state
    const {
        messages,
        sendMessage,
        openConversationId,
        conversationIdsList,
        currentConversationId,
        setCurrentConversation,
        setUpNewConversation,
        userFolders,
        setUserFolders,
        currentFolder,
        setCurrentFolder,
        setUpNewFolder,
        moveConversationToFolder,
        deleteConversation,
        deleteFolder
    } = useContext(WebSocketContext);

    // --- Local state management ---
    const [isInputDisabled, setIsInputDisabled] = useState(false);
    const [input, setInput] = useState<string>("");
    const [columns, setColumns] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // --- References ---
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const fuseRef = useRef<Fuse<string> | null>(null);

    /**
     * Fetch all unique COLUMN values from the CSV via the Next.js API route.
     * These values are used for autocompletion.
     */
    useEffect(() => {
        fetch("/api/columns")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setColumns(data);
                    // Fuse.js enables fuzzy search across user input
                    fuseRef.current = new Fuse(data, {
                        threshold: 0.4,
                        ignoreLocation: true,
                        findAllMatches: true,
                    });
                }
            })
            .catch((err) => console.error("Failed to fetch columns:", err));
    }, []);

    /**
     * Automatically scroll to the bottom of the message container
     * whenever new messages are added.
     */
    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages]);

    /**
     * If the user is an admin, disable input when viewing a conversation
     * that is not currently open.
     */
    if (userIsAdmin)
        useEffect(() => {
            setIsInputDisabled(openConversationId !== currentConversationId);
            setInput("");
        }, [openConversationId, currentConversationId]);

    /**
     * Handle message sending when user clicks the send button or presses Enter.
     */
    const handleSend = () => {
        if (input.trim() !== "" && !isInputDisabled) {
            sendMessage(input);
            setInput("");
            setSuggestions([]);
        }
    };

    // --- State for keyboard navigation ---
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);

    /**
     * Handles user typing in the input field.
     * - Autocompletion resets at every space.
     * - Only triggers when the last word has at least 3 characters.
     * - Uses Fuse.js for fuzzy matching.
     */
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setInput(value);
        setSelectedSuggestionIndex(-1); // Reset selection on new typing

        if (!fuseRef.current) return;

        const words = value.trimEnd().split(/\s+/);
        const lastWord = words[words.length - 1] || "";

        // Reset suggestions when user types a space or has <3 chars
        if (value.endsWith(" ") || lastWord.length < 3) {
            setSuggestions([]);
            return;
        }

        // Perform fuzzy match
        const results = fuseRef.current
            .search(lastWord)
            .map((r) => r.item)
            .slice(0, 5);

        // Fallback to substring match if Fuse returns nothing
        const matches =
            results.length > 0
                ? results
                : columns
                    .filter((c) => c.toLowerCase().includes(lastWord.toLowerCase()))
                    .slice(0, 5);

        setSuggestions(matches);
    };

    /**
     * Handles key events for:
     * - Navigating autocomplete suggestions (↑ ↓)
     * - Accepting a suggestion with Enter or Tab
     * - Sending messages normally when no suggestion is selected
     */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (suggestions.length > 0) {
            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    setSelectedSuggestionIndex((prev) =>
                        prev < suggestions.length - 1 ? prev + 1 : 0
                    );
                    return;

                case "ArrowUp":
                    event.preventDefault();
                    setSelectedSuggestionIndex((prev) =>
                        prev > 0 ? prev - 1 : suggestions.length - 1
                    );
                    return;

                case "Tab":
                case "Enter":
                    if (selectedSuggestionIndex >= 0) {
                        event.preventDefault();
                        handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
                        return;
                    }
                    break;

                default:
                    break;
            }
        }

        // If no suggestion is active, Enter sends the message
        if (event.key === "Enter" && !isInputDisabled) {
            sendMessage(input);
            setInput("");
            setSuggestions([]);
        }
    };

    /**
     * Replaces the last word in the input with the chosen suggestion.
     */
    const handleSuggestionSelect = (suggestion: string) => {
        setInput((prev) => {
            const words = prev.trim().split(/\s+/);
            words[words.length - 1] = suggestion;
            return words.join(" ") + " ";
        });
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
    };
    console.log(conversationIdsList);
    // --- Folder state ---
    const [folders, setFolders] = useState<string[]>([]);
    const [folderAssignments, setFolderAssignments] = useState<Record<string, string | null>>({});
    const [activeFolder, setActiveFolder] = useState<string | null>(null);

    // Called when selecting a conversation
    const handleConversationChange = (convId: string) => {
        setCurrentConversation(convId);
    };

    // When the user clicks a folder in the dropdown
    const handleFolderChange = (folder: string | null) => {
        setCurrentFolder(folder);
    };

    // Create a new folder
    const handleCreateFolder = (folderName: string) => {
        setUpNewFolder(folderName);
        setActiveFolder(folderName);
    };

    // Handle moving a conversation to a folder (drag & drop)
    const handleMoveConversation = (conversationId: string, folderName: string | null) => {
        moveConversationToFolder(folderName, conversationId);
    };

        /**
     * Deletes a folder (front-end placeholder).
     */
    const handleDeleteFolder = (folderName: string) => {
        deleteFolder(folderName);
        
    };

    /**
     * Deletes a conversation (front-end placeholder).
     */
    const handleDeleteConversation = (conversationId: string) => {
        deleteConversation(conversationId);
    };


    return (
        <div className="w-full h-full rounded-[15px] flex flex-col items-center bg-white shadow-[0px_3.5px_5.5px_0px_rgba(0,_0,_0,_0.02)]">
            {/* ---------- HEADER ---------- */}
            <div className="w-full h-[50px] rounded-t-[15px] z-10 flex items-center justify-between px-[20px] bg-gradient-to-tl from-secondary to-primary">
                <div className="flex w-full gap-[8px] items-center">
                    <p className="text-background font">Chat with the bot</p>
                    <RobotIcon width={24} height={24} />
                </div>
            </div>

            <WaveAsset className="w-full" />

            {/* ---------- MESSAGE CONTAINER ---------- */}
            <div className="w-full flex-grow relative overflow-hidden">
                <div
                    ref={messagesContainerRef}
                    className="absolute top-0 left-0 w-full h-full flex flex-col gap-[10px] px-[20px] pb-[20px] overflow-y-auto scroll-smooth"
                >
                    {messages.map((message, index) => (
                        <ChatMessage key={index} type={message.type}>
                            {message.content}
                        </ChatMessage>
                    ))}
                </div>
            </div>

            {/* ---------- INPUT + AUTOCOMPLETE ---------- */}
            <div className="w-full flex items-end justify-center px-[20px] py-[10px] relative">
                <textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your message..."
                    className={cn(
                        "appearance-none outline-none ring-0 bg-transparent placeholder:text-gray-dark w-full min-h-[50px] max-h-[200px] resize-none overflow-y-auto border-t border-gray-light text-text leading-[1.4] px-2 py-2",
                        userIsAdmin && isInputDisabled && "cursor-not-allowed"
                    )}
                    disabled={userIsAdmin && isInputDisabled}
                    rows={1}
                    ref={(el) => {
                        if (el) {
                            // Dynamic height adjustment
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                        }
                    }}
                    onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "auto";
                        target.style.height = `${Math.min(target.scrollHeight, 200)}px`; // max 200px height
                    }}
                />

                {/* Dynamic fuzzy suggestions */}
                {suggestions.length > 0 && (
                    <div className="absolute bottom-[70px] left-[20px] right-[20px] bg-white border border-gray-200 rounded-md shadow-md z-50 max-h-[200px] overflow-y-auto">
                        {suggestions.map((s, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "p-2 text-sm cursor-pointer",
                                    i === selectedSuggestionIndex ? "bg-gray-200" : "hover:bg-gray-100"
                                )}
                                onMouseDown={() => handleSuggestionSelect(s)}
                            >
                                {s}
                            </div>
                        ))}
                    </div>
                )}

                {/* Send button */}
                <div
                    onClick={handleSend}
                    className={cn(
                        "absolute right-[-20px] bottom-[10px] w-[40px] h-[40px] rounded-full flex items-center justify-center bg-gradient-to-tl from-secondary to-primary shadow-[0px_0px_10px_0px_rgba(0,_0,_0,_0.25)] cursor-pointer",
                        userIsAdmin && isInputDisabled && "cursor-not-allowed"
                    )}
                >
                    <SendIcon width={20} height={20} className="fill-background" />
                </div>
            </div>

            {/* ---------- CONVERSATION CONTROLS ---------- */}
            <div className="w-full flex gap-2 px-[20px] pb-[10px]">
                <Select
                    value={currentConversationId}
                    placeholder="Select a conversation:"
                    options={conversationIdsList.map((entry: any) => {
                        const id = typeof entry === "string" ? entry : entry.id ?? entry.conversationId ?? String(entry);
                        const creationDate = typeof entry === "string" ? undefined : entry.creationDate;
                        const lastModifiedDate = typeof entry === "string" ? undefined : entry.lastModifiedDate;
                        const folderFromEntry = typeof entry === "string" ? null : (entry.folder ?? null);
                        const folder = folderFromEntry ?? (folderAssignments[id] ?? null);

                        return { label: id, value: id, creationDate, lastModifiedDate, folder };
                    })}
                    onChange={handleConversationChange}
                    folders={userFolders}
                    currentFolder={currentFolder}
                    onFolderChange={handleFolderChange}
                    onCreateFolder={handleCreateFolder}
                    onChangeHandleValueChange={true}
                    onMoveConversation={handleMoveConversation}
                    onDeleteFolder={handleDeleteFolder}
                    onDeleteConversation={handleDeleteConversation}
                />

                <button
                    onClick={setUpNewConversation}
                    className="px-4 py-2 bg-gradient-to-tl from-secondary to-primary text-background rounded-md hover:opacity-90 transition-opacity"
                >
                    New Chat
                </button>
            </div>
        </div>
    );
}
