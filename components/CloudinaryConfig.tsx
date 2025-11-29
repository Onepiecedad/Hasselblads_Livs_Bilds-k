
import React, { useState, useEffect } from 'react';
import { Cloud, ExternalLink, ArrowRight, Search, Settings, Check } from 'lucide-react';
import { setCloudinaryConfig, isCloudinaryConfigured } from '../cloudinaryService';
import { setSearchConfig } from '../geminiService';

interface CloudinaryConfigProps {
  onConfigured: () => void;
  onSkip: () => void;
}

// Uppdaterade med dina nycklar från skärmdumparna
// OBS: Rättat stavfel Alza -> AIza (Stort i)
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
    
    // Använd sparade nycklar om de finns, annars dina nya defaults
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
  };

  const handleContinue = () => {
      if(isCloudinaryConfigured()) onConfigured();
  };

  return (
    <div className="max-w-2xl mx-auto mt-6 md:mt-10 bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
      <div className="bg-emerald-900 p-5 md:p-8 text-white flex items-center gap-4">
         <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-amber-400">
            <Settings size={24} />
         </div>
         <div>
            <h3 className="text-xl md:text-2xl font-bold serif-font">Systemkonfiguration</h3>
            <p className="text-emerald-200/80 text-sm md:text-base">Koppla dina tjänster för bildhantering.</p>
         </div>
      </div>

      <div className="flex border-b border-stone-200 bg-stone-50">
          <button 
            onClick={() => setActiveTab('cloudinary')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeTab === 'cloudinary' ? 'border-b-2 border-emerald-600 text-emerald-900 bg-white' : 'text-stone-400 hover:text-stone-600'}`}
          >
              <Cloud size={18} /> Bildlagring
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeTab === 'search' ? 'border-b-2 border-emerald-600 text-emerald-900 bg-white' : 'text-stone-400 hover:text-stone-600'}`}
          >
              <Search size={18} /> Sökmotor
          </button>
      </div>

      <div className="p-5 md:p-8 min-h-[300px]">
        {activeTab === 'cloudinary' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-xl text-sm">
                    <p className="font-bold mb-1">Cloudinary Integration</p>
                    <p className="text-emerald-800/80">Krävs för att skapa publika URL:er som WooCommerce kan importera.</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Cloud Name</label>
                    <input type="text" value={cloudName} onChange={(e) => { setCloudName(e.target.value); setSaved(false); }} className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium text-stone-800" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Upload Preset (Unsigned)</label>
                    <input type="text" value={uploadPreset} onChange={(e) => { setUploadPreset(e.target.value); setSaved(false); }} className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium text-stone-800" />
                </div>
            </div>
        )}

        {activeTab === 'search' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-4 bg-amber-50 border border-amber-100 text-amber-900 rounded-xl text-sm flex items-start gap-3">
                    <Check size={18} className="mt-0.5 text-amber-600" />
                    <div>
                        <p className="font-bold mb-1">Google Custom Search (CSE)</p>
                        <p className="text-amber-800/80">Dina egna nycklar är nu inlagda. Detta ger dig 100 gratis sökningar/dag (eller mer om du aktiverat billing).</p>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Google API Key</label>
                    <input type="password" value={googleApiKey} onChange={(e) => { setGoogleApiKey(e.target.value); setSaved(false); }} placeholder="AIza..." className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm text-stone-600" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Search Engine ID (CX)</label>
                    <input type="text" value={googleCx} onChange={(e) => { setGoogleCx(e.target.value); setSaved(false); }} placeholder="0123..." className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm text-stone-600" />
                </div>
            </div>
        )}
      </div>

      <div className="p-6 border-t border-stone-100 flex flex-col-reverse sm:flex-row justify-between items-center bg-stone-50 gap-4">
         <button onClick={handleSave} className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold transition-colors ${saved ? 'bg-stone-200 text-stone-500 cursor-default' : 'bg-emerald-900 text-white hover:bg-emerald-800'}`}>
            {saved ? 'Inställningar sparade' : 'Spara ändringar'}
         </button>

         <button onClick={handleContinue} disabled={!isCloudinaryConfigured()} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-amber-200 transition-all hover:-translate-y-0.5">
            Starta Appen <ArrowRight size={20} />
         </button>
      </div>
    </div>
  );
};
