import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { 
    FiUpload, FiFileText, FiUser, FiMessageSquare, FiAward, 
    FiBarChart2, FiBriefcase, FiEdit, FiSearch, FiAlertCircle
} from 'react-icons/fi';
import './App.css';

const EmptyState = () => (
  <div className="empty-state">
    <div className="empty-state-icon-wrapper">
      <FiSearch />
    </div>
    <h2>Prêt à trouver le talent parfait ?</h2>
    <p>Remplissez le formulaire avec la description de poste et téléchargez les CVs pour commencer l'analyse de compatibilité.</p>
    <div className="steps-container">
      <div className="step">
        <FiEdit />
        <span>Décrivez le poste</span>
      </div>
      <div className="step">
        <FiUpload />
        <span>Téléchargez les CVs</span>
      </div>
      <div className="step">
        <FiBarChart2 />
        <span>Obtenez l'analyse</span>
      </div>
    </div>
  </div>
);

const Dropzone = ({ onFilesAdded }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragActive(true);
    else if (e.type === 'dragleave') setIsDragActive(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragActive(false);
    if (e.dataTransfer.files?.length) onFilesAdded(e.dataTransfer.files);
  }, [onFilesAdded]);
  const handleFileSelect = (e) => {
    if (e.target.files?.length) onFilesAdded(e.target.files);
    e.target.value = null;
  };
  return (
    <div className={`dropzone ${isDragActive ? 'active' : ''}`}
      onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
      onClick={() => document.getElementById('file-input').click()}>
      <input type="file" id="file-input" multiple onChange={handleFileSelect} style={{ display: 'none' }} accept=".pdf,.docx,.txt" />
      <FiUpload className="upload-icon" />
      <p><b>Glissez et déposez vos fichiers ici</b></p>
      <p>ou cliquez pour sélectionner</p>
      <span className="file-types">PDF, DOC, DOCX jusqu'à 10MB chacun</span>
    </div>
  );
};

const CandidateCard = ({ candidate }) => {
    const getScoreColor = (score) => {
        if (score >= 80) return 'var(--success-color)';
        if (score >= 60) return 'var(--warning-color)';
        return 'var(--error-color)';
    };
    return (
        <div className="candidate-card" style={{ borderLeftColor: getScoreColor(candidate.score) }}>
            <div className="card-header">
                <div className="candidate-info">
                    <FiUser /><h3>{candidate.candidate_name}</h3>
                </div>
                <div className="score-badge" style={{ backgroundColor: getScoreColor(candidate.score), color: '#000' }}>
                    {candidate.score}%
                </div>
            </div>
            <div className="card-section">
                <h4><FiMessageSquare /> Synthèse par l'IA</h4>
                <p className="summary">{candidate.summary}</p>
            </div>
            <div className="card-section">
                <h4><FiAward /> Critères d'évaluation</h4>
                <div className="details-grid">
                    {Object.entries(candidate.details).filter(([key]) => key !== 'totalScore' && key !== 'common_skills').map(([key, value]) => (
                        <div key={key} className="detail-item">
                            <strong>{key.replace(/_/g, ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase())}</strong>
                            <span>{value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const SkeletonCard = () => (
    <div className="candidate-card skeleton-card">
      <div className="skeleton-line" style={{ width: '80%', height: '24px' }}></div>
      <div className="skeleton-line" style={{ width: '50%', height: '18px' }}></div>
      <div className="skeleton-block" style={{ height: '80px', marginTop: '1rem' }}></div>
      <div className="skeleton-line" style={{ width: '60%', height: '18px' }}></div>
      <div className="skeleton-block" style={{ height: '100px', marginTop: '1rem' }}></div>
    </div>
);

function App() {
  const [jobDescription, setJobDescription] = useState('');
  const [cvFiles, setCvFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleFilesAdded = (files) => {
    const fileArray = Array.from(files);
    const newFiles = fileArray.filter(file => !cvFiles.some(f => f.name === file.name && f.size === file.size));
    setCvFiles(prev => [...prev, ...newFiles]);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jobDescription || cvFiles.length === 0) {
      setError('Veuillez fournir une description de poste et au moins un CV.');
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setError('');
    setResults([]);

    const formData = new FormData();
    formData.append('job_description', jobDescription);
    cvFiles.forEach(file => formData.append('cvs', file));

    try {
      const response = await axios.post('http://localhost:8000/analyze/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const sortedResults = response.data.sort((a, b) => b.score - a.score);
      setResults(sortedResults);
    } catch (err) {
      setError('Une erreur est survenue lors de l\'analyse. Veuillez vérifier que le serveur backend est bien lancé.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const renderResults = () => {
    if (isLoading) return Array.from({ length: cvFiles.length || 3 }).map((_, index) => <SkeletonCard key={index} />);
    if (error) return <div className="state-display error-state"><FiAlertCircle className="icon" /><h3>Oops! Une erreur est survenue.</h3><p>{error}</p></div>;
    if (results.length > 0) return results.map((candidate, index) => <CandidateCard key={index} candidate={candidate} />);
    if (hasSearched) return <div className="state-display"><FiSearch className="icon" /><h3>Aucun profil correspondant</h3><p>L'analyse s'est terminée, mais aucun candidat pertinent n'a été identifié pour ce poste.</p></div>;
    
    return <EmptyState />;
  };

  return (
    <div className="app-container">
        <header className="app-header">
            <div className="logo">
                <div className="logo-icon-wrapper">
                    <FiBarChart2 />
                </div>
                <div className="logo-text">
                    {/* --- BRANDING MIS À JOUR --- */}
                    <h1>RH-PRO</h1>
                    <span>Votre assistant idéal</span>
                </div>
            </div>
        </header>
        <main className="main-content">
            <aside className="form-panel">
                <form onSubmit={handleSubmit}>
                    <div className="form-section">
                        <h2><FiBriefcase /> Description de Poste</h2>
                        <textarea
                            placeholder="Collez ici la description complète du poste à pourvoir..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            required
                        />
                        <p className="helper-text">Incluez les compétences requises, l'expérience et les qualifications.</p>
                    </div>
                    <div className="form-section">
                        <h2><FiFileText /> CVs des Candidats</h2>
                        <Dropzone onFilesAdded={handleFilesAdded} />
                         {cvFiles.length > 0 && (
                            <div className="file-list">
                                {cvFiles.map((file, i) => <span key={i} className="file-tag">{file.name}</span>)}
                            </div>
                        )}
                    </div>
                    <button type="submit" className="submit-button" disabled={isLoading || !jobDescription || cvFiles.length === 0}>
                        <FiBarChart2 />
                        {isLoading ? 'Analyse en cours...' : 'Analyser la Compatibilité'}
                    </button>
                </form>
            </aside>
            <section className="results-panel">
                {renderResults()}
            </section>
        </main>
    </div>
  );
}

export default App;