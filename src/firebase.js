// src/firebase.js
// SUBSTITUA os valores abaixo pelos do seu projeto Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAzJKLLW8UWCYzTKzqP3tyw9N9zj4FdrAw",
  authDomain: "baby-tracker-eabec.firebaseapp.com",
  projectId: "baby-tracker-eabec",
  storageBucket: "baby-tracker-eabec.firebasestorage.app",
  messagingSenderId: "439787773713",
  appId: "1:439787773713:web:fd4ef8d9a0a652aae6f6b0",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
