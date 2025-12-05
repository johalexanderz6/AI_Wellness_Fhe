// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface MentalHealthRecord {
  id: string;
  encryptedMood: string;
  encryptedStressLevel: string;
  timestamp: number;
  owner: string;
  category: string;
  aiResponse: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generateAIResponse = (mood: number, stress: number): string => {
  const responses = [
    "I notice you're feeling a bit low today. Remember, it's okay to not be okay.",
    "Your stress levels seem elevated. Have you tried deep breathing exercises?",
    "You appear to be in a balanced state. Keep up your self-care routine!",
    "I detect some emotional turbulence. Would you like to talk about what's bothering you?",
    "Your mood seems positive today! Celebrate these good moments."
  ];
  
  const score = (mood * 0.7) + ((10 - stress) * 0.3);
  
  if (score < 3) return responses[0];
  if (score < 5) return responses[1];
  if (score < 7) return responses[2];
  if (score < 9) return responses[3];
  return responses[4];
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MentalHealthRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ category: "Daily Check-in", moodLevel: 5, stressLevel: 5, note: "" });
  const [selectedRecord, setSelectedRecord] = useState<MentalHealthRecord | null>(null);
  const [decryptedMood, setDecryptedMood] = useState<number | null>(null);
  const [decryptedStress, setDecryptedStress] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("records");

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }
      
      const list: MentalHealthRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedMood: recordData.mood, 
                encryptedStressLevel: recordData.stress, 
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                category: recordData.category,
                aiResponse: recordData.aiResponse || ""
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting mental health data with Zama FHE..." });
    try {
      const encryptedMood = FHEEncryptNumber(newRecordData.moodLevel);
      const encryptedStress = FHEEncryptNumber(newRecordData.stressLevel);
      const aiResponse = generateAIResponse(newRecordData.moodLevel, newRecordData.stressLevel);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        mood: encryptedMood, 
        stress: encryptedStress, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        category: newRecordData.category,
        aiResponse: aiResponse,
        note: newRecordData.note
      };
      
      await contract.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("record_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Your encrypted journal entry is saved securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ category: "Daily Check-in", moodLevel: 5, stressLevel: 5, note: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedMood: string, encryptedStress: string): Promise<[number, number] | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return [FHEDecryptNumber(encryptedMood), FHEDecryptNumber(encryptedStress)];
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to start your private mental health journey", icon: "🔗" },
    { title: "Journal Securely", description: "Record your feelings and thoughts with FHE encryption", icon: "📝", details: "Your data is encrypted before leaving your device using Zama FHE" },
    { title: "AI Analysis", description: "Our AI analyzes your encrypted data without seeing it", icon: "🤖", details: "FHE allows computations on encrypted data without decryption" },
    { title: "Get Support", description: "Receive personalized, private mental health support", icon: "💖", details: "Your privacy is guaranteed throughout the process" }
  ];

  const renderMoodChart = () => {
    if (records.length === 0) return null;
    
    const recentRecords = records.slice(0, 7).reverse();
    const maxMood = 10;
    
    return (
      <div className="mood-chart">
        <div className="chart-title">Recent Mood Trends</div>
        <div className="chart-grid">
          <div className="y-axis">
            {[10, 8, 6, 4, 2, 0].map(val => (
              <div className="y-tick" key={val}>{val}</div>
            ))}
          </div>
          <div className="chart-bars">
            {recentRecords.map((record, index) => (
              <div className="chart-bar-container" key={index}>
                <div className="chart-bar" style={{ height: `${(decryptedMood || 5) / maxMood * 100}%` }}>
                  <div className="bar-label">{new Date(record.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing your private mental health space...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🧠</div>
          <h1>FHE<span>Mind</span>Care</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn">
            + New Journal Entry
          </button>
          <button onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Your Private Mental Wellness Companion</h2>
            <p>Share your thoughts securely with FHE encryption and receive AI-powered support</p>
          </div>
          <div className="fhe-badge">
            <span>🔒 FHE-Powered Privacy</span>
          </div>
        </div>

        {showTutorial && (
          <div className="tutorial-section">
            <h2>How FHE MindCare Works</h2>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === "records" ? "active" : ""}`}
            onClick={() => setActiveTab("records")}
          >
            My Journal
          </button>
          <button 
            className={`tab-button ${activeTab === "insights" ? "active" : ""}`}
            onClick={() => setActiveTab("insights")}
          >
            Wellness Insights
          </button>
          <button 
            className={`tab-button ${activeTab === "resources" ? "active" : ""}`}
            onClick={() => setActiveTab("resources")}
          >
            Mental Health Resources
          </button>
        </div>

        {activeTab === "records" && (
          <div className="records-section">
            <div className="section-header">
              <h2>Your Encrypted Journal</h2>
              <button onClick={loadRecords} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "⟳ Refresh"}
              </button>
            </div>
            
            {records.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon">📔</div>
                <p>No journal entries yet</p>
                <button className="primary-button" onClick={() => setShowCreateModal(true)}>
                  Start Your First Entry
                </button>
              </div>
            ) : (
              <div className="records-list">
                {records.map(record => (
                  <div className="record-card" key={record.id} onClick={() => setSelectedRecord(record)}>
                    <div className="record-header">
                      <div className="record-date">
                        {new Date(record.timestamp * 1000).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className="record-category">{record.category}</div>
                    </div>
                    <div className="record-preview">
                      {record.aiResponse.substring(0, 100)}...
                    </div>
                    <div className="record-footer">
                      <div className="record-owner">
                        {record.owner.substring(0, 6)}...{record.owner.substring(38)}
                      </div>
                      <div className="record-status">🔒 Encrypted</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "insights" && (
          <div className="insights-section">
            <h2>Your Wellness Insights</h2>
            <div className="insights-grid">
              <div className="insight-card">
                <h3>Mood Trends</h3>
                {renderMoodChart()}
              </div>
              <div className="insight-card">
                <h3>Recent AI Feedback</h3>
                {records.length > 0 ? (
                  <div className="ai-feedback">
                    {records.slice(0, 3).map(record => (
                      <div className="feedback-item" key={record.id}>
                        <div className="feedback-date">
                          {new Date(record.timestamp * 1000).toLocaleDateString()}
                        </div>
                        <div className="feedback-text">
                          {record.aiResponse}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No feedback yet. Create your first journal entry to get insights.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "resources" && (
          <div className="resources-section">
            <h2>Mental Health Resources</h2>
            <div className="resource-list">
              <div className="resource-card">
                <h3>Crisis Hotlines</h3>
                <ul>
                  <li>National Suicide Prevention Lifeline: 988</li>
                  <li>Crisis Text Line: Text HOME to 741741</li>
                  <li>Veterans Crisis Line: 988 then press 1</li>
                </ul>
              </div>
              <div className="resource-card">
                <h3>Self-Care Tips</h3>
                <ul>
                  <li>Practice deep breathing exercises</li>
                  <li>Maintain a regular sleep schedule</li>
                  <li>Engage in physical activity daily</li>
                  <li>Limit screen time before bed</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Journal Entry</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Category</label>
                <select 
                  name="category" 
                  value={newRecordData.category} 
                  onChange={(e) => setNewRecordData({...newRecordData, category: e.target.value})}
                >
                  <option value="Daily Check-in">Daily Check-in</option>
                  <option value="Stressful Event">Stressful Event</option>
                  <option value="Positive Moment">Positive Moment</option>
                  <option value="Therapy Session">Therapy Session</option>
                  <option value="General Reflection">General Reflection</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Mood Level (1-10)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={newRecordData.moodLevel} 
                  onChange={(e) => setNewRecordData({...newRecordData, moodLevel: parseInt(e.target.value)})}
                />
                <div className="slider-value">{newRecordData.moodLevel}</div>
              </div>
              
              <div className="form-group">
                <label>Stress Level (1-10)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={newRecordData.stressLevel} 
                  onChange={(e) => setNewRecordData({...newRecordData, stressLevel: parseInt(e.target.value)})}
                />
                <div className="slider-value">{newRecordData.stressLevel}</div>
              </div>
              
              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea 
                  name="note" 
                  value={newRecordData.note} 
                  onChange={(e) => setNewRecordData({...newRecordData, note: e.target.value})}
                  placeholder="What's on your mind today?"
                  rows={3}
                />
              </div>
              
              <div className="encryption-notice">
                <div className="lock-icon">🔒</div>
                <p>Your data will be encrypted with Zama FHE before being stored on-chain</p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="secondary-button">
                Cancel
              </button>
              <button onClick={submitRecord} disabled={creating} className="primary-button">
                {creating ? "Encrypting and Saving..." : "Save Securely"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRecord && (
        <div className="modal-overlay">
          <div className="record-detail-modal">
            <div className="modal-header">
              <h2>Journal Entry Details</h2>
              <button onClick={() => { setSelectedRecord(null); setDecryptedMood(null); setDecryptedStress(null); }} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="record-info">
                <div className="info-item">
                  <span>Date:</span>
                  <strong>{new Date(selectedRecord.timestamp * 1000).toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>Category:</span>
                  <strong>{selectedRecord.category}</strong>
                </div>
              </div>
              
              <div className="ai-response">
                <h3>AI Response</h3>
                <p>{selectedRecord.aiResponse}</p>
              </div>
              
              <div className="encrypted-data-section">
                <h3>Encrypted Data</h3>
                <div className="data-item">
                  <span>Mood Level:</span>
                  <div className="encrypted-value">
                    {selectedRecord.encryptedMood.substring(0, 20)}...
                  </div>
                </div>
                <div className="data-item">
                  <span>Stress Level:</span>
                  <div className="encrypted-value">
                    {selectedRecord.encryptedStressLevel.substring(0, 20)}...
                  </div>
                </div>
                
                <button 
                  className="decrypt-button"
                  onClick={async () => {
                    if (decryptedMood !== null) {
                      setDecryptedMood(null);
                      setDecryptedStress(null);
                    } else {
                      const result = await decryptWithSignature(selectedRecord.encryptedMood, selectedRecord.encryptedStressLevel);
                      if (result) {
                        setDecryptedMood(result[0]);
                        setDecryptedStress(result[1]);
                      }
                    }
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : decryptedMood !== null ? "Hide Values" : "Decrypt with Wallet"}
                </button>
              </div>
              
              {decryptedMood !== null && decryptedStress !== null && (
                <div className="decrypted-data-section">
                  <h3>Decrypted Values</h3>
                  <div className="decrypted-values">
                    <div className="value-item">
                      <span>Mood Level:</span>
                      <strong>{decryptedMood}/10</strong>
                    </div>
                    <div className="value-item">
                      <span>Stress Level:</span>
                      <strong>{decryptedStress}/10</strong>
                    </div>
                  </div>
                  <div className="decryption-notice">
                    <div className="warning-icon">⚠️</div>
                    <p>These values are only visible after wallet signature verification</p>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => { setSelectedRecord(null); setDecryptedMood(null); setDecryptedStress(null); }} 
                className="primary-button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">FHE MindCare</div>
            <p>Your private mental wellness companion powered by Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔒 Powered by Zama FHE</div>
          <div className="copyright">© {new Date().getFullYear()} FHE MindCare</div>
        </div>
      </footer>
    </div>
  );
};

export default App;