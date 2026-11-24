import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <>
    <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
    <App />
  </>
);
