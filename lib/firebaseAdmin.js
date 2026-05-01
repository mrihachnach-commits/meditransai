import admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

/**
 * @typedef {import('express').Request & { user?: any, idToken?: string }} CustomRequest
 */

// Load firebase config
let firebaseConfig = {};
try {
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, "utf8");
    firebaseConfig = JSON.parse(rawConfig);
    console.log("[Config] Loaded from file system at", configPath);
  } else {
    console.warn("[Config] firebase-applet-config.json not found at cwd, trying import fallback");
    firebaseConfig = { error: "Configuration missing" };
  }
} catch (err) {
  console.error("[Config] Critical error during load:", err.message);
  firebaseConfig = { error: err.message };
}

// Allow override from environment variable if provided
if (process.env.FIREBASE_CONFIG_JSON) {
  try {
    const envConfig = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
    firebaseConfig = { ...firebaseConfig, ...envConfig };
    console.log("Applied FIREBASE_CONFIG_JSON from environment");
  } catch (err) {
    console.error("Failed to parse FIREBASE_CONFIG_JSON:", err);
  }
}

// Support individual env var overrides for sensitive settings
if (process.env.FIREBASE_API_KEY) firebaseConfig.apiKey = process.env.FIREBASE_API_KEY;
if (process.env.FIREBASE_AUTH_DOMAIN) firebaseConfig.authDomain = process.env.FIREBASE_AUTH_DOMAIN;
if (process.env.FIREBASE_PROJECT_ID) firebaseConfig.projectId = process.env.FIREBASE_PROJECT_ID;
if (process.env.FIREBASE_FIRESTORE_DATABASE_ID) firebaseConfig.firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;

// Set environment variables for firebase-admin
if (firebaseConfig.projectId) {
  process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
}

export { firebaseConfig };

let adminApp = null;
let isFullAdmin = false;

export function getAdminApp() {
  if (adminApp) return { app: adminApp, isFullAdmin };
  
  // Primary: Standard Node.js environment variables (Vercel/Production)
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  console.log(`[Firebase Admin] Attempting init. Project: ${projectId}, Has Email: ${!!clientEmail}, Has Key: ${!!privateKey}`);

  // Backup: Check if service account is provided as a full JSON string
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log("[Firebase Admin] Found FIREBASE_SERVICE_ACCOUNT JSON");
    } catch (e) {
      console.error("[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string");
    }
  }

  if (projectId) {
    try {
      if (admin.apps.length === 0) {
        // Option 1: Full Service Account via individual vars
        if (clientEmail && privateKey) {
          // Robust private key formatting for Vercel/Docker environment variables
          let formattedKey = privateKey;
          if (formattedKey.startsWith("\"") && formattedKey.endsWith("\"")) {
            formattedKey = formattedKey.substring(1, formattedKey.length - 1);
          }
          // Handle literal \n strings (common in Vercel UI paste)
          formattedKey = formattedKey.replace(/\\n/g, "\n");

          adminApp = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: formattedKey,
            }),
            projectId
          });
          isFullAdmin = true;
          console.log(`[Firebase Admin] Success: Initialized WITH Service Account for: ${projectId}`);
        } 
        // Option 2: Full Service Account via JSON blob
        else if (serviceAccount) {
          adminApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId
          });
          isFullAdmin = true;
          console.log(`[Firebase Admin] Success: Initialized WITH Service Account (JSON)`);
        }
        // Option 3: Base Project ID (Limited functionality)
        else {
          adminApp = admin.initializeApp({ 
            projectId: projectId 
          });
          isFullAdmin = false;
          console.warn(`[Firebase Admin] Warning: Initialized with Project ID ONLY. Admin Auth tasks will fail on Vercel.`);
        }
      } else {
        adminApp = admin.apps[0];
      }
      return { app: adminApp, isFullAdmin };
    } catch (e) {
      console.error("[Firebase Admin] Fatal init error:", e.message);
      return { app: null, isFullAdmin: false };
    }
  }
  
  console.error("[Firebase Admin] Fatal: No Project ID found in env or config.");
  return { app: null, isFullAdmin: false };
}

export { getAdminFirestore };

// Initialize Firestore Helper using REST API
export const firestoreRest = {
  getDoc: async (collection, docId, idToken) => {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}/${docId}`;
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const res = await fetch(url, { headers });
    if (res.status === 404) return { exists: false };
    
    const resText = await res.text();
    if (!res.ok) {
      let errorMessage = "Firestore REST error";
      try {
        const error = JSON.parse(resText);
        errorMessage = error.error?.message || errorMessage;
      } catch (pe) {
        errorMessage = resText.substring(0, 200);
      }
      throw new Error(errorMessage);
    }
    
    try {
      const data = JSON.parse(resText);
      return { exists: true, data: parseFirestoreFields(data.fields) };
    } catch (e) {
      throw new Error("Invalid response from Firestore: " + resText.substring(0, 100));
    }
  },
  
  setDoc: async (collection, docId, data, idToken) => {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}/${docId}`;
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const body = { fields: encodeFirestoreFields(data) };
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
    
    const resText = await res.text();
    if (!res.ok) {
      let errorMessage = "Firestore REST error";
      try {
        const error = JSON.parse(resText);
        errorMessage = error.error?.message || errorMessage;
      } catch (pe) {
        errorMessage = resText.substring(0, 200);
      }
      throw new Error(errorMessage);
    }
    return JSON.parse(resText);
  },

  deleteDoc: async (collection, docId, idToken) => {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}/${docId}`;
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const res = await fetch(url, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) {
      const resText = await res.text();
      let errorMessage = "Firestore REST error";
      try {
        const error = JSON.parse(resText);
        errorMessage = error.error?.message || errorMessage;
      } catch (pe) {
        errorMessage = resText.substring(0, 200);
      }
      throw new Error(errorMessage);
    }
    return true;
  },

  listDocs: async (collection, idToken) => {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}`;
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const res = await fetch(url, { headers });
    const resText = await res.text();
    
    if (!res.ok) {
      let errorMessage = `Firestore REST error (Status ${res.status})`;
      try {
        const error = JSON.parse(resText);
        errorMessage = error.error?.message || errorMessage;
      } catch (pe) {
        errorMessage = resText.substring(0, 200);
      }
      throw new Error(errorMessage);
    }
    
    try {
      const data = JSON.parse(resText);
      return (data.documents || []).map((doc) => ({
        id: doc.name.split('/').pop(),
        ...parseFirestoreFields(doc.fields)
      }));
    } catch (e) {
      throw new Error("Invalid response from Firestore list: " + resText.substring(0, 100));
    }
  }
};

// Helper to parse Firestore REST fields
export function parseFirestoreFields(fields) {
  if (!fields) return {};
  const result = {};
  try {
    for (const key in fields) {
      const valueObj = fields[key];
      if (!valueObj) continue;
      
      if ('stringValue' in valueObj) result[key] = valueObj.stringValue;
      else if ('integerValue' in valueObj) result[key] = parseInt(valueObj.integerValue);
      else if ('doubleValue' in valueObj) result[key] = valueObj.doubleValue;
      else if ('booleanValue' in valueObj) result[key] = valueObj.booleanValue;
      else if ('timestampValue' in valueObj) result[key] = valueObj.timestampValue;
      else if ('mapValue' in valueObj && valueObj.mapValue.fields) result[key] = parseFirestoreFields(valueObj.mapValue.fields);
      else if ('arrayValue' in valueObj) {
        result[key] = (valueObj.arrayValue.values || []).map((v) => {
          const temp = parseFirestoreFields({ temp: v });
          return temp.temp;
        });
      }
    }
  } catch (e) {
    console.warn("Error parsing Firestore fields:", e);
  }
  return result;
}

// Helper to encode Firestore REST fields
export function encodeFirestoreFields(data) {
  const fields = {};
  for (const key in data) {
    const val = data[key];
    if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'number') {
      if (Number.isInteger(val)) fields[key] = { integerValue: val.toString() };
      else fields[key] = { doubleValue: val };
    }
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (val instanceof Date) fields[key] = { timestampValue: val.toISOString() };
    else if (Array.isArray(val)) {
      fields[key] = { arrayValue: { values: val.map(v => encodeFirestoreFields({ temp: v }).temp) } };
    }
    else if (typeof val === 'object' && val !== null) {
      fields[key] = { mapValue: { fields: encodeFirestoreFields(val) } };
    }
  }
  return fields;
}
