import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Building,
  Workflow as WorkflowIcon,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Plus,
  Sparkles,
  Save,
  Loader2,
  AlertCircle,
  Calendar,
  MessageSquare,
  Cake,
  Truck,
  Wand2,
  Languages,
  Wrench,
} from 'lucide-react';
import { Business, WorkflowField, WorkflowCondition, FieldType, ResultingAction } from '../types/db';
import { getBusinesses, createBusiness, createWorkflow } from '../lib/api';

const PRESETS = [
  {
    id: 'clinic',
    title: 'Clinic & Doctor Intake',
    icon: MessageSquare,
    color: 'from-emerald-500 to-teal-600',
    name: 'Apex Dental Patient Booking Assistant',
    bizName: 'Apex Dental Care Clinic',
    industry: 'healthcare',
    language: 'en-US',
    greeting: 'Hello! Thank you for calling Apex Dental Care. How can I help you today?',
    closing: 'Thank you for booking with Apex Dental Care! We look forward to seeing you.',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'Patient Name' },
      { fieldName: 'phone_number', fieldType: 'phone' as FieldType, isRequired: true, orderIndex: 2, description: 'Contact Phone' },
      { fieldName: 'symptom_description', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 3, description: 'Dental Issue or Pain Level' },
      { fieldName: 'preferred_date_time', fieldType: 'date' as FieldType, isRequired: true, orderIndex: 4, description: 'Appointment Date and Time' },
    ],
  },
  {
    id: 'bakery',
    title: 'Bakery & Cake Orders',
    icon: Cake,
    color: 'from-purple-500 to-pink-600',
    name: 'Artisan Bakery Cake Assistant',
    bizName: 'Sweet Delights Bakery',
    industry: 'bakery',
    language: 'en-US',
    greeting: 'Hello! Welcome to Sweet Delights Bakery. Are you calling for a cake order or general inquiry?',
    closing: 'Thank you for your cake order! Our baker will confirm your order details shortly.',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'Customer Name' },
      { fieldName: 'cake_flavor', fieldType: 'select' as FieldType, isRequired: true, orderIndex: 2, description: 'Flavor (Vanilla, Chocolate, Red Velvet)' },
      { fieldName: 'pickup_date', fieldType: 'date' as FieldType, isRequired: true, orderIndex: 3, description: 'Required Date' },
      { fieldName: 'delivery_preference', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 4, description: 'Delivery or Pickup' },
    ],
  },
  {
    id: 'hindi',
    title: 'Hindi & Hinglish Assistant',
    icon: Languages,
    color: 'from-rose-500 to-orange-600',
    name: 'नमस्ते एपेक्स क्लिनिक असिस्टेंट',
    bizName: 'नमस्ते एपेक्स क्लिनिक',
    industry: 'hindi',
    language: 'hi-IN',
    greeting: 'नमस्ते! एपेक्स क्लिनिक में आपका स्वागत है। मैं आपकी क्या सहायता कर सकता हूँ?',
    closing: 'आपका धन्यवाद! आपका अपॉइंटमेंट दर्ज कर लिया गया है।',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'मरीज़ का नाम (Patient Name)' },
      { fieldName: 'phone_number', fieldType: 'phone' as FieldType, isRequired: true, orderIndex: 2, description: 'फोन नंबर (Phone Number)' },
      { fieldName: 'problem_description', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 3, description: 'समस्या का विवरण (Dental Issue)' },
      { fieldName: 'preferred_date_time', fieldType: 'date' as FieldType, isRequired: true, orderIndex: 4, description: 'अपॉइंटमेंट समय (Preferred Time)' },
    ],
  },
  {
    id: 'logistics',
    title: 'Logistics & Delivery',
    icon: Truck,
    color: 'from-indigo-500 to-blue-600',
    name: 'Delivery Status & Tracking Assistant',
    bizName: 'Swift Express Logistics',
    industry: 'logistics',
    language: 'en-US',
    greeting: 'Hello! Thank you for calling Swift Delivery. Do you need a new package dispatch or tracking update?',
    closing: 'Thank you! Your delivery request has been logged.',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'Name' },
      { fieldName: 'tracking_number', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 2, description: 'Tracking or Order ID' },
      { fieldName: 'delivery_address', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 3, description: 'Destination Address' },
    ],
  },
  {
    id: 'real_estate',
    title: 'Real Estate & Property',
    icon: Building,
    color: 'from-amber-500 to-orange-600',
    name: 'Prime Estate Realty Qualification Assistant',
    bizName: 'Prime Estate Realty',
    industry: 'real_estate',
    language: 'en-US',
    greeting: 'Hello! Thank you for calling Prime Estate Realty. Are you looking to buy, rent, sell, or schedule a site visit?',
    closing: 'Thank you! Our property agent will get back to you with matching property listings.',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'Lead Name' },
      { fieldName: 'intent_type', fieldType: 'select' as FieldType, isRequired: true, orderIndex: 2, description: 'Buy, Rent, Sell, or Site Visit' },
      { fieldName: 'property_type', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 3, description: 'Apartment, Villa, Commercial' },
      { fieldName: 'budget_range', fieldType: 'text' as FieldType, isRequired: false, orderIndex: 4, description: 'Budget Range' },
    ],
  },
  {
    id: 'repair_service',
    title: 'Home & Repair Service',
    icon: Wrench,
    color: 'from-cyan-500 to-blue-600',
    name: 'Pro Repair Service Request Assistant',
    bizName: 'Pro Repair Services',
    industry: 'repair_service',
    language: 'en-US',
    greeting: 'Hello! Thank you for calling Pro Repair Services. What service or repair do you need help with today?',
    closing: 'Thank you! A technician visit has been scheduled for your repair.',
    fields: [
      { fieldName: 'caller_name', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 1, description: 'Customer Name' },
      { fieldName: 'service_type', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 2, description: 'Appliance or Plumbing Service' },
      { fieldName: 'issue_description', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 3, description: 'Problem Description & Urgency' },
      { fieldName: 'service_address', fieldType: 'text' as FieldType, isRequired: true, orderIndex: 4, description: 'Service Address' },
    ],
  },
];

export const WorkflowBuilder: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Business State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState<boolean>(true);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('new');
  const [businessName, setBusinessName] = useState<string>('');
  const [businessIndustry, setBusinessIndustry] = useState<string>('healthcare');

  // Workflow State
  const [workflowName, setWorkflowName] = useState<string>('');
  const [language, setLanguage] = useState<string>('en-US');
  const [greetingMessage, setGreetingMessage] = useState<string>(
    'Hello! Thank you for calling. How can I assist you today?'
  );
  const [closingMessage, setClosingMessage] = useState<string>(
    'Thank you for calling us! Have a wonderful day.'
  );

  // Fields to collect
  const [fields, setFields] = useState<WorkflowField[]>([
    { fieldName: 'caller_name', fieldType: 'text', isRequired: true, orderIndex: 1, description: 'Caller Name' },
    { fieldName: 'phone_number', fieldType: 'phone', isRequired: true, orderIndex: 2, description: 'Phone Number' },
    { fieldName: 'preferred_date_time', fieldType: 'date', isRequired: false, orderIndex: 3, description: 'Preferred Date/Time' },
  ]);

  // Action after collection
  const [postAction, setPostAction] = useState<ResultingAction>('schedule_appointment');

  // Submit Status
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Preset Loader
  const applyPreset = (preset: typeof PRESETS[0]) => {
    setSelectedBusinessId('new');
    setBusinessName(preset.bizName);
    setWorkflowName(preset.name);
    setGreetingMessage(preset.greeting);
    setClosingMessage(preset.closing);
    setFields(preset.fields);
    setBusinessIndustry(preset.industry);
    if (preset.language) setLanguage(preset.language);
  };

  // Load existing businesses & check URL query params for preset
  useEffect(() => {
    async function load() {
      try {
        setLoadingBusinesses(true);
        const data = await getBusinesses();
        setBusinesses(data);

        // Check URL preset query param (e.g. ?preset=real_estate)
        const params = new URLSearchParams(location.search);
        const presetId = params.get('preset');
        if (presetId) {
          const matched = PRESETS.find((p) => p.id === presetId);
          if (matched) {
            applyPreset(matched);
          }
        }
      } catch (err) {
        console.error('Error fetching businesses:', err);
      } finally {
        setLoadingBusinesses(false);
      }
    }
    load();
  }, [location.search]);

  // Handle Business Selection Dropdown
  const handleBusinessSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedBusinessId(val);
    if (val !== 'new') {
      const found = businesses.find((b) => b.id === val);
      if (found) {
        setBusinessName(found.name);
        setBusinessIndustry(found.industryType || 'general');
      }
    } else {
      setBusinessName('');
    }
  };

  // Add field
  const addField = () => {
    const nextIdx = fields.length + 1;
    setFields([
      ...fields,
      {
        fieldName: `field_${nextIdx}`,
        fieldType: 'text',
        isRequired: false,
        orderIndex: nextIdx,
        description: '',
      },
    ]);
  };

  // Remove field
  const removeField = (index: number) => {
    if (fields.length <= 1) {
      setErrorMsg('At least one field is required.');
      return;
    }
    setErrorMsg(null);
    setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, orderIndex: i + 1 })));
  };

  // Update field
  const updateField = (index: number, key: keyof WorkflowField, value: any) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    setFields(updated);
  };

  // Handle Submit & Save Workflow
  const handleSave = async () => {
    setErrorMsg(null);

    if (!workflowName.trim()) {
      setErrorMsg('Please enter a workflow name.');
      setCurrentStep(1);
      return;
    }

    try {
      setSubmitting(true);
      let targetBizId = selectedBusinessId;

      // Create new business profile if creating new or if not selected
      if (targetBizId === 'new' || !targetBizId) {
        if (!businessName.trim()) {
          setErrorMsg('Please enter a business name for your new profile.');
          setCurrentStep(1);
          setSubmitting(false);
          return;
        }

        const createdBiz = await createBusiness({
          name: businessName.trim(),
          industryType: businessIndustry,
          ownerInfo: { name: 'Business Owner', email: '' },
          languageSettings: { primaryLanguage: language },
        });
        targetBizId = createdBiz.id;
      }

      // Default condition rule based on postAction
      const defaultCondition: WorkflowCondition = {
        fieldReference: fields[0]?.fieldName || 'caller_name',
        operator: 'is_set',
        value: '',
        resultingAction: postAction,
      };

      await createWorkflow({
        businessId: targetBizId,
        name: workflowName.trim(),
        triggerType: 'inbound_call',
        greetingMessage: greetingMessage.trim(),
        closingMessage: closingMessage.trim(),
        isActive: true,
        language,
        fields,
        conditions: [defaultCondition],
      });

      navigate('/', { state: { message: `Workflow "${workflowName}" created and saved successfully!` } });
    } catch (err: any) {
      console.error('Error saving workflow:', err);
      setErrorMsg(err.message || 'Failed to save workflow. Please check form fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-indigo-600" />
              Create Simple AI Workflow
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Configure your voice assistant in 3 easy steps
            </p>
          </div>
        </div>

        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs sm:text-sm rounded-full border border-indigo-200">
          Step {currentStep} of 3
        </span>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Template Presets bar */}
      <div className="glass-card p-4 rounded-2xl border border-slate-200 space-y-2 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          1-Click Presets (Click to Fill Preset Fields)
        </span>
        <div className="grid sm:grid-cols-3 gap-3 pt-1">
          {PRESETS.map((preset) => {
            const IconComponent = preset.icon;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-all hover:scale-[1.02] flex items-center gap-3"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${preset.color} flex items-center justify-center text-white shrink-0`}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-800">{preset.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Wizard Progress Bar */}
      <div className="flex items-center justify-between relative px-2">
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -z-10 -translate-y-1/2"></div>
        <div
          className="absolute top-1/2 left-0 h-1 bg-indigo-600 -z-10 -translate-y-1/2 transition-all duration-300"
          style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
        ></div>

        <button
          onClick={() => setCurrentStep(1)}
          className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
            currentStep >= 1 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'
          }`}
        >
          1
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
            currentStep >= 2 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'
          }`}
        >
          2
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center transition-all ${
            currentStep >= 3 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'
          }`}
        >
          3
        </button>
      </div>

      {/* STEP 1: Basic Profile */}
      {currentStep === 1 && (
        <div className="glass-card p-6 rounded-3xl space-y-5 border border-slate-200 shadow-md animate-fade-in">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-5 h-5 text-indigo-600" />
            Step 1: Business Profile & Workflow Setup
          </h2>

          <div className="space-y-4">
            {/* Target Business Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Select Business Profile
              </label>
              <select
                value={selectedBusinessId}
                onChange={handleBusinessSelectChange}
                className="w-full glass-input px-4 py-3 rounded-xl text-sm font-bold bg-white"
              >
                <option value="new">+ Create New Business Profile</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.industryType || 'General'})
                  </option>
                ))}
              </select>
            </div>

            {/* Business Name Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Apex Dental Care Clinic"
                className="w-full glass-input px-4 py-3 rounded-xl text-sm font-medium"
              />
            </div>

            {/* Workflow Name Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Workflow Name
              </label>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="e.g. Patient Appointment Booking Workflow"
                className="w-full glass-input px-4 py-3 rounded-xl text-sm font-medium"
              />
            </div>

            {/* Industry Category Group Dropdown */}
            <div>
              <label className="block text-xs font-extrabold text-indigo-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Select Category / Group (Where will this appear on Home Page?)
              </label>
              <select
                value={businessIndustry}
                onChange={(e) => setBusinessIndustry(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-xl text-sm font-bold bg-indigo-50/40 border border-indigo-200 text-slate-900 shadow-sm"
              >
                <option value="healthcare">🏥 Clinic & Doctor (Healthcare)</option>
                <option value="bakery">🎂 Artisan Bakery & Cake Shop</option>
                <option value="hindi">🗣 Hindi & Hinglish Assistant</option>
                <option value="logistics">🚚 Delivery & Logistics</option>
                <option value="real_estate">🏢 Real Estate & Property</option>
                <option value="repair_service">🛠 Home & Repair Service</option>
                <option value="general">✨ General Custom Assistant</option>
              </select>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Primary Voice Assistant Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-xl text-sm font-medium bg-white"
              >
                <option value="en-US">English (US / Indian English)</option>
                <option value="hi-IN">Hindi (हिंदी)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!workflowName.trim()) {
                  setErrorMsg('Please enter a workflow name.');
                  return;
                }
                if (!businessName.trim()) {
                  setErrorMsg('Please enter a business name.');
                  return;
                }
                setErrorMsg(null);
                setCurrentStep(2);
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md transition-all"
            >
              Next: Voice Script & Fields
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Script & Fields */}
      {currentStep === 2 && (
        <div className="glass-card p-6 rounded-3xl space-y-6 border border-slate-200 shadow-md animate-fade-in">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            Step 2: Voice Script & Information to Collect
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Opening Greeting Message
              </label>
              <textarea
                rows={2}
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                className="w-full glass-input p-3 rounded-xl text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Closing Message
              </label>
              <textarea
                rows={2}
                value={closingMessage}
                onChange={(e) => setClosingMessage(e.target.value)}
                className="w-full glass-input p-3 rounded-xl text-sm font-medium"
              />
            </div>

            {/* Information Fields Checklist */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Information to Collect from Caller
                </label>
                <button
                  type="button"
                  onClick={addField}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Field
                </button>
              </div>

              <div className="space-y-2.5">
                {fields.map((field, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3"
                  >
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>

                    <input
                      type="text"
                      value={field.fieldName}
                      onChange={(e) => updateField(idx, 'fieldName', e.target.value)}
                      placeholder="field_name"
                      className="w-1/3 glass-input px-3 py-2 rounded-lg text-xs font-medium"
                    />

                    <input
                      type="text"
                      value={field.description || ''}
                      onChange={(e) => updateField(idx, 'description', e.target.value)}
                      placeholder="Prompt / Question"
                      className="flex-1 glass-input px-3 py-2 rounded-lg text-xs font-medium"
                    />

                    <label className="flex items-center gap-1 text-xs text-slate-600 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.isRequired}
                        onChange={(e) => updateField(idx, 'isRequired', e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Required
                    </label>

                    <button
                      type="button"
                      onClick={() => removeField(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setCurrentStep(3);
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md transition-all"
            >
              Next: Action & Save
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Action & Save */}
      {currentStep === 3 && (
        <div className="glass-card p-6 rounded-3xl space-y-6 border border-slate-200 shadow-md animate-fade-in">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Step 3: Post-Collection Action & Save
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Action After Information Collection
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label
                onClick={() => setPostAction('schedule_appointment')}
                className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                  postAction === 'schedule_appointment'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Google Calendar Booking</h4>
                  <p className="text-xs text-slate-500">
                    Automatically check availability and create calendar appointment event.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setPostAction('transfer_call')}
                className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                  postAction === 'transfer_call'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Transfer to Staff / Urgent Queue</h4>
                  <p className="text-xs text-slate-500">
                    Flag as urgent and notify owner for immediate phone call follow-up.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Workflow Summary Review */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Workflow Summary Review
            </h4>
            <div className="text-xs text-slate-700 space-y-1">
              <p><strong>Business:</strong> {businessName || 'Default Business'}</p>
              <p><strong>Workflow:</strong> {workflowName}</p>
              <p><strong>Category Group:</strong> <span className="capitalize">{businessIndustry}</span></p>
              <p><strong>Language:</strong> {language === 'hi-IN' ? 'Hindi (हिंदी)' : 'English'}</p>
              <p><strong>Fields ({fields.length}):</strong> {fields.map((f) => f.fieldName).join(', ')}</p>
            </div>
          </div>

          <div className="pt-4 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSave}
              className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-xl glow-indigo transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save & Launch Voice Assistant
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
