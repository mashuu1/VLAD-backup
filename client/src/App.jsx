import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://vlad-trends-backend.shares.zrok.io';
import { getDifficulty } from './difficulty_map';
import { downloadScheduleAsPNG } from './pdfUtils';


function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Send a POST request to the backend with the user's Gbox email/pass.
      const res = await axios.post(`${API_BASE_URL}/api/sync-gbox`, { email, password });
      if (res.status === 200) {
        sessionStorage.removeItem('vlad_initial_scrape_done');
        navigate('/success');
      }
    } catch (err) {
      console.error(err);
      // Wait for 2 seconds to simulate handshake then alert for testing phase 1 when backend is off
      setTimeout(() => {
        setLoading(false);
        if (err.message.includes('Network Error')) {
          alert('Phase 1 is complete! Backend is not connected yet, tell me to proceed to Phase 2.');
        }
      }, 2000);
    }
  };

  return (
    <div className="app-container">
      <h2>VLAD</h2>
      <form onSubmit={handleLogin}>
        <div className="input-group">
          <label>GBox Email</label>
          <input 
            type="email" 
            placeholder="you@gbox.adnu.edu.ph"
            required 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
          />
        </div>
        <div className="input-group">
          <label>Password</label>
          <div className="password-wrapper" style={{ position: 'relative' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="••••••••"
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              style={{ width: '100%', paddingRight: '40px' }}
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b'
              }}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>
        <button type="submit" className="login-btn">Login with Gbox</button>
      </form>

      {loading && (
        <div className="overlay">
          <div className="spinner"></div>
          <h3>Handshake in progress...</h3>
        </div>
      )}
    </div>
  );
}

const ADNU_TRIVIAS = [
  "The 4 Pillars: The iconic pillars of the Burns Hall (and the high school building) symbolize the university's '4 Cs': Competence, Conscience, Compassionate Commitment to Change, and Christ-Centeredness.",
  "The Golden Knight: AdNU is the only Ateneo school to use the Golden Knight as its mascot, representing the soldierly and chivalrous roots of Saint Ignatius of Loyola.",
  "The First in Bicol: Established in 1940, it was the first Jesuit school in the Bicol region, originally founded as an all-boys high school.",
  "WWII Garrison: During World War II, the Japanese army used the campus as a garrison and prison, making it a site of significant historical weight.",
  "University Status: It officially gained university status on November 11, 1998, with Fr. Raul Bonoan, SJ, as its first University President.",
  "Primum Regnum Dei: The university motto, which you’ll see everywhere, means 'First the Kingdom of God,' emphasizing the priority of spiritual and social missions.",
  "The Six Stars: If you look closely at the university seal, the six stars represent the six provinces of the Bicol Region: Albay, Camarines Norte, Camarines Sur, Catanduanes, Masbate, and Sorsogon.",
  "Animation Pioneer: AdNU is widely recognized as one of the pioneers of digital animation education in the Philippines, with its graduates often working on major international films.",
  "The O’Brien Library: The library is named after Fr. James J. O’Brien, SJ, a legendary Jesuit who dedicated much of his life to documenting and preserving Bicolano culture and folklore.",
"John Philip Sousa's March: The school’s 'Regnum Dei' march actually uses a melody composed by the famous American 'March King,' John Philip Sousa.",
  "The First Co-eds: It took 13 years for the school to go co-ed; the college department admitted its first five female students in 1953.",
  "The Church of Christ the King: This campus landmark is famous for its modern architecture and the statue of Christ that serves as a focal point for the university community.",
  "Autonomous Excellence: In 2008, AdNU became the first university in Southern Luzon to be granted Full Autonomous Status by CHED.",
  "Blue and Gold: Unlike the blue-and-white of Manila, AdNU uses Blue and Gold to symbolize the 'Ateneo blue' tradition combined with the excellence and chivalry of the Golden Knight.",
  "The Alingal Hall: Named after Fr. Godofredo Alingal, SJ, this building honors a Jesuit priest who was a prominent activist for the poor and a martyr during the Martial Law period."
];

// Reusable Questionnaire Component
// Helper to parse schedule strings for the calendar view
function parseTimeStr(timeStr, ampm) {
  let [h, m] = timeStr.split(':').map(Number);
  const period = ampm.toUpperCase();
  if (period === 'NN') {
    // NN = Noon → treat 12:00 as 12:00 PM
    return 12 * 60 + m;
  }
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function normalizeScheduleStr(raw) {
  let s = (raw || '').toUpperCase();
  // Expand common ranges FIRST (before individual day replacement)
  s = s.replace(/M-TH/g, 'MTWH');
  s = s.replace(/M-SU/g, 'MTWHFS');
  s = s.replace(/M-F/g, 'MTWHF');
  s = s.replace(/M-S(?!U)/g, 'MTWHFS');
  s = s.replace(/T-TH/g, 'TWH');
  
  // Normalize full day names to single-letter codes
  s = s.replace(/\bTHU(?:RS(?:DAY)?)?\b/g, 'H');
  s = s.replace(/\bTUE(?:S(?:DAY)?)?\b/g, 'T');
  s = s.replace(/\bMON(?:DAY)?\b/g, 'M');
  s = s.replace(/\bWED(?:NES(?:DAY)?)?\b/g, 'W');
  s = s.replace(/\bFRI(?:DAY)?\b/g, 'F');
  s = s.replace(/\bSUN(?:DAY)?\b/g, 'SU');
  s = s.replace(/\bSAT(?:UR(?:DAY)?)?\b/g, 'S');
  return s;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function WeeklyCalendar({ schedule, id }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const times = [];
  for (let h = 7; h <= 21; h++) {
    times.push(`${h === 12 ? 12 : h % 12}:00 ${h >= 12 ? 'PM' : 'AM'}`);
    times.push(`${h === 12 ? 12 : h % 12}:30 ${h >= 12 ? 'PM' : 'AM'}`);
  }

    const sessions = useMemo(() => {
    const all = [];
    const seenSessions = new Set();

    schedule.forEach(unit => {
      unit.forEach(row => {
        const raw = row.schedule_raw;
        if (!raw || raw === 'TBA') return;
        const normalized = normalizeScheduleStr(raw);
        const parts = normalized.split('/').map(p => p.trim());
        parts.forEach(part => {
          // Robust regex for varied formats: "MTW 08:00 AM - 09:30 AM" or "M 11:00-12:00 PM"
          const match = part.match(/([MTWHFS]+)\s+(\d{1,2}:\d{2})\s*(AM|PM|NN)?\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM|NN)/i);
          if (match) {
            const daysRaw = match[1];
            const endAMPM = match[5].toUpperCase();
            const startAMPMRaw = (match[3] || '').toUpperCase();
            
            const endM = parseTimeStr(match[4], endAMPM);
            let startM = parseTimeStr(match[2], startAMPMRaw || endAMPM);

            // Heuristic for omitted AM/PM (e.g., "11:00 - 12:00 PM" -> 11:00 AM to 12:00 PM)
            if (!startAMPMRaw && startM > endM) {
              const altStartM = parseTimeStr(match[2], endAMPM === 'PM' ? 'AM' : 'PM');
              if (altStartM < endM) startM = altStartM;
            }
            
            const activeDays = [];
            if (daysRaw.includes('M')) activeDays.push('Mon');
            if (daysRaw.includes('T')) activeDays.push('Tue');
            if (daysRaw.includes('W')) activeDays.push('Wed');
            if (daysRaw.includes('H')) activeDays.push('Thu');
            if (daysRaw.includes('F')) activeDays.push('Fri');
            if (daysRaw.includes('S')) activeDays.push('Sat');

            activeDays.forEach(d => {
              const sessionKey = `${row.course_code}-${d}-${startM}-${endM}`;
              if (!seenSessions.has(sessionKey)) {
                all.push({
                  day: d,
                  start: startM,
                  end: endM,
                  code: row.course_code,
                  section: row.section,
                  title: row.title,
                  instructor: row.instructor
                });
                seenSessions.add(sessionKey);
              }
            });
          }
        });
      });
    });
    return all;
  }, [schedule]);

  const hasOverlap = (s1, idx) => {
    return sessions.some((s2, idx2) => 
      idx !== idx2 && 
      s1.day === s2.day && 
      s1.start < s2.end && s1.end > s2.start
    );
  };

  return (
    <div id={id} className="calendar-grid-container">
      <div className="calendar-header">
        <div className="time-col-header"></div>
        {days.map(d => <div key={d} className="day-col-header">{d}</div>)}
      </div>
      <div className="calendar-body">
        <div className="time-column">
          {times.map(t => <div key={t} className="time-slot-label">{t}</div>)}
        </div>
        <div className="grid-content">
          {/* Grid Lines */}
          {times.map((_, i) => (
            <div key={i} className="grid-row-line" style={{ top: `${i * 30}px` }}></div>
          ))}
          {days.map((_, i) => (
            <div key={i} className="grid-col-line" style={{ left: `${(i / 6) * 100}%` }}></div>
          ))}
          
          {/* Sessions */}
          {sessions.map((s, idx) => {
            const startPos = (s.start - 7 * 60) / 30 * 30; // 30px per 30 mins
            const duration = (s.end - s.start) / 30 * 30;
            const dayIdx = days.indexOf(s.day);
            const isConflicting = hasOverlap(s, idx);
            
            // Stable color based on full course code hash
            const hash = s.code.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0);
            const hue = ((hash % 360) + 360) % 360;
            
            return (
              <div 
                key={idx} 
                className="calendar-session-block"
                style={{
                  top: `${startPos}px`,
                  height: `${Math.max(duration, 20)}px`,
                  left: `${(dayIdx / 6) * 100}%`,
                  width: `${(1 / 6) * 100}%`,
                  background: isConflicting ? 'rgba(239, 68, 68, 0.2)' : `hsla(${hue}, 70%, 50%, 0.15)`,
                  borderLeft: `4px solid ${isConflicting ? '#ef4444' : `hsla(${hue}, 70%, 50%, 0.8)`}`,
                  borderTop: isConflicting ? '2px solid #ef4444' : 'none',
                  borderRight: isConflicting ? '2px solid #ef4444' : 'none',
                  borderBottom: isConflicting ? '2px solid #ef4444' : 'none',
                  zIndex: isConflicting ? 100 : 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="session-code" style={{ color: isConflicting ? '#ef4444' : '#1e3a8a' }}>
                    {s.code} {isConflicting && '⚠️'}
                  </div>
                  <div className="session-section">{s.section}</div>
                </div>
                <div className="session-title">{s.title}</div>
                <div className="session-time" style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '2px', fontWeight: '500' }}>
                  {formatTime(s.start)} - {formatTime(s.end)}
                </div>
                <div className="session-instructor">{s.instructor}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScheduleAIAdvisor({ schedule, preferences, matchScore }) {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    setAnalysis('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/ai/analyze-schedule`, {
        schedule: schedule.schedule,
        preferences,
        matchScore
      });
      setAnalysis(res.data.analysis);
    } catch (err) {
      const msg = err.response?.data?.error
        || (err.code === 'ERR_NETWORK' ? 'Cannot reach server — is the backend running on port 3000?' : err.message)
        || 'AI analysis unavailable';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schedule && preferences) {
      handleAnalyze();
    }
  }, [schedule?.schedule, preferences]);

  return (
    <div className="ai-advisor-panel" style={{
      width: '320px',
      background: '#ffffff',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
      maxHeight: '800px',
      overflowY: 'auto',
      animation: 'slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ 
          width: '40px', height: '40px', background: '#2563eb', borderRadius: '12px', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' 
        }}>
          🤖
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>VLAD Advisor</h3>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem 0', textAlign: 'center' }}>
          <div className="spinner" style={{ width: '30px', height: '30px', margin: '0 auto 1rem' }}></div>
          <p style={{ fontSize: '0.85rem', color: '#475569' }}>Analyzing permutations...</p>
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid #ef444455' }}>
          <p style={{ fontSize: '0.8rem', color: '#f87171', margin: 0 }}>{error}</p>
          <button onClick={handleAnalyze} style={{ marginTop: '0.75rem', background: '#ef4444', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : (
        <div className="analysis-content" style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: '1.6' }}>
          {analysis ? (
             <div style={{ whiteSpace: 'pre-wrap' }}>{analysis}</div>
          ) : (
            <p style={{ color: '#64748b', fontStyle: 'italic' }}>Select a schedule to see AI analysis.</p>
          )}
        </div>
      )}
      
      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #1e293b', fontSize: '0.65rem', color: '#475569', textAlign: 'center' }}>
        Powered by Groq Llama 3.3 · VLAD Advisor
      </div>
    </div>
  );
}


function SchedulerQuestionnaire({ advisedSubjects, offerings, onGenerate, onCancel }) {
  const [qStep, setQStep] = useState(1);
  const [answers, setAnswers] = useState({
    timeTolerance: {},
    pedagogy: {},
    intensity: {},
    flow: {},
    fixed: { freeDays: [], cutOff: '08:30 PM' },
    ranking: ['Time Tolerance', 'Professor Priority', 'Professional Intensity', 'Gap/Minor Strategy'],
    preferredProfessors: [],
    permissions: { threeMajors: false, fourConsecutive: false }
  });

  const RANKING_DESCRIPTIONS = {
    'Time Tolerance': 'How strictly you want the system to avoid 7:30 AM or late night slots.',
    'Professor Priority': 'The weight given to your preferred instructors vs. slot convenience.',
    'Professional Intensity': 'Strategies for major subject placement and daily cognitive load.',
    'Gap/Minor Strategy': 'How to handle gaps, lunch breaks, and placement of GE/Minor subjects.'
  };

  // Helper to detect elective placeholders in UI
  const isElectivePlaceholder = (code) => {
    const electivePrefixes = ['CSEC', 'ITEC', 'ISEC', 'CSGE', 'ITGE', 'ISGE', 'CSME', 'MSGE'];
    return electivePrefixes.some(prefix => code.startsWith(prefix)) && 
           (/00\d$/.test(code) || code.length <= 7);
  };

  const availableInstructors = useMemo(() => {
    if (!offerings.length || !advisedSubjects.length) return [];
    const instructorItems = [];
    const seen = new Set();
    offerings.forEach(off => {
      const isMatch = advisedSubjects.some(advisedCode => {
        if (off.course_code === advisedCode) return true;
        if (isElectivePlaceholder(advisedCode)) {
          const prefix = advisedCode.match(/^[A-Z]+/)[0];
          return off.course_code.startsWith(prefix);
        }
        return false;
      });
      if (isMatch && off.instructor && off.instructor !== 'TO BE ASSIGNED') {
        const names = off.instructor.split(/[/,]/).map(n => n.trim());
        names.forEach(name => {
          if (name) {
            const key = `${name}-${off.course_code}`;
            if (!seen.has(key)) {
              seen.add(key);
              instructorItems.push({ id: key, name: name, code: off.course_code, title: off.title });
            }
          }
        });
      }
    });
    return instructorItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [offerings, advisedSubjects]);

  const renderQuestion = (category, key, question) => (
    <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
      <p style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1e293b' }}>{question}</p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map(val => (
          <button
            key={val}
            onClick={() => setAnswers(prev => ({
              ...prev,
              [category]: { ...prev[category], [key]: val }
            }))}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              background: answers[category][key] === val ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#ffffff',
              color: answers[category][key] === val ? 'white' : '#475569',
              transition: 'all 0.2s',
              fontWeight: 'bold'
            }}
          >
            {val}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
        <span>Strongly Disagree</span>
        <span>Strongly Agree</span>
      </div>
    </div>
  );

  const isStepValid = () => {
    switch(qStep) {
      case 1:
        return answers.timeTolerance['730aversion'] && answers.timeTolerance['eveningFlex'] && answers.timeTolerance['anchor9to4'];
      case 2:
        if (answers.preferredProfessors.length === 0) return !!answers.pedagogy['timeFirst'];
        return !!answers.pedagogy['loyalty'] && !!answers.pedagogy['timeFirst'] && !!answers.pedagogy['matching'];
      case 3:
        return answers.intensity['peakMorning'] && answers.intensity['intensiveGaps'] && answers.intensity['subjectPriority'];
      case 4:
        return answers.flow['gapStrategy'] && answers.flow['minorMorning'] && answers.flow['marathonMode'];
      case 7: return true;
      default: return true;
    }
  };

  return (
    <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="portal-card" style={{ 
        background: '#ffffff', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
        padding: '2.5rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <span style={{ color: '#2563eb', fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Step {qStep} of 7</span>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Personalized Architect</h2>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        {qStep === 1 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Part 1: Extreme Slot Tolerance (Time)</h3>
            {renderQuestion('timeTolerance', '730aversion', '"I am willing to take 7:30 AM classes if it results in a better overall schedule."')}
            {renderQuestion('timeTolerance', 'eveningFlex', '"I am comfortable with evening classes (5:00 PM – 8:30 PM) to avoid morning traffic."')}
            {renderQuestion('timeTolerance', 'anchor9to4', '"I prioritize a standard mid-day window, even if classes are spread across more days."')}
          </div>
        )}

        {qStep === 2 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Part 2: Pedagogy vs. Convenience (Professors)</h3>
            <div style={{ marginBottom: '3rem', padding: '1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 1rem', color: '#2563eb' }}>Professor Prioritization</h4>
              {availableInstructors.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {availableInstructors.map((item) => {
                    const isSelected = answers.preferredProfessors.some(p => p.id === item.id);
                    return (
                      <div key={item.id} onClick={() => {
                        const next = isSelected ? answers.preferredProfessors.filter(p => p.id !== item.id) : [...answers.preferredProfessors, item];
                        setAnswers(prev => ({ ...prev, preferredProfessors: next }));
                      }} style={{
                        padding: '1rem', background: isSelected ? 'rgba(37, 99, 235, 0.1)' : '#ffffff',
                        border: `1px solid ${isSelected ? '#2563eb' : '#1e293b'}`, borderRadius: '12px',
                        display: 'flex', alignItems: 'center', gap: '1.25rem', cursor: 'pointer'
                      }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: `2px solid ${isSelected ? '#2563eb' : '#475569'}`, background: isSelected ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{isSelected && '✓'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: isSelected ? '#2563eb' : '#1e293b', marginBottom: '0.25rem' }}>{item.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#475569' }}><span style={{ color: '#2563eb' }}>{item.code}</span> • {item.title}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>No specific instructors found.</p>}
            </div>
            {answers.preferredProfessors.length > 0 && renderQuestion('pedagogy', 'loyalty', '"I would choose a specific professor even if their class is at an inconvenient time."')}
            {renderQuestion('pedagogy', 'timeFirst', '"I don\'t care who the professor is as long as the time slot is perfect."')}
            {answers.preferredProfessors.length > 0 && renderQuestion('pedagogy', 'matching', '"How important is it that your schedule matches the specific professors you selected earlier?"')}
          </div>
        )}

        {qStep === 3 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Part 3: Professional Intensity (Majors)</h3>
            {renderQuestion('intensity', 'peakMorning', '"I prefer to have my Professional subjects in the morning when I am most alert."')}
            {renderQuestion('intensity', 'intensiveGaps', '"I want back-to-back major subjects even if it means no lunch break."')}
            {renderQuestion('intensity', 'subjectPriority', '"How critical is it that your major subjects are prioritized over minors/GEs?"')}
          </div>
        )}

        {qStep === 4 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Part 4: "Flow" Strategy (Gaps & Minors)</h3>
            {renderQuestion('flow', 'gapStrategy', '"I prefer long breaks (2-3 hours) between classes to study or rest."')}
            {renderQuestion('flow', 'minorMorning', '"I don\'t mind having GEs/Minors early in the morning."')}
            {renderQuestion('flow', 'marathonMode', '"I prefer a compact schedule (all classes in a row) to finish early."')}
          </div>
        )}

        {qStep === 5 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Part 5: Fixed Preferences (Hard Constraints)</h3>
            <div style={{ marginBottom: '2.5rem' }}>
              <p style={{ color: '#1e293b', marginBottom: '1rem', fontWeight: 'bold' }}>Preferred Free Days:</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <button key={day} onClick={() => {
                    const next = answers.fixed.freeDays.includes(day) ? answers.fixed.freeDays.filter(d => d !== day) : [...answers.fixed.freeDays, day];
                    setAnswers(prev => ({ ...prev, fixed: { ...prev.fixed, freeDays: next } }));
                  }} style={{
                    padding: '0.75rem 1.25rem', borderRadius: '10px', background: answers.fixed.freeDays.includes(day) ? '#2563eb' : '#ffffff',
                    color: answers.fixed.freeDays.includes(day) ? 'white' : '#64748b', border: `1px solid ${answers.fixed.freeDays.includes(day) ? '#2563eb' : '#1e293b'}`, cursor: 'pointer'
                  }}>{day}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: '#1e293b', marginBottom: '0.4rem', fontWeight: 'bold' }}>Hard Cut-off Time:</p>
              <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                The system will flag any classes ending after this time as violations — choose when you want to stop having classes.
              </p>
              <select value={answers.fixed.cutOff} onChange={(e) => setAnswers(prev => ({ ...prev, fixed: { ...prev.fixed, cutOff: e.target.value } }))}
                style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: '#ffffff', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                <option>04:00 PM</option><option>05:00 PM</option><option>06:00 PM</option><option>07:00 PM</option><option>08:30 PM</option>
              </select>
            </div>
          </div>
        )}

        {qStep === 6 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Final Step: Global Priority Ranking</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onDragOver={(e) => e.preventDefault()}>
              {answers.ranking.map((item, idx) => (
                <div key={item} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx); e.currentTarget.style.opacity = '0.4'; }}
                  onDragEnd={(e) => e.currentTarget.style.opacity = '1'}
                  onDrop={(e) => {
                    e.preventDefault();
                    const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    const newRank = [...answers.ranking];
                    const [removed] = newRank.splice(draggedIdx, 1);
                    newRank.splice(idx, 0, removed);
                    setAnswers(prev => ({ ...prev, ranking: newRank }));
                  }} style={{ 
                    padding: '1.25rem', background: idx === 0 ? 'rgba(37, 99, 235, 0.1)' : '#ffffff', 
                    border: `1px solid ${idx === 0 ? '#2563eb' : '#1e293b'}`, borderRadius: '16px', 
                    display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'grab'
                  }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: idx === 0 ? '#2563eb' : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#ffffff', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ color: idx === 0 ? '#2563eb' : '#475569', fontWeight: 'bold', fontSize: '0.95rem' }}>{item}</span>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>{RANKING_DESCRIPTIONS[item]}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button 
                      disabled={idx === 0} 
                      onClick={(e) => { e.stopPropagation(); const newRank = [...answers.ranking]; const temp = newRank[idx-1]; newRank[idx-1] = newRank[idx]; newRank[idx] = temp; setAnswers(prev => ({ ...prev, ranking: newRank })); }}
                      style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                    <button 
                      disabled={idx === answers.ranking.length - 1} 
                      onClick={(e) => { e.stopPropagation(); const newRank = [...answers.ranking]; const temp = newRank[idx+1]; newRank[idx+1] = newRank[idx]; newRank[idx] = temp; setAnswers(prev => ({ ...prev, ranking: newRank })); }}
                      style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', cursor: idx === answers.ranking.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === answers.ranking.length - 1 ? 0.3 : 1 }}>▼</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {qStep === 7 && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: '#2563eb' }}>Administrative Permissions (Soft Rules)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {[ { key: 'threeMajors', label: 'Sequential Major Subjects' }, { key: 'fourConsecutive', label: 'Maximum Consecutive Classes' } ].map(p => (
                <div key={p.key} style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ flex: 1 }}><p style={{ margin: 0, fontWeight: 'bold', color: '#1e293b' }}>{p.label}</p></div>
                  <button onClick={() => setAnswers(prev => ({ ...prev, permissions: { ...prev.permissions, [p.key]: !prev.permissions[p.key] } }))}
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', background: answers.permissions[p.key] ? '#10b981' : '#f8fafc', border: '1px solid #e2e8f0', color: answers.permissions[p.key] ? '#ffffff' : '#64748b' }}>
                    {answers.permissions[p.key] ? 'YES' : 'NO'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
          {qStep > 1 && <button onClick={() => setQStep(prev => prev - 1)} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: '#1e293b', color: '#ffffff', border: 'none', cursor: 'pointer' }}>Back</button>}
          <button onClick={qStep === 7 ? () => onGenerate(answers) : () => setQStep(prev => prev + 1)} disabled={!isStepValid()}
            style={{ flex: 2, padding: '1rem', borderRadius: '12px', background: isStepValid() ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#1e293b', color: isStepValid() ? 'white' : '#64748b', border: 'none', cursor: 'pointer' }}>
            {qStep === 7 ? 'Generate My Schedule' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Success() {
  const [offerings, setOfferings] = useState([]);
  const [scrapeStatus, setScrapeStatus] = useState('idle');
  const [progress, setProgress] = useState({ currentPage: 0, totalEntries: 0 });
  const [error, setError] = useState('');
  const [currentTablePage, setCurrentTablePage] = useState(1);
  const [lastScrapeTime, setLastScrapeTime] = useState(null);
  const [isFirstScrape, setIsFirstScrape] = useState(false);
  const [currentTriviaIndex, setCurrentTriviaIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [showUnitWarning, setShowUnitWarning] = useState(false);
  
  // New States for direct scheduling
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSchedules, setGeneratedSchedules] = useState([]);
  const [viewMode, setViewMode] = useState('offerings'); // 'offerings' or 'results'
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);
  const [userPreferences, setUserPreferences] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadScheduleAsPNG('weekly-calendar-capture', `AdNU_Schedule_Option_${activeScheduleIndex + 1}.png`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate Image. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const audioRef = useRef(null);
  const rowsPerPage = 15;

  const totalUnits = useMemo(() => {
    return selectedSubjects.reduce((sum, sub) => sum + (parseFloat(sub.units) || 0), 0);
  }, [selectedSubjects]);

  const handleGenerate = async (answers) => {
    setIsGenerating(true);
    setShowQuestionnaire(false);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/kaizen/generate`, {
        answers,
        advisedSubjects: selectedSubjects.map(s => s.course_code)
      });
      setGeneratedSchedules(res.data.schedules);
      setUserPreferences(answers);
      setActiveScheduleIndex(0);
      setViewMode('results');
      // Scroll to top so user sees the results
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to generate schedules';
      const errorDetails = err.response?.data?.details || '';
      setError(errorMsg + (errorDetails ? ' — ' + errorDetails : ''));
      // Scroll to top so user sees the error
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (totalUnits >= 24 && !showUnitWarning) {
      alert('Warning: You have achieved 24 units.');
      setShowUnitWarning(true);
    } else if (totalUnits < 24) {
      setShowUnitWarning(false);
    }
  }, [totalUnits, showUnitWarning]);

  const uniqueSections = useMemo(() => {
    const sections = {};
    offerings.forEach(off => {
      const key = `${off.course_code}-${off.section}`;
      if (!sections[key]) {
        sections[key] = { ...off, schedules: [off.schedule_raw] };
      } else {
        if (!sections[key].schedules.includes(off.schedule_raw)) {
          sections[key].schedules.push(off.schedule_raw);
        }
      }
    });
    return Object.values(sections);
  }, [offerings]);

  // Group ALL unique sections into subjects
  const groupedSubjects = useMemo(() => {
    const subjects = {};
    uniqueSections.forEach(off => {
      if (!subjects[off.course_code]) {
        subjects[off.course_code] = {
          course_code: off.course_code,
          title: off.title,
          units: off.units,
          sections: []
        };
      }
      subjects[off.course_code].sections.push(off);
    });
    return Object.values(subjects);
  }, [uniqueSections]);

  // Filter grouped subjects based on search term
  const filteredGroupedSubjects = useMemo(() => {
    if (!searchTerm) return groupedSubjects;
    const lowerSearch = searchTerm.toLowerCase();
    return groupedSubjects.filter(sub => 
      sub.course_code?.toLowerCase().includes(lowerSearch) || 
      sub.title?.toLowerCase().includes(lowerSearch)
    );
  }, [groupedSubjects, searchTerm]);

  const toggleSubjectSelection = (subject) => {
    const isSelected = selectedSubjects.some(s => s.course_code === subject.course_code);
    if (isSelected) {
      setSelectedSubjects(prev => prev.filter(s => s.course_code !== subject.course_code));
    } else {
      const subObj = {
        course_code: subject.course_code,
        title: subject.title,
        units: subject.units
      };
      setSelectedSubjects(prev => [...prev, subObj]);
    }
  };

  // Trivia Cycle Logic
  useEffect(() => {
    if ((scrapeStatus === 'scraping' || scrapeStatus === 'idle') && offerings.length === 0) {
      const interval = setInterval(() => {
        setCurrentTriviaIndex(prev => (prev + 1) % ADNU_TRIVIAS.length);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [scrapeStatus, offerings.length]);

  // Audio Control: Regnum Dei Sync Music
  useEffect(() => {
    // Play when first scrape starts
    if (isFirstScrape && (scrapeStatus === 'scraping' || scrapeStatus === 'idle')) {
      if (!audioRef.current) {
        audioRef.current = new Audio('/regnum_dei.mp3');
        audioRef.current.loop = true;
        audioRef.current.volume = 0.5; // Set volume to 50%
      }
      audioRef.current.play().catch(err => console.log('Audio playback pending user interaction:', err));
    }

    // Fade out when done
    if (scrapeStatus === 'done' && audioRef.current && !audioRef.current.paused) {
      const fadeInterval = setInterval(() => {
        if (audioRef.current.volume > 0.05) {
          audioRef.current.volume -= 0.05;
        } else {
          audioRef.current.pause();
          audioRef.current.volume = 0.5; // Reset to 50% for next time
          clearInterval(fadeInterval);
        }
      }, 150);
      return () => clearInterval(fadeInterval);
    }
  }, [isFirstScrape, scrapeStatus]);

  // Use sessionStorage to track if we have already seen a 'done' status in this browser session
  // This ensures that navigating back and forth between tabs doesn't re-trigger the loading screen
  const initialDoneKey = 'vlad_initial_scrape_done';

  const isFetchingData = useRef(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (isFetchingData.current) return;

      try {
        const res = await axios.get(`${API_BASE_URL}/api/scrape/status`);
        
        setProgress({ 
          currentPage: res.data.currentPage, 
          totalEntries: res.data.totalEntries 
        });

        const isScraping = res.data.status === 'scraping';
        const isDone = res.data.status === 'done';
        const isIdle = res.data.status === 'idle';

        // 1. Manage the Initial Sync UI (Trivia screen)
        // If it's the first time in this session AND we are scraping, STAY on the loading screen
        if (isScraping && !sessionStorage.getItem(initialDoneKey)) {
          setScrapeStatus('scraping');
          setIsFirstScrape(true);
        } else if (isIdle && offerings.length === 0 && !sessionStorage.getItem(initialDoneKey)) {
          setScrapeStatus('idle');
          setIsFirstScrape(true);
        } else if (isDone) {
          setIsFirstScrape(false);
          setScrapeStatus('done');
          sessionStorage.setItem(initialDoneKey, 'true');
        }

        // 2. Manage Data Fetching (Independent of UI state)
        if (offerings.length === 0 || res.data.lastScrapeTime !== lastScrapeTime) {
          isFetchingData.current = true;
          try {
            const dataRes = await axios.get(`${API_BASE_URL}/api/scrape/data`);
            if (dataRes.data.entries && dataRes.data.entries.length > 0) {
              setOfferings(dataRes.data.entries);
              setLastScrapeTime(res.data.lastScrapeTime || new Date().toISOString());
              
              // Only hide the trivia screen if we aren't currently in the middle of a live scrape
              // OR if we already finished one in this session.
              if (!isScraping || sessionStorage.getItem(initialDoneKey)) {
                setIsFirstScrape(false);
                setScrapeStatus(isDone ? 'done' : 'scraping');
              }

              setCurrentTablePage(prev => {
                const newTotalPages = Math.ceil(dataRes.data.entries.length / rowsPerPage);
                return prev > newTotalPages ? 1 : prev;
              });
            }
          } catch (fetchErr) {
            // silent fail
          } finally {
            isFetchingData.current = false;
          }
        }

        if (res.data.status === 'error') {
          setError(res.data.error);
          setScrapeStatus('error');
        }
      } catch (err) {
        // Backend might not be ready yet
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000); // Increased to 3s to reduce load
    return () => clearInterval(interval);
  }, [lastScrapeTime, offerings.length]); 

  // Pagination on SUBJECTS level
  const indexOfLastRow = currentTablePage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentSubjects = filteredGroupedSubjects.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(filteredGroupedSubjects.length / rowsPerPage);

  const nextPage = () => {
    if (currentTablePage < totalPages) setCurrentTablePage(prev => prev + 1);
  };

  const prevPage = () => {
    if (currentTablePage > 1) setCurrentTablePage(prev => prev - 1);
  };

  // Percentage based on ~2000 entries
  const percentage = Math.min(100, Math.round(((progress.totalEntries || 0) / 2000) * 100));

  // Format the last scrape time for display
  const formatScrapeTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  return (
    <div className="success-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', display: 'block', height: 'auto', minHeight: '100vh' }}>
      
      {/* ===== INITIALIZING / SYNCING SCREEN ===== */}
      {isFirstScrape && (scrapeStatus === 'scraping' || scrapeStatus === 'idle') && (
        <div className="first-scrape-layout">
          <div className="scrape-loading-panel">
            <div className="scrape-loader-icon">
              <div className="scrape-ring"></div>
              <div className="scrape-ring-inner"></div>
              <span className="scrape-percentage-text" style={{ fontSize: '2rem' }}>
                {scrapeStatus === 'scraping' ? `${percentage}%` : '⏳'}
              </span>
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '1.5rem 0 0.5rem', letterSpacing: '-0.5px' }}>
              {scrapeStatus === 'scraping' 
                ? (percentage < 100 ? 'Syncing MyAdNU Offerings' : 'Preparing your data...')
                : 'Initializing Scraper'}
            </h2>
            <p style={{ color: '#475569', fontSize: '1rem', margin: 0 }}>
              {scrapeStatus === 'scraping' 
                ? (percentage >= 100 ? 'I am preparing the data from MyAdNU' : `${progress.totalEntries} entries captured...`)
                : 'Waiting for the engine to begin...'}
            </p>
            {scrapeStatus === 'scraping' && (
              <div className="scrape-progress-track" style={{ marginTop: '1.5rem' }}>
                <div className="scrape-progress-fill" style={{ width: `${percentage}%` }}></div>
              </div>
            )}
          </div>

          <div className="trivia-container">
            <div className="trivia-label">Did you know?</div>
            <p 
              key={currentTriviaIndex} 
              className="trivia-text"
              style={{ 
                fontSize: ADNU_TRIVIAS[currentTriviaIndex].length > 150 ? '1.15rem' : '1.4rem' 
              }}
            >
              {ADNU_TRIVIAS[currentTriviaIndex]}
            </p>
            <div className="trivia-decoration">AdNU</div>
          </div>
        </div>
      )}

      {/* ===== ERROR STATE ===== */}
      {scrapeStatus === 'error' && (
        <div style={{ textAlign: 'center', marginTop: '4rem', color: '#f87171' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>❌</div>
          <h3 style={{ fontSize: '1.5rem' }}>Scraping Error</h3>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* ===== LOADING STATE (on refresh) ===== */}
      {!isFirstScrape && offerings.length === 0 && scrapeStatus !== 'error' && (
        <div className="overlay">
          <div className="spinner"></div>
          <h3 style={{ color: '#1e3a8a' }}>Fetching latest offerings...</h3>
        </div>
      )}

      {/* ===== AFTER FIRST SCRAPE: Data Table ===== */}
      {offerings.length > 0 && !isFirstScrape && (
        <div style={{ color: '#1e293b', width: '100%' }}>
          {/* Generation Error Banner */}
          {error && viewMode === 'offerings' && (
            <div style={{ 
              marginBottom: '1.5rem', padding: '1.25rem 1.5rem', 
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: '1rem' }}>Schedule Generation Failed</p>
                <p style={{ margin: '0.5rem 0 0', color: '#fca5a5', fontSize: '0.85rem', lineHeight: '1.5' }}>{error}</p>
              </div>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '1.5rem', cursor: 'pointer', padding: '4px' }}>×</button>
            </div>
          )}

          {/* Header with timestamp and button */}
          <div className="offerings-header-container">
            <div className="offerings-header-content">
              <img 
                src="/adnu_seal.png" 
                alt="Ateneo de Naga University Seal" 
                style={{ width: '90px', height: '90px', marginBottom: '1rem', objectFit: 'contain' }} 
              />
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#1e293b', textTransform: 'uppercase' }}>
                  ADNU Course Offerings
                </h1>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  As of {formatScrapeTime(lastScrapeTime)} &bull; {offerings.length} entries
                </p>
              </div>
            </div>
            
            <div className="offerings-header-actions">
              <button 
                onClick={() => window.location.href = '/kaizen'}
                className="login-btn"
                style={{ 
                  marginTop: 0, 
                  padding: '0.75rem 1.5rem', 
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                  whiteSpace: 'nowrap', 
                  maxWidth: '350px', 
                  fontSize: '0.95rem',
                  boxShadow: '0 4px 15px rgba(29, 78, 216, 0.3)'
                }}
              >
                Go to advisement
              </button>
              <button 
                onClick={() => { sessionStorage.clear(); window.location.href = '/'; }}
                style={{ 
                  padding: '0.5rem 1.25rem', 
                  background: 'none', 
                  border: '1px solid #cbd5e1', 
                  borderRadius: '8px',
                  color: '#64748b', 
                  fontSize: '0.85rem', 
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => { e.target.style.borderColor = '#ef4444'; e.target.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.color = '#64748b'; }}
              >
                Log out
              </button>
            </div>
          </div>
            
          {/* Search Bar */}
          <div style={{ position: 'relative', marginTop: '1.5rem', marginBottom: '1rem' }}>
              <input 
                type="text" 
                placeholder="Search by subject code (e.g. COMP) or subject name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentTablePage(1);
                }}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  paddingLeft: '3.5rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  color: '#1e293b',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#1e293b'}
              />
              <span style={{ position: 'absolute', left: '1.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.2rem', opacity: 0.5 }}>
                🔍
              </span>
            </div>

          {/* Main Layout: Conditional based on viewMode */}
          {viewMode === 'results' ? (
            <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', color: '#1e293b', margin: 0 }}>Manual Schedule Results</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button 
                    onClick={handleDownload} 
                    disabled={isDownloading}
                    className="page-btn" 
                    style={{ 
                      background: isDownloading ? '#94a3b8' : '#10b981', 
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    {isDownloading ? '⏳ Generating...' : '📥 Download PNG'}
                  </button>
                  <button onClick={() => setViewMode('offerings')} className="page-btn" style={{ background: '#1e293b', color: '#ffffff' }}>Back to Offerings</button>
                </div>
              </div>

              <div className="main-offerings-layout">
                {/* AI Advisor - Outside the schedule container */}
                <div className="sidebar-layout" style={{ top: '2rem' }}>
                  <ScheduleAIAdvisor 
                    schedule={generatedSchedules[activeScheduleIndex]} 
                    preferences={userPreferences} 
                    matchScore={generatedSchedules[activeScheduleIndex]?.matchPercentage ?? Math.round(generatedSchedules[activeScheduleIndex]?.totalScore)}
                  />
                </div>
                
                {/* Main Schedule Container */}
                <div style={{ flex: 1, minWidth: 0, background: '#ffffff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', overflowX: 'auto', padding: '0.5rem 0' }}>
                    {generatedSchedules.map((res, idx) => {
                        const pct = res.matchPercentage ?? Math.round(res.totalScore);
                        const pctColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#2563eb' : '#ef4444';
                        return (
                        <button
                          key={idx}
                          onClick={() => setActiveScheduleIndex(idx)}
                          style={{
                            padding: '1rem 1.5rem',
                            background: activeScheduleIndex === idx ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#ffffff',
                            border: `1px solid ${activeScheduleIndex === idx ? '#2563eb' : '#1e293b'}`,
                            borderRadius: '12px',
                            color: activeScheduleIndex === idx ? '#ffffff' : '#1e293b',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.25rem',
                            minWidth: '120px',
                            boxShadow: activeScheduleIndex === idx ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none'
                          }}
                        >
                          <span style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 'bold' }}>Option #{idx + 1}</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: '900', color: activeScheduleIndex === idx ? 'white' : pctColor }}>
                            {pct}% Match
                          </span>
                        </button>
                        );
                    })}
                  </div>

                  {generatedSchedules[activeScheduleIndex] && (() => {
                    const active = generatedSchedules[activeScheduleIndex];
                    const bd = active.breakdown || {};
                    const dims = [
                      { label: '🕐 Time Preference', value: bd.timePct },
                      { label: '👨‍🏫 Professor Match', value: bd.profPct },
                      { label: '📊 Cognitive Load', value: bd.stressPct },
                      { label: '📐 Compactness', value: bd.gapPct },
                      { label: '✅ Free Days', value: bd.compliancePct },
                    ].filter(d => d.value !== undefined);
                    return (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                      {dims.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                          {dims.map((d, i) => {
                            const barColor = d.value >= 80 ? '#10b981' : d.value >= 60 ? '#2563eb' : '#ef4444';
                            return (
                            <div key={i} style={{ flex: '1 1 140px', background: '#ffffff', borderRadius: '10px', padding: '0.75rem 1rem', minWidth: '140px' }}>
                              <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.4rem', whiteSpace: 'nowrap' }}>{d.label}</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: barColor, marginBottom: '0.4rem' }}>{d.value}%</div>
                              <div style={{ height: '4px', background: '#ffffff', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${d.value}%`, height: '100%', background: barColor, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                      <WeeklyCalendar id="weekly-calendar-capture" schedule={active.schedule} />
                    </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="main-offerings-layout">
              {/* Left: Table and Pagination */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <button onClick={prevPage} disabled={currentTablePage === 1} className="page-btn">Previous</button>
                  <span style={{ fontSize: '0.9rem', color: '#475569' }}>Page {currentTablePage} of {totalPages}</span>
                  <button onClick={nextPage} disabled={currentTablePage === totalPages} className="page-btn">Next</button>
                </div>

                <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {currentSubjects.map((sub, idx) => {
                      const isSelected = selectedSubjects.some(s => s.course_code === sub.course_code);
                      return (
                        <div key={idx} style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                          <div style={{ padding: '1.25rem 1.5rem', background: isSelected ? 'rgba(37, 99, 235, 0.1)' : '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <div style={{ height: '40px', padding: '0 1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1.25rem', color: '#64748b', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                {sub.units} Units
                              </div>
                              <div>
                                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#2563eb', marginRight: '1rem' }}>{sub.course_code}</span>
                                <span style={{ fontSize: '1rem', color: '#1e293b', fontWeight: '600' }}>{sub.title}</span>
                              </div>
                            </div>
                            
                            <button onClick={() => toggleSubjectSelection(sub)} style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none', background: isSelected ? '#ef4444' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: isSelected ? 'none' : '0 4px 15px rgba(29, 78, 216, 0.2)' }}>
                              {isSelected ? 'Remove Subject' : 'Add Subject'}
                            </button>
                          </div>
                          
                          <div style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {sub.sections.map((sec, sidx) => (
                                <div key={sidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(0, 0, 0, 0.03)', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 3fr 1fr 1fr', gap: '1.5rem', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', color: '#475569', fontSize: '0.9rem' }}>{sec.section}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{sec.schedules.join(' / ')}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>{sec.instructor}</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: sec.open_slots === 'CLOSED' ? '#ef4444' : '#10b981', textAlign: 'right' }}>
                                      {sec.open_slots === 'CLOSED' ? 'CLOSED' : `${sec.open_slots} slots`}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredGroupedSubjects.length === 0 && (
                      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                        <p>No subjects found{searchTerm ? ` matching "${searchTerm}"` : ''}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>


            {/* Right: Sidebar - Only show in offerings mode */}
            <div className="sidebar-layout">
              {/* Sidebar Header Container */}
              <div style={{ 
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                borderRadius: '16px', 
                padding: '1rem', 
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}>
                <button 
                  onClick={() => {
                    if (selectedSubjects.length > 0) {
                      setShowQuestionnaire(true);
                    }
                  }}
                  className="login-btn kaizen-btn"
                  disabled={selectedSubjects.length === 0}
                  style={{ 
                    marginTop: 0, 
                    padding: '0.75rem 1.25rem', 
                    background: selectedSubjects.length > 0 
                      ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' 
                      : '#f1f5f9', 
                    whiteSpace: 'nowrap', 
                    width: '100%', 
                    fontSize: '0.9rem',
                    cursor: selectedSubjects.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: 1,
                    textAlign: 'center',
                    lineHeight: '1.4',
                    border: selectedSubjects.length > 0 ? 'none' : '1px solid #cbd5e1',
                    borderRadius: '10px',
                    color: selectedSubjects.length > 0 ? 'white' : '#94a3b8',
                    fontWeight: 'bold',
                    boxShadow: selectedSubjects.length > 0 ? '0 4px 15px rgba(29, 78, 216, 0.3)' : 'none'
                  }}
                >
                  Make a personalized schedule now
                </button>
              </div>

              {/* Questionnaire Overlay for Success Page */}
              {showQuestionnaire && (
                <SchedulerQuestionnaire 
                  advisedSubjects={selectedSubjects.map(s => s.course_code)}
                  offerings={offerings}
                  onCancel={() => setShowQuestionnaire(false)}
                  onGenerate={handleGenerate}
                />
              )}

              {/* Loading State for Generation */}
              {isGenerating && (
                <div className="overlay">
                  <div className="loader-orbit">
                    <div className="orbit-ring"></div>
                    <div className="orbit-core">AI</div>
                  </div>
                  <h3 style={{ marginTop: '2rem', color: '#1e3a8a' }}>Architecting Manual Permutations...</h3>
                </div>
              )}

              {/* Sidebar Content Container */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.5)', 
                borderRadius: '16px', 
                border: '1px solid #1e293b', 
                minHeight: '400px', 
                padding: '1.5rem', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Selection List</h3>
                  <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', color: totalUnits >= 24 ? '#ef4444' : '#64748b' }}>
                    {totalUnits} Units
                  </div>
                </div>

                {selectedSubjects.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem', opacity: 0.2 }}>📋</div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6' }}>
                      No subjects selected yet. Search and add subjects from the offerings to start building your schedule.
                    </p>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {selectedSubjects.map((sub, idx) => (
                      <div key={idx} style={{ 
                        background: '#ffffff', 
                        padding: '1rem', 
                        borderRadius: '12px', 
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>{sub.course_code}</div>
                          <div style={{ fontSize: '0.75rem', color: '#475569' }}>{sub.title}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>{sub.units} Units</div>
                        </div>
                        <button 
                          onClick={() => toggleSubjectSelection(sub)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kaizen() {
  const [kaizenStatus, setKaizenStatus] = useState('idle');
  const [advisedSubjects, setAdvisedSubjects] = useState([]);
  const [electiveOptions, setElectiveOptions] = useState([]);
  const [lastScrapeTime, setLastScrapeTime] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();
  const isManual = new URLSearchParams(location.search).get('manual') === 'true';

  const [offerings, setOfferings] = useState([]);
  const [generatedSchedules, setGeneratedSchedules] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const navigate = useNavigate();
  const [userPreferences, setUserPreferences] = useState(null);
  const [isDownloading, setIsDownloading] = useState(null);

  const handleDownload = async (index) => {
    setIsDownloading(index);
    try {
      await downloadScheduleAsPNG(`kaizen-schedule-${index}`, `AdNU_Kaizen_Option_${index + 1}.png`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate Image.');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleGenerate = async (finalAnswers) => {
    setIsGenerating(true);
    setShowQuestionnaire(false);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/kaizen/generate`, {
        answers: finalAnswers,
        advisedSubjects
      });
      setGeneratedSchedules(res.data.schedules);
      setUserPreferences(finalAnswers);
      setKaizenStatus('results');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate schedules');
      setKaizenStatus('error');
    } finally {
      setIsGenerating(false);
    }
  };


  // Helper to detect elective placeholders in UI
  const isElectivePlaceholder = (code) => {
    const electivePrefixes = ['CSEC', 'ITEC', 'ISEC', 'CSGE', 'ITGE', 'ISGE', 'CSME', 'MSGE'];
    return electivePrefixes.some(prefix => code.startsWith(prefix)) && 
           (/00\d$/.test(code) || code.length <= 7);
  };

  // Derive unique instructors for advised subjects with subject context
  const availableInstructors = useMemo(() => {
    if (!offerings.length || !advisedSubjects.length) return [];
    
    const instructorItems = [];
    const seen = new Set();
    
    offerings.forEach(off => {
      // Check if offering is an exact match OR matches an elective placeholder
      const isMatch = advisedSubjects.some(advisedCode => {
        if (off.course_code === advisedCode) return true;
        if (isElectivePlaceholder(advisedCode)) {
          const prefix = advisedCode.match(/^[A-Z]+/)[0];
          return off.course_code.startsWith(prefix);
        }
        return false;
      });

      if (isMatch && off.instructor && off.instructor !== 'TO BE ASSIGNED') {
        const names = off.instructor.split(/[/,]/).map(n => n.trim());
        names.forEach(name => {
          if (name) {
            const key = `${name}-${off.course_code}`;
            if (!seen.has(key)) {
              seen.add(key);
              instructorItems.push({
                id: key,
                name: name,
                code: off.course_code,
                title: off.title
              });
            }
          }
        });
      }
    });
    return instructorItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [offerings, advisedSubjects]);

  const formatScrapeTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const startKaizen = async () => {
    try {
      setError('');
      setKaizenStatus('authenticating');
      await axios.post(`${API_BASE_URL}/api/kaizen/start`);
      pollKaizenStatus();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setKaizenStatus('error');
    }
  };

  const pollKaizenStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/kaizen/status`);
        setKaizenStatus(res.data.status);
        if (res.data.status === 'done') {
          clearInterval(interval);
          fetchKaizenData();
        } else if (res.data.status === 'error') {
          clearInterval(interval);
          setError(res.data.error);
        }
      } catch (err) {
        clearInterval(interval);
        setKaizenStatus('error');
        setError(err.message);
      }
    }, 2000);
  };

  const fetchKaizenData = async () => {
    try {
      if (isManual) {
        const saved = localStorage.getItem('manualSubjects');
        if (saved) {
          const subjects = JSON.parse(saved);
          // Use unique course codes
          const codes = Array.from(new Set(subjects.map(s => s.course_code)));
          setAdvisedSubjects(codes);
          setKaizenStatus('done');
        } else {
          setKaizenStatus('idle');
        }
      } else {
        // Fetch advisement data
        const res = await axios.get(`${API_BASE_URL}/api/kaizen/data`);
        if (res.data.advisedSubjects.length > 0 || res.data.electiveOptions.length > 0) {
          setAdvisedSubjects(res.data.advisedSubjects);
          setElectiveOptions(res.data.electiveOptions);
          setLastScrapeTime(res.data.lastScrapeTime);
          setKaizenStatus('done');
        }
      }
      
      // Fetch offerings data to extract instructors
      const offRes = await axios.get(`${API_BASE_URL}/api/scrape/data`);
      if (offRes.data.entries) {
        setOfferings(offRes.data.entries);
      }
    } catch (err) {
      if (err.response && err.response.status !== 404) {
        setError('Failed to fetch KAIZEN data');
      }
    }
  };

  useEffect(() => {
    fetchKaizenData();
  }, [isManual]);

  const statusDescriptions = {
    authenticating: '🔐 Awaiting Manual Login in the Portal Window...',
    scraping_advisement: '📂 Syncing Advised Subjects...',
    scraping_curriculum: '📑 Indexing Elective Options...',
  };


  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh', color: '#1e293b' }}>
      
      {showQuestionnaire && (
        <SchedulerQuestionnaire 
          advisedSubjects={advisedSubjects}
          offerings={offerings}
          onCancel={() => setShowQuestionnaire(false)}
          onGenerate={handleGenerate}
        />
      )}

      {isGenerating && (
        <div className="overlay">
          <div className="loader-orbit">
            <div className="orbit-ring"></div>
            <div className="orbit-planet"></div>
            <div className="orbit-core">AI</div>
          </div>
          <h3 style={{ marginTop: '2rem' }}>Architecting Optimized Permutations...</h3>
          <p style={{ color: '#64748b', marginTop: '1rem' }}>Calculating fitness scores & balancing daily stress...</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>KAIZEN</h1>
          <p style={{ color: '#64748b', margin: '0.5rem 0' }}>
            {lastScrapeTime ? `Your advisement as of ${formatScrapeTime(lastScrapeTime)}` : 'The Intelligent Schedule Architect'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
          {kaizenStatus === 'results' && (
            <button 
              onClick={() => { setKaizenStatus('done'); setGeneratedSchedules([]); }}
              className="page-btn"
              style={{ background: '#1e293b', border: 'none' }}
            >
              Start Over
            </button>
          )}
          <button 
            onClick={() => navigate('/success')} 
            className="login-btn"
            style={{ 
              marginTop: 0, 
              padding: '0.75rem 1.5rem', 
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
              whiteSpace: 'nowrap', 
              maxWidth: '350px', 
              fontSize: '0.95rem',
              boxShadow: '0 4px 15px rgba(37, 99, 235, 0.1)'
            }}
          >
            Go to Offerings
          </button>
        </div>
      </div>

      {kaizenStatus === 'results' && (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ padding: '0.5rem 1rem', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', borderRadius: '10px', fontSize: '1rem' }}>Top 10 Results</span>
            Optimized Schedule Architectures
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '2rem' }}>
            {generatedSchedules.map((res, idx) => (
              <div key={idx} id={`kaizen-schedule-${idx}`} className="portal-card" style={{ 
                background: '#ffffff', padding: '2rem', borderRadius: '20px', 
                border: idx === 0 ? '2px solid #2563eb' : '1px solid #1e293b',
                position: 'relative', overflow: 'hidden'
              }}>
                <button 
                  onClick={() => handleDownload(idx)}
                  disabled={isDownloading !== null}
                  style={{
                    position: 'absolute',
                    bottom: '1rem',
                    right: '1rem',
                    padding: '0.5rem 1rem',
                    background: isDownloading === idx ? '#94a3b8' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    cursor: isDownloading === idx ? 'not-allowed' : 'pointer',
                    zIndex: 10
                  }}
                >
                  {isDownloading === idx ? '⏳' : '📥 PNG'}
                </button>
                {idx === 0 && (
                  <div style={{ 
                    position: 'absolute', top: 0, right: 0, 
                    background: '#2563eb', color: '#ffffff', padding: '0.4rem 1rem', 
                    fontSize: '0.75rem', fontWeight: 'bold', borderBottomLeftRadius: '12px' 
                  }}>
                    BEST MATCH
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Option #{idx + 1}</h3>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>Fitness Score: {Math.round(res.totalScore)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: '1.5rem', fontWeight: '900', 
                      color: res.totalScore > 0 ? '#10b981' : '#ef4444' 
                    }}>
                      {Math.round(res.totalScore)}
                    </div>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b' }}>Score</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {res.schedule.map((unit, sidx) => (
                    <div key={sidx} style={{ padding: '0.75rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#2563eb' }}>{unit[0].course_code}</span>
                        <span style={{ fontSize: '0.8rem', color: '#475569' }}>Sec: {unit[0].section}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>{unit[0].title}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {unit.map((row, ridx) => (
                          <div key={ridx} style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid #1e293b' }}>
                            {row.schedule_raw} {row.room && `• ${row.room}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {res.penalties > 0 && (
                  <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#f87171' }}>
                      ⚠️ Includes high-intensity patterns or constraint overlaps (Sequential Majors / Consecutive Classes / Cut-offs).
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {kaizenStatus === 'idle' && (
        <div className="portal-init">
          <div className="portal-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '3rem', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏛️</div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Initialize Student Portal</h2>
            <p style={{ color: '#475569', maxWidth: '500px', margin: '0 auto 2rem' }}>
              We need to sync your latest advisement and curriculum data. Click below to open the secure login portal.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px', margin: '0 auto' }}>
              <button className="login-btn" onClick={startKaizen} style={{ fontSize: '1.2rem', padding: '1.2rem', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', width: '100%' }}>
                Open Secure Login Portal
              </button>
              <button 
                onClick={async () => {
                  try {
                    const res = await axios.post(`${API_BASE_URL}/api/kaizen/bypass`);
                    if (res.data.status === 'done') {
                      // Fetch the data immediately so state is updated
                      const dataRes = await axios.get(`${API_BASE_URL}/api/kaizen/data`);
                      setAdvisedSubjects(dataRes.data.advisedSubjects);
                      setElectiveOptions(dataRes.data.electiveOptions);
                      setLastScrapeTime(dataRes.data.lastScrapeTime);
                      setKaizenStatus('done');
                    }
                  } catch (err) {
                    setError('Bypass failed: No existing data found.');
                    setKaizenStatus('error');
                  }
                }}
                className="login-btn" 
                style={{ 
                  fontSize: '0.95rem', 
                  padding: '0.8rem', 
                  background: 'rgba(0, 0, 0, 0.05)', 
                  border: '1px dashed rgba(0, 0, 0, 0.2)',
                  color: '#475569',
                  width: '100%'
                }}
              >
                Fast-Track: Use Database / Cache
              </button>
            </div>
          </div>
        </div>
      )}

      {kaizenStatus === 'authenticating' && (
        <div className="portal-active" style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div className="pulse-container" style={{ position: 'relative', width: '200px', height: '200px', margin: '0 auto 2rem' }}>
            <div className="pulse-ring"></div>
            <div className="portal-icon" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '5rem' }}>🌐</div>
          </div>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Portal Connection Active</h2>
          <p style={{ color: '#475569', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Please log in to the **College Portal** window that just opened. 
            The system is watching for your successful login to start the scrape.
          </p>
          <div style={{ marginTop: '2rem', padding: '1rem', background: '#ffffff', borderRadius: '12px', display: 'inline-block', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#2563eb', fontWeight: 'bold' }}>STATUS:</span> {statusDescriptions[kaizenStatus]}
          </div>
        </div>
      )}

      {(kaizenStatus === 'scraping_advisement' || kaizenStatus === 'scraping_curriculum') && (
        <div className="scraping-active" style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div className="loader-orbit" style={{ margin: '0 auto 3rem' }}>
            <div className="orbit-ring"></div>
            <div className="orbit-planet"></div>
            <div className="orbit-core">K</div>
          </div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-1px' }}>SYNCHRONIZING DATA</h2>
          <p style={{ color: '#2563eb', fontWeight: 600, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
            {statusDescriptions[kaizenStatus]}
          </p>
          <div style={{ width: '100%', maxWidth: '400px', background: '#ffffff', height: '6px', borderRadius: '3px', margin: '2rem auto', overflow: 'hidden' }}>
            <div className="loading-progress-bar"></div>
          </div>
        </div>
      )}

      {kaizenStatus === 'error' && (
        <div style={{ textAlign: 'center', marginTop: '2rem', color: '#f87171' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>❌</div>
          <h3 style={{ fontSize: '1.5rem' }}>Connection Interrupted</h3>
          <p style={{ color: '#ef4444' }}>{error}</p>
          <button className="login-btn" onClick={() => { setKaizenStatus('idle'); setError(''); }} style={{ marginTop: '1.5rem', background: '#ef4444', maxWidth: '200px' }}>Reconnect Portal</button>
        </div>
      )}

      {kaizenStatus === 'done' && (
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginTop: '2rem' }}>
          <div style={{ flex: 1 }}>
            {/* Advised Subjects Container */}
            <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.5rem', background: '#ffffff', borderRadius: '8px' }}>✅</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Advised Subjects</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {advisedSubjects.map((sub, i) => {
                  return (
                    <div key={i} style={{ 
                      padding: '0.75rem 1.25rem', 
                      background: '#ffffff', 
                      borderRadius: '10px', 
                      border: '1px solid #e2e8f0', 
                      fontWeight: 600, 
                      color: '#2563eb', 
                      fontSize: '1.1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      {sub}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.5rem', background: '#ffffff', borderRadius: '8px' }}>📚</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Curriculum & Electives</h2>
              </div>
              <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1e293b' }}>
                      <th style={{ padding: '12px', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>No</th>
                      <th style={{ padding: '12px', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Code</th>

                      <th style={{ padding: '12px', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Title</th>
                      <th style={{ padding: '12px', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Units</th>
                      <th style={{ padding: '12px', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Credited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {electiveOptions.map((opt, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px' }}>{opt.no}</td>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{opt.subject_code}</td>

                        <td style={{ padding: '12px' }}>{opt.subject_title}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{opt.units}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{opt.credited}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ width: '360px', position: 'sticky', top: '2rem' }}>
            <button 
              className="login-btn kaizen-btn"
              onClick={() => setShowQuestionnaire(true)}
              style={{ 
                marginTop: 0, 
                padding: '0.75rem 1.25rem', 
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                whiteSpace: 'nowrap', 
                width: '100%', 
                fontSize: '0.9rem',
                cursor: 'pointer',
                opacity: 1,
                textAlign: 'center',
                lineHeight: '1.4',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)'
              }}
            >
              Make a personalized schedule now
            </button>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>
              * Based on your current advisement and the active offerings list.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/success" element={<Success />} />
        <Route path="/kaizen" element={<Kaizen />} />
      </Routes>
    </Router>
  );
}

export default App;
// SYNC: 04/26/2026 17:13:01
