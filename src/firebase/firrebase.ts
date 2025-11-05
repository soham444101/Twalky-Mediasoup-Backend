import admin from "firebase-admin";
import path from "path";

const serviceAccountPath = require(path.resolve(__dirname, "./serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

export default admin;
