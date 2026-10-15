import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeHotelApp } from './legacy.js';
import './styles.css';

function HotelApp() {
  useEffect(() => {
    initializeHotelApp();
  }, []);

  return null;
}

createRoot(document.getElementById('app')).render(<HotelApp />);
