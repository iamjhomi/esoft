import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './firebase';
import { auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Attempt anonymous sign-in so the client has an auth context for Firestore rules.
signInAnonymously(auth).catch(err => console.warn('Anonymous sign-in failed', err));

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
