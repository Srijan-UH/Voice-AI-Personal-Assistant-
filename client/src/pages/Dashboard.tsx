import React, { useState, useEffect } from 'react';
import {
  getCalls,
  getBusinesses,
  getCallTranscript,
  updateCallStatus,
  CallWithDetails,
  CallTranscriptResponse,
} from '../lib/api';
import { Business, FollowUpStatus } from '../types/db';
import {
  PhoneCall,
  User,
  Phone,
  Calendar,
  Building,
  Workflow as WorkflowIcon,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  FileText,
  X,
  Bot,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Tag,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [calls, setCalls] = useState<CallWithDetails[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedBusiness, setSelectedBusiness] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Updating Call Status State
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Transcript Drawer State
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<CallTranscriptResponse | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState<boolean>(false);

  const fetchCallsAndBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const [callsData, bizData] = await Promise.all([
        getCalls(selectedBusiness, selectedStatus),
        getBusinesses().catch(() => []),
      ]);
      setCalls(callsData);
      setBusinesses(bizData);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Failed to load call logs from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallsAndBusinesses();
  }, [selectedBusiness, selectedStatus]);

  const handleStatusChange = async (callId: string, newStatus: FollowUpStatus) => {
    try {
      setUpdatingId(callId);
      await updateCallStatus(callId, newStatus);
      setCalls((prev) =>
        prev.map((c) => (c.id === callId ? { ...c, followUpStatus: newStatus } : c))
      );
      if (transcriptData && transcriptData.call.id === callId) {
        setTranscriptData({
          ...transcriptData,
          call: { ...transcriptData.call, followUpStatus: newStatus },
        });
      }
    } catch (err: any) {
      console.error('Failed to update call status:', err);
      alert(`Error updating call status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenTranscript = async (callId: string) => {
    setActiveCallId(callId);
    setTranscriptLoading(true);
    setTranscriptData(null);
    try {
      const data = await getCallTranscript(callId);
      setTranscriptData(data);
    } catch (err: any) {
      console.error('Failed to fetch call transcript:', err);
    } finally {
      setTranscriptLoading(false);
    }
  };

  // Metrics calculation
  const totalCalls = calls.length;
  const pendingCalls = calls.filter((c) => c.followUpStatus === 'pending').length;
  const completedCalls = calls.filter((c) => c.followUpStatus === 'completed').length;
  const urgentCalls = calls.filter(
    (c) => c.urgencyLevel === 'urgent' || c.urgencyLevel === 'high'
  ).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-indigo-400" />
            Calls Management Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor incoming voice intake calls, extracted caller details, AI summaries, and follow-up actions.
          </p>
        </div>

        <button
          onClick={fetchCallsAndBusinesses}
          disabled={loading}
          className="self-start sm:self-auto px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Total Calls</span>
            <PhoneCall className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-slate-100">{totalCalls}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Pending Action</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400">{pendingCalls}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">{completedCalls}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Urgent Escalations</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-xl font-bold text-rose-400">{urgentCalls}</p>
        </div>
      </div>

      {/* Filter Bar Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Filter Call Logs:</span>
        </div>

        <div className="grid grid-cols-2 gap-2 flex-1 sm:max-w-md">
          {/* Business Filter */}
          <select
            value={selectedBusiness}
            onChange={(e) => setSelectedBusiness(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Businesses ({businesses.length})</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="contacted">Contacted</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Main Calls List Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-xs text-slate-400">Loading call records from Firestore...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-rose-200">Error Loading Calls</h4>
            <p className="mt-0.5 text-[11px] text-rose-400/80">{error}</p>
          </div>
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <PhoneCall className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300 mb-1">No call records found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4 leading-relaxed">
            No voice or text calls match the selected filter criteria. Launch a live test assistant from the home page to populate calls!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => {
            const isUrgent = call.urgencyLevel === 'urgent' || call.urgencyLevel === 'high';

            return (
              <div
                key={call.id}
                className={`bg-slate-900 border ${
                  isUrgent ? 'border-rose-500/40' : 'border-slate-800'
                } rounded-2xl p-4 shadow-xl hover:border-indigo-500/40 transition-all space-y-3 relative overflow-hidden`}
              >
                {/* Top Row: Caller Name/Phone & Status Badge */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
                        isUrgent
                          ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
                          : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-100 text-sm">
                          {call.callerName || 'Unknown Caller'}
                        </h3>
                        {isUrgent && (
                          <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Urgent Escalation
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {call.callerPhone || 'No Phone'}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {new Date(call.startTime).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Follow-up Status Dropdown Picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">Status:</span>
                    <select
                      value={call.followUpStatus || 'pending'}
                      disabled={updatingId === call.id}
                      onChange={(e) =>
                        handleStatusChange(call.id, e.target.value as FollowUpStatus)
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-xl border focus:outline-none transition-colors ${
                        call.followUpStatus === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : call.followUpStatus === 'contacted'
                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                          : call.followUpStatus === 'closed'
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      <option value="pending" className="bg-slate-900 text-amber-300">
                        Pending
                      </option>
                      <option value="contacted" className="bg-slate-900 text-indigo-300">
                        Contacted
                      </option>
                      <option value="completed" className="bg-slate-900 text-emerald-300">
                        Completed
                      </option>
                      <option value="closed" className="bg-slate-900 text-slate-400">
                        Closed
                      </option>
                    </select>
                  </div>
                </div>

                {/* Middle Row: Business/Workflow Tags & AI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-indigo-300 mb-1">
                      <Building className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-semibold">{call.businessName}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-slate-400">{call.workflowName}</span>
                    </div>

                    {/* AI Summary Snippet */}
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed text-slate-300 text-[11px]">
                      <span className="font-semibold text-slate-400 block mb-0.5">
                        AI Call Summary:
                      </span>
                      {call.aiSummary || 'Intake workflow completed successfully.'}
                    </div>
                  </div>

                  {/* Collected Fields Pill Checklist */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                      Collected Fields
                    </span>
                    {call.collectedFields && Object.keys(call.collectedFields).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(call.collectedFields).map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-1 rounded-lg bg-slate-950 text-[11px] text-slate-300 border border-slate-800 flex items-center gap-1 font-mono"
                          >
                            <Tag className="w-3 h-3 text-emerald-400" />
                            <span className="text-slate-400 capitalize">{k.replace('_', ' ')}:</span>
                            <span className="font-semibold text-emerald-300">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">No custom fields extracted.</p>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Action Taken & View Full Transcript Button */}
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      Action: <strong className="text-slate-200">{call.actionTaken || 'Log Intake'}</strong>
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenTranscript(call.id)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    View Full Transcript
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript Drawer Modal Overlay */}
      {activeCallId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Full Call Transcript & Subcollections
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">Call ID: {activeCallId}</p>
              </div>

              <button
                onClick={() => setActiveCallId(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            {transcriptLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 text-xs">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                <span>Reading transcript subcollection from Firestore...</span>
              </div>
            ) : transcriptData ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Caller & Business Info Box */}
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">
                      {transcriptData.call.callerName || 'Caller'} ({transcriptData.call.callerPhone})
                    </span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                      {transcriptData.call.businessName}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {transcriptData.call.aiSummary}
                  </p>
                </div>

                {/* Extracted Subcollection Responses */}
                {transcriptData.responses && transcriptData.responses.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Firestore Responses Subcollection
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {transcriptData.responses.map((r) => (
                        <div key={r.id} className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-500 block font-mono capitalize">
                            {r.fieldName.replace('_', ' ')}
                          </span>
                          <span className="font-semibold text-emerald-300">{String(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Turn-by-Turn Transcript */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Turn-by-Turn Transcript
                  </h4>

                  {transcriptData.transcript.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded-xl">
                      No transcript entries found in subcollection.
                    </p>
                  ) : (
                    transcriptData.transcript.map((item) => {
                      const isAssistant = item.role === 'assistant';
                      const isTool = item.role === 'tool';

                      if (isTool) {
                        return (
                          <div key={item.id} className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 text-[11px] flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span>{item.content}</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl text-xs ${
                            isAssistant
                              ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/80'
                              : 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white rounded-tr-none ml-auto max-w-[85%]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                            <span className="font-semibold capitalize">{item.role}</span>
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{item.content}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
