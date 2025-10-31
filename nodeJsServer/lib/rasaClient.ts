import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const RASA_URL = 'http://localhost:5005';
const ACTION_URL = 'http://localhost:5055';
const LOGS_DIR = path.join(process.cwd(), 'logs/logs.json');

/**
 * Parallel logging system for user interactions with Rasa.
 * All of the conversations ID of a user are stored in a dedicated folder.
 * @param conversationId - Unique identifier for the conversation.
 * @param userId - Unique identifier for the user.
 * @returns Path to the user's log file.
 */
function setupLogging(userId: string, conversationId: string) {

  // Create logs directory if it doesn't exist
  if ((!fs.existsSync(LOGS_DIR))) {
    fs.mkdirSync(path.dirname(LOGS_DIR), { recursive: true });
    fs.writeFileSync(LOGS_DIR, '{}');
  }
  //add userId if not present
  const fileContent = fs.readFileSync(LOGS_DIR, 'utf8');
  const logData = JSON.parse(fileContent);
  if (!logData[userId]) {
    logData[userId] = [];
    fs.writeFileSync(LOGS_DIR, JSON.stringify(logData, null, 2));
  }

  // Ensure existing entries are normalized to objects with metadata
  // New shape: { id: string, creationDate: string, lastModifiedDate: string }
  const nowIso = new Date().toISOString();
  logData[userId] = logData[userId].map((entry: any) => {
    if (typeof entry === 'string') {
      return { id: entry, creationDate: nowIso, lastModifiedDate: nowIso };
    }
    // If already an object but missing fields, fill them
    return {
      id: entry.id ?? entry.conversationId ?? entry,
      creationDate: entry.creationDate ?? entry.createdAt ?? nowIso,
      lastModifiedDate: entry.lastModifiedDate ?? entry.updatedAt ?? nowIso,
    };
  });

  // append conversationId object if not present
  const existing = logData[userId].find((e: any) => e.id === conversationId);
  if (!existing) {
    const convObj = { id: conversationId, creationDate: nowIso, lastModifiedDate: nowIso };
    logData[userId].push(convObj);
    fs.writeFileSync(LOGS_DIR, JSON.stringify(logData, null, 2));
  } else {
    // If already exists, ensure lastModifiedDate is up to date
    // We update lastModifiedDate here to the current time to reflect access; actual conversation edits will update later.
    existing.lastModifiedDate = nowIso;
    fs.writeFileSync(LOGS_DIR, JSON.stringify(logData, null, 2));
  }
}

/**
 * Logs user interaction in the log file
 * @param conversationId - Unique identifier for the conversation.
 * @param userId - Unique identifier for the user.
 */
function logInteraction(
  conversationId: string,
  userId: string
) {
  //change lastModifiedDate of the conversation in logs.json
  const fileContent = fs.readFileSync(LOGS_DIR, 'utf8');
  const logData = JSON.parse(fileContent);
  const userConversations = logData[userId] || [];
  const conversation = userConversations.find((c: any) => c.id === conversationId);
  if (conversation) {
    conversation.lastModifiedDate = new Date().toISOString();
  }
  fs.writeFileSync(LOGS_DIR, JSON.stringify(logData, null, 2));
}

/**
 * Logs a single entry to a user's log file.
 * @param fileHandle - Path to the log file.
 * @param message - Message content.
 * @param isServer - Indicates whether the message is from the server.
 */
function logSingleEntry(fileHandle: string, message: string, isServer: boolean) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp: timestamp,
    message: { str: message, srv: isServer }
  };

  // Read the existing content of the file and parse it
  let logArray;
  try {
    const fileContent = fs.readFileSync(fileHandle, 'utf8');
    logArray = JSON.parse(fileContent);
  } catch (error) {
    logArray = [];
  }

  // Append the new log entry
  logArray.push(logEntry);

  // Write the updated log array back to the file
  fs.writeFileSync(fileHandle, JSON.stringify(logArray, null, 2));
}

/**
 * Fetches the list of logged-in users by inspecting the logs directory.
 * @returns Array of user IDs.
 */
function getUserLoggedList() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    return [];
  }

  const files = fs.readdirSync(logsDir);
  return files.map(file => path.basename(file, '.json'));
}

/**
 * Parses log entries to construct a message frame for the user.
 * @param logs - Array of user interaction logs.
 * @returns A parsed frame containing messages and additional data.
 */
function parseLogsToSend(
  logs: Rasa.UserInteractionLog[]
) {
  const messageLogs = logs.filter((log) => log.message !== undefined).map(log => log.message) as { str: string, srv: boolean }[];

  const dataMap = logs.reduce((acc, log) => {
    if (log.data) {
      if (log.data.data !== undefined) {
        acc.data = log.data.data;
      }
      if (log.data.args !== undefined) {
        acc.args = log.data.args;
      }
    }
    return acc;
  }, { data: undefined as string | undefined, args: undefined as string | undefined });

  return {
    message: messageLogs,
    data: dataMap
  };
}

/**
 * Sends a message to the Rasa server and formats the response.
 * @param message - Message to send.
 * @param conversationId - Sender's unique identifier.
 * @returns Promise resolving to a formatted Rasa response.
 */
async function sendMessageToRasa(message: string, conversationId: string) {
  return fetch(RASA_URL + '/webhooks/rest/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sender: conversationId, message }),
  })
    .then(response => response.json())
    .then(data => {
      //For each element, pushing string message and args/data json
      const formattedResponse: Rasa.Response = { message: [], data: {} };
      data.forEach((item: any) => {
        if (item.text) {
          formattedResponse.message.push({ str: item.text, srv: true });
          //{str : , srv:true}
        } else {
          formattedResponse.data = item.custom;
        }
      });

      return formattedResponse;
    })
    .catch(error => {
      throw new Error(`Failed to send message to Rasa: ${error.message}`);
    });
}

/**
 * Load a conversation for a given conversation ID.
 * @param conversationId - The ID of the conversation to load.
 * @returns Array of user interaction logs.
 */
async function loadConversation(conversationId: string): Promise<Rasa.UserInteractionLog[]> {
  const response = await fetch(`${RASA_URL}/conversations/${conversationId}/tracker`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load conversation: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const logs: Rasa.UserInteractionLog[] = [];

  (data.events || []).forEach((event: any) => {
    const rawTs = event.timestamp;
    const timestamp =
      typeof rawTs === "number"
        ? new Date(rawTs * 1000).toISOString()
        : new Date().toISOString();

    if (event.event === "user" && typeof event.text === "string") {
      logs.push({
        timestamp,
        message: { str: event.text, srv: false },
      });
    } else if (event.event === "bot") {
      // bot text message
      if (typeof event.text === "string") {
        logs.push({
          timestamp,
          message: { str: event.text, srv: true },
        });
      }
      // bot custom payload / data
      if (event.data) {
        logs.push({
          timestamp,
          data: {
            data: event.data?.data?.file_content ?? event.data?.data,
            args: event.data?.args?.file_content ?? event.data?.args,
          },
        });
      }
    }
  });

  return logs;
}




/**
 * Parses a command string into an action and slots.
 * @param command - Command string in a predefined format.
 * @returns An object containing the action and slots.
 */
function parseCommand(command: string) {
  const parts = command.trim().split(/\s+/);
  if (parts.length < 1) {
    throw new Error('Invalid command format');
  }

  const action = parts[0];
  const slots: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const slotName = parts[i].replace('--', '');
    const slotValue = parts[i + 1];
    if (!slotName || !slotValue) {
      throw new Error('Invalid slot format');
    }
    slots[slotName] = slotValue;
  }

  return { action, slots };
}

/**
 * Triggers a custom action on the Rasa action server.
 * @param nextAction - The name of the action to trigger.
 * @param slot - Slots required for the action.
 * @returns Promise resolving to the server response.
 */
async function triggerAction(nextAction: string, slot: Record<string, string>) {
  const payload = {
    next_action: nextAction,
    tracker: {
      sender_id: "test_user",
      slots: slot,
      latest_message: {
        text: "blblblblb",
        intent: {
          name: "admin",
          confidence: 0.99
        },
        entities: []
      },
      paused: false,
      events: [],
      active_loop: null,
      latest_action_name: null
    },
    domain: {
      intents: ["admin"],
      entities: [],
      slots: {},
      responses: {},
      actions: [nextAction]
    }
  };

  return fetch(ACTION_URL + '/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(`Action ${nextAction} triggered successfully.`);
      return data;
    })
    .catch(error => {
      console.error(`Failed to trigger action ${nextAction}:`, error);
      throw new Error(`Failed to trigger action: ${error.message}`);
    });
}

/**
 * Return a list of conversation IDs for a given user. 
 * @param userId - The ID of the user.
 * @returns Promise resolving to the server response.
 */
async function getUserLog(userId: string) {
  // Look for conversation files inside logs/<userId>
  if (!fs.existsSync(LOGS_DIR)) {
    return [];
  }

  // Read logs.json and get conversation IDs for the user
  const fileContent = fs.readFileSync(path.join(LOGS_DIR), 'utf8');
  const logData = JSON.parse(fileContent);
  return logData[userId] || [];
}

export { sendMessageToRasa, parseCommand, triggerAction, setupLogging, logInteraction, logSingleEntry, getUserLoggedList, getUserLog, parseLogsToSend, loadConversation };