// Firebase initialization (modular SDK)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDxSmZwkU0Xy0MvxjaqJgVpBpZdnqJkYo4",
  authDomain: "test-crud-44b9e.firebaseapp.com",
  projectId: "test-crud-44b9e",
  storageBucket: "test-crud-44b9e.firebasestorage.app",
  messagingSenderId: "154875113292",
  appId: "1:154875113292:web:1bae678829bd9a38c269e9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
