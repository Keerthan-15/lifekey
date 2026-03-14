require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const drugFamilies = JSON.parse(fs.readFileSync(path.join(__dirname, 'drug_families.json'), 'utf8'));
const systemKnowledge = JSON.parse(fs.readFileSync(path.join(__dirname, 'system_knowledge.json'), 'utf8'));

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'lifekey_secret_demo';

// Serve frontend static files
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// --- JSON Database Setup ---
const DB_FILE = path.join(__dirname, 'database.json');

const readDB = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading database.json", e);
        return {
            patients: [], doctors: [], active_admissions: [], 
            status_logs: [], treatment_history: [], medication_logs: [], 
            emergency_ids: [], notifications: [], deletion_logs: []
        };
    }
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
};

// Helper for sending responses reliably
const sendError = (res, err) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
};

const HOSPITAL_MAP = {
  Cardiology: { name: "Heart Care Institute Chennai", address: "No. 7, Anna Salai, Teynampet, Chennai, Tamil Nadu 600018", phone: "044-2222-1111", maps: "https://maps.google.com/?q=Heart+Care+Institute,+Teynampet,+Chennai", doctor: "Dr. Ramanujan Pillai", dept: "Cardiology Department, Second Floor, Block B" },
  Neurology: { name: "NeuroLife Hospital", address: "No. 23, Nungambakkam High Road, Chennai, Tamil Nadu 600034", phone: "044-3333-2222", maps: "https://maps.google.com/?q=NeuroLife+Hospital,+Nungambakkam,+Chennai", doctor: "Dr. Savitha Krishnamurthy", dept: "Neurology Department, Third Floor, Block C" },
  Orthopedics: { name: "BoneCare Specialty Hospital", address: "No. 45, Velachery Main Road, Chennai, Tamil Nadu 600042", phone: "044-4444-3333", maps: "https://maps.google.com/?q=BoneCare+Specialty+Hospital,+Velachery,+Chennai", doctor: "Dr. Harish Balakrishnan", dept: "Orthopedics Department, First Floor, Block A" },
  Emergency: { name: "LifeKey General Hospital", address: "No. 14, Rajiv Gandhi Salai, Perungudi, Chennai, Tamil Nadu 600096", phone: "044-5555-4444", maps: "https://maps.google.com/?q=LifeKey+General+Hospital,+Perungudi,+Chennai", doctor: "Dr. Anil Kapoor", dept: "Emergency Department, Ground Floor, Block A" },
  General: { name: "CityCare Medical Centre", address: "No. 89, Mount Road, Anna Nagar, Chennai, Tamil Nadu 600040", phone: "044-6666-5555", maps: "https://maps.google.com/?q=CityCare+Medical+Centre,+Anna+Nagar,+Chennai", doctor: "Dr. Meenakshi Sundaram", dept: "General Medicine, Ground Floor, Block D" },
  Nephrology: { name: "KidneyCare Institute", address: "No. 12, OMR Road, Sholinganallur, Chennai, Tamil Nadu 600119", phone: "044-7777-6666", maps: "https://maps.google.com/?q=KidneyCare+Institute,+Sholinganallur,+Chennai", doctor: "Dr. Balasubramanian Iyer", dept: "Nephrology Department, Third Floor, Block B" },
  Gastroenterology: { name: "DigestCare Hospital", address: "No. 56, Poonamallee High Road, Koyambedu, Chennai, Tamil Nadu 600107", phone: "044-8888-7777", maps: "https://maps.google.com/?q=DigestCare+Hospital,+Koyambedu,+Chennai", doctor: "Dr. Priya Venkataraman", dept: "Gastroenterology, First Floor, Block C" },
  Pulmonology: { name: "LungCare Specialty Centre", address: "No. 34, GST Road, Chromepet, Chennai, Tamil Nadu 600044", phone: "044-9999-8888", maps: "https://maps.google.com/?q=LungCare+Specialty+Centre,+Chromepet,+Chennai", doctor: "Dr. Senthilkumar Rajendran", dept: "Pulmonology, Second Floor, Block A" },
  Gynecology: { name: "WomenFirst Hospital", address: "No. 67, Adyar Bridge Road, Adyar, Chennai, Tamil Nadu 600020", phone: "044-1111-9999", maps: "https://maps.google.com/?q=WomenFirst+Hospital,+Adyar,+Chennai", doctor: "Dr. Anitha Subramaniam", dept: "Gynecology, Ground Floor, Block B" },
  Oncology: { name: "CancerCare Institute", address: "No. 3, Sardar Patel Road, Guindy, Chennai, Tamil Nadu 600032", phone: "044-2345-6789", maps: "https://maps.google.com/?q=CancerCare+Institute,+Guindy,+Chennai", doctor: "Dr. Vikram Natarajan", dept: "Oncology, Fourth Floor, Block D" }
};

// --- AUTHENTICATION ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = readDB();
    const user = db.doctors.find(d => d.email === email && d.password === password);
    if (user) {
      const token = jwt.sign({ id: user.id, role: user.dept }, JWT_SECRET, { expiresIn: '12h' });
      return res.json({ status: 'success', token, user: { id: user.id, name: user.name, email: user.email, dept: user.dept } });
    }
    return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
  } catch (err) {
    sendError(res, err);
  }
});

// --- MAIN FLOW ---
app.post('/api/identify', async (req, res) => {
  const { fingerprint_id } = req.body;
  try {
    const db = readDB();
    const patientIndex = db.patients.findIndex(p => p.fingerprint_id === fingerprint_id);
    
    if (patientIndex !== -1) {
      const patient = db.patients[patientIndex];
      const admissionId = Date.now();
      
      const newAdmission = {
        id: admissionId,
        patient_id: patient.id,
        status: 'Under Treatment',
        admitted_at: new Date().toISOString(),
        is_archived: 0
      };
      
      db.active_admissions.push(newAdmission);
      
      db.status_logs.push({
        id: Date.now(),
        patient_id: patient.id,
        admission_id: admissionId,
        status: 'Under Treatment',
        changed_at: new Date().toISOString()
      });
      
      patient.last_status = 'Under Treatment';
      writeDB(db);
      return res.json({ status: 'found', patient });
    }
    return res.status(404).json({ status: 'not_found' });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/dashboard/live', async (req, res) => {
  try {
    const db = readDB();
    const activeAdmissions = db.active_admissions.filter(a => a.status !== 'Discharged' && a.status !== 'Cured' && a.is_archived === 0);
    
    // order by admitted_at DESC
    activeAdmissions.sort((a, b) => new Date(b.admitted_at) - new Date(a.admitted_at));

    const results = activeAdmissions.map(a => {
      const patientObj = db.patients.find(p => p.id === a.patient_id) || {};
      const patient = { ...patientObj };
      
      // Add admission data
      patient.admission_id = a.id;
      patient.admitted_at = a.admitted_at;
      patient.admission_status = a.status;

      // Timeline
      const timeline = db.status_logs
          .filter(sl => sl.admission_id === a.id)
          .sort((sl1, sl2) => new Date(sl1.changed_at) - new Date(sl2.changed_at))
          .map(sl => ({ status: sl.status, changed_at: sl.changed_at }));
      patient.status_timeline = timeline;

      return patient;
    });

    results.forEach(patient => {
      // Map Geographic hospital data over
      patient.hospital_info = HOSPITAL_MAP[patient.specialty] || HOSPITAL_MAP['Emergency'];
      
      if (patient.medications) {
        const meds = typeof patient.medications === 'string' ? JSON.parse(patient.medications) : patient.medications;
        patient.current_medication = meds.length > 0 ? meds[meds.length - 1] : 'None';
        // The frontend already references patient.medications directly, so we swap it
        patient.medications = patient.current_medication;
      }
    });

    res.json(results);
  } catch (err) {
    sendError(res, err);
  }
});

// --- PATIENT DETAILS & MANAGEMENT ---
app.get('/api/patient/:id', async (req, res) => {
  try {
    const db = readDB();
    const patientId = req.params.id;
    const patientIndex = db.patients.findIndex(p => p.id === patientId);
    
    if (patientIndex !== -1) {
      const patient = { ...db.patients[patientIndex] };
      const activeAdmission = db.active_admissions.find(a => a.patient_id === patientId && a.is_archived === 0 && !['Discharged', 'Cured'].includes(a.status));
      if (activeAdmission) {
        patient.admitted_at = activeAdmission.admitted_at;
      }
      
      const history = db.treatment_history.filter(h => h.patient_id === patientId).sort((a,b) => new Date(b.admitted_at) - new Date(a.admitted_at));
      return res.json({ status: 'success', patient, history });
    }
    return res.status(404).json({ status: 'not_found' });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/patient/:id/history', async (req, res) => {
  try {
    const db = readDB();
    const history = db.treatment_history.filter(h => h.patient_id === req.params.id).sort((a,b) => new Date(b.admitted_at) - new Date(a.admitted_at));
    res.json(history);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/patient/:id/medications', async (req, res) => {
  const { new_medications_json, old_medications_json, reason, doctor_id } = req.body;
  const patientId = req.params.id;
  try {
    const db = readDB();
    const patient = db.patients.find(p => p.id === patientId);
    if (patient) {
        patient.medications = new_medications_json;
        db.medication_logs.push({
            id: Date.now(),
            patient_id: patientId,
            changed_by: doctor_id,
            old_medications: old_medications_json,
            new_medications: new_medications_json,
            reason: reason,
            changed_at: new Date().toISOString()
        });
        writeDB(db);
    }
    res.json({ status: 'success' });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/patient/:id/status', async (req, res) => {
  const { status, admission_id } = req.body;
  const patientId = req.params.id;
  try {
    const db = readDB();
    if (admission_id) {
       if (['Discharged', 'Cured'].includes(status)) {
           // Explicit cleanup mapping from status change action
           db.active_admissions = db.active_admissions.filter(a => a.id !== admission_id);
       } else {
           const admission = db.active_admissions.find(a => a.id === admission_id);
           if (admission) admission.status = status;
           
           db.status_logs.push({
               id: Date.now(),
               patient_id: patientId,
               admission_id: admission_id,
               status: status,
               changed_at: new Date().toISOString()
           });
       }
    }
    const patient = db.patients.find(p => p.id === patientId);
    if (patient) patient.last_status = status;
    writeDB(db);
    
    res.json({ status: 'success' });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/patient/:id/notes', async (req, res) => {
  const { notes, admission_id } = req.body;
  const patientId = req.params.id;
  try {
    const db = readDB();
    const patient = db.patients.find(p => p.id === patientId);
    if (patient) {
        // Technically update treatment history if it was already discharged, else save to patients
        patient.discharge_notes = notes;
        writeDB(db);
    }
    res.json({ status: 'success' });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/patient/:id/discharge', async (req, res) => {
  const patientId = req.params.id;
  const { admission_id, diagnosis, treatment_given, medications_added, new_conditions, new_surgeries, doctor_id, notes, admitted_at } = req.body;
  
  try {
    const db = readDB();
    
    db.treatment_history.push({
        id: Date.now(),
        patient_id: patientId,
        admitted_at: new Date(admitted_at).toISOString(),
        discharged_at: new Date().toISOString(),
        diagnosis,
        treatment_given,
        medications_added: JSON.stringify(medications_added),
        new_conditions: JSON.stringify(new_conditions),
        new_surgeries: JSON.stringify(new_surgeries),
        doctor_id,
        notes
    });
  
    const patient = db.patients.find(p => p.id === patientId);
    if (patient) {
        patient.last_status = 'Discharged';
        patient.discharge_notes = notes;
    }
  
    if (admission_id) {
        db.active_admissions = db.active_admissions.filter(a => a.id !== admission_id);
    }
    
    writeDB(db);
    res.json({ status: 'success', message: 'Patient discharged successfully' });
  } catch (err) {
    sendError(res, err);
  }
});

// --- EMERGENCY ENTRY & ARCHIVE ---
app.post('/api/patient/manual', async (req, res) => {
  const { id, name, age, blood_group, allergies, conditions, medications, emergency_contact, contact_name, is_critical, status, admitted_at } = req.body;
  try {
    const db = readDB();
    const admissionTime = admitted_at ? new Date(admitted_at).toISOString() : new Date().toISOString();
  
    let patient = db.patients.find(p => p.id === id);
    if (patient) {
        Object.assign(patient, {
            name: name || 'Unknown Patient', age, blood_group,
            allergies: JSON.stringify(allergies || ["None"]),
            conditions: JSON.stringify(conditions || ["None"]),
            medications: JSON.stringify(medications || ["None"]),
            emergency_contact, contact_name, is_critical, last_status: status
        });
    } else {
        patient = {
            id, name: name || 'Unknown Patient', age, blood_group,
            allergies: JSON.stringify(allergies || ["None"]),
            conditions: JSON.stringify(conditions || ["None"]),
            medications: JSON.stringify(medications || ["None"]),
            emergency_contact, contact_name, is_critical, last_status: status,
            specialty: 'General'
        };
        db.patients.push(patient);
    }
  
    const newAdmission = {
        id: Date.now(),
        patient_id: id,
        status: status,
        admitted_at: admissionTime,
        is_archived: 0
    };
    db.active_admissions.push(newAdmission);
  
    db.status_logs.push({
        id: Date.now(),
        patient_id: id,
        admission_id: newAdmission.id,
        status: status,
        changed_at: admissionTime
    });
  
    writeDB(db);
    res.json({ status: 'success', patient_id: id });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/patient/:id/archive', async (req, res) => {
  const { reason, user_id, user_role } = req.body;
  const patientId = req.params.id;
  try {
    const db = readDB();
    db.active_admissions.forEach(a => {
        if (a.patient_id === patientId) a.is_archived = 1;
    });
    const patient = db.patients.find(p => p.id === patientId);
    if (patient) patient.is_archived = 1;
  
    db.deletion_logs.push({
        id: Date.now(),
        patient_id: patientId,
        user_id: user_id || null,
        user_role: user_role || null,
        reason: reason,
        archived_at: new Date().toISOString()
    });
  
    writeDB(db);
    res.json({ status: 'success' });
  } catch (err) {
    sendError(res, err);
  }
});

// --- AI CLINICAL ASSISTANT CORE ---
const assistantRateLimits = new Map(); // sessionId -> { count, timestamp }

const sanitizeInput = (text) => {
  if (!text) return '';
  // Strip HTML/Scripts
  let sanitized = text.replace(/<[^>]*>?/gm, '');
  // Prompt injection detection
  const injectionPatterns = [/ignore previous/i, /system prompt/i, /you are an ai/i, /impersonate/i, /translate to/i];
  const isInjected = injectionPatterns.some(p => p.test(sanitized));
  return { sanitized: sanitized.substring(0, 300), isInjected };
};

const detectIntent = (text) => {
  const input = text.toLowerCase();
  let intent = { type: 'UNKNOWN', confidence: 0, params: {} };

  // Medical Ceiling - Detect general medical queries not related to system
  const medicalGeneralPatterns = [/treatment for/i, /symptoms of/i, /what is malaria/i, /how to cure/i, /medicine for/i];
  if (medicalGeneralPatterns.some(p => p.test(input))) {
    return { type: 'MEDICAL_CEILING', confidence: 1.0, params: {} };
  }

  // Patient ID regex
  const patientIdMatch = input.match(/(pt-\d+|em-\d+)/i);
  const patientId = patientIdMatch ? patientIdMatch[0].toUpperCase() : null;

  // General Info / Workflow Patterns
  if (input.includes('how does') || input.includes('what does') || input.includes('how do i') || input.includes('what is an') || input.includes('meaning of')) {
    let key = null;
    if (input.includes('emergency dashboard')) key = 'emergency_dashboard_purpose';
    else if (input.includes('nurse dashboard')) key = 'nurse_dashboard_purpose';
    else if (input.includes('emergency id system')) key = 'emergency_id_system';
    else if (input.includes('patient profile')) key = 'patient_profile_content';
    else if (input.includes('search')) key = 'workflow_search';
    else if (input.includes('discharge')) key = 'workflow_discharge';
    else if (input.includes('manually add')) key = 'workflow_manual_entry';
    else if (input.includes('severe condition')) key = 'term_severe';
    else if (input.includes('emergency condition')) key = 'term_emergency';
    else if (input.includes('normal condition')) key = 'term_normal';
    else if (input.includes('admission time')) key = 'term_admission_time';
    else if (input.includes('emergency id')) key = 'term_emergency_id';
    
    if (key) return { type: 'GENERAL_INFO', confidence: 0.95, params: { key } };
  }

  if (input.includes('safe') || input.includes('prescribe') || input.includes('conflict')) {
    intent = { type: 'SAFETY_ALERT', confidence: 0.9, params: { patientId, drug: input.split(' ').pop().replace(/[?!]/g, '') } };
  } else if (input.includes('summary') || input.includes('summarize') || input.includes('details of')) {
    intent = { type: 'SUMMARY_QUERY', confidence: 0.9, params: { patientId } };
  } else if (input.includes('allergy') || input.includes('blood group') || input.includes('medication') || input.includes('doctor') || input.includes('status')) {
    let field = 'unknown';
    if (input.includes('allergy') || input.includes('allergies')) field = 'allergies';
    else if (input.includes('blood group')) field = 'blood_group';
    else if (input.includes('medication')) field = 'medications';
    else if (input.includes('doctor')) field = 'doctor';
    else if (input.includes('status')) field = 'status';
    intent = { type: 'FIELD_QUERY', confidence: 0.9, params: { patientId, field } };
  } else if (input.includes('lookup') || (patientId && input.length < 20)) {
    intent = { type: 'PATIENT_LOOKUP', confidence: 0.85, params: { patientId } };
  } else if (input.includes('how many') || input.includes('count') || input.includes('aggregate') || input.includes('active')) {
    intent = { type: 'AGGREGATE_QUERY', confidence: 0.85, params: {} };
  } else if (input.includes('list') || input.includes('show') || input.includes('which patients')) {
    intent = { type: 'LIST_FILTER', confidence: 0.8, params: { condition: input.includes('severe') ? 'Severe' : (input.includes('normal') ? 'Normal' : (input.includes('emergency') ? 'Emergency' : null)) } };
  }

  return intent;
};

app.post('/api/assistant/query', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { query } = req.body;
    const sessionId = decoded.id;
    const role = decoded.role || (decoded.name?.includes('Nurse') ? 'Nurse' : (decoded.name?.includes('Admin') ? 'Admin' : 'Doctor'));

    // Rate Limiting
    const now = Date.now();
    const limit = (role === 'Admin') ? 100 : 60;
    const windowMs = 3600000;
    let rateData = assistantRateLimits.get(sessionId) || { count: 0, timestamp: now };
    
    if (now - rateData.timestamp > windowMs) {
      rateData = { count: 0, timestamp: now };
    }
    
    if (rateData.count >= limit) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait an hour.' });
    }
    rateData.count++;
    assistantRateLimits.set(sessionId, rateData);

    // Sanitization
    const { sanitized, isInjected } = sanitizeInput(query);
    const db = readDB();

    if (isInjected) {
      db.notifications.push({ id: Date.now(), message: `SECURITY ALERT: Injection attempt by ${decoded.id}: ${query.substring(0, 50)}`, status: 'alert', created_at: new Date().toISOString() });
      writeDB(db);
      return res.status(400).json({ error: 'Security warning: Query rejected due to injection pattern detection.' });
    }

    // Intent Detection
    const intent = detectIntent(sanitized);

    // Logging for all queries
    const auditMsg = `Assistant query (${intent.type}) by ${decoded.id}: ${sanitized.substring(0, 100)}`;
    db.notifications.push({ id: Date.now(), message: auditMsg, status: 'assistant', created_at: new Date().toISOString() });
    writeDB(db);

    if (intent.type === 'MEDICAL_CEILING') {
      return res.json({ 
        title: 'System Boundary', 
        content: 'I can only assist with queries related to this hospital management system. For clinical reference information, please consult the appropriate medical resources or qualified clinical staff.',
        footer: 'Decision Support Only'
      });
    }

    if (intent.confidence < 0.75) {
      const escalation = HOSPITAL_MAP['Emergency'];
      return res.json({ 
        title: 'Query Unclear',
        content: 'I was unable to interpret that query clearly. Please rephrase your question or contact system support.', 
        hint: `Closest match attempted: ${intent.type}. You might try asking about patient summaries or system workflows.`,
        footer: `Escalation: Contact ${escalation.doctor} at ${escalation.phone} (${escalation.name})`
      });
    }

    // Role-Based Authorization
    const permissions = {
      'Doctor': ['PATIENT_LOOKUP', 'FIELD_QUERY', 'SAFETY_ALERT', 'SUMMARY_QUERY', 'GENERAL_INFO'],
      'ED': ['PATIENT_LOOKUP', 'FIELD_QUERY', 'LIST_FILTER', 'GENERAL_INFO'], // Usually Nurses
      'Admin': ['AGGREGATE_QUERY', 'LIST_FILTER', 'GENERAL_INFO']
    };
    
    // Normalize role for permissions
    let normalizedRole = role === 'Admin' ? 'Admin' : (role === 'ED' ? 'ED' : 'Doctor');
    if (!permissions[normalizedRole].includes(intent.type)) {
      return res.status(403).json({ error: 'This query is outside your access level. Please contact your administrator or a staff member with the appropriate role.' });
    }

    // GENERAL_INFO handled from Static Knowledge Base
    if (intent.type === 'GENERAL_INFO') {
      const answer = systemKnowledge.knowledge_base[intent.params.key];
      return res.json({
        title: 'System Knowledge Base',
        content: answer + "\n\n(Note: This answer is based on system documentation v" + systemKnowledge.version + ")",
        timestamp: new Date().toLocaleString(),
        footer: "Decision Support Only"
      });
    }

    // Data Fetching
    let resultData = null;
    if (intent.params.patientId) {
      resultData = db.patients.find(p => p.id === intent.params.patientId);
      if (!resultData) {
        return res.json({
          title: 'Record Not Found',
          content: `Patient record not found for ID ${intent.params.patientId}. Please verify the patient ID and try again, or use the Search Tab to locate the correct record.`,
          footer: 'Decision Support Only'
        });
      }
    }

    // Intent Specific Logic
    let responseText = '';
    if (intent.type === 'SAFETY_ALERT' && resultData) {
      const drug = intent.params.drug.toLowerCase();
      const allergies = (typeof resultData.allergies === 'string' ? JSON.parse(resultData.allergies) : resultData.allergies) || [];
      const medications = (typeof resultData.medications === 'string' ? JSON.parse(resultData.medications) : resultData.medications) || [];
      
      const drugList = drugFamilies[drug] || [drug];
      const conflict = allergies.find(a => drugList.includes(a.toLowerCase())) || 
                       (Array.isArray(medications) ? medications.find(m => drugList.includes(m.toLowerCase())) : (medications.toLowerCase().includes(drug) ? medications : null));

      if (conflict) {
        responseText = `⚠️ [ALERT] Potential conflict found. Patient ${resultData.name} (${resultData.id}) has a record of ${conflict}.`;
      } else {
        responseText = `✅ No obvious conflicts found for ${drug} in patient ${resultData.name}'s records. (Allergies: ${allergies.join(', ') || 'None'}, Meds: ${Array.isArray(medications) ? medications.join(', ') : medications})`;
      }
    } else if (intent.type === 'FIELD_QUERY' && resultData) {
      const val = resultData[intent.params.field];
      if (!val || (Array.isArray(val) && val.length === 0) || val === '["None"]') {
         responseText = `This information (${intent.params.field}) has not been recorded for patient ${resultData.name}. Please update the patient profile or contact the assigned clinical staff.`;
      } else {
         responseText = `Patient ${resultData.name} (${resultData.id}) - ${intent.params.field}: ${typeof val === 'string' && val.startsWith('[') ? JSON.parse(val).join(', ') : val}`;
      }
    } else if (intent.type === 'SUMMARY_QUERY' && resultData) {
      responseText = `Summary for ${resultData.name} (${resultData.id}): Age: ${resultData.age}, Blood: ${resultData.blood_group}, Status: ${resultData.last_status}, Specialty: ${resultData.specialty}.`;
    } else if (intent.type === 'AGGREGATE_QUERY') {
      const count = db.active_admissions.filter(a => a.is_archived === 0).length;
      responseText = `Currently there are ${count} active emergency patients admitted in the dashboard.`;
    } else if (intent.type === 'LIST_FILTER') {
      let activeListIds = db.active_admissions.filter(a => a.is_archived === 0).map(a => a.patient_id);
      let list = db.patients.filter(p => activeListIds.includes(p.id));
      if (intent.params.condition) {
          list = list.filter(p => p.last_status === intent.params.condition);
      }
      responseText = `Found ${list.length} patients with ${intent.params.condition || 'active'} status: ${list.map(p => `${p.name} (${p.id})`).join(', ') || 'None'}`;
    } else {
      responseText = resultData ? `Retrieved record for ${resultData.name} (${resultData.id}).` : 'No patient found with that ID.';
    }

    const disclaimer = "\n\nDISCLAIMER: This output is decision-support only. It does not constitute clinical authority or medical advice. Always verify with the patient record and consult qualified clinical staff before acting.";
    res.json({ 
      title: resultData ? `${resultData.id} - ${resultData.name}` : 'AI Clinical Assistant',
      content: responseText,
      timestamp: new Date().toLocaleString(),
      footer: disclaimer 
    });

  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });
    sendError(res, err);
  }
});

// --- EMERGENCY FALLBACK ---
app.post('/api/emergency/create', async (req, res) => {
  try {
    const db = readDB();
    const emergencyId = `EM-${Math.floor(10000 + Math.random() * 90000)}`;
    db.emergency_ids.push({
        emergency_id: emergencyId,
        status: 'active',
        created_at: new Date().toISOString()
    });
    writeDB(db);
    return res.json({ emergency_id: emergencyId });
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/emergency/:id/link', async (req, res) => {
  const { linked_to } = req.body;
  const emergencyId = req.params.id;
  try {
    const db = readDB();
    const record = db.emergency_ids.find(e => e.emergency_id === emergencyId);
    if (record) {
        record.linked_to = linked_to;
        writeDB(db);
    }
    return res.json({ status: 'success', linked: true });
  } catch (err) {
    sendError(res, err);
  }
});

// --- NOTIFICATIONS ---
app.post('/api/notify', async (req, res) => {
  const { patient_id, sent_to } = req.body; // Ignore frontend generic message
  try {
    const db = readDB();
    const pt = db.patients.find(p => p.id === patient_id);
    if (pt) {
       const hosp = HOSPITAL_MAP[pt.specialty] || HOSPITAL_MAP['Emergency'];
       const finalMsg = `LifeKey SMS Alert: ${pt.name} admitted to ${hosp.name}. Status: ${pt.is_critical ? 'CRITICAL' : 'Stable'}. Assigned physician: ${hosp.doctor}. Phone: ${hosp.phone}. Map: ${hosp.maps}`;
       db.notifications.push({
           id: Date.now(),
           patient_id: patient_id,
           sent_to: sent_to,
           message: finalMsg,
           sent_at: new Date().toISOString(),
           status: 'sent'
       });
       writeDB(db);
       return res.json({ status: 'sent', logged: true, generated_message: finalMsg });
    }
    return res.status(404).json({ error: 'Patient not found' });
  } catch (err) {
    sendError(res, err);
  }
});

// Catch-all route to serve the frontend for any non-API requests
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`LifeKey Backend running on port ${PORT}`);
  try {
    readDB();
    console.log('✅ JSON Database Connected');
  } catch (e) {
    console.error('❌ Failed to connect to JSON Database:', e.message);
  }
});
