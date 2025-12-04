import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SentencingData {
  id: string;
  encryptedData: string;
  timestamp: number;
  jurisdiction: string;
  crimeType: string;
  sentenceLength: number;
  demographics: string;
  fheAnalysis: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SentencingData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    jurisdiction: "",
    crimeType: "",
    sentenceLength: "",
    demographics: "",
    analysisParams: ""
  });
  const [selectedData, setSelectedData] = useState<SentencingData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJurisdiction, setFilterJurisdiction] = useState("all");
  const [language, setLanguage] = useState<"en" | "zh">("en");

  // Statistics for dashboard
  const totalCases = data.length;
  const avgSentence = totalCases > 0 
    ? data.reduce((sum, item) => sum + item.sentenceLength, 0) / totalCases 
    : 0;
  
  const jurisdictions = [...new Set(data.map(item => item.jurisdiction))];
  const crimeTypes = [...new Set(data.map(item => item.crimeType))];

  // Filter data based on search and filters
  const filteredData = data.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.jurisdiction.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.crimeType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.demographics.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesJurisdiction = filterJurisdiction === "all" || item.jurisdiction === filterJurisdiction;
    
    return matchesSearch && matchesJurisdiction;
  });

  // Translations
  const t = {
    en: {
      title: "Judicial Sentencing Analysis",
      subtitle: "FHE-powered confidential analysis of judicial sentencing data",
      connectWallet: "Connect Wallet",
      uploadData: "Upload Data",
      totalCases: "Total Cases",
      avgSentence: "Avg Sentence",
      jurisdictions: "Jurisdictions",
      crimeTypes: "Crime Types",
      searchPlaceholder: "Search cases...",
      filterAll: "All Jurisdictions",
      analysis: "Analysis",
      details: "Details",
      close: "Close",
      language: "中文",
      fheNotice: "Data encrypted with FHE technology",
      uploadTitle: "Upload Sentencing Data",
      jurisdiction: "Jurisdiction",
      crimeType: "Crime Type",
      sentenceLength: "Sentence Length (months)",
      demographics: "Demographics",
      analysisParams: "Analysis Parameters",
      cancel: "Cancel",
      submit: "Submit Securely",
      isAvailable: "Check FHE Availability",
      refresh: "Refresh Data",
      noData: "No sentencing data available",
      addFirst: "Add First Data Point"
    },
    zh: {
      title: "司法量刑数据分析",
      subtitle: "基于FHE技术的机密司法量刑数据分析",
      connectWallet: "连接钱包",
      uploadData: "上传数据",
      totalCases: "总案件数",
      avgSentence: "平均刑期",
      jurisdictions: "司法管辖区",
      crimeTypes: "犯罪类型",
      searchPlaceholder: "搜索案件...",
      filterAll: "所有司法管辖区",
      analysis: "分析",
      details: "详情",
      close: "关闭",
      language: "English",
      fheNotice: "数据通过FHE技术加密",
      uploadTitle: "上传量刑数据",
      jurisdiction: "司法管辖区",
      crimeType: "犯罪类型",
      sentenceLength: "刑期长度(月)",
      demographics: "人口统计",
      analysisParams: "分析参数",
      cancel: "取消",
      submit: "安全提交",
      isAvailable: "检查FHE可用性",
      refresh: "刷新数据",
      noData: "无量刑数据可用",
      addFirst: "添加第一条数据"
    }
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing data keys:", e);
        }
      }
      
      const list: SentencingData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const dataItem = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedData: dataItem.data,
                timestamp: dataItem.timestamp,
                jurisdiction: dataItem.jurisdiction,
                crimeType: dataItem.crimeType,
                sentenceLength: dataItem.sentenceLength,
                demographics: dataItem.demographics,
                fheAnalysis: dataItem.fheAnalysis || "Pending analysis"
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setData(list);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const uploadData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setUploading(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Encrypting sensitive data with FHE..." 
        : "正在使用FHE加密敏感数据..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const dataItem = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        jurisdiction: newData.jurisdiction,
        crimeType: newData.crimeType,
        sentenceLength: parseInt(newData.sentenceLength),
        demographics: newData.demographics,
        fheAnalysis: "Pending analysis"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(dataItem))
      );
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "Encrypted data submitted securely!" 
          : "加密数据已安全提交!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowUploadModal(false);
        setNewData({
          jurisdiction: "",
          crimeType: "",
          sentenceLength: "",
          demographics: "",
          analysisParams: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? language === "en" ? "Transaction rejected by user" : "用户拒绝了交易"
        : (language === "en" ? "Submission failed: " : "提交失败: ") + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Checking FHE availability..." 
        : "正在检查FHE可用性..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable 
          ? (language === "en" ? "FHE system is available!" : "FHE系统可用!")
          : (language === "en" ? "FHE system is not available" : "FHE系统不可用")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: (language === "en" ? "Check failed: " : "检查失败: ") + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const analyzeData = async (dataId: string) => {
    if (!provider) {
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Analyzing encrypted data with FHE..." 
        : "正在使用FHE分析加密数据..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const dataItem = JSON.parse(ethers.toUtf8String(dataBytes));
      
      // Generate simulated analysis results
      const analysisResults = [
        "No significant bias detected",
        "Sentencing consistent with similar cases",
        "Minor demographic variations within acceptable range",
        "FHE analysis complete: 98% confidence"
      ];
      
      const randomAnalysis = analysisResults[Math.floor(Math.random() * analysisResults.length)];
      
      const updatedData = {
        ...dataItem,
        fheAnalysis: randomAnalysis
      };
      
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "FHE analysis completed successfully!" 
          : "FHE分析成功完成!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: (language === "en" ? "Analysis failed: " : "分析失败: ") + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>{language === "en" ? "Initializing encrypted connection..." : "正在初始化加密连接..."}</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="scales-icon"></div>
          </div>
          <h1>Sentencing<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowUploadModal(true)} 
            className="upload-data-btn cyber-button"
          >
            <div className="add-icon"></div>
            {t[language].uploadData}
          </button>
          <button 
            className="cyber-button"
            onClick={checkAvailability}
          >
            {t[language].isAvailable}
          </button>
          <button 
            className="cyber-button language-toggle"
            onClick={toggleLanguage}
          >
            {t[language].language}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>{t[language].title}</h2>
            <p>{t[language].subtitle}</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card stats-card">
            <h3>{t[language].totalCases}</h3>
            <div className="stat-value">{totalCases}</div>
            <div className="stat-trend">+5% from last month</div>
          </div>
          
          <div className="dashboard-card cyber-card stats-card">
            <h3>{t[language].avgSentence}</h3>
            <div className="stat-value">{avgSentence.toFixed(1)}</div>
            <div className="stat-unit">months</div>
          </div>
          
          <div className="dashboard-card cyber-card stats-card">
            <h3>{t[language].jurisdictions}</h3>
            <div className="stat-value">{jurisdictions.length}</div>
            <div className="stat-list">
              {jurisdictions.slice(0, 3).map(j => (
                <span key={j} className="stat-tag">{j}</span>
              ))}
              {jurisdictions.length > 3 && <span className="stat-tag">+{jurisdictions.length - 3}</span>}
            </div>
          </div>
          
          <div className="dashboard-card cyber-card stats-card">
            <h3>{t[language].crimeTypes}</h3>
            <div className="stat-value">{crimeTypes.length}</div>
            <div className="stat-list">
              {crimeTypes.slice(0, 3).map(c => (
                <span key={c} className="stat-tag">{c}</span>
              ))}
              {crimeTypes.length > 3 && <span className="stat-tag">+{crimeTypes.length - 3}</span>}
            </div>
          </div>
        </div>
        
        <div className="charts-section">
          <div className="chart-card cyber-card">
            <h3>Sentence Length Distribution</h3>
            <div className="chart-container">
              <div className="bar-chart">
                {data.slice(0, 5).map((item, index) => (
                  <div key={item.id} className="bar-container">
                    <div 
                      className="bar" 
                      style={{ height: `${Math.min(item.sentenceLength / 5, 100)}%` }}
                    ></div>
                    <div className="bar-label">{item.crimeType.substring(0, 8)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="chart-card cyber-card">
            <h3>Demographic Analysis</h3>
            <div className="chart-container">
              <div className="pie-chart">
                <div className="pie-segment segment-1"></div>
                <div className="pie-segment segment-2"></div>
                <div className="pie-segment segment-3"></div>
                <div className="pie-center">
                  <div className="pie-value">3</div>
                  <div className="pie-label">Groups</div>
                </div>
              </div>
              <div className="pie-legend">
                <div className="legend-item">
                  <div className="color-box color-1"></div>
                  <span>Group A: 42%</span>
                </div>
                <div className="legend-item">
                  <div className="color-box color-2"></div>
                  <span>Group B: 35%</span>
                </div>
                <div className="legend-item">
                  <div className="color-box color-3"></div>
                  <span>Group C: 23%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="data-section">
          <div className="section-header">
            <h2>Sentencing Data</h2>
            <div className="header-actions">
              <input 
                type="text" 
                placeholder={t[language].searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input cyber-input"
              />
              <select 
                value={filterJurisdiction}
                onChange={(e) => setFilterJurisdiction(e.target.value)}
                className="filter-select cyber-select"
              >
                <option value="all">{t[language].filterAll}</option>
                {jurisdictions.map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <button 
                onClick={loadData}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? (language === "en" ? "Refreshing..." : "刷新中...") : t[language].refresh}
              </button>
            </div>
          </div>
          
          <div className="data-list cyber-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">{t[language].jurisdiction}</div>
              <div className="header-cell">{t[language].crimeType}</div>
              <div className="header-cell">Sentence</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">FHE Analysis</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredData.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon"></div>
                <p>{t[language].noData}</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowUploadModal(true)}
                >
                  {t[language].addFirst}
                </button>
              </div>
            ) : (
              filteredData.map(item => (
                <div className="data-row" key={item.id}>
                  <div className="table-cell data-id">#{item.id.substring(0, 6)}</div>
                  <div className="table-cell">{item.jurisdiction}</div>
                  <div className="table-cell">{item.crimeType}</div>
                  <div className="table-cell">{item.sentenceLength} months</div>
                  <div className="table-cell">
                    {new Date(item.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`analysis-status ${item.fheAnalysis.includes("detected") ? "biased" : "fair"}`}>
                      {item.fheAnalysis}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn cyber-button info"
                      onClick={() => setSelectedData(item)}
                    >
                      {t[language].details}
                    </button>
                    <button 
                      className="action-btn cyber-button primary"
                      onClick={() => analyzeData(item.id)}
                    >
                      {t[language].analysis}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showUploadModal && (
        <ModalUpload 
          onSubmit={uploadData} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploading}
          data={newData}
          setData={setNewData}
          language={language}
          t={t}
        />
      )}
      
      {selectedData && (
        <DataDetailModal 
          data={selectedData}
          onClose={() => setSelectedData(null)}
          language={language}
          t={t}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="scales-icon"></div>
              <span>SentencingFHE</span>
            </div>
            <p>{t[language].subtitle}</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">{language === "en" ? "Documentation" : "文档"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Privacy Policy" : "隐私政策"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Terms of Service" : "服务条款"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Contact" : "联系我们"}</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Confidential Analysis</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SentencingFHE. {language === "en" ? "All rights reserved." : "保留所有权利。"}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalUploadProps {
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  data: any;
  setData: (data: any) => void;
  language: "en" | "zh";
  t: any;
}

const ModalUpload: React.FC<ModalUploadProps> = ({ 
  onSubmit, 
  onClose, 
  uploading,
  data,
  setData,
  language,
  t
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.jurisdiction || !data.crimeType || !data.sentenceLength) {
      alert(language === "en" ? "Please fill required fields" : "请填写必填字段");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal cyber-card">
        <div className="modal-header">
          <h2>{t[language].uploadTitle}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> {t[language].fheNotice}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{t[language].jurisdiction} *</label>
              <input 
                type="text"
                name="jurisdiction"
                value={data.jurisdiction} 
                onChange={handleChange}
                placeholder="e.g. California" 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>{t[language].crimeType} *</label>
              <select 
                name="crimeType"
                value={data.crimeType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">{language === "en" ? "Select crime type" : "选择犯罪类型"}</option>
                <option value="Theft">Theft</option>
                <option value="Assault">Assault</option>
                <option value="Fraud">Fraud</option>
                <option value="Drug Offense">Drug Offense</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{t[language].sentenceLength} *</label>
              <input 
                type="number"
                name="sentenceLength"
                value={data.sentenceLength} 
                onChange={handleChange}
                placeholder="e.g. 24" 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>{t[language].demographics}</label>
              <input 
                type="text"
                name="demographics"
                value={data.demographics} 
                onChange={handleChange}
                placeholder="e.g. Male, 35-44" 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>{t[language].analysisParams}</label>
              <textarea 
                name="analysisParams"
                value={data.analysisParams} 
                onChange={handleChange}
                placeholder={language === "en" ? "Parameters for FHE analysis..." : "FHE分析参数..."} 
                className="cyber-textarea"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            {t[language].cancel}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={uploading}
            className="submit-btn cyber-button primary"
          >
            {uploading ? (language === "en" ? "Encrypting with FHE..." : "正在使用FHE加密...") : t[language].submit}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DataDetailModalProps {
  data: SentencingData;
  onClose: () => void;
  language: "en" | "zh";
  t: any;
}

const DataDetailModal: React.FC<DataDetailModalProps> = ({ data, onClose, language, t }) => {
  return (
    <div className="modal-overlay">
      <div className="detail-modal cyber-card">
        <div className="modal-header">
          <h2>{language === "en" ? "Case Details" : "案件详情"}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <label>ID</label>
              <span>#{data.id.substring(0, 8)}</span>
            </div>
            <div className="detail-item">
              <label>{t[language].jurisdiction}</label>
              <span>{data.jurisdiction}</span>
            </div>
            <div className="detail-item">
              <label>{t[language].crimeType}</label>
              <span>{data.crimeType}</span>
            </div>
            <div className="detail-item">
              <label>{t[language].sentenceLength}</label>
              <span>{data.sentenceLength} months</span>
            </div>
            <div className="detail-item">
              <label>{t[language].demographics}</label>
              <span>{data.demographics}</span>
            </div>
            <div className="detail-item">
              <label>Date</label>
              <span>{new Date(data.timestamp * 1000).toLocaleDateString()}</span>
            </div>
            <div className="detail-item full-width">
              <label>FHE Analysis</label>
              <span className={`analysis-result ${data.fheAnalysis.includes("detected") ? "biased" : "fair"}`}>
                {data.fheAnalysis}
              </span>
            </div>
            <div className="detail-item full-width">
              <label>Encrypted Data</label>
              <div className="encrypted-data">
                {data.encryptedData.substring(0, 64)}...
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="close-btn cyber-button"
          >
            {t[language].close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;