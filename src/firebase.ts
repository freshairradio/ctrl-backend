import * as admin from 'firebase-admin';
import fs from 'fs';
const serviceAccount = JSON.parse(
  fs.readFileSync('./.secrets/google.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
