import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { WorkflowBuilder } from './pages/WorkflowBuilder';
import { ChatView } from './pages/ChatView';
import { VoiceView } from './pages/VoiceView';
import { Dashboard } from './pages/Dashboard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
        <Header />
        <main className="flex-1 pb-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workflows/new" element={<WorkflowBuilder />} />
            <Route path="/chat/:workflowId" element={<ChatView />} />
            <Route path="/voice/:workflowId" element={<VoiceView />} />
          </Routes>
        </main>
        <footer className="py-4 border-t border-slate-200 text-center text-xs text-slate-500">
          Voice AI Personal Assistant &bull; Mobile-First React + Node/Express Architecture
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;
