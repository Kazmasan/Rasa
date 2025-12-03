import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const RASA_URL = 'http://localhost:5005';
const ACTION_URL = 'http://localhost:5055';

const LOGS_FILE = path.join(process.cwd(), 'logs/logs.json');
const FOLDERS_FILE = path.join(process.cwd(), 'logs/folders.json');

/** ----------------------------------------------------------
 * Ensure logs and folders files exist (shared global files)
 * --------------------------------------------------------- */
function ensureFiles() {
  const logsDir = path.dirname(LOGS_FILE);

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Always ensure logs.json exists and contains a valid object
  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, "{}");
  } else {
    // Repair logs.json if corrupted
    try {
      const data = JSON.parse(fs.readFileSync(LOGS_FILE, "utf8"));
      if (typeof data !== "object" || data === null) {
        fs.writeFileSync(LOGS_FILE, "{}");
      }
    } catch {
      fs.writeFileSync(LOGS_FILE, "{}");
    }
  }

  // Same for folders.json
  if (!fs.existsSync(FOLDERS_FILE)) {
    fs.writeFileSync(FOLDERS_FILE, "{}");
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(FOLDERS_FILE, "utf8"));
      if (typeof data !== "object" || data === null) {
        fs.writeFileSync(FOLDERS_FILE, "{}");
      }
    } catch {
      fs.writeFileSync(FOLDERS_FILE, "{}");
    }
  }
}

/** ----------------------------------------------------------
 * Load / Save utilities
 * --------------------------------------------------------- */
function loadLogs() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
}

function saveLogs(data: any) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2));
}

function loadFolders() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf8'));
}

function saveFolders(data: any) {
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(data, null, 2));
}

/** ----------------------------------------------------------
 * Conversation logging
 * --------------------------------------------------------- */
function setupLogging(userId: string, conversationId: string, folder: string | null = null) {
  ensureFiles();
  const logs = loadLogs();

  if (!logs[userId]) logs[userId] = [];

  const now = new Date().toISOString();

  logs[userId] = logs[userId].map((entry: any) => ({
    id: entry.id ?? entry,
    creationDate: entry.creationDate ?? now,
    lastModifiedDate: entry.lastModifiedDate ?? now,
    folder: entry.folder ?? null,
  }));

  const existing = logs[userId].find((e: any) => e.id === conversationId);

  if (!existing) {
    logs[userId].push({
      id: conversationId,
      creationDate: now,
      lastModifiedDate: now,
      folder: folder,
    });
  } else {
    existing.lastModifiedDate = now;
  }

  saveLogs(logs);
}

function logInteraction(conversationId: string, userId: string) {
  const logs = loadLogs();

  const c = logs[userId]?.find((x: any) => x.id === conversationId);
  if (c) {
    c.lastModifiedDate = new Date().toISOString();
    saveLogs(logs);
  }
}

function deleteConversation(userId: string, conversationId: string) {
  const logs = loadLogs();
  if (!logs[userId]) return;

  logs[userId] = logs[userId].filter((c: any) => c.id !== conversationId);
  saveLogs(logs);
  return deleteRasaConversation(conversationId);
}

/** ----------------------------------------------------------
 * Folder management
 * --------------------------------------------------------- */

function createFolder(userId: string, folderName: string) {
  const folders = loadFolders();
  if (!folders[userId]) folders[userId] = [];

  if (!folders[userId].includes(folderName)) {
    folders[userId].push(folderName);
  }

  saveFolders(folders);
}

function renameFolder(userId: string, oldName: string, newName: string) {
  const folders = loadFolders();
  if (!folders[userId]) return;

  const index = folders[userId].indexOf(oldName);
  if (index === -1) return;

  folders[userId][index] = newName;
  saveFolders(folders);

  const logs = loadLogs();
  if (logs[userId]) {
    logs[userId].forEach((c: any) => {
      if (c.folder === oldName) c.folder = newName;
    });
    saveLogs(logs);
  }
}

function deleteFolder(userId: string, folderName: string) {
  const folders = loadFolders();
  if (!folders[userId]) return;

  folders[userId] = folders[userId].filter((f: string) => f !== folderName);
  saveFolders(folders);

  const logs = loadLogs();
  if (logs[userId]) {
    logs[userId].forEach((c: any) => {
      if (c.folder === folderName) c.folder = null;
    });
    saveLogs(logs);
  }
}

function addConversationToFolder(userId: string, conversationId: string, folderName: string) {
  const logs = loadLogs();
  const folders = loadFolders();

  if (!folders[userId]?.includes(folderName) && folderName !== null) {
    createFolder(userId, folderName);
  }

  const c = logs[userId]?.find((x: any) => x.id === conversationId);
  if (c) {
    c.folder = folderName;
    saveLogs(logs);
  }
}

function unassignConversation(userId: string, conversationId: string) {
  const logs = loadLogs();
  const c = logs[userId]?.find((x: any) => x.id === conversationId);
  if (c) {
    c.folder = null;
    saveLogs(logs);
  }
}

function getUserFolders(userId: string) {
  const folders = loadFolders();
  return folders[userId] || [];
}

function getUserConversations(userId: string, folder: string | null = null) {
  const logs = loadLogs();
  const convs = logs[userId] || [];

  if (folder === null) return convs;
  if (folder === "none") return convs.filter((c: any) => !c.folder);

  return convs.filter((c: any) => c.folder === folder);
}

/** ----------------------------------------------------------
 * Remaining RASA logic…
 * --------------------------------------------------------- */

function logSingleEntry(fileHandle: string, message: string, isServer: boolean) {
  const ts = new Date().toISOString();
  let arr = [];

  try {
    arr = JSON.parse(fs.readFileSync(fileHandle, 'utf8'));
  } catch (_) {}

  arr.push({ timestamp: ts, message: { str: message, srv: isServer } });
  fs.writeFileSync(fileHandle, JSON.stringify(arr, null, 2));
}

function getUserLoggedList() {
  const dir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => path.basename(f, '.json'));
}

async function deleteRasaConversation(conversationId: string) {
  try {
    console.log(`Resetting RASA conversation: ${conversationId}`);

    const response = await fetch(
      `${RASA_URL}/conversations/${conversationId}/tracker/events?include_events=NONE`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            event: "restart"
          }
        ]),
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to reset RASA conversation ${conversationId}. Status: ${response.status}`
      );
      return null;
    }

    console.log(`RASA conversation ${conversationId} successfully reset.`);
    return await response.json();

  } catch (error) {
    console.error("Error while resetting RASA conversation:", error);
    return null;
  }
}

function parseLogsToSend(logs: Rasa.UserInteractionLog[]) {
  const msg = logs
    .filter(l => l.message)
    .map(l => l.message) as { str: string; srv: boolean }[];

  const dataMap = logs.reduce(
    (acc, log) => {
      if (log.data) {
        if (log.data.data !== undefined) acc.data = log.data.data;
        if (log.data.args !== undefined) acc.args = log.data.args;
      }
      return acc;
    },
    { data: undefined as any, args: undefined as any }
  );

  return { message: msg, data: dataMap };
}

async function sendMessageToRasa(message: string, conversationId: string) {
  return fetch(RASA_URL + '/webhooks/rest/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: conversationId, message }),
  })
    .then(r => r.json())
    .then(data => {
      const response: Rasa.Response = { message: [], data: {} };
      data.forEach((item: any) => {
        if (item.text)
          response.message.push({ str: item.text, srv: true });
        else response.data = item.custom;
      });
      return response;
    });
}

async function loadConversation(conversationId: string): Promise<Rasa.UserInteractionLog[]> {
  const response = await fetch(`${RASA_URL}/conversations/${conversationId}/tracker`);

  if (!response.ok) {
    throw new Error(`Failed to load conversation: ${response.status}`);
  }

  const data = await response.json();
  const logs: Rasa.UserInteractionLog[] = [];

  (data.events || []).forEach((event: any) => {
    const ts =
      typeof event.timestamp === 'number'
        ? new Date(event.timestamp * 1000).toISOString()
        : new Date().toISOString();

    if (event.event === 'user' && event.text) {
      logs.push({ timestamp: ts, message: { str: event.text, srv: false } });
    } else if (event.event === 'bot') {
      if (event.text)
        logs.push({ timestamp: ts, message: { str: event.text, srv: true } });
      if (event.data)
        logs.push({
          timestamp: ts,
          data: {
            data: event.data?.data?.file_content ?? event.data?.data,
            args: event.data?.args?.file_content ?? event.data?.args,
          },
        });
    }
  });

  return logs;
}

function parseCommand(command: string) {
  const parts = command.trim().split(/\s+/);
  const action = parts[0];
  const slots: Record<string, string> = {};

  for (let i = 1; i < parts.length; i += 2) {
    slots[parts[i].replace('--', '')] = parts[i + 1];
  }

  return { action, slots };
}

async function triggerAction(nextAction: string, slot: Record<string, string>) {
  const payload = {
    next_action: nextAction,
    tracker: {
      sender_id: "test_user",
      slots: slot,
      latest_message: {
        text: "blblblblb",
        intent: { name: "admin", confidence: 0.99 },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());
}

async function getUserLog(userId: string) {
  ensureFiles();
  const logs = loadLogs();
  return logs[userId] || [];
}

export {
  sendMessageToRasa,
  parseCommand,
  triggerAction,
  setupLogging,
  logInteraction,
  logSingleEntry,
  getUserLoggedList,
  getUserLog,
  parseLogsToSend,
  loadConversation,
  createFolder,
  renameFolder,
  deleteFolder,
  addConversationToFolder,
  unassignConversation,
  getUserFolders,
  getUserConversations,
  deleteConversation
};
