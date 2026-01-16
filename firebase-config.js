// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAvvzP1c1gdRjUWAv2yaTQZXT2yh8EGyUE",
  authDomain: "shop-trends.firebaseapp.com",
  projectId: "shop-trends",
  storageBucket: "shop-trends.firebasestorage.app",
  messagingSenderId: "747426078467",
  appId: "1:747426078467:web:c7099ec2279de197f9d336",
  measurementId: "G-NF0X7J2TE0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
