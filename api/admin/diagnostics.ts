import { firebaseConfig, getAdminApp } from "../../lib/firebaseAdmin.js";
import { checkAdmin } from "../../lib/utils.js";
import type { CustomRequest } from "../../lib/firebaseAdmin.js";

export default async function handler(req: CustomRequest, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    await checkAdmin(req);
    
    const { app: adminApp, isFullAdmin } = getAdminApp();
    
    const results: any = {
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      configLoaded: !firebaseConfig.error,
      adminSdk: { 
        status: adminApp ? "ok" : "error",
        isFullAdmin: isFullAdmin
      },
      env: {
        VERCEL: process.env.VERCEL || "0",
        HAS_ADMIN_KEYS: !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
        HAS_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT
      }
    };

    return res.status(200).json(results);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.error || "Diagnostics failed", message: err.details || err.message });
  }
}
