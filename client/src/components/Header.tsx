import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mic, Sparkles, LayoutDashboard, Plus, Home, Radio } from 'lucide-react';

export const Header: React.FC = () => {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/95 border-b border-slate-200/90 px-5 py-3.5 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 blur-sm opacity-60 group-hover:opacity-100 transition duration-300 animate-pulse"></div>
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-500 flex items-center justify-center shadow-md text-white">
              <Mic className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2 tracking-tight group-hover:text-indigo-600 transition-colors">
              Voice AI Assistant
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Smart Voice Assistant Platform</p>
          </div>
        </Link>

        {/* Navigation Tabs with Larger Text */}
        <nav className="flex items-center space-x-1.5 bg-slate-100 border border-slate-200/90 p-1.5 rounded-2xl">
          <Link
            to="/"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all duration-200 ${
              location.pathname === '/'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md glow-indigo'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white'
            }`}
            title="Home"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </Link>

          <Link
            to="/dashboard"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all duration-200 ${
              location.pathname === '/dashboard'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md glow-indigo'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white'
            }`}
            title="Calls Dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/workflows/new"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all duration-200 ${
              location.pathname === '/workflows/new'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md glow-indigo'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white'
            }`}
            title="New Workflow"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </Link>
        </nav>
      </div>
    </header>
  );
};
