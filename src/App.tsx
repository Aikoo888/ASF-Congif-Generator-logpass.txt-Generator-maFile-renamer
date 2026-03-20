import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Code, 
  AlertCircle,
  FileJson,
  CheckCircle2,
  Trash2,
  RefreshCw,
  LayoutGrid,
  FileArchive,
  FolderEdit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

interface Account {
  username: string;
  password: string;
}

const DEFAULT_TEMPLATE = `{
	"Enabled": true,
	"GamesPlayedWhileIdle": [
		1055890,
		1392130,
		3802400,
		2972090
	],
	"RemoteCommunication": 0,
	"SteamLogin": "{{username}}",
	"SteamPassword": "{{password}}"
}`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'config-generator' | 'log-pass-generator' | 'mafile-renamer'>('log-pass-generator');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Converter state
  const [converterInput, setConverterInput] = useState('');
  const [converterSuccess, setConverterSuccess] = useState<string | null>(null);

  // Renamer state
  const [renamerFile, setRenamerFile] = useState<File | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamerError, setRenamerError] = useState<string | null>(null);
  const [renamerSuccess, setRenamerSuccess] = useState<string | null>(null);
  const renamerInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
      
      const parsedAccounts: Account[] = lines.map(line => {
        // Try common delimiters: colon, semicolon, pipe
        const parts = line.split(/[:;|]/);
        if (parts.length >= 2) {
          return {
            username: parts[0].trim(),
            password: parts[1].trim()
          };
        }
        return null;
      }).filter((acc): acc is Account => acc !== null);

      if (parsedAccounts.length === 0) {
        setError('No valid accounts found. Format should be "user:pass".');
        setAccounts([]);
      } else {
        setAccounts(parsedAccounts);
        setSuccess(`${parsedAccounts.length} accounts loaded successfully.`);
      }
    };
    reader.onerror = () => setError('Error reading file.');
    reader.readAsText(file);
  };

  const generateJson = (acc: Account) => {
    // Try to parse as JSON for smart replacement
    try {
      const obj = JSON.parse(template);
      
      const processNode = (node: any) => {
        if (Array.isArray(node)) {
          node.forEach(processNode);
        } else if (node !== null && typeof node === 'object') {
          Object.keys(node).forEach(key => {
            const lowerKey = key.toLowerCase();
            
            // Broad detection for username-like keys (e.g., "username", "SteamLogin", "user_id")
            const isUsernameKey = 
              ['username', 'user', 'login', 'log'].some(k => lowerKey === k || lowerKey.endsWith(k)) ||
              lowerKey.includes('username') || 
              lowerKey.includes('login');

            // Broad detection for password-like keys (e.g., "password", "SteamPassword", "pwd")
            const isPasswordKey = 
              ['password', 'pass', 'pwd', 'secret'].some(k => lowerKey === k || lowerKey.endsWith(k)) ||
              lowerKey.includes('password');

            if (isUsernameKey && typeof node[key] === 'string') {
              node[key] = acc.username;
            } else if (isPasswordKey && typeof node[key] === 'string') {
              node[key] = acc.password;
            } else {
              processNode(node[key]);
            }
          });
        }
      };
      
      processNode(obj);
      let result = JSON.stringify(obj, null, 2);
      
      // Still apply placeholders for any other fields or if smart detection missed something
      return result
        .replace(/{{username}}/g, acc.username)
        .replace(/{{password}}/g, acc.password)
        .replace(/{{logpass}}/g, `${acc.username}:${acc.password}`);
    } catch (e) {
      // Fallback to simple placeholder replacement if template is not valid JSON
      return template
        .replace(/{{username}}/g, acc.username)
        .replace(/{{password}}/g, acc.password)
        .replace(/{{logpass}}/g, `${acc.username}:${acc.password}`);
    }
  };

  const downloadZip = async () => {
    if (accounts.length === 0) return;
    setIsGenerating(true);
    setError(null);

    try {
      const zip = new JSZip();
      accounts.forEach((acc, index) => {
        const jsonContent = generateJson(acc);
        // Use username as filename, or index if username contains invalid chars
        const safeName = acc.username.replace(/[^a-z0-9]/gi, '_').toLowerCase() || `account_${index}`;
        zip.file(`${safeName}.json`, jsonContent);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `accounts_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSuccess('ZIP file created successfully!');
    } catch (err) {
      setError('Error creating ZIP file.');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAll = () => {
    setAccounts([]);
    setFileName(null);
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewJson = accounts.length > 0 ? generateJson(accounts[0]) : '';

  // Converter logic
  const getConvertedLogpass = () => {
    if (!converterInput.trim()) return '';
    const lines = converterInput.split(/\r?\n/).filter(line => line.trim() !== '');
    return lines.map(line => {
      const parts = line.split(/\s+/).filter(p => p.trim() !== '');
      if (parts.length >= 2) {
        return `${parts[0].trim()}:${parts[1].trim()}`;
      }
      return null;
    }).filter(p => p !== null).join('\n');
  };

  const downloadConvertedTxt = () => {
    const output = getConvertedLogpass();
    if (!output) return;

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `converted_logpass_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setConverterSuccess('Logpass file downloaded successfully!');
    setTimeout(() => setConverterSuccess(null), 3000);
  };

  const handleRenamerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      setRenamerError('Please upload a .zip file.');
      return;
    }
    setRenamerFile(file);
    setRenamerError(null);
    setRenamerSuccess(null);
  };

  const processRenaming = async () => {
    if (!renamerFile) return;
    setIsRenaming(true);
    setRenamerError(null);

    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(renamerFile);
      const newZip = new JSZip();
      let count = 0;

      for (const [path, file] of Object.entries(content.files)) {
        if (file.dir) continue;
        
        const fileName = path.split('/').pop() || '';
        let newName = fileName;

        if (fileName.endsWith('.maFile') && fileName.includes('_')) {
          const parts = fileName.split('_');
          if (parts.length > 1) {
            newName = parts.slice(1).join('_');
            count++;
          }
        }

        const fileData = await file.async('blob');
        newZip.file(newName, fileData);
      }

      if (count === 0) {
        setRenamerError('No .maFile files with underscores found to rename.');
        setIsRenaming(false);
        return;
      }

      const blob = await newZip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `renamed_mafiles_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRenamerSuccess(`Successfully renamed ${count} files!`);
    } catch (err) {
      setRenamerError('Error processing ZIP file.');
      console.error(err);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="mb-12 border-b border-line pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileJson className="w-8 h-8" />
              <h1 className="text-3xl font-bold tracking-tight uppercase">ASF Config Generator</h1>
            </div>
          </div>
          
          {/* Tab Switcher */}
          <div className="flex bg-ink/5 p-1 rounded-sm border border-line/10">
            <button 
              onClick={() => setActiveTab('log-pass-generator')}
              className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-all flex items-center gap-2 ${activeTab === 'log-pass-generator' ? 'bg-ink text-bg' : 'hover:bg-ink/10'}`}
            >
              <RefreshCw className="w-3 h-3" />
              log-pass-generator
            </button>
            <button 
              onClick={() => setActiveTab('config-generator')}
              className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-all flex items-center gap-2 ${activeTab === 'config-generator' ? 'bg-ink text-bg' : 'hover:bg-ink/10'}`}
            >
              <LayoutGrid className="w-3 h-3" />
              config-generator
            </button>
            <button 
              onClick={() => setActiveTab('mafile-renamer')}
              className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-all flex items-center gap-2 ${activeTab === 'mafile-renamer' ? 'bg-ink text-bg' : 'hover:bg-ink/10'}`}
            >
              <FolderEdit className="w-3 h-3" />
              mafile-renamer
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'log-pass-generator' ? (
          <motion.div 
            key="log-pass-generator"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Left Column: Input */}
            <div className="space-y-8">
              <section className="border border-line p-6 bg-white/50">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">01</span>
                  <h2 className="text-sm font-bold uppercase tracking-widest">Raw Data Input</h2>
                </div>
                
                <div className="space-y-4">
                  <textarea 
                    value={converterInput}
                    onChange={(e) => setConverterInput(e.target.value)}
                    className="w-full h-[400px] p-4 font-mono text-xs bg-ink text-bg resize-none focus:outline-none"
                    placeholder="Paste data here (e.g. copied from Excel)..."
                  />
                  <div className="bg-ink/5 p-3 text-[10px] font-mono space-y-1">
                    <p className="font-bold uppercase opacity-60 mb-1">Instructions:</p>
                    <p>Paste your data here (e.g. columns copied from Excel).</p>
                    <p>The tool extracts login and password and automatically inserts the <span className="text-blue-600">":"</span> separator.</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Output & Download */}
            <div className="space-y-8">
              <section className="border border-line p-6 bg-white/50 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">02</span>
                  <h2 className="text-sm font-bold uppercase tracking-widest">Logpass Output</h2>
                </div>

                <div className="flex-grow bg-ink text-bg p-4 font-mono text-xs overflow-auto max-h-[400px]">
                  {converterInput.trim() ? (
                    <pre>{getConvertedLogpass()}</pre>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40 italic">
                      Paste data to see converted output
                    </div>
                  )}
                </div>

                <div className="mt-8 space-y-4">
                  <AnimatePresence mode="wait">
                    {converterSuccess && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 bg-green-100 border border-green-200 text-green-700 text-xs"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{converterSuccess}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button 
                    onClick={downloadConvertedTxt}
                    disabled={!converterInput.trim()}
                    className={`
                      w-full py-4 flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all
                      ${converterInput.trim() 
                        ? 'bg-ink text-bg hover:bg-ink/90 cursor-pointer' 
                        : 'bg-ink/20 text-ink/40 cursor-not-allowed'}
                    `}
                  >
                    <Download className="w-5 h-5" />
                    Download .txt File
                  </button>
                </div>
              </section>
            </div>
          </motion.div>
        ) : activeTab === 'config-generator' ? (
          <motion.div 
            key="config-generator"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Left Column: Configuration */}
            <div className="space-y-8">
              {/* Step 1: Upload */}
              <section className="border border-line p-6 bg-white/50">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">01</span>
                  <h2 className="text-sm font-bold uppercase tracking-widest">Logpass Upload</h2>
                </div>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed border-line/20 p-8 text-center cursor-pointer
                    hover:border-line/50 transition-colors group
                    ${fileName ? 'bg-ink/5' : ''}
                  `}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt"
                    className="hidden"
                  />
                  {fileName ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 mb-2" />
                      <span className="font-bold">{fileName}</span>
                      <span className="text-xs opacity-60">{accounts.length} accounts loaded</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); clearAll(); }}
                        className="mt-4 text-xs flex items-center gap-1 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 mb-2 opacity-40 group-hover:opacity-100 transition-opacity" />
                      <span className="font-bold uppercase text-sm">Select File</span>
                      <span className="text-xs opacity-60">logpass.txt (Format: user:pass)</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Step 2: Template */}
              <section className="border border-line p-6 bg-white/50">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">02</span>
                  <h2 className="text-sm font-bold uppercase tracking-widest">JSON Template (Example)</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="relative">
                    <textarea 
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="w-full h-64 p-4 font-mono text-xs bg-ink text-bg resize-none focus:outline-none"
                      placeholder="Enter JSON template here..."
                    />
                    <div className="absolute top-2 right-2 opacity-40">
                      <Code className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Preview & Action */}
            <div className="space-y-8">
              {/* Preview */}
              <section className="border border-line p-6 bg-white/50 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">03</span>
                    <h2 className="text-sm font-bold uppercase tracking-widest">Preview</h2>
                  </div>
                  {accounts.length > 0 && (
                    <span className="text-[10px] font-mono opacity-60 uppercase">
                      Account #1 of {accounts.length}
                    </span>
                  )}
                </div>

                <div className="flex-grow bg-ink text-bg p-4 font-mono text-xs overflow-auto max-h-[400px]">
                  {accounts.length > 0 ? (
                    <pre>{previewJson}</pre>
                  ) : (
                    <div className="h-full flex items-center justify-center opacity-40 italic">
                      Upload a file to see a preview
                    </div>
                  )}
                </div>

                <div className="mt-8 space-y-4">
                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 bg-red-100 border border-red-200 text-red-700 text-xs"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </motion.div>
                    )}
                    {success && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 bg-green-100 border border-green-200 text-green-700 text-xs"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{success}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button 
                    onClick={downloadZip}
                    disabled={accounts.length === 0 || isGenerating}
                    className={`
                      w-full py-4 flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all
                      ${accounts.length > 0 && !isGenerating 
                        ? 'bg-ink text-bg hover:bg-ink/90 cursor-pointer' 
                        : 'bg-ink/20 text-ink/40 cursor-not-allowed'}
                    `}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download ZIP
                      </>
                    )}
                  </button>
                </div>
              </section>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="mafile-renamer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto w-full"
          >
            <section className="border border-line p-8 bg-white/50">
              <div className="flex items-center gap-2 mb-6">
                <span className="font-mono text-xs bg-ink text-bg px-2 py-0.5">01</span>
                <h2 className="text-sm font-bold uppercase tracking-widest">maFile Renamer</h2>
              </div>

              <div className="space-y-6">
                <div 
                  onClick={() => renamerInputRef.current?.click()}
                  className={`
                    border-2 border-dashed border-line/20 p-12 text-center cursor-pointer
                    hover:border-line/50 transition-colors group
                    ${renamerFile ? 'bg-ink/5' : ''}
                  `}
                >
                  <input 
                    type="file" 
                    ref={renamerInputRef}
                    onChange={handleRenamerUpload}
                    accept=".zip"
                    className="hidden"
                  />
                  {renamerFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileArchive className="w-12 h-12 mb-2" />
                      <span className="font-bold">{renamerFile.name}</span>
                      <span className="text-xs opacity-60">Ready to process</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setRenamerFile(null); }}
                        className="mt-4 text-xs flex items-center gap-1 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-12 h-12 mb-2 opacity-40 group-hover:opacity-100 transition-opacity" />
                      <span className="font-bold uppercase text-sm">Select ZIP File</span>
                      <span className="text-xs opacity-60">Contains .maFile files</span>
                    </div>
                  )}
                </div>

                <div className="bg-ink/5 p-4 text-[11px] font-mono space-y-2">
                  <p className="font-bold uppercase opacity-60">Logic:</p>
                  <p>Removes the SteamID prefix from filenames.</p>
                  <p className="italic opacity-60">
                    Example: 76561198728554659_atlas_6827.maFile → atlas_6827.maFile
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {renamerError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-2 p-3 bg-red-100 border border-red-200 text-red-700 text-xs"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{renamerError}</span>
                    </motion.div>
                  )}
                  {renamerSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-2 p-3 bg-green-100 border border-green-200 text-green-700 text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{renamerSuccess}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  onClick={processRenaming}
                  disabled={!renamerFile || isRenaming}
                  className={`
                    w-full py-4 flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all
                    ${renamerFile && !isRenaming 
                      ? 'bg-ink text-bg hover:bg-ink/90 cursor-pointer' 
                      : 'bg-ink/20 text-ink/40 cursor-not-allowed'}
                  `}
                >
                  {isRenaming ? (
                    <>
                      <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Rename & Download ZIP
                    </>
                  )}
                </button>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
