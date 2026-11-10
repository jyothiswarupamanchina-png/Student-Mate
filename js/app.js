/**
 * STUDYPILOT AI - APPLICATION CORE LOGIC (DYNAMIC MULTI-USER VERSION)
 * Architecture: 
 *   - BackendService: Spring Boot REST API + MySQL Bridge with isolated per-user storage fallback
 *   - AIService: Real AI API integration bridge (Google Gemini / OpenAI / Custom backend)
 *   - Reactive State Store with full user data isolation and dynamic CRUD forms
 */

/* ==========================================================================
   1. SPRING BOOT & MYSQL BACKEND INTEGRATION SERVICE
   Prepares frontend for Java Spring Boot REST API at localhost:8080/api.
   Ensures strict data isolation per authenticated student identity.
   Transparently informs user of backend connectivity status.
   ========================================================================== */
const BackendService = {
  config: {
    baseUrl: localStorage.getItem('studypilot_backend_url') || 'http://localhost:8080/api',
    tokenKey: 'studypilot_jwt_token',
    currentUserKey: 'studypilot_active_student'
  },

  isOnline: false,
  lastHealthCheckTime: 0,

  getToken() {
    return localStorage.getItem(this.config.tokenKey) || sessionStorage.getItem(this.config.tokenKey);
  },

  setToken(token, remember = true) {
    if (remember) {
      localStorage.setItem(this.config.tokenKey, token);
    } else {
      sessionStorage.setItem(this.config.tokenKey, token);
    }
  },

  clearToken() {
    localStorage.removeItem(this.config.tokenKey);
    sessionStorage.removeItem(this.config.tokenKey);
    localStorage.removeItem(this.config.currentUserKey);
    sessionStorage.removeItem(this.config.currentUserKey);
  },

  getCurrentUser() {
    const raw = localStorage.getItem(this.config.currentUserKey) || sessionStorage.getItem(this.config.currentUserKey);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user, remember = true) {
    const serialized = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(this.config.currentUserKey, serialized);
    } else {
      sessionStorage.setItem(this.config.currentUserKey, serialized);
    }
  },

  /**
   * Probes the Spring Boot backend server health.
   * Cached for 5s to avoid duplicate checks; uses 4000ms timeout for cold starts.
   */
  async checkBackendStatus(force = false) {
    const now = Date.now();
    if (!force && this.lastHealthCheckTime && (now - this.lastHealthCheckTime < 5000)) {
      return this.isOnline;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      this.isOnline = res.ok;
      this.lastHealthCheckTime = Date.now();
    } catch {
      this.isOnline = false;
      this.lastHealthCheckTime = Date.now();
    }
    this.updateBackendStatusUI();
    return this.isOnline;
  },

  updateBackendStatusUI() {
    const pill = document.getElementById('backendStatusPill');
    const dot = document.getElementById('backendStatusDot');
    const text = document.getElementById('backendStatusText');
    const authBanner = document.getElementById('authBackendBanner');
    const authHeading = document.getElementById('authBackendStatusHeading');
    const authText = document.getElementById('authBackendStatusText');

    if (!pill || !text) return;

    if (this.isOnline) {
      pill.className = 'api-status-pill backend-pill';
      dot.className = 'status-indicator-dot connected';
      text.textContent = 'Spring Boot: Connected (MySQL)';
      if (authBanner) {
        authBanner.className = 'backend-callout-banner';
        authHeading.textContent = 'Spring Boot Backend Connected (MySQL)';
        authText.textContent = `Connected to live Spring Boot API at ${this.config.baseUrl}. User credentials and academic data are synchronized with MySQL.`;
      }
    } else {
      pill.className = 'api-status-pill backend-pill offline';
      dot.className = 'status-indicator-dot offline';
      text.textContent = 'Session: Local Storage (Offline Mode)';
      if (authBanner) {
        authBanner.className = 'backend-callout-banner offline';
        authHeading.textContent = 'Spring Boot Offline • Local Session Mode Active';
        authText.textContent = `Backend at ${this.config.baseUrl} is currently offline. Your student records are safely isolated in local browser storage and will be ready to sync when Spring Boot is started.`;
      }
    }
  },

  /**
   * Get student data store isolated strictly by authenticated student email/ID.
   */
  getUserDataStoreKey(email) {
    return `studypilot_data_${encodeURIComponent((email || 'guest').toLowerCase().trim())}`;
  },

  getStudentData(email) {
    const key = this.getUserDataStoreKey(email);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {
        profile: null,
        subjects: [],
        tasks: [],
        deadlines: [],
        calendarEvents: [],
        wellness: { mood: '' },
        sleepLogs: [],
        quizHistory: [],
        gpaHistory: [],
        studySessions: []
      };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.gpaHistory) parsed.gpaHistory = [];
      if (!parsed.studySessions) parsed.studySessions = [];
      if (!parsed.sleepLogs) parsed.sleepLogs = [];
      return parsed;
    } catch {
      return { profile: null, subjects: [], tasks: [], deadlines: [], calendarEvents: [], wellness: {}, sleepLogs: [], quizHistory: [], gpaHistory: [], studySessions: [] };
    }
  },

  saveStudentData(email, data) {
    const key = this.getUserDataStoreKey(email);
    localStorage.setItem(key, JSON.stringify(data));
  },

  /**
   * Authenticate student (Login)
   * Supports logging in with Student Name or University Email
   */
  async login(identifier, password, remember = true) {
    const cleanId = (identifier || '').trim();
    const cleanIdLower = cleanId.toLowerCase();

    // Verify backend reachability before attempting login
    await this.checkBackendStatus();

    if (this.isOnline) {
      let response;
      try {
        response = await fetch(`${this.config.baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanId, name: cleanId, password })
        });
      } catch (networkErr) {
        console.warn('Backend network error during login, falling back to local mode:', networkErr);
        this.isOnline = false;
        this.updateBackendStatusUI();
      }

      if (response) {
        if (response.ok) {
          const result = await response.json();
          this.setToken(result.token, remember);
          this.setCurrentUser(result.user, remember);
          return { success: true, user: result.user, isLocal: false };
        } else {
          // Never fall back to local storage after backend credentials rejection or validation error
          let errorMessage = 'Invalid credentials. Please verify your student name or password.';
          try {
            const errData = await response.json();
            if (errData.error) {
              errorMessage = errData.error;
            } else if (errData.message) {
              errorMessage = errData.message;
            } else if (errData.errors && typeof errData.errors === 'object') {
              errorMessage = Object.values(errData.errors).join(', ');
            }
          } catch {
            // response was not JSON
          }
          throw new Error(errorMessage);
        }
      }
    }

    // Local storage fallback with user isolation (only when backend is genuinely offline)
    const usersStore = JSON.parse(localStorage.getItem('studypilot_registered_users') || '{}');

    // Check direct key first (e.g. email or username key)
    let existing = usersStore[cleanIdLower];

    // If not found directly, look through users list by email, name, username, or studentId
    if (!existing) {
      const allUsers = Object.values(usersStore);
      existing = allUsers.find(u =>
        (u.email && u.email.toLowerCase().trim() === cleanIdLower) ||
        (u.name && u.name.toLowerCase().trim() === cleanIdLower) ||
        (u.username && u.username.toLowerCase().trim() === cleanIdLower) ||
        (u.studentId && u.studentId.toLowerCase().trim() === cleanIdLower)
      );
    }

    if (!existing) {
      throw new Error('Student account not found. Please verify your name or email, or click "New Student Registration".');
    }

    if (existing.password !== password) {
      throw new Error('Incorrect password. Please verify your credentials.');
    }

    const token = 'jwt_local_sim_' + Math.random().toString(36).substring(2);
    this.setToken(token, remember);
    this.setCurrentUser(existing, remember);
    return { success: true, user: existing, isLocal: true };
  },

  /**
   * Register new student account (Simplified 4-field onboarding)
   * Mandatory fields: name, academicYear, password, age
   */
  async register(userData, remember = true) {
    // Verify backend reachability before attempting registration
    await this.checkBackendStatus();

    if (this.isOnline) {
      let response;
      try {
        response = await fetch(`${this.config.baseUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        });
      } catch (networkErr) {
        console.warn('Backend network error during registration, falling back to local mode:', networkErr);
        this.isOnline = false;
        this.updateBackendStatusUI();
      }

      if (response) {
        if (response.ok) {
          const result = await response.json();
          this.setToken(result.token, remember);
          this.setCurrentUser(result.user, remember);
          return { success: true, user: result.user, isLocal: false };
        } else {
          // Never fall back to local storage after non-2xx backend response (400, 401, 409, 500)
          let errorMessage = `Registration failed with status ${response.status}.`;
          try {
            const errData = await response.json();
            if (errData.error) {
              errorMessage = errData.error;
            } else if (errData.message) {
              errorMessage = errData.message;
            } else if (errData.errors && typeof errData.errors === 'object') {
              errorMessage = Object.values(errData.errors).join(', ');
            }
          } catch {
            // response was not JSON
          }
          throw new Error(errorMessage);
        }
      }
    }

    // Local storage registration
    const usersStore = JSON.parse(localStorage.getItem('studypilot_registered_users') || '{}');
    const cleanName = (userData.name || '').trim();
    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }
    const nameKey = cleanName.toLowerCase();

    // Check if account already exists with this name or email
    const allUsers = Object.values(usersStore);
    const existingUser = allUsers.find(u => {
      const matchName = u.name && u.name.toLowerCase().trim() === nameKey;
      const matchEmail = userData.email && u.email && u.email.toLowerCase().trim() === userData.email.toLowerCase().trim();
      return matchName || matchEmail;
    });

    if (existingUser || usersStore[nameKey]) {
      throw new Error('An account with this student name already exists. Please sign in or use a different name.');
    }

    // Generate safe email/account key for user isolation and backward compatibility
    const safeSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const userEmail = userData.email ? userData.email.toLowerCase().trim() : `${safeSlug || 'student'}@studypilot.local`;

    const newUser = {
      id: 'student-' + Date.now(),
      name: cleanName,
      academicYear: userData.academicYear || '1st Year',
      age: parseInt(userData.age, 10) || null,
      password: userData.password,
      // Backward compatibility fields for UI, GPA, and session management
      email: userEmail,
      username: nameKey,
      studentId: userData.studentId || '',
      major: userData.major || userData.academicYear || '',
      term: userData.term || userData.academicYear || '1st Year',
      weeklyGoalHours: parseInt(userData.weeklyGoalHours, 10) || 20,
      targetGpa: parseFloat(userData.targetGpa) || null,
      createdAt: new Date().toISOString()
    };

    // Index by both nameKey and userEmail to ensure seamless login and lookup
    usersStore[nameKey] = newUser;
    if (userEmail && userEmail !== nameKey) {
      usersStore[userEmail] = newUser;
    }
    localStorage.setItem('studypilot_registered_users', JSON.stringify(usersStore));

    // Initialize clean empty data store for this new student
    this.saveStudentData(userEmail, {
      profile: newUser,
      subjects: [],
      tasks: [],
      deadlines: [],
      calendarEvents: [],
      wellness: { mood: '' },
      sleepLogs: [],
      quizHistory: [],
      gpaHistory: [],
      studySessions: []
    });

    const token = 'jwt_local_sim_' + Math.random().toString(36).substring(2);
    this.setToken(token, remember);
    this.setCurrentUser(newUser, remember);

    return { success: true, user: newUser };
  }
};


/* ==========================================================================
   2. REAL AI SERVICE INTEGRATION POINT (Architecture Bridge)
   Requirement 8: No fake canned AI responses. 
   Dedicated real API integration ready for Google Gemini, OpenAI, or Backend.
   ========================================================================== */


const AIService = {
  config: {
    provider: localStorage.getItem('studypilot_ai_provider') || 'gemini',
    apiKey: localStorage.getItem('studypilot_ai_key') || '',
    endpoint: localStorage.getItem('studypilot_ai_endpoint') || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash'
  },


  isConfigured() {
    return Boolean(this.config.apiKey && this.config.apiKey.trim().length > 0);
  },


  saveConfig({ provider, apiKey, endpoint }) {
    this.config.provider = provider || this.config.provider;
    this.config.apiKey = apiKey ? apiKey.trim() : '';
    this.config.endpoint = endpoint || this.config.endpoint;
    this.config.model = 'gemini-1.5-flash';

    localStorage.setItem('studypilot_ai_provider', this.config.provider);
    localStorage.setItem('studypilot_ai_key', this.config.apiKey);
    localStorage.setItem('studypilot_ai_endpoint', this.config.endpoint);

    updateApiStatusUI();
  },

  async callAI({ prompt, systemInstruction = '', temperature = 0.7, attachments = [] }) {
    if (!this.isConfigured()) {
      throw new Error('API_KEY_REQUIRED');
    }

    if (this.config.provider === 'gemini') {
      const url = `${this.config.endpoint}?key=${encodeURIComponent(this.config.apiKey)}`;

      const parts = [];
      if (systemInstruction) {
        parts.push({ text: `System Instruction: ${systemInstruction}` });
      }

      // Append multimodal attachments if present (photos & PDFs)
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        attachments.forEach(att => {
          if (att.base64Data && att.mimeType) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.base64Data
              }
            });
          }
        });
      }

      // Append user prompt text
      parts.push({ text: prompt });

      const payload = {
        contents: [
          { parts: parts }
        ],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 2048
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API error with status ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!generatedText) throw new Error('No completion received from Gemini API');
      return generatedText;
    }

    else if (this.config.provider === 'openai') {
      const endpoint = this.config.endpoint.includes('generativelanguage')
        ? 'https://api.openai.com/v1/chat/completions'
        : this.config.endpoint;

      const userContent = [];
      userContent.push({ type: 'text', text: prompt });

      if (attachments && Array.isArray(attachments)) {
        attachments.forEach(att => {
          if (att.mimeType && att.mimeType.startsWith('image/')) {
            userContent.push({
              type: 'image_url',
              image_url: { url: att.dataUrl || `data:${att.mimeType};base64,${att.base64Data}` }
            });
          } else if (att.extractedText) {
            userContent.push({
              type: 'text',
              text: `[Attached Document Text - ${att.name}]:\n${att.extractedText}`
            });
          }
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: userContent.length === 1 ? prompt : userContent }
          ],
          temperature: temperature
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `OpenAI error ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No completion received.';
    }

    else {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({ prompt, systemInstruction, attachments: attachments.map(a => ({ name: a.name, mimeType: a.mimeType, size: a.size })) })
      });

      if (!response.ok) throw new Error(`Custom backend returned status ${response.status}`);
      const data = await response.json();
      return data.response || data.text || JSON.stringify(data);
    }
  },

  async askTutor(message, subject, mode, attachments = []) {
    let system = `You are StudyPilot AI, an elite university academic tutor specializing in ${subject}. Teaching style: ${mode}. Provide structured, clear, and pedagogically sound responses. When analyzing student uploaded photos, diagrams, handwriting, notes, or PDF documents, extract readable text, explain topics thoroughly, and answer student questions directly using the uploaded material.`;

    let promptWithAttachments = message;
    if (attachments && attachments.length > 0) {
      const fileNames = attachments.map(a => a.name).join(', ');
      promptWithAttachments = `[Attached Material: ${fileNames}]\n${message}`;
    }

    return await this.callAI({ prompt: promptWithAttachments, systemInstruction: system, attachments });
  },

  async summarizeDocument(text, format, depth) {
    const prompt = `Summarize the following academic lecture / study notes. Format: ${format}. Depth: ${depth}.\n\nDocument Text:\n${text}`;
    const system = `You are an academic synthesis AI. Summarize notes into well-structured, formatted study aids with headings, bullet points, and key takeaways.`;
    return await this.callAI({ prompt, systemInstruction: system });
  },

  async generateQuiz(topic, subject, count, difficulty) {
    const prompt = `Generate an active recall multiple-choice quiz of ${count} questions on the topic "${topic}" for the subject "${subject}" at ${difficulty} difficulty level. Return JSON formatted questions with options and correct index.`;
    return await this.callAI({ prompt });
  },

  async testConnection() {
    if (!this.isConfigured()) return { success: false, message: 'Please provide a valid API Key first.' };
    try {
      const res = await this.callAI({ prompt: 'Say hello in 5 words', temperature: 0.1 });
      return { success: true, message: `Connected successfully! Response: "${res.trim()}"` };
    } catch (e) {
      return { success: false, message: e.message || 'Connection test failed.' };
    }
  }
};

window.AIService = AIService;
window.BackendService = BackendService;


/* ==========================================================================
   3. APPLICATION STATE & DYNAMIC DATA CALCULATIONS
   No fabricated personal data. Clean empty states for new student sessions.
   ========================================================================== */
const AppState = {
  // Currently authenticated user (null if guest)
  currentUser: null,

  // Student specific data arrays (populated from user store)
  subjects: [],
  tasks: [],
  deadlines: [],
  calendarEvents: [],
  wellness: {
    mood: ''
  },

  // Daily Sleep Tracking history (isolated per student account)
  sleepLogs: [],

  // Multi-Institute GPA calculation history
  gpaHistory: [],

  // Subject-wise Study Time Tracker sessions
  studySessions: [],

  // Active quiz session
  quiz: {
    activeCategory: 'Active Recall',
    activeTitle: 'Knowledge Check',
    currentIndex: 0,
    score: 0,
    userAnswers: {},
    questions: []
  },

  // Save current student state back to storage
  persist() {
    const email = (this.currentUser && this.currentUser.email) ? this.currentUser.email : 'guest';
    BackendService.saveStudentData(email, {
      profile: this.currentUser,
      subjects: this.subjects,
      tasks: this.tasks,
      deadlines: this.deadlines,
      calendarEvents: this.calendarEvents,
      wellness: this.wellness,
      sleepLogs: this.sleepLogs || [],
      quizHistory: this.quizHistory || [],
      gpaHistory: this.gpaHistory || [],
      studySessions: this.studySessions || []
    });
  },

  // Load student state
  loadForUser(user) {
    this.currentUser = user;
    if (!user || !user.email) {
      const guestData = BackendService.getStudentData('guest');
      this.subjects = guestData.subjects || [];
      this.tasks = guestData.tasks || [];
      this.deadlines = guestData.deadlines || [];
      this.calendarEvents = guestData.calendarEvents || [];
      this.wellness = guestData.wellness || { mood: '' };
      this.sleepLogs = guestData.sleepLogs || [];
      this.quizHistory = guestData.quizHistory || [];
      this.gpaHistory = guestData.gpaHistory || [];
      this.studySessions = guestData.studySessions || [];
      return;
    }

    const data = BackendService.getStudentData(user.email);
    this.subjects = data.subjects || [];
    this.tasks = data.tasks || [];
    this.deadlines = data.deadlines || [];
    this.calendarEvents = data.calendarEvents || [];
    this.wellness = data.wellness || { mood: '' };
    this.sleepLogs = data.sleepLogs || [];
    this.quizHistory = data.quizHistory || [];
    this.gpaHistory = data.gpaHistory || [];
    this.studySessions = data.studySessions || [];
  },

  /**
   * Calculates real GPA based on student's entered subjects and marks (4.0 scale).
   */
  calculateGPA() {
    if (!this.subjects || this.subjects.length === 0) return { gpa: '--', credits: 0, avgScore: '--' };

    let totalPoints = 0;
    let totalCredits = 0;
    let sumMarks = 0;
    let countMarks = 0;

    this.subjects.forEach(sub => {
      const credits = parseFloat(sub.credits) || 0;
      const mark = parseFloat(sub.currentMark);

      if (!isNaN(mark)) {
        sumMarks += mark;
        countMarks++;

        let gradePoints = 0;
        if (mark >= 93) gradePoints = 4.0;
        else if (mark >= 90) gradePoints = 3.7;
        else if (mark >= 87) gradePoints = 3.3;
        else if (mark >= 83) gradePoints = 3.0;
        else if (mark >= 80) gradePoints = 2.7;
        else if (mark >= 77) gradePoints = 2.3;
        else if (mark >= 73) gradePoints = 2.0;
        else if (mark >= 70) gradePoints = 1.7;
        else if (mark >= 60) gradePoints = 1.0;
        else gradePoints = 0.0;

        totalPoints += gradePoints * credits;
        totalCredits += credits;
      }
    });

    if (totalCredits === 0) {
      return {
        gpa: '--',
        credits: this.subjects.reduce((sum, s) => sum + (parseFloat(s.credits) || 0), 0),
        avgScore: countMarks > 0 ? (sumMarks / countMarks).toFixed(1) + '%' : '--'
      };
    }

    const gpa = (totalPoints / totalCredits).toFixed(2);
    const avgScore = countMarks > 0 ? (sumMarks / countMarks).toFixed(1) + '%' : '--';
    return { gpa, credits: totalCredits, avgScore };
  }
};

window.AppState = AppState;


/* ==========================================================================
   4. DOM ELEMENT REFERENCES
   ========================================================================== */
const DOM = {
  // Layout & Sidebar
  sidebar: document.getElementById('sidebar'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
  navLinks: document.querySelectorAll('.nav-link'),
  appSections: document.querySelectorAll('.app-section'),
  globalSearchInput: document.getElementById('globalSearchInput'),
  currentDateDisplay: document.getElementById('currentDateDisplay'),
  sidebarSemesterText: document.getElementById('sidebarSemesterText'),
  sidebarUserTitle: document.getElementById('sidebarUserTitle'),
  sidebarUserSub: document.getElementById('sidebarUserSub'),
  sidebarAccountBtn: document.getElementById('sidebarAccountBtn'),

  // Top Nav Profile & Badges
  topNavAvatarInitial: document.getElementById('topNavAvatarInitial'),
  topNavUserName: document.getElementById('topNavUserName'),
  topNavUserRole: document.getElementById('topNavUserRole'),
  profileDropdownBtn: document.getElementById('profileDropdownBtn'),
  profileDropdown: document.getElementById('profileDropdown'),
  profileDropdownName: document.getElementById('profileDropdownName'),
  profileDropdownId: document.getElementById('profileDropdownId'),
  profileDropdownGpa: document.getElementById('profileDropdownGpa'),
  notificationsBtn: document.getElementById('notificationsBtn'),
  notificationDropdown: document.getElementById('notificationDropdown'),
  notificationBadge: document.getElementById('notificationBadge'),
  notificationCount: document.getElementById('notificationCount'),
  notificationList: document.getElementById('notificationList'),
  logoutBtn: document.getElementById('logoutBtn'),
  openLoginModalBtn: document.getElementById('openLoginModalBtn'),
  openProfileModalBtn: document.getElementById('openProfileModalBtn'),
  openManageSubjectsBtn: document.getElementById('openManageSubjectsBtn'),

  // Backend & AI Status
  backendStatusPill: document.getElementById('backendStatusPill'),
  topApiStatusBtn: document.getElementById('topApiStatusBtn'),
  topApiIndicator: document.getElementById('topApiIndicator'),
  topApiStatusText: document.getElementById('topApiStatusText'),
  sidebarApiSub: document.getElementById('sidebarApiSub'),
  sidebarApiTag: document.getElementById('sidebarApiTag'),

  // Dashboard Overview
  heroStudentName: document.getElementById('heroStudentName'),
  heroWelcomeText: document.getElementById('heroWelcomeText'),
  heroTermBadge: document.getElementById('heroTermBadge'),
  heroStreakCount: document.getElementById('heroStreakCount'),
  heroAddSubjectBtn: document.getElementById('heroAddSubjectBtn'),
  quickAddSubjectIconBtn: document.getElementById('quickAddSubjectIconBtn'),
  kpiSubjectCount: document.getElementById('kpiSubjectCount'),
  dashboardSubjectChips: document.getElementById('dashboardSubjectChips'),
  kpiExamsCount: document.getElementById('kpiExamsCount'),
  dashboardNextExamDetail: document.getElementById('dashboardNextExamDetail'),
  kpiStudyHours: document.getElementById('kpiStudyHours'),
  kpiStudyGoalTag: document.getElementById('kpiStudyGoalTag'),
  kpiStudyHoursBar: document.getElementById('kpiStudyHoursBar'),
  kpiStudyHoursAchieved: document.getElementById('kpiStudyHoursAchieved'),
  kpiStudyHoursRemaining: document.getElementById('kpiStudyHoursRemaining'),
  kpiTaskRatio: document.getElementById('kpiTaskRatio'),
  kpiTaskBar: document.getElementById('kpiTaskBar'),
  kpiTaskPercentTag: document.getElementById('kpiTaskPercentTag'),
  kpiPendingText: document.getElementById('kpiPendingText'),
  dashboardTasksList: document.getElementById('dashboardTasksList'),
  dashboardDeadlinesList: document.getElementById('dashboardDeadlinesList'),
  dashboardAddDeadlineBtn: document.getElementById('dashboardAddDeadlineBtn'),
  dashQuickAddTaskBtn: document.getElementById('dashQuickAddTaskBtn'),
  dashboardQuickAiInput: document.getElementById('dashboardQuickAiInput'),
  dashboardQuickAiSubmitBtn: document.getElementById('dashboardQuickAiSubmitBtn'),

  // AI Tutor
  tutorSubjectSelect: document.getElementById('tutorSubjectSelect'),
  tutorModeSelect: document.getElementById('tutorModeSelect'),
  tutorChatViewport: document.getElementById('tutorChatViewport'),
  tutorChatForm: document.getElementById('tutorChatForm'),
  tutorPromptInput: document.getElementById('tutorPromptInput'),
  aiTutorConfigBtn: document.getElementById('aiTutorConfigBtn'),
  noticeConfigBtn: document.getElementById('noticeConfigBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  attachCodeBtn: document.getElementById('attachCodeBtn'),
  tutorAttachFileBtn: document.getElementById('tutorAttachFileBtn'),
  tutorFileInput: document.getElementById('tutorFileInput'),
  tutorAttachmentTray: document.getElementById('tutorAttachmentTray'),
  tutorConnectionBadge: document.getElementById('tutorConnectionBadge'),
  tutorConnectionText: document.getElementById('tutorConnectionText'),

  // Study Planner
  sidebarPomoTimer: document.getElementById('sidebarPomoTimer'),
  sidebarPomoStartBtn: document.getElementById('sidebarPomoStartBtn'),
  sidebarPomoResetBtn: document.getElementById('sidebarPomoResetBtn'),
  sidebarPomoMode: document.getElementById('sidebarPomoMode'),
  mainPomoTimer: document.getElementById('mainPomoTimer'),
  mainPomoStartBtn: document.getElementById('mainPomoStartBtn'),
  mainPomoResetBtn: document.getElementById('mainPomoResetBtn'),
  pomoTabBtns: document.querySelectorAll('.pomo-tab-btn'),
  tasksListContainer: document.getElementById('tasksListContainer'),
  taskFilterBtns: document.querySelectorAll('.task-filter-btn'),
  taskSearchInput: document.getElementById('taskSearchInput'),
  openAddTaskModalBtn: document.getElementById('openAddTaskModalBtn'),

  // Notes Summarizer
  rawNotesInput: document.getElementById('rawNotesInput'),
  notesWordCount: document.getElementById('notesWordCount'),
  clearNotesTextBtn: document.getElementById('clearNotesTextBtn'),
  loadSampleNotesBtn: document.getElementById('loadSampleNotesBtn'),
  summaryFormatSelect: document.getElementById('summaryFormatSelect'),
  summaryLengthSelect: document.getElementById('summaryLengthSelect'),
  executeSummarizeBtn: document.getElementById('executeSummarizeBtn'),
  summaryContentArea: document.getElementById('summaryContentArea'),
  summaryOutputMeta: document.getElementById('summaryOutputMeta'),
  copySummaryBtn: document.getElementById('copySummaryBtn'),
  downloadSummaryBtn: document.getElementById('downloadSummaryBtn'),
  fileDropZone: document.getElementById('fileDropZone'),
  pdfFileInput: document.getElementById('pdfFileInput'),
  browseFileBtn: document.getElementById('browseFileBtn'),
  selectedFileBar: document.getElementById('selectedFileBar'),
  selectedFileName: document.getElementById('selectedFileName'),
  selectedFileSize: document.getElementById('selectedFileSize'),
  removeFileBtn: document.getElementById('removeFileBtn'),

  // Quiz Generator
  quizTopicInput: document.getElementById('quizTopicInput'),
  quizSubjectSelect: document.getElementById('quizSubjectSelect'),
  quizNumQuestions: document.getElementById('quizNumQuestions'),
  quizDifficulty: document.getElementById('quizDifficulty'),
  quizGeneratorForm: document.getElementById('quizGeneratorForm'),
  quizPlayerCard: document.getElementById('quizPlayerCard'),
  quizResultsCard: document.getElementById('quizResultsCard'),
  questionContainer: document.getElementById('questionContainer'),
  playerCategoryTag: document.getElementById('playerCategoryTag'),
  playerTitle: document.getElementById('playerTitle'),
  liveQuizScore: document.getElementById('liveQuizScore'),
  liveQuizTotal: document.getElementById('liveQuizTotal'),
  quizProgressFill: document.getElementById('quizProgressFill'),
  quizStepText: document.getElementById('quizStepText'),
  quizPrevBtn: document.getElementById('quizPrevBtn'),
  quizNextBtn: document.getElementById('quizNextBtn'),
  quizFinishBtn: document.getElementById('quizFinishBtn'),
  finalScorePercent: document.getElementById('finalScorePercent'),
  finalScoreFraction: document.getElementById('finalScoreFraction'),
  finalFeedbackText: document.getElementById('finalFeedbackText'),
  retakeQuizBtn: document.getElementById('retakeQuizBtn'),
  newQuizBtn: document.getElementById('newQuizBtn'),

  // Wellness & Mood
  moodBtns: document.querySelectorAll('.mood-btn'),
  moodFeedbackQuote: document.getElementById('moodFeedbackQuote'),
  breathBubble: document.getElementById('breathBubble'),
  breathStateText: document.getElementById('breathStateText'),
  breathCounterText: document.getElementById('breathCounterText'),
  breathToggleBtn: document.getElementById('breathToggleBtn'),

  // Daily Sleep Tracker
  sleepYesterdayDateLabel: document.getElementById('sleepYesterdayDateLabel'),
  sleepYesterdayForm: document.getElementById('sleepYesterdayForm'),
  sleepYesterdayHours: document.getElementById('sleepYesterdayHours'),
  sleepYesterdayMinutes: document.getElementById('sleepYesterdayMinutes'),
  saveYesterdaySleepBtn: document.getElementById('saveYesterdaySleepBtn'),
  sleepYesterdayLoggedBox: document.getElementById('sleepYesterdayLoggedBox'),
  yesterdayLoggedVal: document.getElementById('yesterdayLoggedVal'),
  editYesterdaySleepBtn: document.getElementById('editYesterdaySleepBtn'),
  sleepAvgDuration: document.getElementById('sleepAvgDuration'),
  sleepDaysRecordedCount: document.getElementById('sleepDaysRecordedCount'),
  sleepLatestQuality: document.getElementById('sleepLatestQuality'),
  toggleCustomDateBtn: document.getElementById('toggleCustomDateBtn'),
  customDateForm: document.getElementById('customDateForm'),
  customDateChevron: document.getElementById('customDateChevron'),
  sleepCustomDate: document.getElementById('sleepCustomDate'),
  sleepCustomHours: document.getElementById('sleepCustomHours'),
  sleepCustomMinutes: document.getElementById('sleepCustomMinutes'),
  saveCustomDateSleepBtn: document.getElementById('saveCustomDateSleepBtn'),
  sleepHistoryList: document.getElementById('sleepHistoryList'),

  // Calendar
  calendarCurrentMonthYear: document.getElementById('calendarCurrentMonthYear'),
  calendarDaysGrid: document.getElementById('calendarDaysGrid'),
  prevMonthBtn: document.getElementById('prevMonthBtn'),
  nextMonthBtn: document.getElementById('nextMonthBtn'),
  selectedDateHeader: document.getElementById('selectedDateHeader'),
  selectedDateCount: document.getElementById('selectedDateCount'),
  selectedDayEventsList: document.getElementById('selectedDayEventsList'),
  quickAddEventForm: document.getElementById('quickAddEventForm'),
  calFilterPills: document.querySelectorAll('.cal-filter-pill'),
  openAddEventModalBtn: document.getElementById('openAddEventModalBtn'),

  // Progress Reports
  reportGpaValue: document.getElementById('reportGpaValue'),
  reportTotalCredits: document.getElementById('reportTotalCredits'),
  reportEnrolledLoad: document.getElementById('reportEnrolledLoad'),
  reportAvgScore: document.getElementById('reportAvgScore'),
  reportTargetGpa: document.getElementById('reportTargetGpa'),
  courseReportTableBody: document.getElementById('courseReportTableBody'),
  reportAddSubjectBtn: document.getElementById('reportAddSubjectBtn'),
  manageSubjectsTableBtn: document.getElementById('manageSubjectsTableBtn'),
  printReportBtn: document.getElementById('printReportBtn'),

  // Modals
  authModal: document.getElementById('authModal'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  tabLoginBtn: document.getElementById('tabLoginBtn'),
  tabRegisterBtn: document.getElementById('tabRegisterBtn'),
  closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),

  profileModal: document.getElementById('profileModal'),
  editProfileForm: document.getElementById('editProfileForm'),
  closeProfileModalBtn: document.getElementById('closeProfileModalBtn'),
  cancelProfileBtn: document.getElementById('cancelProfileBtn'),

  subjectModal: document.getElementById('subjectModal'),
  subjectForm: document.getElementById('subjectForm'),
  subjectModalTitle: document.getElementById('subjectModalTitle'),
  subjectEditId: document.getElementById('subjectEditId'),
  closeSubjectModalBtn: document.getElementById('closeSubjectModalBtn'),
  cancelSubjectBtn: document.getElementById('cancelSubjectBtn'),

  manageSubjectsModal: document.getElementById('manageSubjectsModal'),
  manageSubjectsListContainer: document.getElementById('manageSubjectsListContainer'),
  manageSubjectsSubtitle: document.getElementById('manageSubjectsSubtitle'),
  manageAddSubjectBtn: document.getElementById('manageAddSubjectBtn'),
  closeManageSubjectsModalBtn: document.getElementById('closeManageSubjectsModalBtn'),
  closeManageSubjectsDoneBtn: document.getElementById('closeManageSubjectsDoneBtn'),

  addTaskModal: document.getElementById('addTaskModal'),
  addTaskForm: document.getElementById('addTaskForm'),
  closeAddTaskModalBtn: document.getElementById('closeAddTaskModalBtn'),
  cancelAddTaskBtn: document.getElementById('cancelAddTaskBtn'),

  addEventModal: document.getElementById('addEventModal'),
  addEventModalForm: document.getElementById('addEventModalForm'),
  closeAddEventModalBtn: document.getElementById('closeAddEventModalBtn'),
  cancelAddEventBtn: document.getElementById('cancelAddEventBtn'),

  aiConfigModal: document.getElementById('aiConfigModal'),
  openAiSettingsBtn: document.getElementById('openAiSettingsBtn'),
  profileAiSettingsBtn: document.getElementById('profileAiSettingsBtn'),
  closeAiConfigModalBtn: document.getElementById('closeAiConfigModalBtn'),
  cancelAiConfigBtn: document.getElementById('cancelAiConfigBtn'),
  aiConfigForm: document.getElementById('aiConfigForm'),
  aiProviderSelect: document.getElementById('aiProviderSelect'),
  aiApiKeyInput: document.getElementById('aiApiKeyInput'),
  aiEndpointInput: document.getElementById('aiEndpointInput'),
  toggleApiKeyVisibilityBtn: document.getElementById('toggleApiKeyVisibilityBtn'),
  testApiConnectionBtn: document.getElementById('testApiConnectionBtn'),
  testConnectionResult: document.getElementById('testConnectionResult'),
  modalApiStatusText: document.getElementById('modalApiStatusText'),

  toastContainer: document.getElementById('toastContainer')
};


/* ==========================================================================
   5. UI NOTIFICATIONS & TOAST HELPER
   ========================================================================== */
function showToast(message, type = 'info', duration = 3500) {
  if (!DOM.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


/* ==========================================================================
   6. USER AUTHENTICATION & SESSION MANAGEMENT
   ========================================================================== */
function initAuth() {
  // Check if a student was previously logged in
  const savedUser = BackendService.getCurrentUser();
  if (savedUser) {
    AppState.loadForUser(savedUser);
    updateUserUI();
  } else {
    // If no user, prompt authentication modal on first visit
    setTimeout(() => {
      openAuthModal('login');
    }, 400);
  }

  // Auth modal tabs
  if (DOM.tabLoginBtn && DOM.tabRegisterBtn) {
    DOM.tabLoginBtn.addEventListener('click', () => {
      DOM.tabLoginBtn.classList.add('active');
      DOM.tabRegisterBtn.classList.remove('active');
      DOM.loginForm.classList.remove('d-none');
      DOM.registerForm.classList.add('d-none');
    });

    DOM.tabRegisterBtn.addEventListener('click', () => {
      DOM.tabRegisterBtn.classList.add('active');
      DOM.tabLoginBtn.classList.remove('active');
      DOM.registerForm.classList.remove('d-none');
      DOM.loginForm.classList.add('d-none');
    });
  }

  // Login form submit
  if (DOM.loginForm) {
    DOM.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const remember = document.getElementById('loginRememberMe').checked;

      try {
        const result = await BackendService.login(email, password, remember);
        AppState.loadForUser(result.user);
        closeAuthModal();
        updateUserUI();
        renderAllViews();
        if (window.ExamLearningService?.reload) {
          window.ExamLearningService.reload();
        }
        if (result.isLocal) {
          showToast(`Offline session: Signed in locally as ${result.user.name}.`, 'warning', 5000);
        } else {
          showToast(`Welcome back, ${result.user.name}!`, 'success');
        }
      } catch (err) {
        showToast(err.message, 'warning', 4500);
      }
    });
  }

  // Registration form submit (Simplified 4-field registration)
  if (DOM.registerForm) {
    DOM.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('regFullName');
      const academicYearEl = document.getElementById('regAcademicYear');
      const ageEl = document.getElementById('regAge');
      const passwordEl = document.getElementById('regPassword');

      const name = nameEl ? nameEl.value.trim() : '';
      const academicYear = academicYearEl ? academicYearEl.value : '';
      const age = ageEl ? ageEl.value.trim() : '';
      const password = passwordEl ? passwordEl.value : '';

      if (!name) {
        showToast('Please enter your full name.', 'warning');
        return;
      }
      if (!academicYear) {
        showToast('Please select your academic year.', 'warning');
        return;
      }
      if (!age || parseInt(age, 10) < 10) {
        showToast('Please enter a valid age.', 'warning');
        return;
      }
      if (!password || password.length < 4) {
        showToast('Please enter a password with at least 4 characters.', 'warning');
        return;
      }

      try {
        const result = await BackendService.register({
          name,
          academicYear,
          password,
          age: parseInt(age, 10)
        });

        AppState.loadForUser(result.user);
        closeAuthModal();
        updateUserUI();
        renderAllViews();
        if (window.ExamLearningService?.reload) {
          window.ExamLearningService.reload();
        }
        if (result.isLocal) {
          showToast(`Offline mode: Account created locally for ${result.user.name}. Not saved to server.`, 'warning', 6000);
        } else {
          showToast(`Registration complete! Welcome to StudyPilot, ${result.user.name}.`, 'success');
        }
      } catch (err) {
        showToast(err.message, 'warning', 4500);
      }
    });
  }

  // Logout button
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to log out of this student session?')) {
        BackendService.clearToken();
        AppState.loadForUser(null);
        updateUserUI();
        renderAllViews();
        if (window.ExamLearningService?.reload) {
          window.ExamLearningService.reload();
        }
        openAuthModal('login');
        showToast('Logged out successfully.', 'info');
      }
    });
  }

  // Open login modal triggers
  [DOM.openLoginModalBtn, DOM.sidebarAccountBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', () => openAuthModal('login'));
  });

  if (DOM.closeAuthModalBtn) DOM.closeAuthModalBtn.addEventListener('click', closeAuthModal);
  DOM.authModal.addEventListener('click', (e) => {
    if (e.target === DOM.authModal) closeAuthModal();
  });
}

function openAuthModal(tab = 'login') {
  DOM.authModal.classList.add('show');
  BackendService.checkBackendStatus();
  if (tab === 'login' && DOM.tabLoginBtn) DOM.tabLoginBtn.click();
  if (tab === 'register' && DOM.tabRegisterBtn) DOM.tabRegisterBtn.click();
}

function closeAuthModal() {
  DOM.authModal.classList.remove('show');
}


/* ==========================================================================
   7. USER PROFILE & INTERFACE SYNCHRONIZATION
   ========================================================================== */
function updateUserUI() {
  const user = AppState.currentUser;
  const isGuest = !user;

  const displayName = isGuest ? 'Guest Student' : user.name;
  const displayRole = isGuest ? 'Not Signed In' : (user.academicYear || user.major || 'Enrolled Student');
  const displayId = isGuest ? 'ID: --' : (user.studentId ? `ID: ${user.studentId}` : (user.age ? `Age: ${user.age} • ${user.academicYear || 'Student'}` : (user.academicYear || 'Student')));
  const displayTerm = isGuest ? 'Term: None' : (user.academicYear || user.term || 'Active Term');

  // Initials
  const initials = isGuest ? 'ST' : user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  // Top Nav
  if (DOM.topNavAvatarInitial) DOM.topNavAvatarInitial.textContent = initials;
  if (DOM.topNavUserName) DOM.topNavUserName.textContent = displayName;
  if (DOM.topNavUserRole) DOM.topNavUserRole.textContent = displayRole;

  // Profile Dropdown
  if (DOM.profileDropdownName) DOM.profileDropdownName.textContent = displayName;
  if (DOM.profileDropdownId) DOM.profileDropdownId.textContent = displayId;

  const gpaData = AppState.calculateGPA();
  if (DOM.profileDropdownGpa) {
    DOM.profileDropdownGpa.innerHTML = `<i class="fa-solid fa-star"></i> GPA: ${gpaData.gpa}`;
  }

  // Sidebar
  if (DOM.sidebarSemesterText) DOM.sidebarSemesterText.textContent = displayTerm;
  if (DOM.sidebarUserTitle) DOM.sidebarUserTitle.textContent = displayName;
  if (DOM.sidebarUserSub) DOM.sidebarUserSub.textContent = isGuest ? 'Click to Sign In' : (user.academicYear || user.major || 'Student Account');

  // Hero Welcome Banner
  if (DOM.heroStudentName) DOM.heroStudentName.textContent = isGuest ? 'Student' : `${user.name.split(' ')[0]}!`;
  if (DOM.heroTermBadge) DOM.heroTermBadge.textContent = displayTerm;
  if (DOM.heroWelcomeText) {
    if (isGuest) {
      DOM.heroWelcomeText.textContent = 'Welcome to StudyPilot AI. Log in or create an account to start tracking your coursework.';
    } else if (AppState.subjects.length === 0) {
      DOM.heroWelcomeText.textContent = 'You have not added any enrolled subjects yet. Add your courses below to start tracking tasks and exams.';
    } else {
      const pendingCount = AppState.tasks.filter(t => !t.completed).length;
      const examCount = AppState.deadlines.filter(d => d.type === 'exam').length;
      DOM.heroWelcomeText.textContent = `You have ${pendingCount} pending task${pendingCount === 1 ? '' : 's'} and ${examCount} upcoming exam${examCount === 1 ? '' : 's'}. Keep your academic goals on target!`;
    }
  }

  if (DOM.heroStreakCount) {
    DOM.heroStreakCount.textContent = `${AppState.tasks.some(t => t.completed) ? '3 Days' : '1 Day'}`;
  }

  // Progress Reports Header
  if (DOM.reportTargetGpa) {
    DOM.reportTargetGpa.textContent = isGuest || !user.targetGpa ? '--' : Number(user.targetGpa).toFixed(2);
  }
}

function initProfileModal() {
  function openModal() {
    if (!AppState.currentUser) {
      openAuthModal('login');
      return;
    }
    const user = AppState.currentUser;
    const nameEl = document.getElementById('profileFullName');
    const yearEl = document.getElementById('profileAcademicYear');
    const ageEl = document.getElementById('profileAge');
    const idEl = document.getElementById('profileStudentId');
    const majorEl = document.getElementById('profileMajor');
    const termEl = document.getElementById('profileTerm');
    const goalEl = document.getElementById('profileWeeklyGoal');
    const gpaEl = document.getElementById('profileTargetGpa');

    if (nameEl) nameEl.value = user.name || '';
    if (yearEl) yearEl.value = user.academicYear || '1st Year';
    if (ageEl) ageEl.value = user.age || '';
    if (idEl) idEl.value = user.studentId || '';
    if (majorEl) majorEl.value = user.major || '';
    if (termEl) termEl.value = user.term || '';
    if (goalEl) goalEl.value = user.weeklyGoalHours || 20;
    if (gpaEl) gpaEl.value = user.targetGpa || '';

    DOM.profileModal.classList.add('show');
  }

  function closeModal() {
    DOM.profileModal.classList.remove('show');
  }

  if (DOM.openProfileModalBtn) DOM.openProfileModalBtn.addEventListener('click', openModal);
  if (DOM.closeProfileModalBtn) DOM.closeProfileModalBtn.addEventListener('click', closeModal);
  if (DOM.cancelProfileBtn) DOM.cancelProfileBtn.addEventListener('click', closeModal);

  // Quick access to profile settings from dashboard target cards
  const targetGpaCard = document.getElementById('reportTargetStatus');
  if (targetGpaCard) {
    targetGpaCard.style.cursor = 'pointer';
    targetGpaCard.addEventListener('click', openModal);
  }
  const studyGoalTag = document.getElementById('kpiStudyGoalTag');
  if (studyGoalTag) {
    studyGoalTag.style.cursor = 'pointer';
    studyGoalTag.addEventListener('click', openModal);
  }

  DOM.profileModal.addEventListener('click', (e) => {
    if (e.target === DOM.profileModal) closeModal();
  });

  if (DOM.editProfileForm) {
    DOM.editProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!AppState.currentUser) return;

      const user = AppState.currentUser;
      const nameEl = document.getElementById('profileFullName');
      const yearEl = document.getElementById('profileAcademicYear');
      const ageEl = document.getElementById('profileAge');
      const idEl = document.getElementById('profileStudentId');
      const majorEl = document.getElementById('profileMajor');
      const termEl = document.getElementById('profileTerm');
      const goalEl = document.getElementById('profileWeeklyGoal');
      const gpaEl = document.getElementById('profileTargetGpa');

      if (nameEl && nameEl.value.trim()) user.name = nameEl.value.trim();
      if (yearEl) user.academicYear = yearEl.value;
      if (ageEl) user.age = parseInt(ageEl.value, 10) || user.age;
      if (idEl) user.studentId = idEl.value.trim();
      if (majorEl) user.major = majorEl.value.trim();
      if (termEl) user.term = termEl.value.trim();
      if (goalEl) user.weeklyGoalHours = parseInt(goalEl.value, 10) || 20;
      if (gpaEl) user.targetGpa = gpaEl.value ? parseFloat(gpaEl.value) : null;

      // Update registered users in localStorage cache
      const usersStore = JSON.parse(localStorage.getItem('studypilot_registered_users') || '{}');
      if (user.email && usersStore[user.email.toLowerCase()]) {
        usersStore[user.email.toLowerCase()] = user;
      }
      if (user.username && usersStore[user.username.toLowerCase()]) {
        usersStore[user.username.toLowerCase()] = user;
      }
      if (user.name && usersStore[user.name.toLowerCase()]) {
        usersStore[user.name.toLowerCase()] = user;
      }
      localStorage.setItem('studypilot_registered_users', JSON.stringify(usersStore));
      BackendService.setCurrentUser(user);

      AppState.persist();
      closeModal();
      updateUserUI();
      renderDashboardMetrics();
      showToast('Profile and academic goals updated!', 'success');
    });
  }
}


/* ==========================================================================
   8. SUBJECT / COURSE CRUD & DROPDOWN SYNCHRONIZATION
   Allows adding, editing, and deleting real student subjects.
   Recalculates GPA and updates all course dropdowns in the app.
   ========================================================================== */
function initSubjectManagement() {
  // Open Add Subject Modal
  function openAddSubjectModal() {
    if (!AppState.currentUser) {
      showToast('Please sign in to add your enrolled subjects.', 'warning');
      openAuthModal('login');
      return;
    }
    DOM.subjectModalTitle.textContent = 'Add Enrolled Subject';
    DOM.subjectEditId.value = '';
    DOM.subjectForm.reset();
    document.getElementById('subjectCreditsInput').value = '3.0';
    DOM.subjectModal.classList.add('show');
  }

  // Open Edit Subject Modal
  function openEditSubjectModal(subjectId) {
    const sub = AppState.subjects.find(s => s.id === subjectId);
    if (!sub) return;

    DOM.subjectModalTitle.textContent = `Edit Subject (${sub.code})`;
    DOM.subjectEditId.value = sub.id;
    document.getElementById('subjectCodeInput').value = sub.code;
    document.getElementById('subjectCreditsInput').value = sub.credits;
    document.getElementById('subjectTitleInput').value = sub.name;
    document.getElementById('subjectInstructorInput').value = sub.instructor || '';
    document.getElementById('subjectCurrentMarkInput').value = sub.currentMark !== undefined ? sub.currentMark : '';
    document.getElementById('subjectTargetMarkInput').value = sub.targetMark !== undefined ? sub.targetMark : '';

    DOM.subjectModal.classList.add('show');
  }

  function closeSubjectModal() {
    DOM.subjectModal.classList.remove('show');
  }

  // Triggers for Add Subject
  [DOM.heroAddSubjectBtn, DOM.quickAddSubjectIconBtn, DOM.reportAddSubjectBtn, DOM.manageAddSubjectBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', openAddSubjectModal);
  });

  if (DOM.closeSubjectModalBtn) DOM.closeSubjectModalBtn.addEventListener('click', closeSubjectModal);
  if (DOM.cancelSubjectBtn) DOM.cancelSubjectBtn.addEventListener('click', closeSubjectModal);

  DOM.subjectModal.addEventListener('click', (e) => {
    if (e.target === DOM.subjectModal) closeSubjectModal();
  });

  // Save Subject Form (Add or Edit)
  if (DOM.subjectForm) {
    DOM.subjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!AppState.currentUser) return;

      const editId = DOM.subjectEditId.value;
      const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
      const credits = parseFloat(document.getElementById('subjectCreditsInput').value) || 3.0;
      const name = document.getElementById('subjectTitleInput').value.trim();
      const instructor = document.getElementById('subjectInstructorInput').value.trim();
      const currentMark = document.getElementById('subjectCurrentMarkInput').value !== ''
        ? parseFloat(document.getElementById('subjectCurrentMarkInput').value)
        : undefined;
      const targetMark = document.getElementById('subjectTargetMarkInput').value !== ''
        ? parseFloat(document.getElementById('subjectTargetMarkInput').value)
        : undefined;

      if (!code || !name) return;

      if (editId) {
        // Edit existing
        const index = AppState.subjects.findIndex(s => s.id === editId);
        if (index !== -1) {
          AppState.subjects[index] = {
            ...AppState.subjects[index],
            code,
            credits,
            name,
            instructor,
            currentMark,
            targetMark
          };
          showToast(`Subject ${code} updated!`, 'success');
        }
      } else {
        // Create new
        const newSub = {
          id: 'sub-' + Date.now(),
          code,
          name,
          credits,
          instructor,
          currentMark,
          targetMark
        };
        AppState.subjects.push(newSub);
        showToast(`Subject ${code} added to your semester!`, 'success');
      }

      AppState.persist();
      closeSubjectModal();
      renderAllViews();
    });
  }

  // Manage Subjects Modal handlers
  function openManageModal() {
    if (!AppState.currentUser) {
      openAuthModal('login');
      return;
    }
    renderManageSubjectsList();
    DOM.manageSubjectsModal.classList.add('show');
  }

  function closeManageModal() {
    DOM.manageSubjectsModal.classList.remove('show');
  }

  if (DOM.openManageSubjectsBtn) DOM.openManageSubjectsBtn.addEventListener('click', openManageModal);
  if (DOM.manageSubjectsTableBtn) DOM.manageSubjectsTableBtn.addEventListener('click', openManageModal);
  if (DOM.closeManageSubjectsModalBtn) DOM.closeManageSubjectsModalBtn.addEventListener('click', closeManageModal);
  if (DOM.closeManageSubjectsDoneBtn) DOM.closeManageSubjectsDoneBtn.addEventListener('click', closeManageModal);

  DOM.manageSubjectsModal.addEventListener('click', (e) => {
    if (e.target === DOM.manageSubjectsModal) closeManageModal();
  });

  window.openEditSubjectModal = openEditSubjectModal;
}

function renderManageSubjectsList() {
  if (!DOM.manageSubjectsListContainer) return;
  DOM.manageSubjectsListContainer.innerHTML = '';

  if (DOM.manageSubjectsSubtitle) {
    DOM.manageSubjectsSubtitle.textContent = `${AppState.subjects.length} subjects enrolled`;
  }

  if (AppState.subjects.length === 0) {
    DOM.manageSubjectsListContainer.innerHTML = `
      <div class="empty-state-box">
        <i class="fa-solid fa-book-open"></i>
        <h4>No Subjects Enrolled</h4>
        <p>You haven't added any courses for this semester yet.</p>
      </div>
    `;
    return;
  }

  AppState.subjects.forEach(sub => {
    const row = document.createElement('div');
    row.className = 'manage-subject-row';

    const markDisplay = sub.currentMark !== undefined ? `${sub.currentMark}%` : 'Not graded';

    row.innerHTML = `
      <div class="subject-info-col">
        <strong>${sub.code} - ${sub.name}</strong>
        <p>${sub.credits} Credits &bull; Mark: ${markDisplay} &bull; Instructor: ${sub.instructor || 'Unassigned'}</p>
      </div>
      <div class="subject-actions">
        <button class="btn-sm btn-outline-primary" data-edit-subject="${sub.id}" title="Edit Subject">
          <i class="fa-solid fa-pen-to-square"></i> Edit
        </button>
        <button class="btn-sm btn-icon-sm text-danger" data-delete-subject="${sub.id}" title="Delete Subject">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    row.querySelector('[data-edit-subject]').addEventListener('click', () => {
      DOM.manageSubjectsModal.classList.remove('show');
      window.openEditSubjectModal(sub.id);
    });

    row.querySelector('[data-delete-subject]').addEventListener('click', () => {
      if (confirm(`Remove "${sub.code} - ${sub.name}" from your enrolled subjects?`)) {
        AppState.subjects = AppState.subjects.filter(s => s.id !== sub.id);
        AppState.persist();
        renderManageSubjectsList();
        renderAllViews();
        showToast(`Subject ${sub.code} removed.`, 'warning');
      }
    });

    DOM.manageSubjectsListContainer.appendChild(row);
  });
}

/**
 * Dynamically repopulates all subject <select> dropdowns across the app
 * using the student's actual enrolled subjects.
 */
function renderSubjectDropdowns() {
  const selects = [
    DOM.tutorSubjectSelect,
    DOM.quizSubjectSelect,
    document.getElementById('taskSubjectSelect'),
    document.getElementById('modalEventSubject'),
    document.getElementById('trackerSubjectSelect')
  ];

  selects.forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';

    if (AppState.subjects.length === 0) {
      select.innerHTML = `<option value="GEN101" data-title="General Academic Studies">General Academic Studies</option>`;
      return;
    }

    AppState.subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.code;
      opt.textContent = `${sub.code} - ${sub.name || sub.title || sub.code}`;
      opt.setAttribute('data-title', sub.name || sub.title || sub.code);
      select.appendChild(opt);
    });

    // Restore previous selection if still available
    if (currentVal && AppState.subjects.some(s => s.code === currentVal)) {
      select.value = currentVal;
    }
  });
}


/* ==========================================================================
   9. DASHBOARD METRICS & WIDGET RENDERING
   Displays purely the active student's data with zero hardcoded mocks.
   ========================================================================== */
function renderNotifications() {
  if (!DOM.notificationList) return;
  DOM.notificationList.innerHTML = '';

  const deadlines = AppState.deadlines;
  const count = deadlines.length;

  if (DOM.notificationBadge) DOM.notificationBadge.textContent = count;
  if (DOM.notificationCount) DOM.notificationCount.textContent = `${count} New`;

  if (count === 0) {
    DOM.notificationList.innerHTML = `
      <li class="notification-item" style="justify-content:center; padding: 1.5rem 1rem; color: #94a3b8; font-size: 0.85rem;">
        <i class="fa-regular fa-bell-slash"></i> &nbsp; No new notifications
      </li>
    `;
    return;
  }

  deadlines.slice(0, 5).forEach(item => {
    const li = document.createElement('li');
    li.className = `notification-item ${item.urgent ? 'unread' : ''}`;
    const iconClass = item.type === 'exam' ? 'urgent' : 'info';
    const iconName = item.type === 'exam' ? 'fa-triangle-exclamation' : 'fa-file-circle-check';

    li.innerHTML = `
      <div class="notif-icon ${iconClass}"><i class="fa-solid ${iconName}"></i></div>
      <div class="notif-content">
        <p class="notif-title">${escapeHtml(item.title)}</p>
        <span class="notif-time">${item.course ? escapeHtml(item.course) + ' &bull; ' : ''}${item.countdown || item.date}</span>
      </div>
    `;
    DOM.notificationList.appendChild(li);
  });
}

function renderDashboardMetrics() {
  const user = AppState.currentUser;
  const subjects = AppState.subjects;
  const tasks = AppState.tasks;
  const deadlines = AppState.deadlines;

  // Dynamic Date subtitle
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dayOfWeekStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  if (DOM.currentDateDisplay) DOM.currentDateDisplay.textContent = dateStr;
  const todaySubtitle = document.getElementById('todayDateSubtitle');
  if (todaySubtitle) todaySubtitle.textContent = dayOfWeekStr;
  const agendaCount = document.getElementById('agendaTaskCount');
  if (agendaCount) agendaCount.textContent = `${tasks.length} Tasks`;

  // Notifications
  renderNotifications();

  // KPI 1: Total Subjects
  if (DOM.kpiSubjectCount) {
    DOM.kpiSubjectCount.textContent = subjects.length;
  }
  if (DOM.dashboardSubjectChips) {
    DOM.dashboardSubjectChips.innerHTML = '';
    if (subjects.length === 0) {
      DOM.dashboardSubjectChips.innerHTML = `<span class="chip text-muted">No subjects added yet</span>`;
    } else {
      subjects.slice(0, 4).forEach(sub => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = sub.code;
        DOM.dashboardSubjectChips.appendChild(chip);
      });
      if (subjects.length > 4) {
        const more = document.createElement('span');
        more.className = 'chip more';
        more.textContent = `+${subjects.length - 4} more`;
        DOM.dashboardSubjectChips.appendChild(more);
      }
    }
  }

  // KPI 2: Upcoming Exams
  const exams = deadlines.filter(d => d.type === 'exam');
  if (DOM.kpiExamsCount) DOM.kpiExamsCount.textContent = exams.length;
  if (DOM.dashboardNextExamDetail) {
    if (exams.length === 0) {
      DOM.dashboardNextExamDetail.innerHTML = `<i class="fa-solid fa-calendar-check text-amber"></i> No exams scheduled yet`;
    } else {
      const next = exams[0];
      DOM.dashboardNextExamDetail.innerHTML = `<i class="fa-solid fa-calendar-check text-amber"></i> ${escapeHtml(next.title)} (${next.date})`;
    }
  }

  // KPI 3: Study Hours
  const goalHours = user ? (user.weeklyGoalHours || 20) : 20;
  // Calculate completed task duration + tracked study sessions in hours
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const trackedSessionSecs = (AppState.studySessions || [])
    .filter(s => {
      const t = Date.parse(s.date);
      return !isNaN(t) && t >= sevenDaysAgo;
    })
    .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  const loggedMinutes = tasks.filter(t => t.completed).reduce((sum, t) => sum + (parseInt(t.duration, 10) || 45), 0) + Math.round(trackedSessionSecs / 60);
  const loggedHours = (loggedMinutes / 60).toFixed(1);
  const percentAchieved = Math.min(100, Math.round((loggedHours / goalHours) * 100));

  if (DOM.kpiStudyHours) DOM.kpiStudyHours.innerHTML = `${loggedHours} <small>hrs</small>`;
  if (DOM.kpiStudyGoalTag) DOM.kpiStudyGoalTag.textContent = `Goal: ${goalHours} hrs/wk`;
  if (DOM.kpiStudyHoursBar) DOM.kpiStudyHoursBar.style.width = `${percentAchieved}%`;
  if (DOM.kpiStudyHoursAchieved) DOM.kpiStudyHoursAchieved.textContent = `${percentAchieved}% Achieved`;
  if (DOM.kpiStudyHoursRemaining) {
    const left = Math.max(0, (goalHours - loggedHours)).toFixed(1);
    DOM.kpiStudyHoursRemaining.textContent = `${left} hrs left`;
  }

  // KPI 4: Completed Tasks Ratio
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const taskPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (DOM.kpiTaskRatio) DOM.kpiTaskRatio.innerHTML = `${completedTasks} <small>/ ${totalTasks}</small>`;
  if (DOM.kpiTaskBar) DOM.kpiTaskBar.style.width = `${taskPercent}%`;
  if (DOM.kpiTaskPercentTag) DOM.kpiTaskPercentTag.textContent = `${taskPercent}% Done`;
  if (DOM.kpiPendingText) DOM.kpiPendingText.textContent = `${pendingTasks} Tasks Pending`;

  const sidebarCount = document.getElementById('sidebarPendingTaskCount');
  if (sidebarCount) sidebarCount.textContent = pendingTasks;

  // Render Agenda Tasks & Deadlines
  renderDashboardTasks();
  renderDashboardDeadlines();

  // Progress Reports GPA Cards
  const gpaData = AppState.calculateGPA();
  if (DOM.reportGpaValue) DOM.reportGpaValue.textContent = gpaData.gpa;
  if (DOM.reportTotalCredits) DOM.reportTotalCredits.innerHTML = `${gpaData.credits} <small>Credits</small>`;
  if (DOM.reportEnrolledLoad) DOM.reportEnrolledLoad.textContent = `${subjects.length} Courses Enrolled`;
  if (DOM.reportAvgScore) DOM.reportAvgScore.textContent = gpaData.avgScore;

  renderCourseReportTable();
}

function renderDashboardTasks() {
  if (!DOM.dashboardTasksList) return;
  DOM.dashboardTasksList.innerHTML = '';

  const tasks = AppState.tasks.slice(0, 5);

  if (tasks.length === 0) {
    DOM.dashboardTasksList.innerHTML = `
      <div class="empty-state-box">
        <i class="fa-solid fa-clipboard-list"></i>
        <h4>No study tasks scheduled</h4>
        <p>Click <strong>"+ Add"</strong> above to plan your daily assignments and revision.</p>
      </div>
    `;
    return;
  }

  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `quick-task-item ${task.completed ? 'completed' : ''}`;

    let prioClass = 'low';
    if (task.priority === 'High') prioClass = 'high';
    if (task.priority === 'Medium') prioClass = 'medium';

    item.innerHTML = `
      <input type="checkbox" class="task-checkbox-custom" data-task-id="${task.id}" ${task.completed ? 'checked' : ''} aria-label="Mark task done">
      <div class="quick-task-info">
        <span class="task-title-text">${escapeHtml(task.title)}</span>
        <div class="task-meta-line">
          <span><strong>${escapeHtml(task.subject)}</strong></span>
          <span>&bull;</span>
          <span>Due: ${task.dueDate}</span>
          <span class="priority-indicator ${prioClass}">${task.priority}</span>
        </div>
      </div>
    `;

    const checkbox = item.querySelector('.task-checkbox-custom');
    checkbox.addEventListener('change', () => {
      task.completed = checkbox.checked;
      AppState.persist();
      renderDashboardMetrics();
      renderPlannerTasks();
      showToast(task.completed ? 'Task completed!' : 'Task reopened.', 'info');
    });

    DOM.dashboardTasksList.appendChild(item);
  });
}

function renderDashboardDeadlines() {
  if (!DOM.dashboardDeadlinesList) return;
  DOM.dashboardDeadlinesList.innerHTML = '';

  const deadlines = AppState.deadlines;

  if (deadlines.length === 0) {
    DOM.dashboardDeadlinesList.innerHTML = `
      <div class="empty-state-box">
        <i class="fa-regular fa-calendar-xmark"></i>
        <h4>No upcoming exams or deadlines</h4>
        <p>Click <strong>"+ Add Event"</strong> to log your upcoming exam dates and submission milestones.</p>
      </div>
    `;
    return;
  }

  deadlines.forEach(item => {
    const dlEl = document.createElement('div');
    dlEl.className = `timeline-item ${item.urgent ? 'urgent' : ''}`;

    dlEl.innerHTML = `
      <div class="timeline-date-box">
        <span class="timeline-month">${item.month || 'DATE'}</span>
        <span class="timeline-day">${item.day || '--'}</span>
      </div>
      <div class="timeline-details">
        <h4 class="timeline-title">${escapeHtml(item.title)}</h4>
        <span class="timeline-sub">${escapeHtml(item.course || '')}</span>
      </div>
      <span class="timeline-countdown">${escapeHtml(item.countdown || item.date)}</span>
      <button class="btn-icon-sm text-danger" data-delete-deadline="${item.id}" title="Remove Event">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    dlEl.querySelector('[data-delete-deadline]').addEventListener('click', () => {
      AppState.deadlines = AppState.deadlines.filter(d => d.id !== item.id);
      AppState.persist();
      renderDashboardDeadlines();
      renderDashboardMetrics();
      showToast('Event removed.', 'info');
    });

    DOM.dashboardDeadlinesList.appendChild(dlEl);
  });
}

function renderCourseReportTable() {
  if (!DOM.courseReportTableBody) return;
  DOM.courseReportTableBody.innerHTML = '';

  const subjects = AppState.subjects;

  if (subjects.length === 0) {
    DOM.courseReportTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: #64748b;">
          <i class="fa-solid fa-book" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
          <strong>No subjects enrolled yet</strong>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Click <strong>"+ Add Enrolled Subject"</strong> above to enter your courses, credits, and current grades.</p>
        </td>
      </tr>
    `;
    return;
  }

  subjects.forEach(sub => {
    const tr = document.createElement('tr');
    const markVal = sub.currentMark !== undefined ? sub.currentMark : null;

    let letter = '--';
    let letterClass = 'grade-b';
    let statusPill = '<span class="status-pill-warning">Pending Mark</span>';

    if (markVal !== null) {
      if (markVal >= 90) { letter = 'A'; letterClass = 'grade-a'; statusPill = '<span class="status-pill-success">On Track</span>'; }
      else if (markVal >= 80) { letter = 'B'; letterClass = 'grade-b'; statusPill = '<span class="status-pill-success">On Track</span>'; }
      else if (markVal >= 70) { letter = 'C'; letterClass = 'grade-b'; statusPill = '<span class="status-pill-warning">Improvement Area</span>'; }
      else { letter = 'D'; letterClass = 'grade-b'; statusPill = '<span class="status-pill-warning">Alert</span>'; }
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(sub.code)}</strong></td>
      <td>${escapeHtml(sub.name)}</td>
      <td>${sub.credits}</td>
      <td>${escapeHtml(sub.instructor || 'Unassigned')}</td>
      <td>
        <div class="table-progress-wrap">
          <span>${markVal !== null ? `${markVal}%` : '--'}</span>
          <div class="mini-bar"><div class="mini-fill" style="width: ${markVal || 0}%;"></div></div>
        </div>
      </td>
      <td><span class="grade-letter ${letterClass}">${letter}</span></td>
      <td>
        <button class="btn-sm btn-outline-primary" data-edit-sub-table="${sub.id}">Edit</button>
      </td>
    `;

    tr.querySelector('[data-edit-sub-table]').addEventListener('click', () => {
      window.openEditSubjectModal(sub.id);
    });

    DOM.courseReportTableBody.appendChild(tr);
  });
}


/* ==========================================================================
   10. STUDY PLANNER (TASK CRUD & POMODORO)
   ========================================================================== */
let pomoInterval = null;
let pomoSecondsLeft = 25 * 60;
let pomoIsRunning = false;
let currentPomoMode = 'focus';

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerDisplays() {
  const formatted = formatTimer(pomoSecondsLeft);
  if (DOM.mainPomoTimer) DOM.mainPomoTimer.textContent = formatted;
  if (DOM.sidebarPomoTimer) DOM.sidebarPomoTimer.textContent = formatted;
}

function startPomodoro() {
  if (pomoIsRunning) {
    clearInterval(pomoInterval);
    pomoIsRunning = false;
    if (DOM.mainPomoStartBtn) DOM.mainPomoStartBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume Focus';
    if (DOM.sidebarPomoStartBtn) DOM.sidebarPomoStartBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
    return;
  }

  pomoIsRunning = true;
  if (DOM.mainPomoStartBtn) DOM.mainPomoStartBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Focus';
  if (DOM.sidebarPomoStartBtn) DOM.sidebarPomoStartBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';

  pomoInterval = setInterval(() => {
    pomoSecondsLeft--;
    updateTimerDisplays();

    if (pomoSecondsLeft <= 0) {
      clearInterval(pomoInterval);
      pomoIsRunning = false;
      showToast('🎉 Focus sprint completed! Great job.', 'success', 5000);
      resetPomodoro();
    }
  }, 1000);
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  pomoIsRunning = false;
  if (currentPomoMode === 'focus') pomoSecondsLeft = 25 * 60;
  if (currentPomoMode === 'shortBreak') pomoSecondsLeft = 5 * 60;
  if (currentPomoMode === 'longBreak') pomoSecondsLeft = 15 * 60;

  updateTimerDisplays();
  if (DOM.mainPomoStartBtn) DOM.mainPomoStartBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Focus Session';
  if (DOM.sidebarPomoStartBtn) DOM.sidebarPomoStartBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
}

function initStudyPlanner() {
  updateTimerDisplays();

  if (DOM.mainPomoStartBtn) DOM.mainPomoStartBtn.addEventListener('click', startPomodoro);
  if (DOM.sidebarPomoStartBtn) DOM.sidebarPomoStartBtn.addEventListener('click', startPomodoro);
  if (DOM.mainPomoResetBtn) DOM.mainPomoResetBtn.addEventListener('click', resetPomodoro);
  if (DOM.sidebarPomoResetBtn) DOM.sidebarPomoResetBtn.addEventListener('click', resetPomodoro);

  // Tabs
  DOM.pomoTabBtns.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.pomoTabBtns.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.getAttribute('data-pomo-type');
      currentPomoMode = mode;
      if (DOM.sidebarPomoMode) {
        DOM.sidebarPomoMode.textContent = mode === 'focus' ? 'Study' : 'Break';
      }
      resetPomodoro();
    });
  });

  // Task Filter Tabs
  DOM.taskFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.taskFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      const query = DOM.taskSearchInput ? DOM.taskSearchInput.value : '';
      renderPlannerTasks(filter, query);
    });
  });

  if (DOM.taskSearchInput) {
    DOM.taskSearchInput.addEventListener('input', (e) => {
      const activeBtn = document.querySelector('.task-filter-btn.active');
      const filter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
      renderPlannerTasks(filter, e.target.value);
    });
  }

  // Add Task Modal
  function openTaskModal() {
    if (!AppState.currentUser) {
      showToast('Please sign in to manage tasks.', 'warning');
      openAuthModal('login');
      return;
    }
    DOM.addTaskModal.classList.add('show');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('taskDueDateInput').value = tomorrow.toISOString().split('T')[0];
  }

  function closeTaskModal() {
    DOM.addTaskModal.classList.remove('show');
  }

  if (DOM.openAddTaskModalBtn) DOM.openAddTaskModalBtn.addEventListener('click', openTaskModal);
  if (DOM.dashQuickAddTaskBtn) DOM.dashQuickAddTaskBtn.addEventListener('click', openTaskModal);
  if (DOM.closeAddTaskModalBtn) DOM.closeAddTaskModalBtn.addEventListener('click', closeTaskModal);
  if (DOM.cancelAddTaskBtn) DOM.cancelAddTaskBtn.addEventListener('click', closeTaskModal);

  DOM.addTaskModal.addEventListener('click', (e) => {
    if (e.target === DOM.addTaskModal) closeTaskModal();
  });

  if (DOM.addTaskForm) {
    DOM.addTaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!AppState.currentUser) return;

      const title = document.getElementById('taskTitleInput').value.trim();
      const subject = document.getElementById('taskSubjectSelect').value;
      const priority = document.getElementById('taskPrioritySelect').value;
      const dueDate = document.getElementById('taskDueDateInput').value;
      const duration = parseInt(document.getElementById('taskDurationInput').value, 10) || 45;

      if (!title || !dueDate) return;

      const newTask = {
        id: 'task-' + Date.now(),
        title,
        subject,
        priority,
        dueDate,
        duration,
        completed: false
      };

      AppState.tasks.unshift(newTask);
      AppState.persist();
      closeTaskModal();
      DOM.addTaskForm.reset();

      renderPlannerTasks();
      renderDashboardMetrics();
      showToast(`Task added: "${title.slice(0, 25)}..."`, 'success');
    });
  }

  renderPlannerTasks();
}

function renderPlannerTasks(filter = 'all', searchQuery = '') {
  if (!DOM.tasksListContainer) return;
  DOM.tasksListContainer.innerHTML = '';

  const total = AppState.tasks.length;
  const pending = AppState.tasks.filter(t => !t.completed).length;
  const completed = total - pending;
  const high = AppState.tasks.filter(t => t.priority === 'High' && !t.completed).length;

  document.getElementById('countFilterAll').textContent = total;
  document.getElementById('countFilterPending').textContent = pending;
  document.getElementById('countFilterCompleted').textContent = completed;
  document.getElementById('countFilterHigh').textContent = high;

  let filtered = AppState.tasks.filter(task => {
    if (filter === 'pending') return !task.completed;
    if (filter === 'completed') return task.completed;
    if (filter === 'high') return task.priority === 'High';
    return true;
  });

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    DOM.tasksListContainer.innerHTML = `
      <div style="grid-column: 1 / -1;" class="empty-state-box">
        <i class="fa-solid fa-list-check"></i>
        <h4>No Study Tasks Found</h4>
        <p>Click <strong>"+ Add New Task"</strong> above to schedule coursework and revision.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(task => {
    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'is-completed' : ''}`;

    let prioClass = 'low';
    if (task.priority === 'High') prioClass = 'high';
    if (task.priority === 'Medium') prioClass = 'medium';

    card.innerHTML = `
      <div class="task-card-header">
        <span class="task-subject-tag">${escapeHtml(task.subject)}</span>
        <span class="priority-indicator ${prioClass}">${task.priority} Priority</span>
      </div>
      <div class="task-card-body">
        <input type="checkbox" class="task-checkbox-custom" data-task-id="${task.id}" ${task.completed ? 'checked' : ''} aria-label="Toggle completed">
        <span class="task-card-title">${escapeHtml(task.title)}</span>
      </div>
      <div class="task-card-footer">
        <div class="task-due-date">
          <i class="fa-regular fa-calendar"></i> Due: ${task.dueDate}
        </div>
        <div class="task-duration">
          <i class="fa-regular fa-clock"></i> ${task.duration}m
        </div>
        <button class="task-delete-btn" data-delete-id="${task.id}" title="Delete task">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    `;

    const chk = card.querySelector('.task-checkbox-custom');
    chk.addEventListener('change', () => {
      task.completed = chk.checked;
      AppState.persist();
      card.classList.toggle('is-completed', task.completed);
      renderDashboardMetrics();
      renderPlannerTasks(filter, searchQuery);
      showToast(task.completed ? 'Task completed!' : 'Task reopened.', 'info');
    });

    const del = card.querySelector('.task-delete-btn');
    del.addEventListener('click', () => {
      AppState.tasks = AppState.tasks.filter(t => t.id !== task.id);
      AppState.persist();
      renderPlannerTasks(filter, searchQuery);
      renderDashboardMetrics();
      showToast('Task deleted.', 'warning');
    });

    DOM.tasksListContainer.appendChild(card);
  });
}


/* ==========================================================================
   10B. MULTI-INSTITUTE GPA/CGPA CALCULATOR SYSTEM
   Supports UGC CBCS, Anna University, VTU, JNTU, Mumbai Univ, US 4.0, & Custom
   Strictly verified academic regulation formulas & student data isolation
   ========================================================================== */

const ACADEMIC_REGULATIONS = {
  ugc_cbcs: {
    id: 'ugc_cbcs',
    name: 'UGC CBCS (Choice Based Credit System)',
    institution: 'University Grants Commission (National Standard 10-Point)',
    scale: 10,
    source: 'UGC Guidelines on Adoption of Choice Based Credit System (CBCS), 10-Point Letter Grading System',
    verified: true,
    percentageFormula: 'CGPA × 10 (or [CGPA - 0.75] × 10 for AICTE norm)',
    getPercentage: (gpa) => Math.round(gpa * 10 * 100) / 100,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '90 - 100%' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '80 - 89%' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '70 - 79%' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '60 - 69%' },
      { letter: 'B', point: 6, description: 'Above Average', marksRange: '55 - 59%' },
      { letter: 'C', point: 5, description: 'Average', marksRange: '50 - 54%' },
      { letter: 'P', point: 4, description: 'Pass', marksRange: '40 - 49%' },
      { letter: 'F', point: 0, description: 'Fail', marksRange: '< 40%' },
      { letter: 'Ab', point: 0, description: 'Absent', marksRange: '0%' }
    ],
    classifications: [
      { minGpa: 9.0, label: 'Outstanding (O Grade)', badgeClass: 'success' },
      { minGpa: 8.0, label: 'First Class with Distinction', badgeClass: 'success' },
      { minGpa: 6.5, label: 'First Class', badgeClass: 'primary' },
      { minGpa: 5.5, label: 'Second Class', badgeClass: 'amber' },
      { minGpa: 4.0, label: 'Pass Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Re-appear / Fail', badgeClass: 'danger' }
    ]
  },
  anna_univ_r2021: {
    id: 'anna_univ_r2021',
    name: 'Regulation 2021 (R2021)',
    institution: 'Anna University, Chennai (Affiliated & Autonomous Colleges)',
    scale: 10,
    source: 'Anna University Regulations 2021 for B.E. / B.Tech. Programmes, Clause 15 "Letter Grades & Grade Points"',
    verified: true,
    percentageFormula: 'CGPA × 10 (Standard Anna University Percentage Equivalent)',
    getPercentage: (gpa) => Math.round(gpa * 10 * 100) / 100,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '91 - 100' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '81 - 90' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '71 - 80' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '61 - 70' },
      { letter: 'B', point: 6, description: 'Average', marksRange: '50 - 60' },
      { letter: 'C', point: 5, description: 'Satisfactory', marksRange: '45 - 49' },
      { letter: 'U', point: 0, description: 'Re-appearance (Fail)', marksRange: '< 50' },
      { letter: 'SA', point: 0, description: 'Shortage of Attendance', marksRange: '-' },
      { letter: 'W', point: 0, description: 'Withdrawal', marksRange: '-' }
    ],
    classifications: [
      { minGpa: 8.5, label: 'First Class with Distinction (No arrears)', badgeClass: 'success' },
      { minGpa: 6.5, label: 'First Class', badgeClass: 'primary' },
      { minGpa: 5.0, label: 'Second Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Re-appearance Required', badgeClass: 'danger' }
    ]
  },
  anna_univ_r2017: {
    id: 'anna_univ_r2017',
    name: 'Regulation 2017 (R2017)',
    institution: 'Anna University, Chennai',
    scale: 10,
    source: 'Anna University Regulations 2017 for B.E. / B.Tech., Clause 14 "Letter Grades & Grade Points"',
    verified: true,
    percentageFormula: 'CGPA × 10',
    getPercentage: (gpa) => Math.round(gpa * 10 * 100) / 100,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '91 - 100' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '81 - 90' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '71 - 80' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '61 - 70' },
      { letter: 'B', point: 6, description: 'Average', marksRange: '50 - 60' },
      { letter: 'RA', point: 0, description: 'Re-appearance (Fail)', marksRange: '< 50' },
      { letter: 'SA', point: 0, description: 'Shortage of Attendance', marksRange: '-' },
      { letter: 'W', point: 0, description: 'Withdrawal', marksRange: '-' }
    ],
    classifications: [
      { minGpa: 8.5, label: 'First Class with Distinction', badgeClass: 'success' },
      { minGpa: 6.5, label: 'First Class', badgeClass: 'primary' },
      { minGpa: 5.0, label: 'Second Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Re-appearance Required', badgeClass: 'danger' }
    ]
  },
  vtu_2022: {
    id: 'vtu_2022',
    name: 'CBCS 2021/2022 Scheme',
    institution: 'Visvesvaraya Technological University (VTU Belagavi)',
    scale: 10,
    source: 'VTU Academic Regulations for B.E./B.Tech CBCS, Clause 21OB 7.1 & VTU Equivalence Formula',
    verified: true,
    percentageFormula: '(CGPA - 0.75) × 10 (Official VTU Percentage Formula)',
    getPercentage: (gpa) => gpa >= 0.75 ? Math.round((gpa - 0.75) * 10 * 100) / 100 : 0,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '90 - 100%' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '80 - 89%' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '70 - 79%' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '60 - 69%' },
      { letter: 'B', point: 6, description: 'Above Average', marksRange: '55 - 59%' },
      { letter: 'C', point: 5, description: 'Average', marksRange: '50 - 54%' },
      { letter: 'P', point: 4, description: 'Pass', marksRange: '40 - 49%' },
      { letter: 'F', point: 0, description: 'Fail', marksRange: '< 40%' },
      { letter: 'Ab', point: 0, description: 'Absent', marksRange: '0%' }
    ],
    classifications: [
      { minGpa: 8.25, label: 'First Class with Distinction (Eq. ≥ 75%)', badgeClass: 'success' },
      { minGpa: 6.75, label: 'First Class (Eq. ≥ 60%)', badgeClass: 'primary' },
      { minGpa: 5.75, label: 'Second Class (Eq. ≥ 50%)', badgeClass: 'amber' },
      { minGpa: 4.0, label: 'Pass Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Fail', badgeClass: 'danger' }
    ]
  },
  jntuh_r22: {
    id: 'jntuh_r22',
    name: 'R22 / R18 Academic Regulations',
    institution: 'Jawaharlal Nehru Technological University Hyderabad (JNTUH)',
    scale: 10,
    source: 'JNTUH Academic Regulations for B.Tech R22/R18, Clause 9 "Grading Procedure"',
    verified: true,
    percentageFormula: '(CGPA - 0.5) × 10 (Standard JNTUH Percentage Equivalent)',
    getPercentage: (gpa) => gpa >= 0.5 ? Math.round((gpa - 0.5) * 10 * 100) / 100 : 0,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '≥ 90%' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '80 - 89%' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '70 - 79%' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '60 - 69%' },
      { letter: 'B', point: 6, description: 'Average', marksRange: '50 - 59%' },
      { letter: 'C', point: 5, description: 'Pass', marksRange: '40 - 49%' },
      { letter: 'F', point: 0, description: 'Fail', marksRange: '< 40%' },
      { letter: 'Ab', point: 0, description: 'Absent', marksRange: '0%' }
    ],
    classifications: [
      { minGpa: 8.0, label: 'First Class with Distinction', badgeClass: 'success' },
      { minGpa: 6.5, label: 'First Class', badgeClass: 'primary' },
      { minGpa: 5.5, label: 'Second Class', badgeClass: 'amber' },
      { minGpa: 5.0, label: 'Pass Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Fail', badgeClass: 'danger' }
    ]
  },
  mumbai_univ_cbcs: {
    id: 'mumbai_univ_cbcs',
    name: '10-Point Choice Based Credit System (CBCS)',
    institution: 'University of Mumbai (MU)',
    scale: 10,
    source: 'University of Mumbai CBCS Manual, Circular No. UG/79 of 2016-17',
    verified: true,
    percentageFormula: '7.1 × CGPA + 11 (if CGPA < 7) or 7.4 × CGPA + 12 (as per MU Ordinance)',
    getPercentage: (gpa) => gpa >= 7 ? Math.round((7.4 * gpa + 12) * 100) / 100 : Math.round((7.1 * gpa + 11) * 100) / 100,
    grades: [
      { letter: 'O', point: 10, description: 'Outstanding', marksRange: '80 - 100%' },
      { letter: 'A+', point: 9, description: 'Excellent', marksRange: '70 - 79.99%' },
      { letter: 'A', point: 8, description: 'Very Good', marksRange: '60 - 69.99%' },
      { letter: 'B+', point: 7, description: 'Good', marksRange: '55 - 59.99%' },
      { letter: 'B', point: 6, description: 'Above Average', marksRange: '50 - 54.99%' },
      { letter: 'C', point: 5, description: 'Average', marksRange: '45 - 49.99%' },
      { letter: 'D', point: 4, description: 'Pass', marksRange: '40 - 44.99%' },
      { letter: 'F', point: 0, description: 'Fail', marksRange: '< 40%' }
    ],
    classifications: [
      { minGpa: 7.0, label: 'First Class with Distinction', badgeClass: 'success' },
      { minGpa: 6.0, label: 'First Class', badgeClass: 'primary' },
      { minGpa: 5.0, label: 'Second Class', badgeClass: 'amber' },
      { minGpa: 4.0, label: 'Pass Class', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Fail', badgeClass: 'danger' }
    ]
  },
  us_4_scale: {
    id: 'us_4_scale',
    name: 'US Standard 4.0 Scale',
    institution: 'United States & International Standard 4.0 GPA',
    scale: 4.0,
    source: 'Standard US Higher Education 4.0 Grade Point Average System (College Board)',
    verified: true,
    percentageFormula: '(GPA / 4.0) × 100',
    getPercentage: (gpa) => Math.round((gpa / 4.0) * 100 * 100) / 100,
    grades: [
      { letter: 'A', point: 4.0, description: 'Excellent', marksRange: '93 - 100%' },
      { letter: 'A-', point: 3.7, description: 'Very Good', marksRange: '90 - 92%' },
      { letter: 'B+', point: 3.3, description: 'Good', marksRange: '87 - 89%' },
      { letter: 'B', point: 3.0, description: 'Above Average', marksRange: '83 - 86%' },
      { letter: 'B-', point: 2.7, description: 'Average', marksRange: '80 - 82%' },
      { letter: 'C+', point: 2.3, description: 'Below Average', marksRange: '77 - 79%' },
      { letter: 'C', point: 2.0, description: 'Satisfactory', marksRange: '73 - 76%' },
      { letter: 'C-', point: 1.7, description: 'Passing', marksRange: '70 - 72%' },
      { letter: 'D+', point: 1.3, description: 'Minimum Pass', marksRange: '67 - 69%' },
      { letter: 'D', point: 1.0, description: 'Conditional Pass', marksRange: '60 - 66%' },
      { letter: 'F', point: 0.0, description: 'Failing', marksRange: '< 60%' }
    ],
    classifications: [
      { minGpa: 3.8, label: 'Summa Cum Laude (Highest Distinction)', badgeClass: 'success' },
      { minGpa: 3.6, label: 'Magna Cum Laude (High Distinction)', badgeClass: 'success' },
      { minGpa: 3.4, label: 'Cum Laude (Distinction)', badgeClass: 'primary' },
      { minGpa: 3.0, label: 'Dean’s Honor List', badgeClass: 'primary' },
      { minGpa: 2.0, label: 'Good Academic Standing', badgeClass: 'amber' },
      { minGpa: 0.0, label: 'Academic Probation / Fail', badgeClass: 'danger' }
    ]
  },
  custom: {
    id: 'custom',
    name: 'Custom Institution / User-Defined Scale',
    institution: 'Autonomous College / Custom University',
    scale: 10,
    source: 'User-Configured Scale & Grade Points (Flexible Input)',
    verified: false,
    percentageFormula: '(GPA / Maximum Scale) × 100',
    getPercentage: (gpa, maxScale = 10) => maxScale > 0 ? Math.round((gpa / maxScale) * 100 * 100) / 100 : 0,
    grades: [
      { letter: 'O / A+', point: 10, description: 'Grade Point 10', marksRange: 'Top' },
      { letter: 'A', point: 9, description: 'Grade Point 9', marksRange: 'High' },
      { letter: 'B+', point: 8, description: 'Grade Point 8', marksRange: 'Good' },
      { letter: 'B', point: 7, description: 'Grade Point 7', marksRange: 'Average' },
      { letter: 'C', point: 6, description: 'Grade Point 6', marksRange: 'Satisfactory' },
      { letter: 'P', point: 5, description: 'Grade Point 5', marksRange: 'Pass' },
      { letter: 'F', point: 0, description: 'Grade Point 0', marksRange: 'Fail' }
    ],
    classifications: [
      { minGpaRatio: 0.85, label: 'First Class with Distinction', badgeClass: 'success' },
      { minGpaRatio: 0.65, label: 'First Class', badgeClass: 'primary' },
      { minGpaRatio: 0.50, label: 'Second Class', badgeClass: 'amber' },
      { minGpaRatio: 0.40, label: 'Pass Class', badgeClass: 'amber' },
      { minGpaRatio: 0.0, label: 'Fail / Re-appear', badgeClass: 'danger' }
    ]
  }
};

let currentGpaRegId = 'ugc_cbcs';
let currentGpaMode = 'sgpa'; // 'sgpa' | 'cgpa' | 'history'

function getActiveAcademicRegulation() {
  const reg = ACADEMIC_REGULATIONS[currentGpaRegId] || ACADEMIC_REGULATIONS.ugc_cbcs;
  if (currentGpaRegId === 'custom') {
    const customMaxEl = document.getElementById('gpaCustomMaxScale');
    const scale = customMaxEl ? parseFloat(customMaxEl.value) || 10 : 10;
    const instName = document.getElementById('gpaCustomInstName')?.value.trim();
    const regName = document.getElementById('gpaCustomRegName')?.value.trim();
    return {
      ...reg,
      scale: scale,
      institution: instName || 'Custom Institution / Autonomous College',
      name: regName || `Custom ${scale}-Point Scale`
    };
  }
  return reg;
}

function updateRegulationInfoUI() {
  const reg = getActiveAcademicRegulation();
  const titleDisplay = document.getElementById('gpaRegTitleDisplay');
  const scaleTag = document.getElementById('gpaScaleTag');
  const sourceText = document.getElementById('gpaSourceText');
  const conversionText = document.getElementById('gpaConversionRuleText');
  const badgeWrap = document.getElementById('gpaRegVerifiedBadge');
  const customRow = document.getElementById('gpaCustomConfigRow');
  const chipsList = document.getElementById('gpaGradesChipsList');
  const scorecardInst = document.getElementById('gpaScorecardInst');
  const cgpaInst = document.getElementById('cgpaScorecardInst');

  if (titleDisplay) titleDisplay.textContent = `${reg.institution} • ${reg.name}`;
  if (scaleTag) scaleTag.textContent = `${reg.scale}-Point Scale`;
  if (sourceText) sourceText.textContent = reg.source;
  if (conversionText) conversionText.textContent = reg.percentageFormula;
  if (scorecardInst) scorecardInst.textContent = reg.institution.split('(')[0].trim();
  if (cgpaInst) cgpaInst.textContent = reg.institution.split('(')[0].trim();

  if (customRow) {
    if (currentGpaRegId === 'custom') customRow.classList.remove('d-none');
    else customRow.classList.add('d-none');
  }

  if (badgeWrap) {
    if (reg.verified) {
      badgeWrap.innerHTML = `<span class="badge-soft-emerald"><i class="fa-solid fa-circle-check"></i> Official Verified Rule</span>`;
    } else {
      badgeWrap.innerHTML = `<span class="badge-soft-primary"><i class="fa-solid fa-sliders"></i> User-Defined Rules</span>`;
    }
  }

  // Populate grade preview chips
  if (chipsList) {
    chipsList.innerHTML = '';
    reg.grades.forEach(g => {
      const chip = document.createElement('div');
      chip.className = 'grade-rule-chip';
      chip.innerHTML = `<strong>${g.letter}</strong>: ${g.point} <span>(${g.marksRange})</span>`;
      chipsList.appendChild(chip);
    });
  }

  // Update letter grades dropdown in all existing subject rows
  const gradeSelects = document.querySelectorAll('#gpaSubjectsTableBody .subj-grade-select');
  gradeSelects.forEach(select => {
    const currentSelectedVal = select.value;
    select.innerHTML = '';
    reg.grades.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.letter;
      opt.textContent = `${g.letter} (${g.point} pts - ${g.description})`;
      opt.setAttribute('data-point', g.point);
      select.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'CUSTOM';
    customOpt.textContent = '✎ Custom Grade Point...';
    select.appendChild(customOpt);

    // Try to restore previous selection or select first
    const match = Array.from(select.options).find(o => o.value === currentSelectedVal);
    if (match) select.value = currentSelectedVal;
    else select.selectedIndex = 0;

    syncSubjectRowPoints(select.closest('tr'));
  });

  calculateLiveSGPA();
  calculateLiveCGPA();
}

function syncSubjectRowPoints(tr) {
  if (!tr) return;
  const gradeSelect = tr.querySelector('.subj-grade-select');
  const pointInput = tr.querySelector('.subj-point-input');
  const creditsInput = tr.querySelector('.subj-credits-input');
  const ptsCalcSpan = tr.querySelector('.gpa-pts-calc');

  if (!gradeSelect || !pointInput || !creditsInput || !ptsCalcSpan) return;

  if (gradeSelect.value !== 'CUSTOM') {
    const selectedOpt = gradeSelect.options[gradeSelect.selectedIndex];
    const point = selectedOpt ? parseFloat(selectedOpt.getAttribute('data-point')) : 0;
    pointInput.value = isNaN(point) ? 0 : point;
    pointInput.readOnly = true;
    pointInput.style.backgroundColor = '#f1f5f9';
  } else {
    pointInput.readOnly = false;
    pointInput.style.backgroundColor = '#ffffff';
  }

  const credits = parseFloat(creditsInput.value) || 0;
  const point = parseFloat(pointInput.value) || 0;
  const totalQualityPoints = credits * point;
  ptsCalcSpan.textContent = totalQualityPoints.toFixed(1);

  calculateLiveSGPA();
}

function createGpaSubjectRow(data = null) {
  const reg = getActiveAcademicRegulation();
  const tr = document.createElement('tr');
  const rowId = 'subj-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  tr.id = rowId;

  const titleVal = data ? escapeHtml(data.title || data.code || '') : '';
  const creditsVal = data ? (parseFloat(data.credits) || 3.0) : 3.0;
  const gradeVal = data ? (data.grade || '') : (reg.grades[0]?.letter || 'O');

  let gradeOptionsHtml = '';
  reg.grades.forEach(g => {
    const isSelected = gradeVal === g.letter ? 'selected' : '';
    gradeOptionsHtml += `<option value="${g.letter}" data-point="${g.point}" ${isSelected}>${g.letter} (${g.point} pts - ${g.description})</option>`;
  });
  gradeOptionsHtml += `<option value="CUSTOM" ${gradeVal === 'CUSTOM' ? 'selected' : ''}>✎ Custom Grade Point...</option>`;

  tr.innerHTML = `
    <td class="text-muted row-index" style="font-weight:700; font-size:0.82rem;">1</td>
    <td>
      <input type="text" class="form-control-sm subj-name-input" placeholder="e.g., CS 301 - Data Structures" value="${titleVal}">
    </td>
    <td>
      <input type="number" class="form-control-sm subj-credits-input" min="0.5" max="15" step="0.5" value="${creditsVal}">
    </td>
    <td>
      <select class="form-select-sm subj-grade-select">
        ${gradeOptionsHtml}
      </select>
    </td>
    <td>
      <input type="number" class="form-control-sm subj-point-input" step="0.1" min="0" max="${reg.scale}" value="10" readonly style="background-color:#f1f5f9; font-weight:700; text-align:center;">
    </td>
    <td>
      <span class="gpa-pts-calc">0.0</span>
    </td>
    <td>
      <button type="button" class="btn-remove-row" title="Remove Subject">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </td>
  `;

  // Event Listeners
  const gradeSelect = tr.querySelector('.subj-grade-select');
  const creditsInput = tr.querySelector('.subj-credits-input');
  const pointInput = tr.querySelector('.subj-point-input');
  const removeBtn = tr.querySelector('.btn-remove-row');

  gradeSelect.addEventListener('change', () => syncSubjectRowPoints(tr));
  creditsInput.addEventListener('input', () => syncSubjectRowPoints(tr));
  pointInput.addEventListener('input', () => syncSubjectRowPoints(tr));
  removeBtn.addEventListener('click', () => {
    tr.remove();
    updateRowIndices();
    calculateLiveSGPA();
  });

  return tr;
}

function updateRowIndices() {
  const rows = document.querySelectorAll('#gpaSubjectsTableBody tr');
  rows.forEach((r, idx) => {
    const idxCell = r.querySelector('.row-index');
    if (idxCell) idxCell.textContent = idx + 1;
  });
}

function calculateLiveSGPA() {
  const reg = getActiveAcademicRegulation();
  const rows = document.querySelectorAll('#gpaSubjectsTableBody tr');
  const liveSgpaEl = document.getElementById('gpaLiveSgpa');
  const liveMaxScaleEl = document.getElementById('gpaLiveMaxScale');
  const totalCreditsEl = document.getElementById('gpaTotalCreditsVal');
  const totalPointsEl = document.getElementById('gpaTotalPointsVal');
  const percentageEl = document.getElementById('gpaPercentageVal');
  const subjectCountEl = document.getElementById('gpaSubjectCountVal');
  const badgeEl = document.getElementById('gpaClassificationBadge');
  const subMathTextEl = document.getElementById('gpaSubMathText');
  const breakdownListEl = document.getElementById('gpaBreakdownList');
  const termSelect = document.getElementById('gpaSemesterSelect');
  const scorecardTermEl = document.getElementById('gpaScorecardTerm');

  if (scorecardTermEl && termSelect) {
    scorecardTermEl.textContent = `${termSelect.value} SGPA`;
  }
  if (liveMaxScaleEl) {
    liveMaxScaleEl.textContent = `/ ${reg.scale.toFixed(2)}`;
  }

  let totalCredits = 0;
  let totalQualityPoints = 0;
  let validSubjectCount = 0;
  const breakdownRows = [];

  rows.forEach(tr => {
    const nameInput = tr.querySelector('.subj-name-input');
    const creditsInput = tr.querySelector('.subj-credits-input');
    const gradeSelect = tr.querySelector('.subj-grade-select');
    const pointInput = tr.querySelector('.subj-point-input');

    if (!creditsInput || !pointInput) return;

    const credits = parseFloat(creditsInput.value) || 0;
    const point = parseFloat(pointInput.value) || 0;
    const courseName = nameInput ? nameInput.value.trim() || `Course ${validSubjectCount + 1}` : `Course ${validSubjectCount + 1}`;
    const letter = gradeSelect ? gradeSelect.value : '';

    if (credits > 0) {
      const qPoints = credits * point;
      totalCredits += credits;
      totalQualityPoints += qPoints;
      validSubjectCount++;
      breakdownRows.push({
        course: courseName,
        credits: credits,
        grade: letter,
        point: point,
        points: qPoints
      });
    }
  });

  if (totalCredits === 0) {
    if (liveSgpaEl) liveSgpaEl.textContent = '0.00';
    if (totalCreditsEl) totalCreditsEl.textContent = '0.0';
    if (totalPointsEl) totalPointsEl.textContent = '0.0';
    if (percentageEl) percentageEl.textContent = '-- %';
    if (subjectCountEl) subjectCountEl.textContent = '0';
    if (badgeEl) {
      badgeEl.className = 'scorecard-status-pill';
      badgeEl.innerHTML = `<i class="fa-solid fa-award"></i> <span>Awaiting Grade Entry</span>`;
    }
    if (subMathTextEl) {
      subMathTextEl.innerHTML = `SGPA = 0.0 (Total Quality Points) ÷ 0.0 (Total Credits) = <strong>0.00</strong>`;
    }
    if (breakdownListEl) {
      breakdownListEl.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1rem;">Add subjects on the left to view the calculation breakdown.</td></tr>`;
    }
    return { sgpa: 0, credits: 0, points: 0, percentage: 0 };
  }

  const rawSgpa = totalQualityPoints / totalCredits;
  const sgpa = Math.min(reg.scale, Math.round(rawSgpa * 100) / 100);
  const percentage = reg.getPercentage(sgpa, reg.scale);

  // Determine academic classification
  let classification = 'Pass';
  let badgeClass = 'primary';

  if (reg.classifications) {
    for (const rule of reg.classifications) {
      if (rule.minGpa !== undefined && sgpa >= rule.minGpa) {
        classification = rule.label;
        badgeClass = rule.badgeClass || 'primary';
        break;
      } else if (rule.minGpaRatio !== undefined && (sgpa / reg.scale) >= rule.minGpaRatio) {
        classification = rule.label;
        badgeClass = rule.badgeClass || 'primary';
        break;
      }
    }
  }

  if (liveSgpaEl) liveSgpaEl.textContent = sgpa.toFixed(2);
  if (totalCreditsEl) totalCreditsEl.textContent = totalCredits.toFixed(1);
  if (totalPointsEl) totalPointsEl.textContent = totalQualityPoints.toFixed(1);
  if (percentageEl) percentageEl.textContent = `${percentage.toFixed(1)}%`;
  if (subjectCountEl) subjectCountEl.textContent = validSubjectCount;

  if (badgeEl) {
    badgeEl.className = `scorecard-status-pill ${badgeClass}`;
    badgeEl.innerHTML = `<i class="fa-solid fa-award"></i> <span>${classification}</span>`;
  }

  if (subMathTextEl) {
    subMathTextEl.innerHTML = `
      SGPA = <strong>${totalQualityPoints.toFixed(1)}</strong> (Total Points) ÷ <strong>${totalCredits.toFixed(1)}</strong> (Total Credits) = <strong style="color:var(--primary-700); font-size:1.05rem;">${sgpa.toFixed(2)}</strong>
    `;
  }

  // Populate breakdown table
  if (breakdownListEl) {
    breakdownListEl.innerHTML = '';
    breakdownRows.forEach(item => {
      const loadPercent = ((item.credits / totalCredits) * 100).toFixed(1);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(item.course)}</strong></td>
        <td>${item.credits.toFixed(1)}</td>
        <td><span class="badge-soft-primary" style="padding:0.1rem 0.4rem; font-size:0.75rem;">${escapeHtml(item.grade)} (${item.point})</span></td>
        <td style="font-family:var(--font-mono); font-weight:700;">${item.points.toFixed(1)}</td>
        <td class="text-muted">${loadPercent}%</td>
      `;
      breakdownListEl.appendChild(row);
    });
  }

  return {
    sgpa,
    credits: totalCredits,
    points: totalQualityPoints,
    percentage,
    classification,
    breakdown: breakdownRows
  };
}

// -------------------------------------------------------------
// Cumulative CGPA Calculation Helpers
// -------------------------------------------------------------
function createCgpaSemesterRow(data = null) {
  const tr = document.createElement('tr');
  const semIndex = (document.querySelectorAll('#cgpaSemestersTableBody tr').length || 0) + 1;
  const nameVal = data ? escapeHtml(data.name || `Semester ${semIndex}`) : `Semester ${semIndex}`;
  const sgpaVal = data ? (parseFloat(data.sgpa) || 8.0) : 8.0;
  const creditsVal = data ? (parseFloat(data.credits) || 22.0) : 22.0;

  tr.innerHTML = `
    <td class="text-muted sem-index" style="font-weight:700; font-size:0.82rem;">${semIndex}</td>
    <td>
      <input type="text" class="form-control-sm sem-name-input" value="${nameVal}">
    </td>
    <td>
      <input type="number" class="form-control-sm sem-sgpa-input" min="0" max="10" step="0.01" value="${sgpaVal}">
    </td>
    <td>
      <input type="number" class="form-control-sm sem-credits-input" min="1" max="40" step="0.5" value="${creditsVal}">
    </td>
    <td>
      <span class="cgpa-pts-calc" style="font-family:var(--font-mono); font-weight:700; color:#4f46e5;">0.0</span>
    </td>
    <td>
      <button type="button" class="btn-remove-row" title="Remove Semester">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </td>
  `;

  const sgpaInput = tr.querySelector('.sem-sgpa-input');
  const creditsInput = tr.querySelector('.sem-credits-input');
  const ptsSpan = tr.querySelector('.cgpa-pts-calc');
  const removeBtn = tr.querySelector('.btn-remove-row');

  function syncCgpaRow() {
    const s = parseFloat(sgpaInput.value) || 0;
    const c = parseFloat(creditsInput.value) || 0;
    ptsSpan.textContent = (s * c).toFixed(1);
    calculateLiveCGPA();
  }

  sgpaInput.addEventListener('input', syncCgpaRow);
  creditsInput.addEventListener('input', syncCgpaRow);
  removeBtn.addEventListener('click', () => {
    tr.remove();
    updateCgpaRowIndices();
    calculateLiveCGPA();
  });

  const s = parseFloat(sgpaVal) || 0;
  const c = parseFloat(creditsVal) || 0;
  ptsSpan.textContent = (s * c).toFixed(1);

  return tr;
}

function updateCgpaRowIndices() {
  const rows = document.querySelectorAll('#cgpaSemestersTableBody tr');
  rows.forEach((r, idx) => {
    const idxCell = r.querySelector('.sem-index');
    if (idxCell) idxCell.textContent = idx + 1;
  });
}

function calculateLiveCGPA() {
  const reg = getActiveAcademicRegulation();
  const rows = document.querySelectorAll('#cgpaSemestersTableBody tr');
  const liveValEl = document.getElementById('cgpaLiveValue');
  const liveMaxEl = document.getElementById('cgpaLiveMaxScale');
  const totalCreditsEl = document.getElementById('cgpaTotalCreditsVal');
  const totalPointsEl = document.getElementById('cgpaTotalPointsVal');
  const percentageEl = document.getElementById('cgpaPercentageVal');
  const semesterCountEl = document.getElementById('cgpaSemesterCountVal');
  const badgeEl = document.getElementById('cgpaClassificationBadge');
  const subMathTextEl = document.getElementById('cgpaSubMathText');
  const breakdownListEl = document.getElementById('cgpaBreakdownList');

  if (liveMaxEl) liveMaxEl.textContent = `/ ${reg.scale.toFixed(2)}`;

  let totalCredits = 0;
  let totalQualityPoints = 0;
  let validCount = 0;
  const breakdownRows = [];

  rows.forEach(tr => {
    const nameInput = tr.querySelector('.sem-name-input');
    const sgpaInput = tr.querySelector('.sem-sgpa-input');
    const creditsInput = tr.querySelector('.sem-credits-input');

    if (!sgpaInput || !creditsInput) return;

    const s = parseFloat(sgpaInput.value) || 0;
    const c = parseFloat(creditsInput.value) || 0;
    const semName = nameInput ? nameInput.value.trim() || `Semester ${validCount + 1}` : `Semester ${validCount + 1}`;

    if (c > 0) {
      const q = s * c;
      totalCredits += c;
      totalQualityPoints += q;
      validCount++;
      breakdownRows.push({
        name: semName,
        sgpa: s,
        credits: c,
        points: q
      });
    }
  });

  if (totalCredits === 0) {
    if (liveValEl) liveValEl.textContent = '0.00';
    if (totalCreditsEl) totalCreditsEl.textContent = '0.0';
    if (totalPointsEl) totalPointsEl.textContent = '0.0';
    if (percentageEl) percentageEl.textContent = '-- %';
    if (semesterCountEl) semesterCountEl.textContent = '0';
    if (badgeEl) {
      badgeEl.className = 'scorecard-status-pill';
      badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> <span>Awaiting Semester Scores</span>`;
    }
    if (subMathTextEl) {
      subMathTextEl.innerHTML = `CGPA = 0.0 (Total Quality Points) ÷ 0.0 (Total Credits) = <strong>0.00</strong>`;
    }
    if (breakdownListEl) {
      breakdownListEl.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1rem;">Add semester scores on the left to see the weighted contribution.</td></tr>`;
    }
    return { cgpa: 0, credits: 0, points: 0, percentage: 0 };
  }

  const rawCgpa = totalQualityPoints / totalCredits;
  const cgpa = Math.min(reg.scale, Math.round(rawCgpa * 100) / 100);
  const percentage = reg.getPercentage(cgpa, reg.scale);

  let classification = 'Pass';
  let badgeClass = 'primary';

  if (reg.classifications) {
    for (const rule of reg.classifications) {
      if (rule.minGpa !== undefined && cgpa >= rule.minGpa) {
        classification = rule.label;
        badgeClass = rule.badgeClass || 'primary';
        break;
      } else if (rule.minGpaRatio !== undefined && (cgpa / reg.scale) >= rule.minGpaRatio) {
        classification = rule.label;
        badgeClass = rule.badgeClass || 'primary';
        break;
      }
    }
  }

  if (liveValEl) liveValEl.textContent = cgpa.toFixed(2);
  if (totalCreditsEl) totalCreditsEl.textContent = totalCredits.toFixed(1);
  if (totalPointsEl) totalPointsEl.textContent = totalQualityPoints.toFixed(1);
  if (percentageEl) percentageEl.textContent = `${percentage.toFixed(1)}%`;
  if (semesterCountEl) semesterCountEl.textContent = validCount;

  if (badgeEl) {
    badgeEl.className = `scorecard-status-pill ${badgeClass}`;
    badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> <span>${classification}</span>`;
  }

  if (subMathTextEl) {
    subMathTextEl.innerHTML = `
      CGPA = <strong>${totalQualityPoints.toFixed(1)}</strong> (Total Points) ÷ <strong>${totalCredits.toFixed(1)}</strong> (Total Credits) = <strong style="color:#4f46e5; font-size:1.05rem;">${cgpa.toFixed(2)}</strong>
    `;
  }

  if (breakdownListEl) {
    breakdownListEl.innerHTML = '';
    breakdownRows.forEach(item => {
      const weight = ((item.credits / totalCredits) * 100).toFixed(1);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td><span class="badge-soft-emerald" style="padding:0.1rem 0.4rem; font-weight:700;">${item.sgpa.toFixed(2)}</span></td>
        <td>${item.credits.toFixed(1)}</td>
        <td style="font-family:var(--font-mono); font-weight:700;">${item.points.toFixed(1)}</td>
        <td class="text-muted">${weight}%</td>
      `;
      breakdownListEl.appendChild(row);
    });
  }

  return {
    cgpa,
    credits: totalCredits,
    points: totalQualityPoints,
    percentage,
    classification,
    breakdown: breakdownRows
  };
}

// -------------------------------------------------------------
// History Persistence & Student Isolation
// -------------------------------------------------------------
function saveGpaRecord(type = 'sgpa') {
  const reg = getActiveAcademicRegulation();
  const academicYear = document.getElementById('gpaAcademicYear')?.value || '2025-2026';

  if (type === 'sgpa') {
    const res = calculateLiveSGPA();
    if (!res || res.credits === 0) {
      showToast('Please enter at least one valid course with credits before saving.', 'warning');
      return;
    }

    const term = document.getElementById('gpaSemesterSelect')?.value || 'Semester 1';
    const rows = document.querySelectorAll('#gpaSubjectsTableBody tr');
    const subjects = [];
    rows.forEach(tr => {
      const name = tr.querySelector('.subj-name-input')?.value.trim() || '';
      const credits = parseFloat(tr.querySelector('.subj-credits-input')?.value) || 0;
      const grade = tr.querySelector('.subj-grade-select')?.value || '';
      const point = parseFloat(tr.querySelector('.subj-point-input')?.value) || 0;
      if (credits > 0) subjects.push({ name, credits, grade, point });
    });

    const record = {
      id: 'calc-' + Date.now(),
      type: 'sgpa',
      score: res.sgpa,
      maxScale: reg.scale,
      term: term,
      academicYear: academicYear,
      institutionId: currentGpaRegId,
      institutionName: reg.institution,
      regulationName: reg.name,
      credits: res.credits,
      qualityPoints: res.points,
      percentage: res.percentage,
      classification: res.classification,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      subjects: subjects
    };

    if (!AppState.gpaHistory) AppState.gpaHistory = [];
    AppState.gpaHistory.unshift(record);
    AppState.persist();
    renderGpaCalculatorHistory();
    showToast(`✓ ${term} SGPA (${res.sgpa.toFixed(2)}) saved to your records!`, 'success');

  } else {
    const res = calculateLiveCGPA();
    if (!res || res.credits === 0) {
      showToast('Please enter at least one semester with credits before saving.', 'warning');
      return;
    }

    const rows = document.querySelectorAll('#cgpaSemestersTableBody tr');
    const semesters = [];
    rows.forEach(tr => {
      const name = tr.querySelector('.sem-name-input')?.value.trim() || '';
      const sgpa = parseFloat(tr.querySelector('.sem-sgpa-input')?.value) || 0;
      const credits = parseFloat(tr.querySelector('.sem-credits-input')?.value) || 0;
      if (credits > 0) semesters.push({ name, sgpa, credits });
    });

    const record = {
      id: 'calc-' + Date.now(),
      type: 'cgpa',
      score: res.cgpa,
      maxScale: reg.scale,
      term: 'Cumulative CGPA',
      academicYear: academicYear,
      institutionId: currentGpaRegId,
      institutionName: reg.institution,
      regulationName: reg.name,
      credits: res.credits,
      qualityPoints: res.points,
      percentage: res.percentage,
      classification: res.classification,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      semesters: semesters
    };

    if (!AppState.gpaHistory) AppState.gpaHistory = [];
    AppState.gpaHistory.unshift(record);
    AppState.persist();
    renderGpaCalculatorHistory();
    showToast(`✓ Cumulative CGPA (${res.cgpa.toFixed(2)}) saved to your records!`, 'success');
  }
}

function renderGpaCalculatorHistory() {
  const historyCountEl = document.getElementById('gpaHistoryCount');
  const studentEmailEl = document.getElementById('gpaHistoryStudentEmail');
  const container = document.getElementById('gpaHistoryContainer');

  const history = AppState.gpaHistory || [];

  if (historyCountEl) historyCountEl.textContent = history.length;
  if (studentEmailEl) {
    studentEmailEl.textContent = AppState.currentUser ? `${AppState.currentUser.name} (${AppState.currentUser.email})` : 'Guest Session (Local)';
  }

  if (!container) return;
  container.innerHTML = '';

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 2.5rem 1rem;">
        <div class="empty-icon-bubble" style="background-color:#dbeafe; color:#2563eb;">
          <i class="fa-solid fa-calculator"></i>
        </div>
        <h4 style="margin-top:0.75rem;">No Calculations Saved Yet</h4>
        <p style="font-size:0.85rem; color:#64748b; max-width:360px;">
          Calculate your Semester SGPA or Cumulative CGPA, then click <strong>"Save Calculation"</strong> to store your official transcripts.
        </p>
        <button class="btn-sm btn-primary mt-2" onclick="document.getElementById('gpaTabSgpaBtn').click()">
          <i class="fa-solid fa-plus-circle"></i> Calculate SGPA Now
        </button>
      </div>
    `;
    return;
  }

  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gpa-history-card';
    const isSgpa = item.type === 'sgpa';
    const typeClass = isSgpa ? 'sgpa' : 'cgpa';
    const typeLabel = isSgpa ? 'SGPA' : 'CGPA';
    const termLabel = escapeHtml(item.term || (isSgpa ? 'Semester' : 'Cumulative'));

    card.innerHTML = `
      <div class="history-card-left">
        <span class="history-type-badge ${typeClass}">${typeLabel}</span>
        <div class="history-info-meta">
          <h4>${termLabel} &bull; ${escapeHtml(item.academicYear || '')}</h4>
          <p>
            <i class="fa-solid fa-building-columns"></i> ${escapeHtml(item.institutionName || 'University')} &bull; 
            <i class="fa-solid fa-scroll"></i> ${escapeHtml(item.regulationName || '')} &bull; 
            <i class="fa-regular fa-clock"></i> ${item.date}
          </p>
        </div>
      </div>

      <div class="history-card-score">
        <div class="history-score-val ${!isSgpa ? 'text-indigo' : ''}">${parseFloat(item.score).toFixed(2)} <small style="font-size:0.8rem; color:#94a3b8;">/ ${parseFloat(item.maxScale || 10).toFixed(1)}</small></div>
        <div class="history-score-sub">${item.credits} Credits &bull; ${item.percentage ? item.percentage + '%' : item.classification}</div>
      </div>

      <div class="history-card-actions">
        <button class="btn-sm btn-outline-primary btn-load-calc" title="Reload into Calculator">
          <i class="fa-solid fa-arrow-rotate-right"></i> Load & Edit
        </button>
        <button class="btn-remove-row btn-delete-calc" title="Delete Record">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    card.querySelector('.btn-load-calc').addEventListener('click', () => {
      loadGpaRecordIntoCalculator(item.id);
    });

    card.querySelector('.btn-delete-calc').addEventListener('click', () => {
      if (confirm('Delete this saved calculation from your history?')) {
        AppState.gpaHistory = AppState.gpaHistory.filter(h => h.id !== item.id);
        AppState.persist();
        renderGpaCalculatorHistory();
        showToast('Calculation record removed.', 'warning');
      }
    });

    container.appendChild(card);
  });
}

function loadGpaRecordIntoCalculator(recordId) {
  const item = (AppState.gpaHistory || []).find(h => h.id === recordId);
  if (!item) return;

  // Set institution if exists
  if (item.institutionId && ACADEMIC_REGULATIONS[item.institutionId]) {
    const instSelect = document.getElementById('gpaInstitutionSelect');
    if (instSelect) {
      instSelect.value = item.institutionId;
      currentGpaRegId = item.institutionId;
      updateRegulationInfoUI();
    }
  }

  // Set academic year
  if (item.academicYear) {
    const yearSelect = document.getElementById('gpaAcademicYear');
    if (yearSelect) yearSelect.value = item.academicYear;
  }

  if (item.type === 'sgpa') {
    // Switch to SGPA tab
    const sgpaTabBtn = document.getElementById('gpaTabSgpaBtn');
    if (sgpaTabBtn) sgpaTabBtn.click();

    // Set semester
    if (item.term) {
      const semSelect = document.getElementById('gpaSemesterSelect');
      if (semSelect) semSelect.value = item.term;
    }

    // Populate subjects
    const tbody = document.getElementById('gpaSubjectsTableBody');
    if (tbody && item.subjects && item.subjects.length > 0) {
      tbody.innerHTML = '';
      item.subjects.forEach(sub => {
        const row = createGpaSubjectRow(sub);
        tbody.appendChild(row);
      });
      updateRowIndices();
      calculateLiveSGPA();
    }
    showToast(`Loaded ${item.term} (${item.score}) into SGPA calculator.`, 'info');

  } else {
    // Switch to CGPA tab
    const cgpaTabBtn = document.getElementById('gpaTabCgpaBtn');
    if (cgpaTabBtn) cgpaTabBtn.click();

    const tbody = document.getElementById('cgpaSemestersTableBody');
    if (tbody && item.semesters && item.semesters.length > 0) {
      tbody.innerHTML = '';
      item.semesters.forEach(sem => {
        const row = createCgpaSemesterRow(sem);
        tbody.appendChild(row);
      });
      updateCgpaRowIndices();
      calculateLiveCGPA();
    }
    showToast(`Loaded Cumulative CGPA (${item.score}) into calculator.`, 'info');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadSampleGpaData() {
  const tbody = document.getElementById('gpaSubjectsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const samples = [
    { title: 'CS301 - Data Structures & Algorithms', credits: 4.0, grade: 'O' },
    { title: 'CS302 - Object-Oriented Programming', credits: 3.0, grade: 'A+' },
    { title: 'CS303 - Database Management Systems', credits: 4.0, grade: 'A' },
    { title: 'MA301 - Discrete Mathematics', credits: 4.0, grade: 'B+' },
    { title: 'CS304 - Computer Organization & Arch', credits: 3.0, grade: 'A' },
    { title: 'CS305L - DSA & Programming Lab', credits: 1.5, grade: 'O' }
  ];

  samples.forEach(s => {
    const row = createGpaSubjectRow(s);
    tbody.appendChild(row);
  });

  updateRowIndices();
  calculateLiveSGPA();
  showToast('Sample semester course data loaded!', 'success');
}

function importEnrolledSubjectsToGpa() {
  const subjects = AppState.subjects || [];
  if (subjects.length === 0) {
    showToast('No subjects are currently enrolled in your student profile. Add courses in "Manage Subjects" first.', 'warning');
    return;
  }

  const tbody = document.getElementById('gpaSubjectsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const reg = getActiveAcademicRegulation();

  subjects.forEach(sub => {
    // Estimate letter grade from mark percentage
    let matchedGrade = reg.grades[0]?.letter || 'O';
    const mark = parseFloat(sub.currentMark);
    if (!isNaN(mark)) {
      if (reg.id === 'us_4_scale') {
        if (mark >= 93) matchedGrade = 'A';
        else if (mark >= 90) matchedGrade = 'A-';
        else if (mark >= 87) matchedGrade = 'B+';
        else if (mark >= 83) matchedGrade = 'B';
        else if (mark >= 80) matchedGrade = 'B-';
        else if (mark >= 77) matchedGrade = 'C+';
        else if (mark >= 73) matchedGrade = 'C';
        else if (mark >= 70) matchedGrade = 'C-';
        else if (mark >= 60) matchedGrade = 'D';
        else matchedGrade = 'F';
      } else {
        if (mark >= 90) matchedGrade = 'O';
        else if (mark >= 80) matchedGrade = 'A+';
        else if (mark >= 70) matchedGrade = 'A';
        else if (mark >= 60) matchedGrade = 'B+';
        else if (mark >= 50) matchedGrade = 'B';
        else if (mark >= 40) matchedGrade = 'C';
        else matchedGrade = reg.grades[reg.grades.length - 2]?.letter || 'F';
      }
    }

    const row = createGpaSubjectRow({
      title: `${sub.code} - ${sub.title}`,
      credits: parseFloat(sub.credits) || 3.0,
      grade: matchedGrade
    });
    tbody.appendChild(row);
  });

  updateRowIndices();
  calculateLiveSGPA();
  showToast(`Successfully imported ${subjects.length} enrolled subjects!`, 'success');
}

function importSavedHistoryToCgpa() {
  const history = AppState.gpaHistory || [];
  const sgpaRecords = history.filter(h => h.type === 'sgpa');

  if (sgpaRecords.length === 0) {
    showToast('No saved semester SGPA records found in your calculation history. Calculate and save an SGPA first.', 'warning');
    return;
  }

  const tbody = document.getElementById('cgpaSemestersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  // Reverse chronological to chronological order for semesters
  const sorted = [...sgpaRecords].reverse();

  sorted.forEach((item, idx) => {
    const row = createCgpaSemesterRow({
      name: item.term || `Semester ${idx + 1}`,
      sgpa: item.score,
      credits: item.credits
    });
    tbody.appendChild(row);
  });

  updateCgpaRowIndices();
  calculateLiveCGPA();
  showToast(`Imported ${sorted.length} semester records from history!`, 'success');
}

function copyGpaSummaryToClipboard(type = 'sgpa') {
  const reg = getActiveAcademicRegulation();
  let text = '';

  if (type === 'sgpa') {
    const res = calculateLiveSGPA();
    const term = document.getElementById('gpaSemesterSelect')?.value || 'Semester';
    const year = document.getElementById('gpaAcademicYear')?.value || '';
    text = `📚 STUDYPILOT AI - OFFICIAL SEMESTER SGPA REPORT\n` +
      `Term: ${term} (${year})\n` +
      `Institution: ${reg.institution}\n` +
      `Regulation: ${reg.name} (${reg.scale}-Point Scale)\n` +
      `Official Source: ${reg.source}\n\n` +
      `SGPA: ${res.sgpa.toFixed(2)} / ${reg.scale.toFixed(1)}\n` +
      `Total Credits: ${res.credits}\n` +
      `Total Quality Points: ${res.points.toFixed(1)}\n` +
      `Equivalent Percentage: ${res.percentage}%\n` +
      `Classification: ${res.classification}\n\n` +
      `Formula: SGPA = Σ(Ci × Gi) ÷ Σ Ci\n` +
      `Generated via StudyPilot AI Academic Co-Pilot`;
  } else {
    const res = calculateLiveCGPA();
    const year = document.getElementById('gpaAcademicYear')?.value || '';
    text = `🎓 STUDYPILOT AI - CUMULATIVE CGPA TRANSCRIPT SUMMARY\n` +
      `Batch / Academic Year: ${year}\n` +
      `Institution: ${reg.institution}\n` +
      `Regulation: ${reg.name} (${reg.scale}-Point Scale)\n` +
      `Cumulative CGPA: ${res.cgpa.toFixed(2)} / ${reg.scale.toFixed(1)}\n` +
      `Cumulative Credits Earned: ${res.credits}\n` +
      `Total Quality Points: ${res.points.toFixed(1)}\n` +
      `Equivalent Percentage: ${res.percentage}%\n` +
      `Classification: ${res.classification}\n\n` +
      `Formula: CGPA = Σ(SGPAj × Sj) ÷ Σ Sj\n` +
      `Generated via StudyPilot AI Academic Co-Pilot`;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('Report summary copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard. Please allow clipboard permissions.', 'warning');
  });
}

function initGpaCalculator() {
  const instSelect = document.getElementById('gpaInstitutionSelect');
  const customMaxSelect = document.getElementById('gpaCustomMaxScale');
  const customInstInput = document.getElementById('gpaCustomInstName');
  const customRegInput = document.getElementById('gpaCustomRegName');
  const semesterSelect = document.getElementById('gpaSemesterSelect');

  // Institution change handler
  if (instSelect) {
    instSelect.addEventListener('change', () => {
      currentGpaRegId = instSelect.value;
      updateRegulationInfoUI();
    });
  }

  // Custom institution input listeners
  [customMaxSelect, customInstInput, customRegInput].forEach(el => {
    if (el) {
      el.addEventListener('input', () => {
        if (currentGpaRegId === 'custom') updateRegulationInfoUI();
      });
    }
  });

  if (semesterSelect) {
    semesterSelect.addEventListener('change', () => {
      calculateLiveSGPA();
    });
  }

  // Mode Tabs Switching (SGPA & CGPA)
  const tabSgpaBtn = document.getElementById('gpaTabSgpaBtn');
  const tabCgpaBtn = document.getElementById('gpaTabCgpaBtn');
  const paneSgpa = document.getElementById('gpaPaneSgpa');
  const paneCgpa = document.getElementById('gpaPaneCgpa');

  function setGpaTab(tabName) {
    currentGpaMode = tabName;
    [tabSgpaBtn, tabCgpaBtn].forEach(b => b?.classList.remove('active'));
    [paneSgpa, paneCgpa].forEach(p => p?.classList.add('d-none'));

    if (tabName === 'sgpa') {
      tabSgpaBtn?.classList.add('active');
      paneSgpa?.classList.remove('d-none');
      calculateLiveSGPA();
    } else if (tabName === 'cgpa') {
      tabCgpaBtn?.classList.add('active');
      paneCgpa?.classList.remove('d-none');
      calculateLiveCGPA();
    }
  }

  if (tabSgpaBtn) tabSgpaBtn.addEventListener('click', () => setGpaTab('sgpa'));
  if (tabCgpaBtn) tabCgpaBtn.addEventListener('click', () => setGpaTab('cgpa'));

  // SGPA Subject Rows management
  const addSubjectBtn = document.getElementById('gpaAddSubjectRowBtn');
  const subjectsTableBody = document.getElementById('gpaSubjectsTableBody');

  if (addSubjectBtn && subjectsTableBody) {
    addSubjectBtn.addEventListener('click', () => {
      const row = createGpaSubjectRow();
      subjectsTableBody.appendChild(row);
      updateRowIndices();
      syncSubjectRowPoints(row);
      row.querySelector('.subj-name-input')?.focus();
    });
  }

  // Calculate SGPA Button
  const calculateSgpaBtn = document.getElementById('gpaCalculateSgpaBtn');
  if (calculateSgpaBtn) {
    calculateSgpaBtn.addEventListener('click', () => {
      const res = calculateLiveSGPA();
      if (res && res.credits > 0) {
        showToast(`SGPA calculated: ${res.sgpa.toFixed(2)} (${res.credits} credits)`, 'success');
      } else {
        showToast('Please enter courses with valid credits and grades.', 'warning');
      }
    });
  }

  // Clear SGPA Result Button
  const clearSgpaBtn = document.getElementById('gpaClearSgpaBtn');
  if (clearSgpaBtn) {
    clearSgpaBtn.addEventListener('click', () => {
      const liveSgpaEl = document.getElementById('gpaLiveSgpa');
      const totalCreditsEl = document.getElementById('gpaTotalCreditsVal');
      const totalPointsEl = document.getElementById('gpaTotalPointsVal');
      const percentageEl = document.getElementById('gpaPercentageVal');
      if (liveSgpaEl) liveSgpaEl.textContent = '0.00';
      if (totalCreditsEl) totalCreditsEl.textContent = '0.0';
      if (totalPointsEl) totalPointsEl.textContent = '0.0';
      if (percentageEl) percentageEl.textContent = '-- %';
      showToast('SGPA result cleared.', 'info');
    });
  }

  // Clear Subjects Button
  const clearSubjectsBtn = document.getElementById('gpaClearSubjectsBtn');
  if (clearSubjectsBtn && subjectsTableBody) {
    clearSubjectsBtn.addEventListener('click', () => {
      if (confirm('Clear all subject rows?')) {
        subjectsTableBody.innerHTML = '';
        calculateLiveSGPA();
      }
    });
  }

  // Import Enrolled Courses
  const importEnrolledBtn = document.getElementById('gpaImportEnrolledBtn');
  if (importEnrolledBtn) importEnrolledBtn.addEventListener('click', importEnrolledSubjectsToGpa);

  // Reset All Button
  const resetAllBtn = document.getElementById('gpaResetAllBtn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      if (confirm('Reset all GPA and CGPA calculator inputs?')) {
        if (subjectsTableBody) subjectsTableBody.innerHTML = '';
        const cgpaBody = document.getElementById('cgpaSemestersTableBody');
        if (cgpaBody) cgpaBody.innerHTML = '';
        calculateLiveSGPA();
        calculateLiveCGPA();
        showToast('Calculator reset to initial state.', 'info');
      }
    });
  }

  // CGPA Semesters Management
  const addSemBtn = document.getElementById('cgpaAddSemesterRowBtn');
  const semTableBody = document.getElementById('cgpaSemestersTableBody');

  if (addSemBtn && semTableBody) {
    addSemBtn.addEventListener('click', () => {
      const row = createCgpaSemesterRow();
      semTableBody.appendChild(row);
      updateCgpaRowIndices();
      calculateLiveCGPA();
    });
  }

  // Calculate CGPA Button
  const calculateCgpaBtn = document.getElementById('cgpaCalculateCgpaBtn');
  if (calculateCgpaBtn) {
    calculateCgpaBtn.addEventListener('click', () => {
      const res = calculateLiveCGPA();
      if (res && res.credits > 0) {
        showToast(`Cumulative CGPA calculated: ${res.cgpa.toFixed(2)} (${res.credits} credits)`, 'success');
      } else {
        showToast('Please enter valid semester scores and credits.', 'warning');
      }
    });
  }

  // Clear CGPA Result Button
  const clearCgpaBtn = document.getElementById('cgpaClearCgpaBtn');
  if (clearCgpaBtn) {
    clearCgpaBtn.addEventListener('click', () => {
      const liveCgpaEl = document.getElementById('cgpaLiveValue');
      const totalCreditsEl = document.getElementById('cgpaTotalCreditsVal');
      const totalPointsEl = document.getElementById('cgpaTotalPointsVal');
      const percentageEl = document.getElementById('cgpaPercentageVal');
      if (liveCgpaEl) liveCgpaEl.textContent = '0.00';
      if (totalCreditsEl) totalCreditsEl.textContent = '0.0';
      if (totalPointsEl) totalPointsEl.textContent = '0.0';
      if (percentageEl) percentageEl.textContent = '-- %';
      showToast('CGPA result cleared.', 'info');
    });
  }

  // Clear CGPA Rows
  const clearCgpaRowsBtn = document.getElementById('cgpaClearRowsBtn');
  if (clearCgpaRowsBtn && semTableBody) {
    clearCgpaRowsBtn.addEventListener('click', () => {
      if (confirm('Clear all semester rows?')) {
        semTableBody.innerHTML = '';
        calculateLiveCGPA();
      }
    });
  }

  // Initialize with regulation info and default 5 rows
  updateRegulationInfoUI();

  // Populate initial 5 rows for SGPA table if empty
  if (subjectsTableBody && subjectsTableBody.children.length === 0) {
    for (let i = 0; i < 5; i++) {
      const row = createGpaSubjectRow();
      subjectsTableBody.appendChild(row);
      syncSubjectRowPoints(row);
    }
    updateRowIndices();
    calculateLiveSGPA();
  }

  // Populate initial 4 semesters for CGPA table if empty
  if (semTableBody && semTableBody.children.length === 0) {
    for (let i = 1; i <= 4; i++) {
      const row = createCgpaSemesterRow({ name: `Semester ${i}`, sgpa: 8.0, credits: 22.0 });
      semTableBody.appendChild(row);
    }
    updateCgpaRowIndices();
    calculateLiveCGPA();
  }
}

/* ==========================================================================
   SUBJECT-WISE STUDY TIME TRACKER
   Tracks study duration per enrolled course with refresh & user isolation.
   ========================================================================== */
let activeTrackerInterval = null;

function formatTrackerDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatTrackerHoursMins(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

function getActiveTimerFromStorage() {
  try {
    const raw = localStorage.getItem('studypilot_active_timer');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function updateTrackerDisplay(seconds) {
  const displayEl = document.getElementById('trackerTimerDisplay');
  if (!displayEl) return;
  const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  displayEl.textContent = `${hrs}:${mins}:${secs}`;
}

function restoreActiveTimerIfPresent() {
  const active = getActiveTimerFromStorage();
  const currentEmail = (AppState.currentUser && AppState.currentUser.email) ? AppState.currentUser.email : 'guest';

  const startBtn = document.getElementById('trackerStartBtn');
  const stopBtn = document.getElementById('trackerStopBtn');
  const subjectSelect = document.getElementById('trackerSubjectSelect');
  const statusNotice = document.getElementById('trackerStatusNotice');
  const liveBadge = document.getElementById('trackerLiveBadge');
  const liveSubjectName = document.getElementById('trackerLiveSubjectName');
  const navPill = document.getElementById('navTrackerLivePill');

  if (active && active.userEmail === currentEmail) {
    if (activeTrackerInterval) clearInterval(activeTrackerInterval);

    if (subjectSelect) {
      subjectSelect.value = active.subjectCode;
      subjectSelect.disabled = true;
    }
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    if (liveBadge) liveBadge.style.display = 'inline-flex';
    if (liveSubjectName) liveSubjectName.textContent = `${active.subjectCode} • Live`;
    if (navPill) navPill.style.display = 'inline-block';
    if (statusNotice) {
      statusNotice.innerHTML = `<span class="status-dot-live"></span> Studying <strong>${escapeHtml(active.subjectTitle || active.subjectCode)}</strong>`;
    }

    const elapsed = Math.max(0, Math.floor((Date.now() - active.startTime) / 1000));
    updateTrackerDisplay(elapsed);

    activeTrackerInterval = setInterval(() => {
      const nowElapsed = Math.max(0, Math.floor((Date.now() - active.startTime) / 1000));
      updateTrackerDisplay(nowElapsed);
    }, 1000);
  } else {
    if (activeTrackerInterval) {
      clearInterval(activeTrackerInterval);
      activeTrackerInterval = null;
    }
    updateTrackerDisplay(0);
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (subjectSelect) subjectSelect.disabled = false;
    if (liveBadge) liveBadge.style.display = 'none';
    if (navPill) navPill.style.display = 'none';
    if (statusNotice) statusNotice.textContent = 'Ready to start study session';
  }
}

function startStudyTimer() {
  const currentEmail = (AppState.currentUser && AppState.currentUser.email) ? AppState.currentUser.email : 'guest';
  const existing = getActiveTimerFromStorage();
  if (existing && existing.userEmail === currentEmail) {
    showToast('A study timer is already active! Please stop it before starting another.', 'warning');
    return;
  }

  const select = document.getElementById('trackerSubjectSelect');
  const selectedOpt = select ? select.options[select.selectedIndex] : null;
  const subjectCode = select ? select.value : 'GEN101';
  const subjectTitle = selectedOpt ? (selectedOpt.getAttribute('data-title') || selectedOpt.textContent) : 'General Academic Studies';

  const newActive = {
    userEmail: currentEmail,
    subjectCode: subjectCode,
    subjectTitle: subjectTitle,
    startTime: Date.now()
  };

  localStorage.setItem('studypilot_active_timer', JSON.stringify(newActive));
  restoreActiveTimerIfPresent();
  showToast(`Study timer started for ${subjectTitle}!`, 'success');
}

function stopStudyTimer() {
  const active = getActiveTimerFromStorage();
  const currentEmail = (AppState.currentUser && AppState.currentUser.email) ? AppState.currentUser.email : 'guest';

  if (!active || active.userEmail !== currentEmail) {
    showToast('No study timer is currently running for this student account.', 'warning');
    return;
  }

  if (activeTrackerInterval) {
    clearInterval(activeTrackerInterval);
    activeTrackerInterval = null;
  }

  const endTime = Date.now();
  const durationSeconds = Math.max(1, Math.floor((endTime - active.startTime) / 1000));
  localStorage.removeItem('studypilot_active_timer');

  const now = new Date();
  const newSession = {
    id: 'sess-' + Date.now(),
    subjectCode: active.subjectCode,
    subjectTitle: active.subjectTitle,
    date: now.toISOString().split('T')[0],
    startTime: new Date(active.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    endTime: new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    durationSeconds: durationSeconds,
    durationFormatted: formatTrackerDuration(durationSeconds)
  };

  if (!AppState.studySessions) AppState.studySessions = [];
  AppState.studySessions.unshift(newSession);
  AppState.persist();

  restoreActiveTimerIfPresent();
  renderTrackerStats();
  renderDashboardMetrics();
  updateChartsData();

  showToast(`Logged ${formatTrackerDuration(durationSeconds)} for ${active.subjectTitle}!`, 'success');
}

function renderTrackerStats() {
  const todayStr = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const sessions = AppState.studySessions || [];

  let todaySeconds = 0;
  let weekSeconds = 0;
  let totalSeconds = 0;
  const subjectMap = {};

  // Seed with student's enrolled subjects
  (AppState.subjects || []).forEach(sub => {
    subjectMap[sub.code] = {
      code: sub.code,
      title: sub.name || sub.title || sub.code,
      todaySecs: 0,
      weekSecs: 0,
      totalSecs: 0
    };
  });

  sessions.forEach(sess => {
    const dur = sess.durationSeconds || 0;
    totalSeconds += dur;

    if (sess.date === todayStr) {
      todaySeconds += dur;
    }

    const sessTime = Date.parse(sess.date);
    if (!isNaN(sessTime) && sessTime >= sevenDaysAgo) {
      weekSeconds += dur;
    }

    const code = sess.subjectCode || 'GEN101';
    if (!subjectMap[code]) {
      subjectMap[code] = {
        code: code,
        title: sess.subjectTitle || code,
        todaySecs: 0,
        weekSecs: 0,
        totalSecs: 0
      };
    }

    subjectMap[code].totalSecs += dur;
    if (sess.date === todayStr) {
      subjectMap[code].todaySecs += dur;
    }
    if (!isNaN(sessTime) && sessTime >= sevenDaysAgo) {
      subjectMap[code].weekSecs += dur;
    }
  });

  // Top metric cards
  const statTodayEl = document.getElementById('trackerStatToday');
  const statWeekEl = document.getElementById('trackerStatWeek');
  const statTotalEl = document.getElementById('trackerStatTotal');
  const statTopSubEl = document.getElementById('trackerStatTopSubject');
  const statTopSubTimeEl = document.getElementById('trackerStatTopSubjectTime');

  if (statTodayEl) statTodayEl.textContent = formatTrackerHoursMins(todaySeconds);
  if (statWeekEl) statWeekEl.textContent = formatTrackerHoursMins(weekSeconds);
  if (statTotalEl) statTotalEl.textContent = formatTrackerHoursMins(totalSeconds);

  const subList = Object.values(subjectMap);
  subList.sort((a, b) => b.totalSecs - a.totalSecs);

  if (statTopSubEl && statTopSubTimeEl) {
    if (subList.length > 0 && subList[0].totalSecs > 0) {
      statTopSubEl.textContent = subList[0].code;
      statTopSubTimeEl.textContent = `${formatTrackerHoursMins(subList[0].totalSecs)} logged`;
    } else {
      statTopSubEl.textContent = '--';
      statTopSubTimeEl.textContent = '0 hrs logged';
    }
  }

  // Render Subject Breakdown Cards
  const breakdownContainer = document.getElementById('trackerSubjectBreakdown');
  if (breakdownContainer) {
    breakdownContainer.innerHTML = '';
    if (subList.length === 0) {
      breakdownContainer.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1 / -1; padding: 2rem; text-align: center;">
          <i class="fa-solid fa-stopwatch" style="font-size: 2rem; color: var(--slate-400); margin-bottom: 0.5rem;"></i>
          <h4>No Subject Study Recorded Yet</h4>
          <p class="text-muted">Select a subject above and press "Start Timer" to record your study time.</p>
        </div>
      `;
    } else {
      subList.forEach(item => {
        const percent = totalSeconds > 0 ? Math.min(100, Math.round((item.totalSecs / totalSeconds) * 100)) : 0;
        const card = document.createElement('div');
        card.className = 'subject-time-card';
        card.innerHTML = `
          <div class="subj-time-header">
            <span class="subj-badge">${escapeHtml(item.code)}</span>
            <span class="text-muted" style="font-size: 0.76rem; font-weight: 600;">${percent}% of study time</span>
          </div>
          <div class="subj-time-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="subj-progress-track">
            <div class="subj-progress-fill" style="width: ${percent}%;"></div>
          </div>
          <div class="subj-time-stats-row">
            <span>Today: <strong>${formatTrackerHoursMins(item.todaySecs)}</strong></span>
            <span>Week: <strong>${formatTrackerHoursMins(item.weekSecs)}</strong></span>
            <span>Total: <strong>${formatTrackerHoursMins(item.totalSecs)}</strong></span>
          </div>
        `;
        breakdownContainer.appendChild(card);
      });
    }
  }

  // Render Previous Sessions Table
  const tbody = document.getElementById('trackerSessionsTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    if (sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 1.5rem;">No previous study sessions recorded.</td></tr>`;
    } else {
      sessions.forEach(sess => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <strong>${escapeHtml(sess.subjectCode)}</strong>
            <div class="text-muted" style="font-size:0.75rem;">${escapeHtml(sess.subjectTitle || '')}</div>
          </td>
          <td>${escapeHtml(sess.date)}</td>
          <td>${escapeHtml(sess.startTime)}</td>
          <td>${escapeHtml(sess.endTime)}</td>
          <td><span class="duration-pill">${escapeHtml(sess.durationFormatted || formatTrackerDuration(sess.durationSeconds || 0))}</span></td>
          <td>
            <button type="button" class="btn-remove-row btn-delete-session" title="Delete Session">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        `;

        tr.querySelector('.btn-delete-session').addEventListener('click', () => {
          if (confirm('Delete this study session?')) {
            AppState.studySessions = AppState.studySessions.filter(s => s.id !== sess.id);
            AppState.persist();
            renderTrackerStats();
            renderDashboardMetrics();
            updateChartsData();
            showToast('Study session deleted.', 'info');
          }
        });

        tbody.appendChild(tr);
      });
    }
  }
}

function initStudyTracker() {
  const startBtn = document.getElementById('trackerStartBtn');
  const stopBtn = document.getElementById('trackerStopBtn');
  const clearSessionsBtn = document.getElementById('trackerClearSessionsBtn');

  if (startBtn) startBtn.addEventListener('click', startStudyTimer);
  if (stopBtn) stopBtn.addEventListener('click', stopStudyTimer);

  if (clearSessionsBtn) {
    clearSessionsBtn.addEventListener('click', () => {
      if (confirm('Clear all study session records for this student account?')) {
        AppState.studySessions = [];
        AppState.persist();
        renderTrackerStats();
        renderDashboardMetrics();
        updateChartsData();
        showToast('All study session records cleared.', 'info');
      }
    });
  }

  renderTrackerStats();
  restoreActiveTimerIfPresent();
}

/* ==========================================================================
   11. ACADEMIC CALENDAR & EXAM DEADLINE CRUD
   ========================================================================== */
let calendarCurrentDate = new Date(2026, 9, 26);
let calendarSelectedDateStr = '2026-10-26';
let calendarFilter = 'all';

function renderCalendarGrid() {
  if (!DOM.calendarDaysGrid) return;
  DOM.calendarDaysGrid.innerHTML = '';

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (DOM.calendarCurrentMonthYear) {
    DOM.calendarCurrentMonthYear.textContent = `${monthNames[month]} ${year}`;
  }

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  // Previous month overflow
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.innerHTML = `<span class="day-number">${dayNum}</span>`;
    DOM.calendarDaysGrid.appendChild(cell);
  }

  // Current month days
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const monthFormatted = (month + 1).toString().padStart(2, '0');
    const dayFormatted = day.toString().padStart(2, '0');
    const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    if (dateStr === '2026-10-26') cell.classList.add('today');
    if (dateStr === calendarSelectedDateStr) cell.classList.add('selected');

    const dayEvents = AppState.calendarEvents.filter(ev => {
      if (ev.date !== dateStr) return false;
      if (calendarFilter !== 'all' && ev.type !== calendarFilter) return false;
      return true;
    });

    let dotsHtml = '<div class="day-event-dots">';
    dayEvents.slice(0, 3).forEach(ev => {
      dotsHtml += `<span class="event-dot ${ev.type}"></span>`;
    });
    dotsHtml += '</div>';

    cell.innerHTML = `
      <span class="day-number">${day}</span>
      ${dayEvents.length > 0 ? dotsHtml : ''}
    `;

    cell.addEventListener('click', () => {
      document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      calendarSelectedDateStr = dateStr;
      renderSelectedDayEvents(dateStr);
    });

    DOM.calendarDaysGrid.appendChild(cell);
  }

  renderSelectedDayEvents(calendarSelectedDateStr);
}

function renderSelectedDayEvents(dateStr) {
  if (!DOM.selectedDayEventsList) return;
  DOM.selectedDayEventsList.innerHTML = '';

  const events = AppState.calendarEvents.filter(ev => ev.date === dateStr);

  const parsed = new Date(dateStr + 'T00:00:00');
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const formatted = parsed.toLocaleDateString('en-US', options);

  if (DOM.selectedDateHeader) DOM.selectedDateHeader.textContent = formatted;
  if (DOM.selectedDateCount) DOM.selectedDateCount.textContent = `${events.length} Events`;

  if (events.length === 0) {
    DOM.selectedDayEventsList.innerHTML = `
      <div class="empty-state-box" style="padding: 1.5rem 0.5rem;">
        <i class="fa-regular fa-calendar-check" style="font-size: 1.6rem;"></i>
        <h4>No Events Scheduled</h4>
        <p>No exams or assignment deadlines on this date.</p>
      </div>
    `;
    return;
  }

  events.forEach(ev => {
    const card = document.createElement('div');
    card.className = `day-event-card ${ev.type}`;

    card.innerHTML = `
      <div class="day-event-top">
        <span class="event-type-badge">${ev.type}</span>
        <span class="event-time-tag"><i class="fa-regular fa-clock"></i> ${ev.time || 'All Day'}</span>
      </div>
      <h4 class="event-title-text">${escapeHtml(ev.title)}</h4>
      <span style="font-size: 0.76rem; color: #64748b;">${escapeHtml(ev.course || '')}</span>
    `;

    DOM.selectedDayEventsList.appendChild(card);
  });
}

function initCalendar() {
  if (DOM.prevMonthBtn) {
    DOM.prevMonthBtn.addEventListener('click', () => {
      calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
      renderCalendarGrid();
    });
  }

  if (DOM.nextMonthBtn) {
    DOM.nextMonthBtn.addEventListener('click', () => {
      calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
      renderCalendarGrid();
    });
  }

  DOM.calFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      DOM.calFilterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      calendarFilter = pill.getAttribute('data-cal-filter');
      renderCalendarGrid();
    });
  });

  // Quick Add Event Form in calendar sidebar
  if (DOM.quickAddEventForm) {
    DOM.quickAddEventForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!AppState.currentUser) {
        showToast('Please sign in to schedule events.', 'warning');
        openAuthModal('login');
        return;
      }
      const title = document.getElementById('quickEventTitle').value.trim();
      const type = document.getElementById('quickEventType').value;
      const date = document.getElementById('quickEventDate').value;

      if (!title || !date) return;

      const newEv = {
        id: 'ev-' + Date.now(),
        date,
        title,
        type,
        time: '12:00',
        course: AppState.subjects[0]?.code || 'General Academic'
      };

      AppState.calendarEvents.push(newEv);
      if (type === 'exam' || type === 'assignment') {
        const parsed = new Date(date + 'T00:00:00');
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        AppState.deadlines.push({
          id: newEv.id,
          title,
          course: newEv.course,
          date,
          month: months[parsed.getMonth()],
          day: parsed.getDate().toString().padStart(2, '0'),
          countdown: date,
          type,
          urgent: type === 'exam'
        });
      }

      AppState.persist();
      DOM.quickAddEventForm.reset();
      renderCalendarGrid();
      renderDashboardMetrics();
      showToast(`Event added for ${date}!`, 'success');
    });
  }

  // Full Event Modal
  function openEventModal() {
    if (!AppState.currentUser) {
      openAuthModal('login');
      return;
    }
    DOM.addEventModal.classList.add('show');
    document.getElementById('modalEventDate').value = calendarSelectedDateStr;
  }
  function closeEventModal() {
    DOM.addEventModal.classList.remove('show');
  }

  if (DOM.openAddEventModalBtn) DOM.openAddEventModalBtn.addEventListener('click', openEventModal);
  if (DOM.dashboardAddDeadlineBtn) DOM.dashboardAddDeadlineBtn.addEventListener('click', openEventModal);
  if (DOM.closeAddEventModalBtn) DOM.closeAddEventModalBtn.addEventListener('click', closeEventModal);
  if (DOM.cancelAddEventBtn) DOM.cancelAddEventBtn.addEventListener('click', closeEventModal);

  DOM.addEventModal.addEventListener('click', (e) => {
    if (e.target === DOM.addEventModal) closeEventModal();
  });

  if (DOM.addEventModalForm) {
    DOM.addEventModalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!AppState.currentUser) return;

      const title = document.getElementById('modalEventTitle').value.trim();
      const type = document.getElementById('modalEventType').value;
      const course = document.getElementById('modalEventSubject').value;
      const date = document.getElementById('modalEventDate').value;
      const time = document.getElementById('modalEventTime').value || '10:00';

      if (!title || !date) return;

      const newEv = { id: 'ev-' + Date.now(), date, title, type, course, time };
      AppState.calendarEvents.push(newEv);

      if (type === 'exam' || type === 'assignment') {
        const parsed = new Date(date + 'T00:00:00');
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        AppState.deadlines.push({
          id: newEv.id,
          title,
          course,
          date,
          month: months[parsed.getMonth()],
          day: parsed.getDate().toString().padStart(2, '0'),
          countdown: date,
          type,
          urgent: type === 'exam'
        });
      }

      AppState.persist();
      closeEventModal();
      DOM.addEventModalForm.reset();
      renderCalendarGrid();
      renderDashboardMetrics();
      showToast(`Scheduled: "${title}"`, 'success');
    });
  }

  renderCalendarGrid();
}


/* ==========================================================================
   12. WELLNESS & DAILY HABITS TRACKER
   ========================================================================== */
function initWellnessTracker() {
  const quotes = {
    Great: `"You're feeling energized! Use this cognitive momentum for high-complexity problem solving."`,
    Good: `"Focused and steady. Great mental clarity for consistent study sessions."`,
    Neutral: `"Pace yourself. Drink a glass of water and take 5-minute pauses between study sprints."`,
    Stressed: `"Break overwhelming tasks into small 15-minute milestones. Take a deep breath."`,
    Exhausted: `"Cognitive fatigue detected. Aim for 7 to 8 hours of restorative sleep tonight."`
  };

  DOM.moodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.moodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mood = btn.getAttribute('data-mood');
      AppState.wellness.mood = mood;
      AppState.persist();
      if (DOM.moodFeedbackQuote) {
        DOM.moodFeedbackQuote.textContent = quotes[mood] || quotes['Good'];
      }
      showToast(`Daily mood logged: ${mood}`, 'info');
    });
  });

  // 4-7-8 Breathing Tool
  let breathingInterval = null;
  let isBreathing = false;

  function runBreathingCycle() {
    let phase = 0;
    let countdown = 4;

    DOM.breathBubble.className = 'breath-bubble inhale';
    DOM.breathStateText.textContent = 'Inhale';
    DOM.breathCounterText.textContent = countdown;

    breathingInterval = setInterval(() => {
      countdown--;
      DOM.breathCounterText.textContent = countdown;

      if (countdown <= 0) {
        phase = (phase + 1) % 3;
        if (phase === 0) {
          countdown = 4;
          DOM.breathBubble.className = 'breath-bubble inhale';
          DOM.breathStateText.textContent = 'Inhale';
        } else if (phase === 1) {
          countdown = 7;
          DOM.breathBubble.className = 'breath-bubble hold';
          DOM.breathStateText.textContent = 'Hold';
        } else {
          countdown = 8;
          DOM.breathBubble.className = 'breath-bubble exhale';
          DOM.breathStateText.textContent = 'Exhale';
        }
      }
    }, 1000);
  }

  if (DOM.breathToggleBtn) {
    DOM.breathToggleBtn.addEventListener('click', () => {
      if (isBreathing) {
        clearInterval(breathingInterval);
        isBreathing = false;
        DOM.breathToggleBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Exercise';
        DOM.breathBubble.className = 'breath-bubble';
        DOM.breathStateText.textContent = 'Inhale';
        DOM.breathCounterText.textContent = '4';
      } else {
        isBreathing = true;
        DOM.breathToggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Exercise';
        runBreathingCycle();
      }
    });
  }

  initSleepTracker();
}

function getYesterdayDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function saveSleepEntry(dateStr, hours, minutes) {
  if (!dateStr) {
    showToast('Please select a valid date.', 'error');
    return false;
  }
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);

  if (isNaN(h) || h < 0 || h > 24) {
    showToast('Please enter valid hours (0 to 24).', 'error');
    return false;
  }
  if (isNaN(m) || m < 0 || m > 59) {
    showToast('Please enter valid minutes (0 to 59).', 'error');
    return false;
  }
  if (h === 0 && m === 0) {
    showToast('Total sleep duration must be greater than 0 minutes.', 'warning');
    return false;
  }

  if (!Array.isArray(AppState.sleepLogs)) {
    AppState.sleepLogs = [];
  }

  const existingIdx = AppState.sleepLogs.findIndex(l => l.date === dateStr);
  const totalM = h * 60 + m;
  const record = {
    date: dateStr,
    hours: h,
    minutes: m,
    totalMinutes: totalM,
    recordedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    AppState.sleepLogs[existingIdx] = record;
    showToast(`Updated sleep for ${formatDateFriendly(dateStr)}: ${h}h ${m}m`, 'success');
  } else {
    AppState.sleepLogs.push(record);
    showToast(`Saved sleep for ${formatDateFriendly(dateStr)}: ${h}h ${m}m`, 'success');
  }

  AppState.sleepLogs.sort((a, b) => b.date.localeCompare(a.date));
  AppState.persist();
  renderSleepTracker();
  return true;
}

function openSleepCustomEdit(dateStr, defaultHours = 7, defaultMinutes = 0) {
  const customForm = document.getElementById('customDateForm');
  const dateInput = document.getElementById('sleepCustomDate');
  const hoursInput = document.getElementById('sleepCustomHours');
  const minutesInput = document.getElementById('sleepCustomMinutes');
  const chevron = document.getElementById('customDateChevron');

  if (customForm) customForm.classList.remove('d-none');
  if (chevron) chevron.className = 'fa-solid fa-chevron-up';
  if (dateInput) dateInput.value = dateStr;
  if (hoursInput) hoursInput.value = defaultHours;
  if (minutesInput) minutesInput.value = defaultMinutes;

  dateInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  hoursInput?.focus();
}

function renderSleepTracker() {
  const card = document.getElementById('sleepTrackerCard');
  if (!card) return;

  const yesterdayDateStr = getYesterdayDateStr();
  const friendlyYesterday = formatDateFriendly(yesterdayDateStr);

  const dateLabel = document.getElementById('sleepYesterdayDateLabel');
  if (dateLabel) {
    dateLabel.textContent = `Yesterday: ${friendlyYesterday} (${yesterdayDateStr})`;
  }

  if (!Array.isArray(AppState.sleepLogs)) {
    AppState.sleepLogs = [];
  }

  // Check if yesterday's sleep is already logged
  const yesterdayEntry = AppState.sleepLogs.find(l => l.date === yesterdayDateStr);
  const formWrap = document.getElementById('sleepYesterdayForm');
  const loggedBox = document.getElementById('sleepYesterdayLoggedBox');
  const loggedVal = document.getElementById('yesterdayLoggedVal');

  if (yesterdayEntry) {
    if (formWrap) formWrap.classList.add('d-none');
    if (loggedBox) loggedBox.classList.remove('d-none');
    if (loggedVal) loggedVal.textContent = `${yesterdayEntry.hours}h ${yesterdayEntry.minutes}m`;
  } else {
    if (formWrap) formWrap.classList.remove('d-none');
    if (loggedBox) loggedBox.classList.add('d-none');
  }

  // 14-day history window (from yesterday back 14 calendar days)
  const fourteenDays = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dStr = `${y}-${m}-${day}`;
    fourteenDays.push({
      dateStr: dStr,
      friendlyDate: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      entry: AppState.sleepLogs.find(l => l.date === dStr) || null
    });
  }

  // Calculate average sleep duration for available recorded days
  const recordedLogs = fourteenDays.filter(item => item.entry !== null);
  const recordedCount = recordedLogs.length;

  let totalMinutes = 0;
  recordedLogs.forEach(item => {
    totalMinutes += (item.entry.hours * 60 + item.entry.minutes);
  });

  const avgMinutes = recordedCount > 0 ? Math.round(totalMinutes / recordedCount) : 0;
  const avgH = Math.floor(avgMinutes / 60);
  const avgM = avgMinutes % 60;

  const avgDurationEl = document.getElementById('sleepAvgDuration');
  if (avgDurationEl) {
    avgDurationEl.textContent = recordedCount > 0 ? `${avgH}h ${avgM}m` : '--';
  }

  const daysRecordedEl = document.getElementById('sleepDaysRecordedCount');
  if (daysRecordedEl) {
    daysRecordedEl.textContent = `${recordedCount} / 14`;
  }

  const qualityEl = document.getElementById('sleepLatestQuality');
  if (qualityEl) {
    if (recordedCount === 0) {
      qualityEl.textContent = '--';
    } else if (avgMinutes >= 420 && avgMinutes <= 540) {
      qualityEl.innerHTML = '<span class="text-success"><i class="fa-solid fa-circle-check"></i> Optimal (7-9h)</span>';
    } else if (avgMinutes < 420) {
      qualityEl.innerHTML = '<span class="text-warning"><i class="fa-solid fa-triangle-exclamation"></i> Deficit (<7h)</span>';
    } else {
      qualityEl.innerHTML = '<span class="text-info"><i class="fa-solid fa-bed"></i> Extended (>9h)</span>';
    }
  }

  // Render 14-day history list
  const historyListEl = document.getElementById('sleepHistoryList');
  if (historyListEl) {
    historyListEl.innerHTML = '';
    fourteenDays.forEach(item => {
      const row = document.createElement('div');
      row.className = 'sleep-history-row';

      if (item.entry) {
        const totalM = item.entry.hours * 60 + item.entry.minutes;
        let badgeClass = 'sleep-badge-optimal';
        let badgeText = 'Healthy Rest';

        if (totalM < 360) {
          badgeClass = 'sleep-badge-short';
          badgeText = 'Deficit (<6h)';
        } else if (totalM < 420) {
          badgeClass = 'sleep-badge-short';
          badgeText = 'Fair (6-7h)';
        } else if (totalM > 540) {
          badgeClass = 'sleep-badge-long';
          badgeText = 'Long (>9h)';
        }

        row.innerHTML = `
          <div class="row-left">
            <span class="history-date">${escapeHtml(item.friendlyDate)}</span>
            <span class="history-iso text-muted">${item.dateStr}</span>
          </div>
          <div class="row-middle">
            <strong class="history-duration">${item.entry.hours}h ${item.entry.minutes}m</strong>
            <span class="sleep-history-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn-icon-sm edit-sleep-entry-btn" data-date="${item.dateStr}" data-hours="${item.entry.hours}" data-mins="${item.entry.minutes}" title="Edit sleep for ${item.dateStr}">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        `;
      } else {
        row.innerHTML = `
          <div class="row-left">
            <span class="history-date">${escapeHtml(item.friendlyDate)}</span>
            <span class="history-iso text-muted">${item.dateStr}</span>
          </div>
          <div class="row-middle">
            <span class="text-muted"><i class="fa-regular fa-circle-xmark"></i> Not recorded</span>
            <span class="sleep-history-badge sleep-badge-none">Missing</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn-sm btn-outline-primary log-missed-sleep-btn" data-date="${item.dateStr}" title="Log sleep for ${item.dateStr}">
              <i class="fa-solid fa-plus"></i> Log
            </button>
          </div>
        `;
      }
      historyListEl.appendChild(row);
    });

    historyListEl.querySelectorAll('.edit-sleep-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dStr = btn.getAttribute('data-date');
        const h = btn.getAttribute('data-hours');
        const m = btn.getAttribute('data-mins');
        openSleepCustomEdit(dStr, h, m);
      });
    });

    historyListEl.querySelectorAll('.log-missed-sleep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dStr = btn.getAttribute('data-date');
        openSleepCustomEdit(dStr, 7, 0);
      });
    });
  }
}

function initSleepTracker() {
  const saveYesterdayBtn = document.getElementById('saveYesterdaySleepBtn');
  if (saveYesterdayBtn) {
    saveYesterdayBtn.addEventListener('click', () => {
      const yesterdayDateStr = getYesterdayDateStr();
      const hours = document.getElementById('sleepYesterdayHours')?.value;
      const minutes = document.getElementById('sleepYesterdayMinutes')?.value;
      saveSleepEntry(yesterdayDateStr, hours, minutes);
    });
  }

  const editYesterdayBtn = document.getElementById('editYesterdaySleepBtn');
  if (editYesterdayBtn) {
    editYesterdayBtn.addEventListener('click', () => {
      const yesterdayDateStr = getYesterdayDateStr();
      const existing = AppState.sleepLogs?.find(l => l.date === yesterdayDateStr);
      const formWrap = document.getElementById('sleepYesterdayForm');
      const loggedBox = document.getElementById('sleepYesterdayLoggedBox');
      const hoursInput = document.getElementById('sleepYesterdayHours');
      const minutesInput = document.getElementById('sleepYesterdayMinutes');

      if (formWrap) formWrap.classList.remove('d-none');
      if (loggedBox) loggedBox.classList.add('d-none');
      if (existing) {
        if (hoursInput) hoursInput.value = existing.hours;
        if (minutesInput) minutesInput.value = existing.minutes;
      }
      hoursInput?.focus();
    });
  }

  const toggleCustomBtn = document.getElementById('toggleCustomDateBtn');
  const customForm = document.getElementById('customDateForm');
  const customChevron = document.getElementById('customDateChevron');
  if (toggleCustomBtn && customForm) {
    toggleCustomBtn.addEventListener('click', () => {
      const isHidden = customForm.classList.contains('d-none');
      if (isHidden) {
        customForm.classList.remove('d-none');
        if (customChevron) customChevron.className = 'fa-solid fa-chevron-up';
        const dateInput = document.getElementById('sleepCustomDate');
        if (dateInput && !dateInput.value) {
          dateInput.value = getYesterdayDateStr();
        }
      } else {
        customForm.classList.add('d-none');
        if (customChevron) customChevron.className = 'fa-solid fa-chevron-down';
      }
    });
  }

  const saveCustomBtn = document.getElementById('saveCustomDateSleepBtn');
  if (saveCustomBtn) {
    saveCustomBtn.addEventListener('click', () => {
      const dateVal = document.getElementById('sleepCustomDate')?.value;
      const hoursVal = document.getElementById('sleepCustomHours')?.value;
      const minutesVal = document.getElementById('sleepCustomMinutes')?.value;
      if (saveSleepEntry(dateVal, hoursVal, minutesVal)) {
        if (customForm) customForm.classList.add('d-none');
        if (customChevron) customChevron.className = 'fa-solid fa-chevron-down';
      }
    });
  }

  renderSleepTracker();
}


/* ==========================================================================
   13. CHARTS INITIALIZATION (DYNAMIC & REACTIVE)
   ========================================================================== */
function initCharts() {
  // Weekly Study Hours Chart
  const weeklyCanvas = document.getElementById('weeklyStudyChart');
  if (weeklyCanvas) {
    const ctx = weeklyCanvas.getContext('2d');
    window.dashboardWeeklyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Actual Logged Study (hrs)',
            data: [0, 0, 0, 0, 0, 0, 0],
            backgroundColor: '#2563eb',
            borderRadius: 6,
            borderSkipped: false
          },
          {
            label: 'Target Goal (hrs)',
            data: [3.0, 3.0, 3.0, 3.0, 3.0, 3.5, 3.0],
            type: 'line',
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 3,
            pointBackgroundColor: '#f59e0b',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 6,
            ticks: { callback: (val) => `${val}h` }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Subject Mastery Radar Chart
  const masteryCanvas = document.getElementById('subjectMasteryChart');
  if (masteryCanvas) {
    const ctx = masteryCanvas.getContext('2d');
    window.masteryChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['No Subjects'],
        datasets: [{
          label: 'Mastery Level (%)',
          data: [0],
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          borderColor: '#2563eb',
          borderWidth: 2,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            suggestedMin: 50,
            suggestedMax: 100,
            ticks: { display: false }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Grade Trends Chart
  const trendsCanvas = document.getElementById('gradeTrendsChart');
  if (trendsCanvas) {
    const ctx = trendsCanvas.getContext('2d');
    window.trendsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6'],
        datasets: [{
          label: 'Hours Logged',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, suggestedMax: 10 },
          x: { grid: { display: false } }
        }
      }
    });
  }

  updateChartsData();
}

function updateChartsData() {
  // Update Subject Mastery Radar with student's actual subjects
  if (window.masteryChart) {
    const subjects = AppState.subjects;
    if (subjects.length > 0) {
      window.masteryChart.data.labels = subjects.map(s => s.code);
      window.masteryChart.data.datasets[0].data = subjects.map(s => s.currentMark !== undefined ? s.currentMark : 75);
    } else {
      window.masteryChart.data.labels = ['Add Subjects to View Mastery'];
      window.masteryChart.data.datasets[0].data = [0];
    }
    window.masteryChart.update();
  }

  // Update Weekly Chart Target Line based on user's weekly study goal
  if (window.dashboardWeeklyChart && AppState.currentUser) {
    const dailyTarget = ((AppState.currentUser.weeklyGoalHours || 20) / 7).toFixed(1);
    window.dashboardWeeklyChart.data.datasets[1].data = [dailyTarget, dailyTarget, dailyTarget, dailyTarget, dailyTarget, dailyTarget, dailyTarget];

    // Calculate completed task duration
    const completedTasks = AppState.tasks.filter(t => t.completed);
    const totalHours = (completedTasks.reduce((s, t) => s + (t.duration || 45), 0) / 60).toFixed(1);
    const dayHours = (totalHours / 7).toFixed(1);
    window.dashboardWeeklyChart.data.datasets[0].data = [dayHours, dayHours, dayHours, dayHours, 0, 0, 0];
    window.dashboardWeeklyChart.update();
  }
}


/* ==========================================================================
   14. NOTES SUMMARIZER, QUIZ GENERATOR & AI TUTOR INTEGRATION
   ========================================================================== */
async function extractTextFromPdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('latin1');
    const binaryStr = textDecoder.decode(bytes);

    const textPieces = [];
    const btRegex = /BT[\s\S]*?ET/g;
    let match;

    while ((match = btRegex.exec(binaryStr)) !== null) {
      const block = match[0];
      const tjRegex = /\(([^)]+)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textPieces.push(tjMatch[1]);
      }
      const arrayRegex = /\[([^\]]+)\]\s*TJ/g;
      let arrMatch;
      while ((arrMatch = arrayRegex.exec(block)) !== null) {
        const inner = arrMatch[1];
        const innerTj = /\(([^)]+)\)/g;
        let inM;
        while ((inM = innerTj.exec(inner)) !== null) {
          textPieces.push(inM[1]);
        }
      }
    }

    if (textPieces.length > 0) {
      return textPieces.join(' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  } catch (err) {
    console.warn('PDF text extraction error:', err);
    return '';
  }
}

function initAiTutor() {
  let queuedAttachments = [];

  function renderAttachmentsInChat(attachments) {
    if (!attachments || attachments.length === 0) return '';
    let html = '<div class="chat-attachments-wrap">';
    attachments.forEach(att => {
      if (att.mimeType.startsWith('image/')) {
        html += `
          <div class="chat-attachment-item">
            <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="chat-image-preview" onclick="window.open(this.src)" title="Click to view full size" />
            <span class="chat-att-label"><i class="fa-regular fa-image"></i> ${escapeHtml(att.name)}</span>
          </div>
        `;
      } else {
        html += `
          <div class="chat-attachment-item">
            <div class="chat-pdf-badge">
              <i class="fa-solid fa-file-pdf"></i>
              <div class="pdf-meta">
                <span class="pdf-name">${escapeHtml(att.name)}</span>
                <span class="pdf-size">${(att.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          </div>
        `;
      }
    });
    html += '</div>';
    return html;
  }

  function appendMessage(sender, text, isNotice = false, attachments = []) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (sender === 'user') {
      const studentName = AppState.currentUser ? AppState.currentUser.name : 'Student';
      const attHtml = renderAttachmentsInChat(attachments);
      msg.innerHTML = `
        <div class="message-avatar"><i class="fa-solid fa-user"></i></div>
        <div class="message-bubble">
          <div class="bubble-header">
            <strong>${escapeHtml(studentName)}</strong>
            <span class="bubble-time">${time}</span>
          </div>
          <div class="bubble-content">
            ${attHtml}
            ${text ? `<p>${escapeHtml(text)}</p>` : ''}
          </div>
        </div>
      `;
    } else {
      msg.innerHTML = `
        <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="message-bubble">
          <div class="bubble-header">
            <strong>StudyPilot AI Tutor</strong>
            <span class="bubble-time">${time}</span>
          </div>
          <div class="bubble-content">
            ${isNotice ? text : formatMarkdown(text)}
          </div>
        </div>
      `;
    }

    DOM.tutorChatViewport.appendChild(msg);
    DOM.tutorChatViewport.scrollTop = DOM.tutorChatViewport.scrollHeight;
  }

  function renderAttachmentTray() {
    const tray = DOM.tutorAttachmentTray;
    if (!tray) return;

    if (queuedAttachments.length === 0) {
      tray.innerHTML = '';
      tray.classList.add('d-none');
      return;
    }

    tray.classList.remove('d-none');
    tray.innerHTML = '';

    queuedAttachments.forEach((att, idx) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';

      let visual = '';
      if (att.mimeType.startsWith('image/')) {
        visual = `<img src="${att.dataUrl}" class="att-thumb" alt="${escapeHtml(att.name)}">`;
      } else {
        visual = `<div class="att-icon"><i class="fa-solid fa-file-pdf"></i></div>`;
      }

      const sizeStr = att.size > 1024 * 1024
        ? (att.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (att.size / 1024).toFixed(0) + ' KB';

      chip.innerHTML = `
        ${visual}
        <div class="att-meta">
          <span class="att-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
          <span class="att-size">${sizeStr}</span>
        </div>
        <button type="button" class="btn-remove-att" data-index="${idx}" title="Remove attachment">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      tray.appendChild(chip);
    });

    tray.querySelectorAll('.btn-remove-att').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'), 10);
        queuedAttachments.splice(index, 1);
        renderAttachmentTray();
      });
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  if (DOM.tutorAttachFileBtn && DOM.tutorFileInput) {
    DOM.tutorAttachFileBtn.addEventListener('click', () => {
      DOM.tutorFileInput.click();
    });

    DOM.tutorFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      const maxSizeBytes = 20 * 1024 * 1024; // 20 MB

      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const mime = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');

        if (!allowedExts.includes(ext) && !allowedMimes.includes(mime)) {
          showToast(`Unsupported format: "${file.name}". Please upload JPG, PNG, WEBP, or PDF.`, 'error');
          continue;
        }

        if (file.size > maxSizeBytes) {
          showToast(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 20MB.`, 'error');
          continue;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          const base64Data = dataUrl.split(',')[1];
          let extractedText = '';

          if (mime === 'application/pdf') {
            extractedText = await extractTextFromPdf(file);
          }

          queuedAttachments.push({
            id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: file.name,
            size: file.size,
            mimeType: mime,
            dataUrl: dataUrl,
            base64Data: base64Data,
            extractedText: extractedText
          });

          showToast(`Attached: "${file.name}"`, 'info');
        } catch (err) {
          showToast(`Failed reading file: ${file.name}`, 'error');
        }
      }

      DOM.tutorFileInput.value = '';
      renderAttachmentTray();
    });
  }

  DOM.tutorChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawPrompt = DOM.tutorPromptInput.value.trim();

    if (!rawPrompt && queuedAttachments.length === 0) {
      showToast('Please type a question or attach a photo / PDF document.', 'warning');
      return;
    }

    const prompt = rawPrompt || 'Please explain and summarize the key concepts in this uploaded material.';
    const attachmentsToSend = [...queuedAttachments];

    queuedAttachments = [];
    renderAttachmentTray();
    DOM.tutorPromptInput.value = '';

    const subject = DOM.tutorSubjectSelect.value;
    const mode = DOM.tutorModeSelect.value;

    appendMessage('user', rawPrompt, false, attachmentsToSend);

    if (!AIService.isConfigured()) {
      const noticeHtml = `
        <div class="api-integration-callout" style="margin: 0; background: #fffbeb; border-color: #fde68a;">
          <div class="callout-icon" style="background: #f59e0b;"><i class="fa-solid fa-plug-circle-exclamation"></i></div>
          <div class="callout-content">
            <h4 style="color: #92400e;">AI Service Connection Ready</h4>
            <p style="color: #78350f;">To receive live responses from Google Gemini or OpenAI, connect your API key in Settings. Real API calls are dispatched via <code>AIService.askTutor()</code> in <code>js/app.js</code>.</p>
          </div>
        </div>
        <div style="margin-top: 0.75rem;">
          <button class="btn-sm btn-primary" onclick="document.getElementById('aiConfigModal').classList.add('show')">
            <i class="fa-solid fa-key"></i> Open AI API Settings
          </button>
        </div>
      `;
      appendMessage('assistant', noticeHtml, true);
      return;
    }

    const loadingId = 'loading-' + Date.now();
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'chat-message assistant';
    loadingMsg.id = loadingId;
    loadingMsg.innerHTML = `
      <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="message-bubble">
        <div class="bubble-content">
          <p><i class="fa-solid fa-spinner fa-spin text-primary"></i> <em>Consulting AI Tutor (${escapeHtml(subject)})${attachmentsToSend.length ? ' & analyzing material' : ''}...</em></p>
        </div>
      </div>
    `;
    DOM.tutorChatViewport.appendChild(loadingMsg);
    DOM.tutorChatViewport.scrollTop = DOM.tutorChatViewport.scrollHeight;

    try {
      const response = await AIService.askTutor(prompt, subject, mode, attachmentsToSend);
      document.getElementById(loadingId)?.remove();
      appendMessage('assistant', response);
    } catch (err) {
      document.getElementById(loadingId)?.remove();
      appendMessage('assistant', `<div class="test-result-box error"><i class="fa-solid fa-triangle-exclamation"></i> <strong>AI Error:</strong> ${escapeHtml(err.message)}</div>`, true);
    }
  });

  document.querySelectorAll('.tutor-chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.tutorPromptInput.value = chip.getAttribute('data-tutor-prompt');
      DOM.tutorPromptInput.focus();
    });
  });

  if (DOM.attachCodeBtn) {
    DOM.attachCodeBtn.addEventListener('click', () => {
      DOM.tutorPromptInput.value += "\n```java\n// Enter code snippet\n```\n";
      DOM.tutorPromptInput.focus();
    });
  }

  if (DOM.clearChatBtn) {
    DOM.clearChatBtn.addEventListener('click', () => {
      if (confirm('Clear current tutor chat messages?')) {
        DOM.tutorChatViewport.innerHTML = `
          <div class="chat-message assistant">
            <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-bubble">
              <div class="bubble-header"><strong>StudyPilot AI Tutor</strong></div>
              <div class="bubble-content"><p>Chat cleared. Ask me any question or upload notes/diagrams whenever you are ready!</p></div>
            </div>
          </div>
        `;
      }
    });
  }
}

function initNotesSummarizer() {
  function updateWordCount() {
    const text = DOM.rawNotesInput.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    if (DOM.notesWordCount) {
      DOM.notesWordCount.textContent = `${words} words • ${chars} characters`;
    }
  }

  DOM.rawNotesInput.addEventListener('input', updateWordCount);

  if (DOM.browseFileBtn && DOM.pdfFileInput) {
    DOM.browseFileBtn.addEventListener('click', () => DOM.pdfFileInput.click());
  }

  if (DOM.fileDropZone && DOM.pdfFileInput) {
    DOM.fileDropZone.addEventListener('click', (e) => {
      if (e.target !== DOM.browseFileBtn) DOM.pdfFileInput.click();
    });

    DOM.pdfFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        DOM.selectedFileBar.classList.remove('d-none');
        DOM.selectedFileName.textContent = file.name;
        DOM.selectedFileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
        showToast(`Document "${file.name}" queued.`, 'info');
      }
    });
  }

  if (DOM.removeFileBtn) {
    DOM.removeFileBtn.addEventListener('click', () => {
      DOM.selectedFileBar.classList.add('d-none');
      DOM.pdfFileInput.value = '';
    });
  }

  // Load sample notes demo
  if (DOM.loadSampleNotesBtn) {
    DOM.loadSampleNotesBtn.addEventListener('click', () => {
      DOM.rawNotesInput.value = `LECTURE NOTES: RELATIONAL DATABASES & NORMALIZATION
Key Concepts:
- First Normal Form (1NF): Atomic values, unique records.
- Second Normal Form (2NF): In 1NF + no partial dependency on composite primary key.
- Third Normal Form (3NF): In 2NF + no transitive functional dependencies.
- ACID Properties: Atomicity, Consistency, Isolation, Durability.`;
      updateWordCount();
      showToast('Sample lecture notes loaded.', 'info');
    });
  }

  if (DOM.clearNotesTextBtn) {
    DOM.clearNotesTextBtn.addEventListener('click', () => {
      DOM.rawNotesInput.value = '';
      updateWordCount();
    });
  }

  if (DOM.executeSummarizeBtn) {
    DOM.executeSummarizeBtn.addEventListener('click', async () => {
      const text = DOM.rawNotesInput.value.trim();
      if (!text && DOM.selectedFileBar.classList.contains('d-none')) {
        showToast('Please enter text or upload a document to summarize.', 'warning');
        return;
      }

      const format = DOM.summaryFormatSelect.value;
      const depth = DOM.summaryLengthSelect.value;

      DOM.summaryContentArea.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon-bubble"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <h4>Synthesizing Document...</h4>
          <p>Processing with target format: <strong>${format}</strong> (${depth})</p>
        </div>
      `;

      if (AIService.isConfigured()) {
        try {
          const result = await AIService.summarizeDocument(text, format, depth);
          DOM.summaryContentArea.innerHTML = `<div class="rendered-summary">${formatMarkdown(result)}</div>`;
          DOM.summaryOutputMeta.textContent = `Generated via ${AIService.config.provider} • Just now`;
          showToast('Summary generated successfully!', 'success');
        } catch (err) {
          DOM.summaryContentArea.innerHTML = `<div class="test-result-box error">Error: ${escapeHtml(err.message)}</div>`;
        }
      } else {
        setTimeout(() => {
          DOM.summaryContentArea.innerHTML = `
            <div class="rendered-summary">
              <h2><i class="fa-solid fa-wand-magic-sparkles text-primary"></i> Summary Pipeline Ready</h2>
              <div class="api-integration-callout" style="margin-bottom: 1rem;">
                <div class="callout-icon" style="background: #2563eb;"><i class="fa-solid fa-circle-nodes"></i></div>
                <div class="callout-content">
                  <h4>Live AI Summarization Available</h4>
                  <p>Document (${text.length} chars) ready for synthesis. Connect your Google Gemini or OpenAI API key in Settings to summarize live.</p>
                </div>
              </div>
              <button class="btn-sm btn-primary" onclick="document.getElementById('aiConfigModal').classList.add('show')">
                <i class="fa-solid fa-plug"></i> Connect API Key
              </button>
            </div>
          `;
        }, 350);
      }
    });
  }

  if (DOM.copySummaryBtn) {
    DOM.copySummaryBtn.addEventListener('click', () => {
      const text = DOM.summaryContentArea.innerText;
      if (!text || text.includes('No Summary Generated Yet')) return;
      navigator.clipboard.writeText(text);
      showToast('Summary copied to clipboard!', 'success');
    });
  }

  if (DOM.downloadSummaryBtn) {
    DOM.downloadSummaryBtn.addEventListener('click', () => {
      const text = DOM.summaryContentArea.innerText;
      if (!text || text.includes('No Summary Generated Yet')) return;
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `StudySummary_${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Summary markdown file downloaded.', 'info');
    });
  }
}

function initQuizGenerator() {
  const quizState = AppState.quiz;

  function renderQuizHistory() {
    const container = document.getElementById('quizHistoryList');
    if (!container) return;
    const history = AppState.quizHistory || [];
    if (!history.length) {
      container.innerHTML = '<p class="text-muted" style="font-size: 0.8rem; padding: 0.5rem 0;">No completed quizzes yet. Take a quiz to record your mastery scores.</p>';
      return;
    }
    container.innerHTML = history.slice(0, 8).map(item => {
      const isGood = item.score >= 70;
      const isWarn = item.score >= 50 && item.score < 70;
      const color = isGood ? '#166534' : (isWarn ? '#854d0e' : '#991b1b');
      const bg = isGood ? '#dcfce7' : (isWarn ? '#fef9c3' : '#fee2e2');
      return `
        <div class="quiz-history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--border-color, #e2e8f0);">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">
            <div style="font-weight: 500; font-size: 0.82rem; color: var(--text-primary);">${escapeHtml(item.topic)}</div>
            <small class="text-muted" style="font-size: 0.72rem;">${escapeHtml(item.date)}</small>
          </div>
          <span style="padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.78rem; background: ${bg}; color: ${color};">
            ${item.score}%
          </span>
        </div>
      `;
    }).join('');
  }

  function renderQuestion(index) {
    if (!quizState.questions || !quizState.questions.length) {
      quizState.currentIndex = 0;
      DOM.questionContainer.innerHTML = `
        <div class="empty-state-box">
          <i class="fa-solid fa-bolt"></i>
          <h4>No Quiz Active</h4>
          <p>Fill out the topic and question settings on the left to start an active recall quiz session.</p>
        </div>
      `;
      if (DOM.quizPrevBtn) DOM.quizPrevBtn.disabled = true;
      if (DOM.quizNextBtn) {
        DOM.quizNextBtn.disabled = true;
        DOM.quizNextBtn.classList.remove('d-none');
      }
      if (DOM.quizFinishBtn) DOM.quizFinishBtn.classList.add('d-none');
      return;
    }

    // Clamp index
    if (index < 0) index = 0;
    if (index >= quizState.questions.length) index = quizState.questions.length - 1;
    quizState.currentIndex = index;

    const q = quizState.questions[index];
    DOM.quizStepText.textContent = `Question ${index + 1} of ${quizState.questions.length}`;
    DOM.quizProgressFill.style.width = `${((index + 1) / quizState.questions.length) * 100}%`;
    DOM.liveQuizScore.textContent = quizState.score;
    DOM.liveQuizTotal.textContent = quizState.questions.length;

    const isLast = (index === quizState.questions.length - 1);
    const userAnswer = quizState.userAnswers[index];
    const hasAnswered = (userAnswer !== undefined);

    // Previous button enabled if not on first question
    if (DOM.quizPrevBtn) {
      DOM.quizPrevBtn.disabled = (index === 0);
    }

    // Toggle between Next Question and Finish button
    if (isLast) {
      if (DOM.quizNextBtn) DOM.quizNextBtn.classList.add('d-none');
      if (DOM.quizFinishBtn) {
        DOM.quizFinishBtn.classList.remove('d-none');
        DOM.quizFinishBtn.disabled = !hasAnswered;
      }
    } else {
      if (DOM.quizNextBtn) {
        DOM.quizNextBtn.classList.remove('d-none');
        DOM.quizNextBtn.disabled = !hasAnswered;
      }
      if (DOM.quizFinishBtn) DOM.quizFinishBtn.classList.add('d-none');
    }

    const letters = ['A', 'B', 'C', 'D'];

    let optionsHtml = '';
    q.options.forEach((opt, optIdx) => {
      let stateClass = '';
      if (hasAnswered) {
        if (optIdx === q.correctIndex) stateClass = 'correct';
        else if (optIdx === userAnswer) stateClass = 'incorrect';
      }

      optionsHtml += `
        <button type="button" class="option-btn ${stateClass}" data-opt-index="${optIdx}" ${hasAnswered ? 'disabled' : ''}>
          <span class="option-key">${letters[optIdx] || optIdx + 1}</span>
          <span class="option-text">${escapeHtml(opt)}</span>
          ${hasAnswered && optIdx === q.correctIndex ? '<i class="fa-solid fa-circle-check text-success"></i>' : ''}
          ${hasAnswered && optIdx === userAnswer && optIdx !== q.correctIndex ? '<i class="fa-solid fa-circle-xmark text-danger"></i>' : ''}
        </button>
      `;
    });

    let expHtml = '';
    if (hasAnswered && q.explanation) {
      expHtml = `<div class="explanation-box"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>`;
    }

    DOM.questionContainer.innerHTML = `
      <div class="question-text-box">
        <h3 class="question-prompt">${index + 1}. ${escapeHtml(q.prompt)}</h3>
      </div>
      <div class="quiz-options-list">${optionsHtml}</div>
      ${expHtml}
    `;

    DOM.questionContainer.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (quizState.userAnswers[index] !== undefined) return; // prevent duplicate clicks
        const selectedIdx = parseInt(btn.getAttribute('data-opt-index'), 10);
        quizState.userAnswers[index] = selectedIdx;
        if (selectedIdx === q.correctIndex) {
          quizState.score++;
        }
        renderQuestion(index);
      });
    });
  }

  if (DOM.quizNextBtn) {
    DOM.quizNextBtn.addEventListener('click', () => {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        renderQuestion(quizState.currentIndex + 1);
      }
    });
  }

  if (DOM.quizPrevBtn) {
    DOM.quizPrevBtn.addEventListener('click', () => {
      if (quizState.currentIndex > 0) {
        renderQuestion(quizState.currentIndex - 1);
      }
    });
  }

  if (DOM.quizFinishBtn) {
    DOM.quizFinishBtn.addEventListener('click', () => {
      DOM.quizPlayerCard.classList.add('d-none');
      DOM.quizResultsCard.classList.remove('d-none');

      const total = quizState.questions.length;
      const score = quizState.score;
      const percent = total > 0 ? Math.round((score / total) * 100) : 0;

      DOM.finalScorePercent.textContent = `${percent}%`;
      DOM.finalScoreFraction.textContent = `${score} of ${total} Correct`;

      const feedbackEl = document.getElementById('finalFeedbackText');
      if (feedbackEl) {
        if (percent >= 80) feedbackEl.textContent = 'Outstanding performance! You have strong mastery of this topic.';
        else if (percent >= 60) feedbackEl.textContent = 'Good work! Review the explanations for the questions you missed.';
        else feedbackEl.textContent = 'Active recall practice helps identify gaps. Retake this quiz to improve your score!';
      }

      if (AppState.quizHistory) {
        AppState.quizHistory.unshift({
          topic: DOM.playerTitle.textContent,
          score: percent,
          date: new Date().toLocaleDateString()
        });
        AppState.persist();
        renderQuizHistory();
      }
    });
  }

  function resetQuiz() {
    quizState.currentIndex = 0;
    quizState.score = 0;
    quizState.userAnswers = {};
    DOM.quizResultsCard.classList.add('d-none');
    DOM.quizPlayerCard.classList.remove('d-none');
    renderQuestion(0);
  }

  if (DOM.retakeQuizBtn) DOM.retakeQuizBtn.addEventListener('click', resetQuiz);

  if (DOM.newQuizBtn) {
    DOM.newQuizBtn.addEventListener('click', () => {
      DOM.quizResultsCard.classList.add('d-none');
      DOM.quizPlayerCard.classList.remove('d-none');
      if (DOM.quizTopicInput) {
        DOM.quizTopicInput.value = '';
        DOM.quizTopicInput.focus();
      }
      renderQuestion(0);
    });
  }

  function generateSampleQuestions(topic, count = 5, difficulty = 'Medium') {
    const baseQuestions = [
      {
        prompt: `What is the primary architectural principle of ${topic}?`,
        options: ['Modular Separation of Concerns', 'Single Global Monolith', 'Unconstrained State Mutations', 'Tightly Coupled Dependencies'],
        correctIndex: 0,
        explanation: `Good academic and engineering systems prioritize modularity, separation of concerns, and testable components for ${topic}.`
      },
      {
        prompt: `When analyzing computational efficiency for ${topic}, which metric represents the standard scaling model?`,
        options: ['Constant time execution O(1)', 'Asymptotic upper bound O(f(n))', 'Physical processor clock speed', 'Number of written code comments'],
        correctIndex: 1,
        explanation: 'Asymptotic complexity analysis abstracts hardware variations to model computational resource consumption as input size grows.'
      },
      {
        prompt: `How should boundary conditions and edge cases be handled when implementing ${topic}?`,
        options: ['Ignore rare boundary values to maximize throughput', 'Explicitly validate boundaries (null, empty, limits, overflow)', 'Rely solely on average-case assumptions', 'Assume inputs are always formatted ideally'],
        correctIndex: 1,
        explanation: 'Boundary value analysis systematically tests minimum, maximum, and degenerate conditions to guarantee runtime correctness.'
      },
      {
        prompt: `Which strategy is most effective for maintaining data integrity and idempotency in ${topic}?`,
        options: ['Atomic transactions and immutable state transitions', 'Unsynchronized shared mutable global variables', 'Suppression of all runtime validation exceptions', 'Randomized asynchronous delays without locks'],
        correctIndex: 0,
        explanation: 'Atomic transactions ensure ACID compliance or consistency boundaries so partial failures do not corrupt system state.'
      },
      {
        prompt: `In an exam evaluation on ${topic}, how should trade-offs between optimization and code readability be justified?`,
        options: ['Always prefer obscure micro-optimizations over clarity', 'Profile before optimizing, and prioritize clean, maintainable architecture', 'Disable type checking and assertions for raw execution speed', 'Avoid modular abstractions because function calls incur slight overhead'],
        correctIndex: 1,
        explanation: 'Premature optimization is a primary source of defects; structured maintainability and measurable profiling yield the most reliable results.'
      },
      {
        prompt: `What role does active recall and distributed practice play when mastering ${topic}?`,
        options: ['Passive re-reading is proven to provide superior long-term retention', 'Testing retrieval strength strengthens neural pathways and reveals knowledge gaps', 'Cramming immediately prior to assessment outperforms spaced repetition', 'Memorizing verbatim text without conceptual models is sufficient'],
        correctIndex: 1,
        explanation: 'Cognitive science shows active self-testing and spaced intervals dramatically outperform passive review.'
      },
      {
        prompt: `When debugging an unexpected failure during the execution of ${topic}, what is the recommended diagnostic sequence?`,
        options: ['Guess solutions and alter multiple parameters simultaneously', 'Isolate reproducible input, inspect logs/stack trace, and verify hypotheses step-by-step', 'Delete failing test cases until all assertions succeed', 'Restart the system repeatedly without checking state logs'],
        correctIndex: 1,
        explanation: 'Systematic debugging relies on isolating reproducible minimal cases and verifying assumptions through empirical logs.'
      },
      {
        prompt: `How does encapsulation enhance maintainability when designing components for ${topic}?`,
        options: ['It hides internal state and exposes only clean, well-defined public interfaces', 'It makes every internal field public for convenience', 'It forces all logic to reside inside a single massive source file', 'It prevents classes from having private helper methods'],
        correctIndex: 0,
        explanation: 'Encapsulation restricts direct access to internal details, preventing unintended side effects across dependent modules.'
      },
      {
        prompt: `When evaluating error recovery mechanisms in ${topic}, which approach ensures graceful degradation?`,
        options: ['Crashing the process immediately without logging', 'Structured exception handling with informative feedback and fallback defaults', 'Silently swallowing all exceptions with empty catch blocks', 'Hardcoding return values to ignore real service outages'],
        correctIndex: 1,
        explanation: 'Graceful degradation requires capturing errors safely, providing actionable user feedback, and using reliable fallbacks.'
      },
      {
        prompt: `What is the key takeaway when applying ${topic} to real-world academic and industry problems?`,
        options: ['Theory never aligns with practical implementation', 'Solid conceptual foundations guide disciplined problem-solving and adaptable designs', 'Tooling choice is more critical than fundamental computer science principles', 'Complex solutions are inherently superior to simple, robust designs'],
        correctIndex: 1,
        explanation: 'Mastery of fundamental concepts enables students to evaluate trade-offs objectively and craft robust, maintainable solutions.'
      }
    ];

    const desiredCount = Math.min(Math.max(count, 5), baseQuestions.length);
    return baseQuestions.slice(0, desiredCount);
  }

  if (DOM.quizGeneratorForm) {
    DOM.quizGeneratorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const topic = DOM.quizTopicInput ? DOM.quizTopicInput.value.trim() : 'Core Computer Science Concepts';
      const subject = DOM.quizSubjectSelect ? DOM.quizSubjectSelect.value : 'General Studies';
      const difficulty = DOM.quizDifficulty ? DOM.quizDifficulty.value : 'Medium';
      const count = parseInt(DOM.quizNumQuestions?.value, 10) || 5;

      DOM.playerTitle.textContent = `${topic} (${difficulty})`;
      DOM.playerCategoryTag.textContent = `${subject} • Active Recall (${count} Questions)`;

      if (window.AIService && typeof window.AIService.isConfigured === 'function' && window.AIService.isConfigured()) {
        const submitBtn = document.getElementById('generateQuizSubmitBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating with AI...';
        }
        try {
          const aiPrompt = `Generate an active recall multiple-choice quiz of exactly ${count} questions on the topic "${topic}" for the subject "${subject}" at ${difficulty} difficulty level.
Return ONLY valid raw JSON matching this schema with NO markdown code fences or backticks:
[
  {
    "prompt": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation of why this answer is correct."
  }
]`;
          const rawResponse = await window.AIService.callAI({ prompt: aiPrompt });
          let parsed = null;
          try {
            const cleanJson = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsed = JSON.parse(cleanJson);
          } catch (pe) {
            const match = rawResponse.match(/\[[\s\S]*\]/);
            if (match) parsed = JSON.parse(match[0]);
          }
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].prompt && Array.isArray(parsed[0].options)) {
            quizState.questions = parsed.map(item => ({
              prompt: item.prompt || 'Question',
              options: Array.isArray(item.options) && item.options.length >= 2 ? item.options : ['Option A', 'Option B', 'Option C', 'Option D'],
              correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : 0,
              explanation: item.explanation || ''
            }));
            resetQuiz();
            showToast(`Generated ${quizState.questions.length} questions via ${window.AIService.config.provider}!`, 'success');
            return;
          }
        } catch (err) {
          console.warn('AI quiz generation failed, using structured sample questions:', err);
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      }

      quizState.questions = generateSampleQuestions(topic, count, difficulty);
      resetQuiz();
      showToast(`Active recall quiz with ${quizState.questions.length} questions generated for "${topic}"!`, 'success');
    });
  }

  window.renderQuizHistory = renderQuizHistory;
  renderQuizHistory();
  renderQuestion(0);
}


/* ==========================================================================
   15. APPLICATION BOOTSTRAP & NAVIGATION
   ========================================================================== */
function renderAllViews() {
  updateUserUI();
  renderSubjectDropdowns();
  renderDashboardMetrics();
  renderCalendarGrid();
  renderPlannerTasks();
  updateChartsData();
  renderTrackerStats();
  restoreActiveTimerIfPresent();
  renderSleepTracker();
  if (typeof window.renderQuizHistory === 'function') {
    window.renderQuizHistory();
  }
}

function switchSection(targetSectionId) {
  const cleanId = targetSectionId.replace('#', '').replace('section-', '');
  const targetSectionEl = document.getElementById(`section-${cleanId}`);
  if (!targetSectionEl) return;

  DOM.appSections.forEach(section => section.classList.remove('active'));
  DOM.navLinks.forEach(link => link.classList.remove('active'));

  targetSectionEl.classList.add('active');

  const activeLink = document.querySelector(`.nav-link[data-section="${cleanId}"]`);
  if (activeLink) activeLink.classList.add('active');

  if (window.innerWidth <= 900) {
    DOM.sidebar.classList.remove('mobile-open');
  }

  window.history.pushState(null, '', `#${cleanId}`);

  if (cleanId === 'dashboard' && window.dashboardWeeklyChart) window.dashboardWeeklyChart.resize();
  if (cleanId === 'progress-reports' && window.masteryChart) window.masteryChart.resize();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initNavigation() {
  DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(link.getAttribute('data-section'));
    });
  });

  document.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.getAttribute('data-jump')));
  });

  document.querySelectorAll('[data-section]').forEach(link => {
    if (!link.classList.contains('nav-link')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection(link.getAttribute('data-section'));
      });
    }
  });

  if (DOM.sidebarToggleBtn) {
    DOM.sidebarToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.innerWidth <= 900) {
        DOM.sidebar.classList.toggle('mobile-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
      }
    });
  }
  if (DOM.sidebarCloseBtn) {
    DOM.sidebarCloseBtn.addEventListener('click', () => {
      DOM.sidebar.classList.remove('mobile-open');
      document.body.classList.remove('sidebar-collapsed');
    });
  }

  // Close mobile sidebar when clicking outside on smaller screens
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900 && DOM.sidebar?.classList.contains('mobile-open')) {
      if (!DOM.sidebar.contains(e.target) && !DOM.sidebarToggleBtn?.contains(e.target)) {
        DOM.sidebar.classList.remove('mobile-open');
      }
    }
  });

  window.addEventListener('popstate', () => {
    const hash = window.location.hash || '#dashboard';
    switchSection(hash);
  });

  const initialHash = window.location.hash || '#dashboard';
  switchSection(initialHash);
}

function initHeaderInteractions() {
  if (DOM.notificationsBtn && DOM.notificationDropdown) {
    DOM.notificationsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.notificationDropdown.classList.toggle('show');
      DOM.profileDropdown.classList.remove('show');
    });
  }

  if (DOM.profileDropdownBtn && DOM.profileDropdown) {
    DOM.profileDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.profileDropdown.classList.toggle('show');
      DOM.notificationDropdown.classList.remove('show');
    });
  }

  document.addEventListener('click', () => {
    if (DOM.notificationDropdown) DOM.notificationDropdown.classList.remove('show');
    if (DOM.profileDropdown) DOM.profileDropdown.classList.remove('show');
  });

  // Global search input
  if (DOM.globalSearchInput) {
    DOM.globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = DOM.globalSearchInput.value.trim().toLowerCase();
        if (!val) return;
        if (val.includes('calc') || val.includes('gpa') || val.includes('cgpa') || val.includes('sgpa')) switchSection('gpa-calculator');
        else if (val.includes('tracker') || val.includes('timer') || val.includes('study-time') || val.includes('time')) switchSection('study-tracker');
        else if (val.includes('quiz')) switchSection('quiz-generator');
        else if (val.includes('plan') || val.includes('task')) switchSection('study-planner');
        else if (val.includes('note') || val.includes('pdf')) switchSection('summarizer');
        else if (val.includes('cal') || val.includes('date')) switchSection('calendar');
        else if (val.includes('grade') || val.includes('report')) switchSection('progress-reports');
        else if (val.includes('well') || val.includes('sleep') || val.includes('mood')) switchSection('wellness-tracker');
        else {
          switchSection('ai-tutor');
          if (DOM.tutorPromptInput) {
            DOM.tutorPromptInput.value = `Help me with: ${val}`;
            DOM.tutorPromptInput.focus();
          }
        }
        DOM.globalSearchInput.value = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        DOM.globalSearchInput.focus();
      }
    });
  }

  if (DOM.printReportBtn) {
    DOM.printReportBtn.addEventListener('click', () => window.print());
  }

  // AI Settings Modal
  function openAiModal() {
    DOM.aiApiKeyInput.value = AIService.config.apiKey || '';
    DOM.aiProviderSelect.value = AIService.config.provider || 'gemini';
    DOM.aiEndpointInput.value = AIService.config.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    DOM.testConnectionResult.classList.add('d-none');
    DOM.aiConfigModal.classList.add('show');
  }

  function closeAiModal() {
    DOM.aiConfigModal.classList.remove('show');
  }

  [DOM.openAiSettingsBtn, DOM.topApiStatusBtn, DOM.profileAiSettingsBtn, DOM.aiTutorConfigBtn, DOM.noticeConfigBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', openAiModal);
  });

  if (DOM.closeAiConfigModalBtn) DOM.closeAiConfigModalBtn.addEventListener('click', closeAiModal);
  if (DOM.cancelAiConfigBtn) DOM.cancelAiConfigBtn.addEventListener('click', closeAiModal);

  DOM.aiConfigModal.addEventListener('click', (e) => {
    if (e.target === DOM.aiConfigModal) closeAiModal();
  });

  if (DOM.toggleApiKeyVisibilityBtn) {
    DOM.toggleApiKeyVisibilityBtn.addEventListener('click', () => {
      const type = DOM.aiApiKeyInput.type === 'password' ? 'text' : 'password';
      DOM.aiApiKeyInput.type = type;
      DOM.toggleApiKeyVisibilityBtn.innerHTML = type === 'password'
        ? '<i class="fa-regular fa-eye"></i>'
        : '<i class="fa-regular fa-eye-slash"></i>';
    });
  }

  if (DOM.testApiConnectionBtn) {
    DOM.testApiConnectionBtn.addEventListener('click', async () => {
      DOM.testConnectionResult.classList.remove('d-none');
      DOM.testConnectionResult.className = 'test-result-box';
      DOM.testConnectionResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing live connection...';

      const tempKey = DOM.aiApiKeyInput.value.trim();
      const originalKey = AIService.config.apiKey;
      AIService.config.apiKey = tempKey;

      const result = await AIService.testConnection();
      AIService.config.apiKey = originalKey;

      if (result.success) {
        DOM.testConnectionResult.className = 'test-result-box success';
        DOM.testConnectionResult.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${result.message}`;
      } else {
        DOM.testConnectionResult.className = 'test-result-box error';
        DOM.testConnectionResult.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${result.message}`;
      }
    });
  }

  if (DOM.aiConfigForm) {
    DOM.aiConfigForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const apiKey = DOM.aiApiKeyInput.value.trim();
      const provider = DOM.aiProviderSelect.value;
      const endpoint = DOM.aiEndpointInput.value.trim();

      AIService.saveConfig({ provider, apiKey, endpoint });
      closeAiModal();
      showToast(apiKey ? 'AI API Key successfully connected!' : 'AI settings updated.', 'success');
    });
  }

  if (DOM.backendStatusPill) {
    DOM.backendStatusPill.addEventListener('click', () => {
      BackendService.checkBackendStatus();
      openAuthModal('login');
    });
  }
}

function updateApiStatusUI() {
  const isReady = AIService.isConfigured();
  if (DOM.topApiIndicator) {
    DOM.topApiIndicator.className = isReady ? 'status-indicator-dot connected' : 'status-indicator-dot';
  }
  if (DOM.topApiStatusText) {
    DOM.topApiStatusText.textContent = isReady ? 'AI Engine: Connected' : 'AI Integration: Ready';
  }
  if (DOM.sidebarApiSub) {
    DOM.sidebarApiSub.textContent = isReady ? 'Live API Active' : 'Configure API Key';
  }
  if (DOM.sidebarApiTag) {
    DOM.sidebarApiTag.textContent = isReady ? 'Active' : 'API Ready';
  }
  if (DOM.tutorConnectionBadge) {
    DOM.tutorConnectionBadge.className = isReady ? 'status-indicator-badge connected' : 'status-indicator-badge';
    DOM.tutorConnectionText.textContent = isReady ? 'Live AI Connected' : 'API Key Required';
  }
  if (DOM.modalApiStatusText) {
    DOM.modalApiStatusText.textContent = isReady ? 'Connected (Key Saved)' : 'Pending API Key';
    DOM.modalApiStatusText.className = isReady ? 'text-success' : 'text-amber';
  }
}

function escapeHtml(string) {
  if (typeof string !== 'string') return '';
  return string
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre style="background:#1e293b; color:#f8fafc; padding:0.85rem; border-radius:8px; font-family:var(--font-mono); overflow-x:auto;"><code>$2</code></pre>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:#e2e8f0; padding:0.1rem 0.35rem; border-radius:4px; font-family:var(--font-mono); font-size:0.85em;">$1</code>');
  formatted = formatted.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return formatted;
}

/* ==========================================================================
   16. BOOTSTRAP INITIALIZATION
   ========================================================================== */
let appInitialized = false;

function bootstrapApp() {
  if (appInitialized) return;
  appInitialized = true;

  BackendService.checkBackendStatus();
  initNavigation();
  initAuth();
  initProfileModal();
  initSubjectManagement();
  initStudyPlanner();
  initCalendar();
  initWellnessTracker();
  initAiTutor();
  initNotesSummarizer();
  initQuizGenerator();
  initCharts();
  initGpaCalculator();
  initStudyTracker();
  initHeaderInteractions();
  updateApiStatusUI();
  renderAllViews();

  if (window.ExamLearningService?.refreshSubjects) {
    window.ExamLearningService.refreshSubjects();
  }

  console.log('%c StudyPilot AI - Dynamic Multi-User Student Assistant Ready ', 'background: #2563eb; color: #fff; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  console.log('BackendService endpoints configured for: http://localhost:8080/api');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
