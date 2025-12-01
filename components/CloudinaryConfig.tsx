
import React, { useState, useEffect } from 'react';
import { Cloud, ExternalLink, ArrowRight, Search, Settings, Check, X, Lock, Database } from 'lucide-react';
import { setCloudinaryConfig, isCloudinaryConfigured } from '../cloudinaryService';
import { setSearchConfig } from '../geminiService';

interface CloudinaryConfigProps {
  onConfigured: () => void;
  onSkip: () => void;
}

const DEFAULT_GOOGLE_API_KEY = 'AIzaSyAtSpe9Rm7Nm-SDqIM5utxWijbI_L3UG-o';
const DEFAULT_GOOGLE_CX = 'b446eed8fbf424c0f';

export const CloudinaryConfig: React.FC<CloudinaryConfigProps> = ({ onConfigured, onSkip }) => {
  const [cloudName, setCloudName] = useState('da7wmiyra');
  const [uploadPreset, setUploadPreset] = useState('woocom_upload');
  const [googleApiKey, setGoogleApiKey] = useState(DEFAULT_GOOGLE_API_KEY);
  const [googleCx, setGoogleCx] = useState(DEFAULT_GOOGLE_CX);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'cloudinary' | 'search'>('cloudinary');

  useEffect(() => {
    const savedCloudName = localStorage.getItem('cloudinary_cloud_name');
    const savedPreset = localStorage.getItem('cloudinary_upload_preset');
    if (savedCloudName && savedPreset) {
      setCloudName(savedCloudName);
      setUploadPreset(savedPreset);
      setCloudinaryConfig(savedCloudName, savedPreset);
    } else {
        setCloudinaryConfig('da7wmiyra', 'woocom_upload');
    }

    const savedApiKey = localStorage.getItem('google_search_api_key');
    const savedCx = localStorage.getItem('google_search_cx');
    
    const apiKeyToUse = savedApiKey || DEFAULT_GOOGLE_API_KEY;
    const cxToUse = savedCx || DEFAULT_GOOGLE_CX;

    setGoogleApiKey(apiKeyToUse);
    setGoogleCx(cxToUse);
    
    if (apiKeyToUse && cxToUse) setSearchConfig(apiKeyToUse, cxToUse);
    if ((savedCloudName || 'da7wmiyra') && (savedPreset || 'woocom_upload')) setSaved(true);
  }, []);

  const handleSave = () => {
    if (cloudName.trim() && uploadPreset.trim()) {
      localStorage.setItem('cloudinary_cloud_name', cloudName.trim());
      localStorage.setItem('cloudinary_upload_preset', uploadPreset.trim());
      setCloudinaryConfig(cloudName.trim(), uploadPreset.trim());
    }
    if (googleApiKey.trim()) localStorage.setItem('google_search_api_key', googleApiKey.trim());
    if (googleCx.trim()) localStorage.setItem('google_search_cx', googleCx.trim());
    if (googleApiKey.trim() && googleCx.trim()) setSearchConfig(googleApiKey.trim(), googleCx.trim());
    setSaved(true);
    setTimeout(() => onConfigured(), 500); // Auto close a bit after save
  };

  return (
    <div className="max-w-2xl mx-auto mt-6 md:mt-16 bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden relative animate-in fade-in zoom-in-95 duration-500">
      
      {/* Header */}
      <div className="bg-emerald-950 p-8 text-white flex items-center gap-6 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-32 bg-emerald-800 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50"></div>
         
         <div className="relative z-10 w-14 h-14 bg-emerald-900 border border-emerald-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-lg">
            <Settings size={28} />
         </div>
         <div className="relative z-10 flex-1">
            <h3 className="text-2xl font-bold serif-font tracking-wide">Systemkonfiguration</h3>
            <p className="text-emerald-200/80 text-sm mt-1 font-medium">Hantera API-nycklar och bildlagring.</p>
         </div>
         <button 
            onClick={onSkip} 
            className="relative z-10 text-emerald-300 hover:text-white bg-white/5 hover:bg-white/10 p-2.5 rounded-full transition-colors backdrop-blur-sm"
            title="Stäng fönstret"
         >
             <X size={20} />
         </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 bg-stone-50/50 p-2 gap-2">
          <button 
            onClick={() => setActiveTab('cloudinary')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all rounded-xl ${activeTab === 'cloudinary' ? 'bg-white shadow-sm text-emerald-900 ring-1 ring-stone-200' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'}`}
          >
              <Cloud size={16} /> Bildlagring
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all rounded-xl ${activeTab === 'search' ? 'bg-white shadow-sm text-emerald-900 ring-1 ring-stone-200' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'}`}
          >
              <Search size={16} /> Sökmotor
          </button>
      </div>

      {/* Content */}
      <div className="p-8 min-h-[320px]">
        {activeTab === 'cloudinary' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="p-5 bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-2xl text-sm flex gap-4">
                    <div className="bg-emerald-100 p-2 rounded-lg shrink-0 h-fit text-emerald-600"><Cloud size={20}/></div>
                    <div>
                        <p className="font-bold mb-1 text-base">Cloudinary Integration</p>
                        <p className="text-emerald-800/80 leading-relaxed">Krävs för att skapa publika URL:er. Utan detta sparas bilder lokalt (Base64) vilket gör exportfilen enorm.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="group">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-emerald-600 transition-colors">Cloud Name</label>
                        <div className="relative">
                            <Database size={16} className="absolute left-4 top-3.5 text-stone-400 group-focus-within:text-emerald-600 transition-colors" />
                            <input type="text" value={cloudName} onChange={(e) => { setCloudName(e.target.value); setSaved(false); }} className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-11 pr-4 py-3 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 focus:bg-white outline-none transition-all font-medium text-stone-800" placeholder="t.ex. da7wmiyra" />
                        </div>
                    </div>
                    <div className="group">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-emerald-600 transition-colors">Upload Preset (Unsigned)</label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-4 top-3.5 text-stone-400 group-focus-within:text-emerald-600 transition-colors" />
                            <input type="text" value={uploadPreset} onChange={(e) => { setUploadPreset(e.target.value); setSaved(false); }} className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-11 pr-4 py-3 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 focus:bg-white outline-none transition-all font-medium text-stone-800" placeholder="t.ex. woocom_upload" />
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'search' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-5 bg-amber-50 border border-amber-100 text-amber-900 rounded-2xl text-sm flex items-start gap-4">
                    <div className="bg-amber-100 p-2 rounded-lg shrink-0 text-amber-600"><Check size={20} /></div>
                    <div>
                        <p className="font-bold mb-1 text-base">Google Custom Search (CSE)</p>
                        <p className="text-amber-800/80 leading-relaxed">Nycklar är förifyllda. Detta ger dig 100 gratis sökningar/dag. För obegränsat antal, aktivera fakturering i Google Cloud Console.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="group">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-emerald-600 transition-colors">Google API Key</label>
                        <input type="password" value={googleApiKey} onChange={(e) => { setGoogleApiKey(e.target.value); setSaved(false); }} placeholder="AIza..." className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 focus:bg-white outline-none font-mono text-sm text-stone-600 transition-all" />
                    </div>
                    <div className="group">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-emerald-600 transition-colors">Search Engine ID (CX)</label>
                        <input type="text" value={googleCx} onChange={(e) => { setGoogleCx(e.target.value); setSaved(false); }} placeholder="0123..." className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 focus:bg-white outline-none font-mono text-sm text-stone-600 transition-all" />
                    </div>
                </div>
            </div>
        )}
      </div>

      <div className="p-6 border-t border-stone-100 flex flex-col-reverse sm:flex-row justify-end items-center bg-stone-50 gap-4">
         <button onClick={handleSave} className={`w-full sm:w-auto px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:-translate-y-1 ${saved ? 'bg-stone-200 text-stone-500 cursor-default shadow-none translate-y-0' : 'bg-emerald-900 text-white hover:bg-emerald-800 shadow-emerald-900/20'}`}>
            {saved ? 'Sparad! Återgår till Dashboard...' : 'Spara & Gå till Dashboard'}
         </button>
      </div>
    </div>
  );
};
