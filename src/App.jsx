import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ChatInterface from './components/ChatInterface';
import Dashboard from './components/Dashboard';
import StorekeeperView from './components/StorekeeperView';

import ContactUs from './components/ContactUs';
import SettingsView from './components/SettingsView';
import SalesHistory from './components/SalesHistory';
import ErrorBoundary from './components/ErrorBoundary';
import { AppDataProvider } from './context/AppDataContext';

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { Camera } from '@capacitor/camera';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

const DeepLinkHandler = () => {
  const navigate = useNavigate();

  React.useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (data) => {
      console.log('App opened with URL:', data.url);
      try {
        const url = new URL(data.url);
        // Check for kiranaai://query?q=...
        if (url.host === 'query') {
          const query = url.searchParams.get('q');
          if (query) {
            console.log('Navigating to customer view with query:', query);
            navigate('/customer', { state: { autoQuery: query } });
          }
        }
      } catch (e) {
        console.error('Error parsing deep link:', e);
      }
    });
  }, [navigate]);

  return null;
};



function App() {


  React.useEffect(() => {
    const requestPermissions = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          console.log("Requesting permissions...");
          await Camera.requestPermissions();
          try {
            await SpeechRecognition.requestPermissions();
          } catch (err) {
            console.warn("Speech recognition permissions failed:", err);
          }
        } catch (e) {
          console.error("Error requesting permissions:", e);
        }
      }
    };
    requestPermissions();
  }, []);

  return (
    <Router>
      <AppDataProvider>
        <DeepLinkHandler />
        <ErrorBoundary>
          <Layout>
            <Routes>
              <Route path="/" element={<ChatInterface />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/storekeeper" element={<StorekeeperView />} />

              <Route path="/settings" element={<SettingsView />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/sales" element={<SalesHistory />} />
            </Routes>
          </Layout>
        </ErrorBoundary>
      </AppDataProvider>
    </Router>
  );
}

export default App;
