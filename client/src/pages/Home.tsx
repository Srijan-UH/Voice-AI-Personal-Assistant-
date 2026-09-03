import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  checkServerHealth,
  getBusinesses,
  getWorkflows,
  seedDemoWorkflow,
  seedCakeShopWorkflow,
  seedHindiWorkflow,
  HealthResponse,
} from '../lib/api';
import { Business, Workflow } from '../types/db';
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Calendar,
  Mic,
  Bot,
  MessageSquare,
  Cake,
  Loader2,
  Radio,
  Languages,
  Check,
  PhoneIncoming,
  Database,
  UserCheck,
  TrendingUp,
  Building,
  Plus,
  Truck,
  Wrench,
  Wand2,
} from 'lucide-react';

interface CategoryConfig {
  id: string;
  badge: string;
  title: string;
  description: string;
  icon: any;
  gradient: string;
  border: string;
  glow: string;
  btnGradient: string;
  matchIndustries: string[];
  matchLanguages?: string[];
  seedHandler?: (mode: 'chat' | 'voice') => Promise<void>;
}

export const Home: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  // Seeding Loading States
  const [seedingClinic, setSeedingClinic] = useState<boolean>(false);
  const [seedingBakery, setSeedingBakery] = useState<boolean>(false);
  const [seedingHindi, setSeedingHindi] = useState<boolean>(false);

  const fetchHealthAndData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthData, bizData, wfData] = await Promise.all([
        checkServerHealth().catch(() => null),
        getBusinesses().catch(() => []),
        getWorkflows().catch(() => []),
      ]);
      setHealth(healthData);
      setBusinesses(bizData);
      setWorkflows(wfData);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndData();
    if (location.state && (location.state as any).message) {
      setFlashMsg((location.state as any).message);
    }
  }, [location]);

  const handleLaunchDentalDemo = async (mode: 'chat' | 'voice') => {
    try {
      setSeedingClinic(true);
      const res = await seedDemoWorkflow();
      navigate(`/${mode}/${res.workflowId}`);
    } catch (err: any) {
      console.error('Failed to launch demo:', err);
      setError(err.message || 'Failed to seed demo dental workflow');
    } finally {
      setSeedingClinic(false);
    }
  };

  const handleLaunchCakeShopDemo = async (mode: 'chat' | 'voice') => {
    try {
      setSeedingBakery(true);
      const res = await seedCakeShopWorkflow();
      navigate(`/${mode}/${res.workflowId}`);
    } catch (err: any) {
      console.error('Failed to launch cake shop demo:', err);
      setError(err.message || 'Failed to seed demo cake shop workflow');
    } finally {
      setSeedingBakery(false);
    }
  };

  const handleLaunchHindiDemo = async (mode: 'chat' | 'voice') => {
    try {
      setSeedingHindi(true);
      const res = await seedHindiWorkflow();
      navigate(`/${mode}/${res.workflowId}`);
    } catch (err: any) {
      console.error('Failed to launch Hindi demo:', err);
      setError(err.message || 'Failed to seed demo Hindi workflow');
    } finally {
      setSeedingHindi(false);
    }
  };

  // Define Category Definitions for All 6 Hackathon Use Cases
  const CATEGORIES: CategoryConfig[] = [
    {
      id: 'clinic',
      badge: 'Clinic & Doctor',
      title: 'Apex Dental Care Clinic',
      description: 'Patient intake, appointment booking on Google Calendar, emergency pain rule escalation, and follow-up logging.',
      icon: MessageSquare,
      gradient: 'from-emerald-500 to-teal-500',
      border: 'border-emerald-200',
      glow: 'glow-emerald',
      btnGradient: 'from-emerald-600 to-teal-600',
      matchIndustries: ['dental', 'clinic', 'healthcare', 'doctor'],
      seedHandler: handleLaunchDentalDemo,
    },
    {
      id: 'bakery',
      badge: 'Artisan Bakery',
      title: 'Sweet Delights Bakery',
      description: 'Custom cake order intake, flavor selection (Vanilla, Red Velvet), pickup dates, and tasting scheduling.',
      icon: Cake,
      gradient: 'from-purple-500 to-pink-500',
      border: 'border-purple-200',
      glow: 'glow-purple',
      btnGradient: 'from-purple-600 to-pink-600',
      matchIndustries: ['bakery', 'hospitality', 'cake', 'food'],
      seedHandler: handleLaunchCakeShopDemo,
    },
    {
      id: 'hindi',
      badge: 'Hindi & Hinglish',
      title: 'नमस्ते एपेक्स क्लिनिक',
      description: 'Full voice intake in natural Hindi (hi-IN). Asks for name, phone, problem, and appointment time in Hindi.',
      icon: Languages,
      gradient: 'from-rose-500 to-orange-500',
      border: 'border-rose-200',
      glow: 'glow-rose',
      btnGradient: 'from-rose-600 to-orange-600',
      matchIndustries: ['hindi'],
      matchLanguages: ['hi-IN'],
      seedHandler: handleLaunchHindiDemo,
    },
    {
      id: 'logistics',
      badge: 'Delivery & Logistics',
      title: 'Swift Express Logistics',
      description: 'Package pickup/delivery location intake, delivery time slots, tracking number lookup, and order status updates.',
      icon: Truck,
      gradient: 'from-indigo-500 to-blue-500',
      border: 'border-indigo-200',
      glow: 'glow-indigo',
      btnGradient: 'from-indigo-600 to-blue-600',
      matchIndustries: ['logistics', 'delivery', 'courier', 'shipping'],
    },
    {
      id: 'real_estate',
      badge: 'Real Estate & Realty',
      title: 'Prime Estate Realty',
      description: 'Lead qualification for buy/rent/sell inquiries, property type preference, budget, location, and site visit scheduling.',
      icon: Building,
      gradient: 'from-amber-500 to-orange-500',
      border: 'border-amber-200',
      glow: 'glow-amber',
      btnGradient: 'from-amber-600 to-orange-600',
      matchIndustries: ['real_estate', 'property', 'realty', 'housing'],
    },
    {
      id: 'repair_service',
      badge: 'Home & Repair Service',
      title: 'Pro Repair & Service',
      description: 'Service issue description, appliance repair address, preferred technician visit time, and priority emergency flagging.',
      icon: Wrench,
      gradient: 'from-cyan-500 to-blue-500',
      border: 'border-cyan-200',
      glow: 'glow-cyan',
      btnGradient: 'from-cyan-600 to-blue-600',
      matchIndustries: ['repair_service', 'home_service', 'maintenance', 'repair'],
    },
    {
      id: 'general',
      badge: 'General & Custom',
      title: 'General Custom Assistants',
      description: 'Custom AI voice workflows for general business inquiries, custom intake, and appointment booking.',
      icon: Wand2,
      gradient: 'from-slate-600 to-slate-800',
      border: 'border-slate-300',
      glow: 'glow-indigo',
      btnGradient: 'from-slate-700 to-slate-900',
      matchIndustries: ['general', 'other'],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-14">
      {/* Flash Notification */}
      {flashMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-emerald-900">{flashMsg}</span>
          </div>
          <button
            onClick={() => setFlashMsg(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Header */}
      <section className="relative text-center space-y-6 pt-4 pb-8">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse"></div>

        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-slate-100 border border-slate-200 text-xs sm:text-sm font-bold text-indigo-700 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
          </span>
          AI Voice Agents &bull; Category-Based Missed Call Automation
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
          AI Voice Agents for{' '}
          <span className="gradient-text-indigo">Modern Businesses</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-700 max-w-3xl mx-auto leading-relaxed font-normal">
          Talk to every customer in English, Hindi & Hinglish. Collect structured intake, qualify leads, track CRM orders, and schedule appointments on Google Calendar automatically.
        </p>

        <div className="pt-4 flex flex-wrap gap-4 justify-center items-center">
          <button
            onClick={() => handleLaunchDentalDemo('voice')}
            disabled={seedingClinic || seedingBakery || seedingHindi}
            className="px-8 py-4 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-bold text-sm sm:text-base shadow-xl glow-indigo flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {seedingClinic ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Radio className="w-5 h-5 text-rose-200 animate-pulse" />
                Launch Dental Voice Agent
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <Link
            to="/workflows/new"
            className="px-7 py-4 rounded-full bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm sm:text-base border border-slate-300 shadow-sm flex items-center gap-2 transition-all hover:scale-105"
          >
            <Plus className="w-5 h-5 text-indigo-600" />
            Build Custom Workflow
          </Link>
        </div>

        <ul className="pt-4 flex flex-wrap gap-3 justify-center text-xs sm:text-sm font-semibold text-slate-800">
          <li className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 border border-slate-200 shadow-sm">
            <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> Sub-Second Response
          </li>
          <li className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 border border-slate-200 shadow-sm">
            <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> Hindi & English Support
          </li>
          <li className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 border border-slate-200 shadow-sm">
            <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> Google Calendar Integration
          </li>
          <li className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 border border-slate-200 shadow-sm">
            <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> CRM Order Tracking
          </li>
        </ul>
      </section>

      {/* CATEGORIES GRID — All AI Voice Agents Grouped By Industry Category */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            INTERACTIVE DEMOS & CATEGORIES
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Pre-Configured AI Voice Agents By Category
          </h2>
          <p className="text-sm text-slate-600">
            Select or create voice agents grouped under each industry category.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map((cat) => {
            const IconComp = cat.icon;

            // Find matching businesses and workflows for this category
            const matchingBizs = businesses.filter((b) => {
              const ind = (b.industryType || '').toLowerCase();
              return cat.matchIndustries.some((m) => ind.includes(m.toLowerCase()));
            });

            const matchingBizIds = new Set(matchingBizs.map((b) => b.id));
            const categoryWorkflows = workflows.filter((w) => {
              if (matchingBizIds.has(w.businessId)) return true;
              if (cat.matchLanguages && w.language && cat.matchLanguages.includes(w.language)) return true;
              return false;
            });

            return (
              <div
                key={cat.id}
                className={`glass-card rounded-3xl p-6 border ${cat.border} flex flex-col justify-between space-y-5 hover:border-indigo-300 transition-all ${cat.glow}`}
              >
                <div className="space-y-3.5">
                  {/* Category Badge & Icon */}
                  <div className="flex items-center justify-between">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${cat.gradient} flex items-center justify-center text-white shadow-md`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    <span className="px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                      {cat.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{cat.title}</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">{cat.description}</p>

                  {/* List of Workflows under this Category */}
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Active Workflows ({categoryWorkflows.length})
                    </span>

                    {categoryWorkflows.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No custom workflows built yet. Use demo launcher below or build a new workflow.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {categoryWorkflows.map((wf) => {
                          const parentBiz = businesses.find((b) => b.id === wf.businessId);
                          return (
                            <div
                              key={wf.id}
                              className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="truncate">
                                <span className="font-bold text-slate-900 block truncate">{wf.name}</span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                  {parentBiz?.name || 'Business'} &bull; {wf.language === 'hi-IN' ? 'Hindi' : 'English'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => navigate(`/voice/${wf.id}`)}
                                  className="px-2.5 py-1 bg-indigo-600 text-white font-bold text-[11px] rounded-lg shadow-sm"
                                >
                                  Voice
                                </button>
                                <button
                                  onClick={() => navigate(`/chat/${wf.id}`)}
                                  className="px-2 py-1 bg-white border border-slate-300 text-slate-700 font-semibold text-[11px] rounded-lg"
                                >
                                  Chat
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Launchers for Category — Both Demo Voice Call & Create Workflow Buttons */}
                <div className="pt-3 space-y-2">
                  <div className="flex gap-2">
                    {cat.seedHandler ? (
                      <>
                        <button
                          onClick={() => cat.seedHandler!('voice')}
                          disabled={seedingClinic || seedingBakery || seedingHindi}
                          className={`flex-1 py-3 px-3 bg-gradient-to-r ${cat.btnGradient} text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50`}
                        >
                          <Radio className="w-4 h-4 text-white animate-pulse" />
                          Voice Call
                        </button>
                        <button
                          onClick={() => cat.seedHandler!('chat')}
                          disabled={seedingClinic || seedingBakery || seedingHindi}
                          className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-1 transition-all border border-slate-200"
                        >
                          Chat
                        </button>
                      </>
                    ) : categoryWorkflows.length > 0 ? (
                      <>
                        <button
                          onClick={() => navigate(`/voice/${categoryWorkflows[0].id}`)}
                          className={`flex-1 py-3 px-3 bg-gradient-to-r ${cat.btnGradient} text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-1.5 shadow-md transition-all`}
                        >
                          <Radio className="w-4 h-4 text-white animate-pulse" />
                          Voice Call
                        </button>
                        <button
                          onClick={() => navigate(`/chat/${categoryWorkflows[0].id}`)}
                          className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-1 transition-all border border-slate-200"
                        >
                          Chat
                        </button>
                      </>
                    ) : null}
                  </div>

                  {/* Create Workflow Button for ALL 6 Category Cards */}
                  <Link
                    to={`/workflows/new?preset=${cat.id}`}
                    className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all border border-slate-300 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    Create {cat.badge} Workflow
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Platform Capabilities */}
      <section className="space-y-6 pt-4">
        <div className="text-center max-w-xl mx-auto space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            Platform Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Everything Your Voice Agent Needs
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <PhoneIncoming className="w-6 h-6 text-indigo-600" />
            <h4 className="text-base font-bold text-slate-900">24/7 Inbound Answering</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Every missed call picked up instantly with zero queues or waiting time.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <UserCheck className="w-6 h-6 text-purple-600" />
            <h4 className="text-base font-bold text-slate-900">Lead Qualification</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Extracts required fields, detects caller urgency, and assigns priority badges.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <Calendar className="w-6 h-6 text-emerald-600" />
            <h4 className="text-base font-bold text-slate-900">Google Calendar Tools</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Checks slot availability and creates confirmed calendar events during the call.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <Database className="w-6 h-6 text-rose-600" />
            <h4 className="text-base font-bold text-slate-900">CRM Order Lookup</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Looks up order delivery tracking and customer membership history mid-call.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <Languages className="w-6 h-6 text-amber-600" />
            <h4 className="text-base font-bold text-slate-900">Hindi & English Switching</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Automatic script and keyword detection to switch seamlessly between languages.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl space-y-2.5 border border-slate-200">
            <TrendingUp className="w-6 h-6 text-teal-600" />
            <h4 className="text-base font-bold text-slate-900">Firestore Call Dashboard</h4>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Turn-by-turn transcripts, AI summaries, extracted fields, and status tracking.
            </p>
          </div>
        </div>
      </section>

      {/* All Business Profiles Database List */}
      <section className="glass-panel p-7 rounded-3xl space-y-5 border border-slate-200 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-5 h-5 text-indigo-600" />
              All Saved Business Profiles ({businesses.length})
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Complete business profiles stored in Google Firestore
            </p>
          </div>

          <Link
            to="/workflows/new"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </Link>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            Loading business profiles...
          </div>
        ) : businesses.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-600 space-y-2">
            <p>No business profiles found yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {businesses.map((biz) => {
              const parentWorkflows = workflows.filter((w) => w.businessId === biz.id);
              return (
                <div
                  key={biz.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 hover:border-slate-300 shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">{biz.name}</h4>
                    <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 capitalize">
                      {biz.industryType || 'General'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Owner: <span className="font-semibold">{biz.ownerInfo?.name || 'Owner'}</span> &bull; Workflows: {parentWorkflows.length}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
