import React, { useState, useEffect } from 'react';
import './App.css';
import { db, auth } from './firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const initialSemesters = [
  { id: 1, name: '1st Semester', start: '', end: '' },
  { id: 2, name: '2nd Semester', start: '', end: '' },
  { id: 3, name: '3rd Semester', start: '', end: '' },
  { id: 4, name: '4th Semester', start: '', end: '' },
];

const initialBatches = [
  { id: 1, batchName: 'Batch 1', semesters: initialSemesters.map(s => ({...s})), assignments: [] },
  { id: 2, batchName: 'Batch 2', semesters: initialSemesters.map(s => ({...s})), assignments: [] },
];

function ordinal(n) {
  const s = ["th","st","nd","rd"], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function AcademicCalendar() {
  const [batches, setBatches] = useState(initialBatches.map(b => ({ id: b.id, batchName: b.batchName, semesters: b.semesters.map(s => ({...s})) })));
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignBatchIndex, setAssignBatchIndex] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [assignRelease, setAssignRelease] = useState('');
  const [assignSubmission, setAssignSubmission] = useState('');
  const [assignLate, setAssignLate] = useState('');
  const [assignIssue, setAssignIssue] = useState('');
   const [copied, setCopied] = useState(false);
   const [batchTypeModalOpen, setBatchTypeModalOpen] = useState(false);
   const [showPassword, setShowPassword] = useState(false);  // Load batches from Firestore on mount
  useEffect(() => {
    let mounted = true;
    const loadBatches = async () => {
      try {
        const q = await getDocs(collection(db, 'batches'));
        if (!mounted) return;
        const remote = q.docs.map(d => {
          const data = d.data() || {};
          return {
            id: data.id || (d.id.startsWith('batch-') ? parseInt(d.id.replace('batch-','')) : d.id),
            batchName: data.batchName || d.id,
            type: data.type || 'weekday',
            semesters: (data.semesters && Array.isArray(data.semesters) && data.semesters.length>0) ? data.semesters.map(s=>({ id:s.id, name:s.name, start:s.start||'', end:s.end||'' })) : initialSemesters.map(s=>({ ...s })),
            assignments: data.assignments || []
          };
        });
        if (remote.length > 0) {
          setBatches(remote);
        }
      } catch (err) {
        console.warn('Failed to load batches from Firestore', err);
      }
    };
    loadBatches();
    return () => { mounted = false };
  }, []);

  // Allow changing any semester's start date. Changes cascade to subsequent semesters.
    const handleStartChange = (batchIndex, semIndex, value) => {
    const updatedBatches = batches.map(b => ({ id: b.id, batchName: b.batchName, type: b.type || 'weekday', semesters: b.semesters.map(s => ({ ...s })) }));
    const sems = updatedBatches[batchIndex].semesters;
    sems[semIndex].start = value || '';
    // choose offsets depending on batch type
    const isWeekend = (updatedBatches[batchIndex].type === 'weekend');
    const endOffset = isWeekend ? 180 : 120;
    sems[semIndex].end = value ? addDays(value, endOffset) : '';

    // Cascade forward within this batch
    for (let i = semIndex + 1; i < sems.length; i++) {
      const prevEnd = sems[i - 1].end;
      if (!prevEnd) {
        sems[i].start = '';
        sems[i].end = '';
      } else {
        sems[i].start = prevEnd;
        sems[i].end = addDays(prevEnd, endOffset);
      }
    }

    setBatches(updatedBatches);
  };

    const addBatch = (type='weekday') => {
    if (!isEditing) return;
    const nextId = batches.length + 1;
    const name = `Batch ${nextId}` + (type === 'weekend' ? ' (Weekend)' : '');
    const newBatch = { id: nextId, batchName: name, type, semesters: initialSemesters.map(s => ({ ...s })), assignments: [] };
    setBatches(prev => [...prev, newBatch]);
  };

    const handleSaveBatch = async (batchIndex) => {
      if (batchIndex == null) return;
      const batch = batches[batchIndex];
      if (!batch) return;
        const payload = {
          id: batch.id,
          batchName: batch.batchName,
          type: batch.type || 'weekday',
          semesters: batch.semesters.map(s => ({ id: s.id, name: s.name, start: s.start, end: s.end })),
          assignments: batch.assignments || []
        };
      try {
        await setDoc(doc(db, 'batches', `batch-${batch.id}`), payload, { merge: true });
        alert('Batch dates saved');
      } catch (err) {
        console.error('Save error', err);
        const msg = err && err.message ? err.message : String(err);
        // If permission error, try anonymous sign-in and retry once
        if (msg.toLowerCase().includes('missing') || msg.toLowerCase().includes('insufficient')) {
          try {
            await signInAnonymously(auth);
            // retry save
            const payload = {
              id: batch.id,
              batchName: batch.batchName,
              semesters: batch.semesters.map(s => ({ id: s.id, name: s.name, start: s.start, end: s.end }))
            };
            await setDoc(doc(db, 'batches', `batch-${batch.id}`), payload, { merge: true });
            alert('Batch dates saved (after anonymous sign-in)');
            return;
          } catch (err2) {
            console.error('Retry save error', err2);
            const msg2 = err2 && err2.message ? err2.message : String(err2);
            // fallback: save locally to localStorage so user data isn't lost
            try {
              const saved = JSON.parse(localStorage.getItem('savedBatches') || '{}');
              saved[`batch-${batch.id}`] = payload;
              localStorage.setItem('savedBatches', JSON.stringify(saved));
              alert('Could not save to Firestore (permission). Saved locally in browser storage.\n\nEnable Anonymous Auth and update Firestore rules to allow writes, or export the saved data.');
            } catch (lsErr) {
              console.error('Local save failed', lsErr);
              alert('Failed to save batch dates: ' + msg2 + '\nAlso failed to save locally.');
            }
            return;
          }
        }
        // final fallback: save locally
        try {
          const saved = JSON.parse(localStorage.getItem('savedBatches') || '{}');
          saved[`batch-${batch.id}`] = payload;
          localStorage.setItem('savedBatches', JSON.stringify(saved));
          alert('Could not save to Firestore. Saved locally in browser storage.');
        } catch (lsErr) {
          console.error('Local save failed', lsErr);
          alert('Failed to save batch dates: ' + msg + '\nAlso failed to save locally.');
        }
      }
    };

    const removeBatch = (batchIndex) => {
      if (!isEditing) return;
      setBatches(prev => prev.filter((_, i) => i !== batchIndex));
    };

    const resetAll = () => setBatches(initialBatches.map(b => ({ id: b.id, batchName: b.batchName, semesters: b.semesters.map(s => ({ ...s })) })));

    function formatToDDMMYYYY(dateStr) {
      if (!dateStr) return '';
      // dateStr expected in YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    // modules mapping by semester index (0-based)
    const modulesBySemester = [
      [
        'Programming', 'Networking', 'Professional Practice', 'Database Design and Development'
      ],
      [
        'Security', 'Planning A Computing Project', 'Software Development Lifecycles', 'Computing Systems Architecture', 'Web Design and Development', 'Maths for Computing'
      ],
      [
        'Computing Research Project - Proposal', 'Business Process Support', 'Transport Network Design', 'Cloud Computing', 'Systems Analysis and Design', 'User Experience and Interface Design'
      ],
      [
        'Discrete Maths', 'Data Structures and Algorithms', 'Applied Programming and Design Principles', 'Network Security', 'Internet of Things', 'Emerging Technologies', 'Computing Research Project - Final Report'
      ]
    ];

    const openAssignModal = (batchIndex) => {
      if (!isEditing) return;
      setAssignBatchIndex(batchIndex);
      setSelectedSubject('');
      setAssignRelease('');
      setAssignSubmission('');
      setAssignLate('');
      setAssignIssue('');
      setCopied(false);
      setAssignModalOpen(true);
    };

    const saveAssignment = () => {
      if (assignBatchIndex == null || !selectedSubject) return;
      const updated = batches.map(b => ({ id: b.id, batchName: b.batchName, semesters: b.semesters.map(s=>({...s})), assignments: b.assignments ? [...b.assignments] : [] }));
      // find semester for subject
      let semIndex = -1;
      for (let i=0;i<modulesBySemester.length;i++){
        if (modulesBySemester[i].includes(selectedSubject)) { semIndex = i; break; }
      }
      const assignment = {
        subject: selectedSubject,
        semesterIndex: semIndex,
        releaseDate: assignRelease,
        submissionDate: assignSubmission,
        lateSubmissionDate: assignLate,
        issueDate: assignIssue
      };
      updated[assignBatchIndex].assignments.push(assignment);
      setBatches(updated);
      setAssignModalOpen(false);
    };

    const handleCopyAssignment = async () => {
      // Build the message format the user requested
      const moduleName = selectedSubject || '-';
      const deadline = formatToDDMMYYYY(assignRelease) || '-';
      const late = formatToDDMMYYYY(assignLate) || '-';
      const issue = formatToDDMMYYYY(assignIssue) || '-';
      const submission = formatToDDMMYYYY(assignSubmission) || '-';

      // Use single * to highlight module name and the two deadlines for WhatsApp
      const message = `Assignment Deadline - *${moduleName}*\n\nDeadline of the Submission: *${deadline}*\nLate Submission Deadline: *${late}*\nAfter the late submission deadline, you cannot submit your assignment.\n\nIssue date: ${issue}\nSubmission date: ${submission}`;

      // Try navigator.clipboard first, fallback to textarea copy
      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(message);
        } else {
          const ta = document.createElement('textarea');
          ta.value = message;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        // keep modal open; update button label to show copied
        setCopied(true);
      } catch (err) {
        alert('Copy failed. You can manually copy the message displayed.');
      }
    };

    const visibleBatches = batches.filter(b => b.batchName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="calendar-wrap">
      <h2>Academic Calendar</h2>
      <div className="calendar-actions">
        <div style={{display:'flex', gap:8}}>
          {isEditing ? (
            <>
              <button onClick={() => setBatchTypeModalOpen(true)} className="small-btn">Add Batch</button>
              <button className="small-btn" onClick={() => setIsEditing(false)}>Lock</button>
            </>
          ) : (
            <button className="small-btn" onClick={() => { setModalOpen(true); setAuthUser(''); setAuthPass(''); setAuthError(''); }}>Edit</button>
          )}
        </div>
      </div>

      <div className="calendar-search">
        <input
          type="text"
          placeholder="Search by batch name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="batches-grid">
        {visibleBatches.map((batch, bIdx) => (
          <div className="batch-card" key={batch.id}>
            { /* determine actual index in the main batches array (visibleBatches may be filtered) */ }
            {(() => { const _realIndex = batches.findIndex(b=>b.id===batch.id); return null })()}
            <table className="calendar-table">
              <thead>
                <tr>
                  <th colSpan={5} className="batch-name-cell">
                    <div className="batch-header">
                      <input
                        className="batch-name-input"
                        value={batch.batchName}
                        readOnly={!isEditing}
                        onChange={(e) => {
                          if (!isEditing) return;
                          const realIndex = batches.findIndex(b => b.id === batch.id);
                          if (realIndex === -1) return;
                          const updated = batches.map(b => ({ id: b.id, batchName: b.batchName, semesters: b.semesters.map(s=>({...s})), assignments: b.assignments ? [...b.assignments] : [] }));
                          updated[realIndex].batchName = e.target.value;
                          setBatches(updated);
                        }}
                      />
                          {isEditing && (
                            <>
                              <button className="small-btn" title="Save dates" onClick={() => {
                                const realIndex = batches.findIndex(b => b.id === batch.id);
                                if (realIndex !== -1) handleSaveBatch(realIndex);
                              }}>💾</button>
                              <button className="remove-btn" title="Delete batch" aria-label="Delete batch" onClick={() => {
                                const realIndex = batches.findIndex(b => b.id === batch.id);
                                if (realIndex !== -1) removeBatch(realIndex);
                              }}>🗑️</button>
                              <button className="small-btn" onClick={() => {
                                const realIndex = batches.findIndex(b => b.id === batch.id);
                                if (realIndex !== -1) openAssignModal(realIndex);
                              }}>Deadline Release</button>
                            </>
                          )}
                    </div>
                  </th>
                </tr>
                <tr>
                  <th>Semester</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Release Date</th>
                  <th>Submission Date</th>
                </tr>
              </thead>
              <tbody>
                        {batch.semesters.map((s, idx) => {
                      const releaseOffset = batch.type === 'weekend' ? 30 : 20;
                      const release = s.start ? addDays(s.start, releaseOffset) : '';
                      const submission = s.end ? addDays(s.end, 15) : '';
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        {idx === 0 ? (
                            isEditing ? (
                              <input
                                type="date"
                                value={s.start}
                                onChange={(e) => {
                                  const realIndex = batches.findIndex(b => b.id === batch.id);
                                  if (realIndex !== -1) handleStartChange(realIndex, idx, e.target.value);
                                }}
                              />
                            ) : (
                              <input type="date" value={s.start} readOnly />
                            )
                          ) : (
                            <input type="date" value={s.start} readOnly />
                          )}
                      </td>
                      <td>
                        <input type="text" value={formatToDDMMYYYY(s.end)} readOnly />
                      </td>
                      <td>
                        <input type="text" value={formatToDDMMYYYY(release)} readOnly />
                      </td>
                      <td>
                        <input type="text" value={formatToDDMMYYYY(submission)} readOnly />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              {batch.assignments && batch.assignments.length > 0 && (
                <div style={{marginTop:10}}>
                  <strong>Assignments / Deadlines</strong>
                  <ul>
                      {batch.assignments.map((a, i) => (
                        <li key={i}>{a.subject} — Semester {a.semesterIndex >= 0 ? a.semesterIndex+1 : '-'} — Issue: {formatToDDMMYYYY(a.issueDate)} — Submission: {formatToDDMMYYYY(a.submissionDate)} — Deadline: {formatToDDMMYYYY(a.releaseDate)} — Late: {formatToDDMMYYYY(a.lateSubmissionDate)}</li>
                      ))}
                  </ul>
                </div>
              )}
          </div>
        ))}
      </div>
      {visibleBatches.length === 0 && (
        <div className="no-results">No batches found</div>
      )}

      {assignModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Release Deadline</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <label>Subject</label>
                  <select value={selectedSubject} onChange={e=>{
                    const val = e.target.value;
                    setSelectedSubject(val);
                    // clear previous admin-chosen dates so modal asks for the Deadline
                    setAssignRelease('');
                    setAssignLate('');
                    setCopied(false);
                    // derive issue and submission dates from the batch academic calendar (semester)
                    if (assignBatchIndex == null) {
                      setAssignIssue('');
                      setAssignSubmission('');
                    } else {
                      const semIdx = modulesBySemester.findIndex(ms => ms.includes(val));
                      if (semIdx === -1) {
                        setAssignIssue('');
                        setAssignSubmission('');
                        } else {
                        const batch = batches[assignBatchIndex];
                        const sem = batch && batch.semesters ? batch.semesters[semIdx] : null;
                        const releaseOffset = batch && batch.type === 'weekend' ? 30 : 20;
                        const issue = sem && sem.start ? addDays(sem.start, releaseOffset) : '';
                        const submission = sem && sem.end ? addDays(sem.end, 15) : '';
                        setAssignIssue(issue);
                        setAssignSubmission(submission);
                      }
                    }
                  }}>
                <option value="">-- select subject --</option>
                {modulesBySemester.flat().map((m, i)=> (
                  <option key={i} value={m}>{m}</option>
                ))}
              </select>
              {selectedSubject && (
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div>Semester: {(() => { for (let i=0;i<modulesBySemester.length;i++){ if (modulesBySemester[i].includes(selectedSubject)) return i+1 } return '-' })()}</div>
                </div>
              )}
              <label>Deadline</label>
              <input type="date" value={assignRelease} onChange={e=>{
                const v = e.target.value;
                setAssignRelease(v);
                // late submission = release + 14
                setAssignLate(v ? addDays(v, 14) : '');
              }} />
              <div>Late Submission Date: <strong>{formatToDDMMYYYY(assignLate)}</strong></div>
              <div>Issue Date: <strong>{formatToDDMMYYYY(assignIssue)}</strong></div>
              <div>Submission Date: <strong>{formatToDDMMYYYY(assignSubmission)}</strong></div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button className="small-btn" onClick={()=>setAssignModalOpen(false)}>Cancel</button>
                <button className="small-btn" onClick={()=>handleCopyAssignment()}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {batchTypeModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:400}}>
            <h3>Select Batch Type</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',gap:12}}>
                <button style={{flex:1,padding:'12px 16px',border:'2px solid #007bff',borderRadius:8,backgroundColor:'#f0f8ff',color:'#007bff',fontWeight:600,cursor:'pointer',fontSize:14}} onClick={()=>{ setBatchTypeModalOpen(false); addBatch('weekday'); }}>📅 Weekday</button>
                <button style={{flex:1,padding:'12px 16px',border:'2px solid #ff9800',borderRadius:8,backgroundColor:'#fff3e0',color:'#ff9800',fontWeight:600,cursor:'pointer',fontSize:14}} onClick={()=>{ setBatchTypeModalOpen(false); addBatch('weekend'); }}>🌙 Weekend</button>
              </div>
              <button style={{padding:'8px 16px',border:'1px solid #ccc',borderRadius:6,backgroundColor:'#f5f5f5',color:'#666',cursor:'pointer'}} onClick={()=>setBatchTypeModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:380}}>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:32,marginBottom:8}}>🔒</div>
              <h3 style={{margin:'0 0 4px 0'}}>Enter Credentials</h3>
              <p style={{margin:0,fontSize:12,color:'#999'}}>Admin access required to edit</p>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#333',marginBottom:4}}>👤 Username</label>
                <input placeholder="Admin" value={authUser} onChange={e=>setAuthUser(e.target.value)} style={{width:'100%',padding:'10px 12px',border:'1px solid #ddd',borderRadius:6,fontSize:14,boxSizing:'border-box'}} />
              </div>
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#333',marginBottom:4}}>🔑 Password</label>
                <div style={{position:'relative'}}>
                  <input placeholder="•••••••••" type={showPassword ? 'text' : 'password'} value={authPass} onChange={e=>setAuthPass(e.target.value)} style={{width:'100%',padding:'10px 12px',paddingRight:36,border:'1px solid #ddd',borderRadius:6,fontSize:14,boxSizing:'border-box'}} />
                  <button type="button" onClick={()=>setShowPassword(!showPassword)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:16,padding:4}} title={showPassword ? 'Hide' : 'Show'}>
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              {authError && <div style={{padding:8,backgroundColor:'#ffebee',color:'#c62828',borderRadius:4,fontSize:12,fontWeight:500}}>❌ {authError}</div>}
              <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
                <button style={{padding:'10px 16px',border:'1px solid #ddd',borderRadius:6,backgroundColor:'#f5f5f5',color:'#666',cursor:'pointer',fontWeight:500}} onClick={()=>{setModalOpen(false); setAuthError('');}}>Cancel</button>
                <button style={{padding:'10px 20px',border:'none',borderRadius:6,backgroundColor:'#007bff',color:'#fff',cursor:'pointer',fontWeight:600}} onClick={()=>{
                  if (authUser === 'Admin' && authPass === 'Esosft') {
                    setIsEditing(true);
                    setModalOpen(false);
                    setAuthError('');
                  } else {
                    setAuthError('Invalid credentials');
                  }
                }}>Unlock</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AcademicCalendar;
