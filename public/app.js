// System State
let isAdmin = false;
let machinesList = [];
let routineTasksList = [];
let breakdownsList = [];
let auditLogsList = [];
let workersList = [];

let currentSignoffTarget = null; // { type: 'routine' | 'breakdown', id: number, item: object }
let currentOverrideLogId = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    loadAllData();
});

// Real-Time Clock
function startClock() {
    function updateTime() {
        const now = new Date();
        document.getElementById('timeText').textContent = now.toLocaleTimeString('he-IL');
        document.getElementById('dateText').textContent = now.toLocaleDateString('he-IL', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    }
    updateTime();
    setInterval(updateTime, 1000);
}

// Load Data from REST API
async function loadAllData() {
    try {
        await Promise.all([
            fetchMachines(),
            fetchRoutineTasks(),
            fetchBreakdowns(),
            fetchAuditLogs(),
            fetchWorkers()
        ]);
        updateStats();
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

async function fetchMachines() {
    const res = await fetch('/api/machines');
    machinesList = await res.json();
    populateMachineDropdowns();
}

async function fetchRoutineTasks() {
    const res = await fetch('/api/routine-tasks');
    routineTasksList = await res.json();
    renderRoutineTasks();
}

async function fetchBreakdowns() {
    const res = await fetch('/api/breakdowns');
    breakdownsList = await res.json();
    renderBreakdowns();
}

async function fetchAuditLogs() {
    const res = await fetch('/api/audit-logs');
    auditLogsList = await res.json();
    renderHistoryTable();
}

async function fetchWorkers() {
    const res = await fetch('/api/workers');
    workersList = await res.json();
    renderWorkersTable();
}

// Populate Machine Dropdowns
function populateMachineDropdowns() {
    const routineFilter = document.getElementById('routineMachineFilter');
    const breakdownSelect = document.getElementById('breakdownMachineSelect');
    const taskSelect = document.getElementById('taskMachineSelect');

    const currentFilterVal = routineFilter.value;

    let optionsHtml = '<option value="all">כל המכונות</option>';
    let selectOptionsHtml = '';

    machinesList.forEach(m => {
        optionsHtml += `<option value="${m.machine_number}">מכונה #${m.machine_number} - ${m.name}</option>`;
        selectOptionsHtml += `<option value="${m.machine_number}">מכונה #${m.machine_number} - ${m.name}</option>`;
    });

    routineFilter.innerHTML = optionsHtml;
    routineFilter.value = currentFilterVal || 'all';

    if (breakdownSelect) breakdownSelect.innerHTML = selectOptionsHtml;
    if (taskSelect) taskSelect.innerHTML = selectOptionsHtml;
}

// Update Stats Bar
function updateStats() {
    document.getElementById('statMachinesCount').textContent = machinesList.length;
    document.getElementById('statTasksCount').textContent = routineTasksList.length;

    const openBreakdowns = breakdownsList.filter(b => b.status === 'open').length;
    document.getElementById('statBreakdownsCount').textContent = openBreakdowns;

    const badge = document.getElementById('breakdownBadgeCount');
    if (openBreakdowns > 0) {
        badge.textContent = openBreakdowns;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}Tab`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    if (tabName === 'history') fetchAuditLogs();
    if (tabName === 'admin') fetchWorkers();
}

// Render Routine Tasks Cards
function renderRoutineTasks() {
    const grid = document.getElementById('routineTasksGrid');
    const machineFilter = document.getElementById('routineMachineFilter').value;
    const freqFilter = document.getElementById('routineFreqFilter').value;

    let filtered = routineTasksList.filter(t => {
        const matchMachine = machineFilter === 'all' || t.machine_number.toString() === machineFilter;
        const matchFreq = freqFilter === 'all' || t.frequency === freqFilter;
        return matchMachine && matchFreq;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="card"><p class="card-desc">לא נמצאו משימות אחזקה תואמות.</p></div>';
        return;
    }

    grid.innerHTML = filtered.map(t => {
        const lastDate = t.last_performed_at ? new Date(t.last_performed_at).toLocaleString('he-IL') : 'טרם בוצע';
        const lastWorker = t.last_performed_by ? `<span class="worker-name-tag">${t.last_performed_by}</span>` : 'ללא';

        return `
            <div class="card">
                <div>
                    <div class="card-top">
                        <span class="machine-tag"><i class="fa-solid fa-industry"></i> מכונה #${t.machine_number}</span>
                        <span class="freq-tag">${t.frequency}</span>
                    </div>
                    <h3 class="card-title">${t.title}</h3>
                    <p class="card-desc">${t.description || 'אין הנחיות נוספות.'}</p>

                    <div class="card-meta-box">
                        <div class="meta-row">
                            <span>ביצוע אחרון:</span>
                            <strong>${lastDate}</strong>
                        </div>
                        <div class="meta-row">
                            <span>נחתם על ידי:</span>
                            <strong>${lastWorker}</strong>
                        </div>
                    </div>
                </div>

                <div class="card-actions">
                    <button class="btn btn-success btn-block" onclick="openSignoffModal('routine', ${t.id})">
                        <i class="fa-solid fa-signature"></i> חתום על בדיקה
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Render Breakdowns Cards
function renderBreakdowns() {
    const grid = document.getElementById('breakdownsGrid');
    const statusFilter = document.getElementById('breakdownStatusFilter').value;
    const prioritySort = document.getElementById('breakdownPriorityFilter').value;

    let filtered = breakdownsList.filter(b => {
        if (statusFilter === 'all') return true;
        return b.status === statusFilter;
    });

    filtered.sort((a, b) => {
        if (prioritySort === 'desc') return b.priority - a.priority;
        return a.priority - b.priority;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="card"><p class="card-desc">אין תקלות להצגה בקטגוריה זו.</p></div>';
        return;
    }

    grid.innerHTML = filtered.map(b => {
        const isResolved = b.status === 'resolved';
        const imageHtml = b.image_url ? `<img src="${b.image_url}" class="breakdown-image-preview" alt="תקלה" />` : '';
        const createdDate = new Date(b.created_at).toLocaleString('he-IL');
        const resolvedDate = b.resolved_at ? new Date(b.resolved_at).toLocaleString('he-IL') : '-';
        const resolvedBy = b.resolved_by ? `<span class="worker-name-tag">${b.resolved_by}</span>` : '-';

        return `
            <div class="card" style="${isResolved ? 'opacity: 0.85; background-color: #fafafa;' : ''}">
                <div>
                    <div class="card-top">
                        <span class="machine-tag"><i class="fa-solid fa-industry"></i> מכונה #${b.machine_number}</span>
                        <span class="priority-tag priority-${b.priority}">עדיפות ${b.priority}</span>
                    </div>

                    <h3 class="card-title" style="${isResolved ? 'text-decoration: line-through;' : ''}">${b.title}</h3>
                    <p class="card-desc">${b.description || 'אין תאור מפורט.'}</p>

                    ${imageHtml}

                    <div class="card-meta-box">
                        <div class="meta-row">
                            <span>זמן דיווח:</span>
                            <strong>${createdDate} (ע"י ${b.created_by || 'מנהל'})</strong>
                        </div>
                        ${b.notes ? `<div class="meta-row"><span>הערות:</span><strong>${b.notes}</strong></div>` : ''}
                        ${isResolved ? `
                            <div class="meta-row"><span>טופל בתאריך:</span><strong>${resolvedDate}</strong></div>
                            <div class="meta-row"><span>נסגר ונחתם ע"י:</span><strong>${resolvedBy}</strong></div>
                        ` : ''}
                    </div>
                </div>

                <div class="card-actions">
                    ${!isResolved ? `
                        <button class="btn btn-danger btn-block" onclick="openSignoffModal('breakdown', ${b.id})">
                            <i class="fa-solid fa-wrench"></i> סגור תקלה וחתום
                        </button>
                    ` : `
                        <button class="btn btn-secondary btn-block" disabled>
                            <i class="fa-solid fa-circle-check"></i> תקלה מטופלת וסגורה
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Render Audit Log Table
function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    const search = (document.getElementById('historySearchInput').value || '').toLowerCase();

    let filtered = auditLogsList.filter(log => {
        if (!search) return true;
        const text = `${log.id} ${log.action_title} ${log.worker_name} ${log.machine_number} ${log.notes || ''}`.toLowerCase();
        return text.includes(search);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">לא נמצאו רשומות ביומן הפעילויות.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(log => {
        const dateStr = new Date(log.created_at).toLocaleString('he-IL');
        const isOverride = log.is_admin_override === 1;

        return `
            <tr style="${isOverride ? 'background-color: #fffbeb;' : ''}">
                <td>#${log.id}</td>
                <td>${dateStr}</td>
                <td><strong>${log.action_title}</strong></td>
                <td>${log.machine_number ? `מכונה #${log.machine_number}` : '-'}</td>
                <td><span class="worker-name-tag">${log.worker_name}</span></td>
                <td>${log.notes || ''} ${isOverride ? `<br><small style="color:#b45309;">סיבת תיקון: ${log.override_reason}</small>` : ''}</td>
                <td><span style="color:var(--success); font-weight:700;"><i class="fa-solid fa-shield-check"></i> נחתם במערכת</span></td>
                <td class="admin-only ${!isAdmin ? 'hidden' : ''}">
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size:12px;" onclick="openAdminOverrideModal(${log.id})">
                        <i class="fa-solid fa-pen"></i> תיקון מנהל
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render Workers Table (Admin)
function renderWorkersTable() {
    const tbody = document.getElementById('adminWorkersTableBody');
    if (!tbody) return;

    if (workersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">אין עובדים במערכת.</td></tr>';
        return;
    }

    tbody.innerHTML = workersList.map(w => `
        <tr>
            <td><strong>${w.employee_code}</strong></td>
            <td><span class="worker-name-tag">${w.full_name}</span></td>
            <td>${new Date(w.created_at).toLocaleDateString('he-IL')}</td>
            <td>
                <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="handleDeleteWorker(${w.id})">
                    <i class="fa-solid fa-trash"></i> מחק
                </button>
            </td>
        </tr>
    `).join('');
}

// Filter History Search
function filterHistoryTable() {
    renderHistoryTable();
}

// Modal Handlers
function openSignoffModal(type, id) {
    currentSignoffTarget = { type, id };
    document.getElementById('signoffError').classList.add('hidden');
    document.getElementById('signoffForm').reset();

    if (type === 'routine') {
        const item = routineTasksList.find(t => t.id === id);
        currentSignoffTarget.item = item;
        document.getElementById('signoffItemType').textContent = 'משימת אחזקה קבועה';
        document.getElementById('signoffItemTitle').textContent = item.title;
        document.getElementById('signoffItemMeta').textContent = `מכונה #${item.machine_number} | תדירות: ${item.frequency}`;
    } else {
        const item = breakdownsList.find(b => b.id === id);
        currentSignoffTarget.item = item;
        document.getElementById('signoffItemType').textContent = 'סגירת תקלה מתפרצת';
        document.getElementById('signoffItemTitle').textContent = item.title;
        document.getElementById('signoffItemMeta').textContent = `מכונה #${item.machine_number} | עדיפות: ${item.priority}`;
    }

    document.getElementById('signoffModal').classList.remove('hidden');
    document.getElementById('signoffEmployeeCode').focus();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Sign-Off Form Submission
async function handleSignoffSubmit(e) {
    e.preventDefault();
    const employee_code = document.getElementById('signoffEmployeeCode').value.trim();
    const pin = document.getElementById('signoffPin').value.trim();
    const notes = document.getElementById('signoffNotes').value.trim();
    const errorDiv = document.getElementById('signoffError');

    errorDiv.classList.add('hidden');

    const url = currentSignoffTarget.type === 'routine'
        ? `/api/routine-tasks/${currentSignoffTarget.id}/signoff`
        : `/api/breakdowns/${currentSignoffTarget.id}/resolve`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_code, pin, notes })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            errorDiv.textContent = data.error || 'מספר עובד או קוד אישי שגוי';
            errorDiv.classList.remove('hidden');
            return;
        }

        closeModal('signoffModal');
        alert(`✅ הפעולה נחתמה בהצלחה!\nשם העובד החותם: ${data.worker_name}`);

        await loadAllData();
    } catch (err) {
        errorDiv.textContent = 'שגיאת התחברות לשרת המקומי';
        errorDiv.classList.remove('hidden');
    }
}

// Admin Role Toggle & Authentication
function openAdminLoginModal() {
    if (isAdmin) {
        // Logout Admin
        isAdmin = false;
        updateRoleUI();
        alert('יצאת ממצב מנהל. המערכת חזרה למצב סטודיו (עובדים).');
    } else {
        document.getElementById('adminLoginError').classList.add('hidden');
        document.getElementById('adminLoginPassword').value = '';
        document.getElementById('adminLoginModal').classList.remove('hidden');
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminLoginPassword').value.trim();
    const errorDiv = document.getElementById('adminLoginError');

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            isAdmin = true;
            closeModal('adminLoginModal');
            updateRoleUI();
            alert('התחברת בהצלחה כמנהל מערכת!');
        } else {
            errorDiv.textContent = data.message || 'סיסמה שגויה';
            errorDiv.classList.remove('hidden');
        }
    } catch (err) {
        errorDiv.textContent = 'שגיאת תקשורת';
        errorDiv.classList.remove('hidden');
    }
}

function updateRoleUI() {
    const badge = document.getElementById('roleBadge');
    const badgeText = document.getElementById('roleBadgeText');
    const toggleBtn = document.getElementById('toggleRoleBtn');
    const adminElements = document.querySelectorAll('.admin-only');

    if (isAdmin) {
        badge.className = 'role-badge admin-mode';
        badgeText.textContent = 'מצב מנהל מערכת (Admin)';
        toggleBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> יציאה ממצב מנהל';
        adminElements.forEach(el => el.classList.remove('hidden'));
    } else {
        badge.className = 'role-badge worker-mode';
        badgeText.textContent = 'מצב סטודיו (עובדים)';
        toggleBtn.innerHTML = '<i class="fa-solid fa-lock"></i> מעבר למצב מנהל';
        adminElements.forEach(el => el.classList.add('hidden'));

        // If currently on admin tab, switch to routine tab
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'admin') {
            switchTab('routine');
        }
    }
    renderHistoryTable();
}

// Add New Breakdown (Admin)
function openNewBreakdownModal() {
    document.getElementById('newBreakdownForm').reset();
    document.getElementById('newBreakdownModal').classList.remove('hidden');
}

async function handleNewBreakdownSubmit(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('machine_number', document.getElementById('breakdownMachineSelect').value);
    formData.append('priority', document.getElementById('breakdownPrioritySelect').value);
    formData.append('title', document.getElementById('breakdownTitle').value.trim());
    formData.append('description', document.getElementById('breakdownDescription').value.trim());
    formData.append('notes', document.getElementById('breakdownNotes').value.trim());
    formData.append('created_by', 'מנהל מערכת');

    const imageFile = document.getElementById('breakdownImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const res = await fetch('/api/breakdowns', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            closeModal('newBreakdownModal');
            alert('דיווח התקלה פורסם בהצלחה!');
            await loadAllData();
        }
    } catch (err) {
        alert('שגיאה בשמירת דיווח התקלה');
    }
}

// Add New Routine Task (Admin)
function openNewTaskModal() {
    document.getElementById('newTaskForm').reset();
    document.getElementById('newTaskModal').classList.remove('hidden');
}

async function handleNewTaskSubmit(e) {
    e.preventDefault();
    const payload = {
        machine_number: document.getElementById('taskMachineSelect').value,
        frequency: document.getElementById('taskFrequencySelect').value,
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim()
    };

    try {
        const res = await fetch('/api/routine-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeModal('newTaskModal');
            alert('משימת האחזקה נוספה בהצלחה!');
            await loadAllData();
        }
    } catch (err) {
        alert('שגיאה בשמירת המשימה');
    }
}

// Add Worker (Admin)
async function handleAddWorker(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('workerFullName').value.trim(),
        employee_code: document.getElementById('workerEmployeeCode').value.trim(),
        pin: document.getElementById('workerPin').value.trim()
    };

    try {
        const res = await fetch('/api/workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            document.getElementById('addWorkerForm').reset();
            alert('העובד נוסף בהצלחה למערכת!');
            await fetchWorkers();
        } else {
            alert(data.error || 'שגיאה בהוספת עובד');
        }
    } catch (err) {
        alert('שגיאת תקשורת');
    }
}

async function handleDeleteWorker(workerId) {
    if (!confirm('האם אתה בטוח שברצונך למחוק עובד זה מניהול המשתמשים?')) return;
    try {
        await fetch(`/api/workers/${workerId}`, { method: 'DELETE' });
        await fetchWorkers();
    } catch (err) {
        alert('שגיאה במחיקת עובד');
    }
}

// Add Machine (Admin)
async function handleAddMachine(e) {
    e.preventDefault();
    const payload = {
        machine_number: document.getElementById('machineNumber').value,
        name: document.getElementById('machineName').value.trim(),
        location: document.getElementById('machineLocation').value.trim()
    };

    try {
        const res = await fetch('/api/machines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            document.getElementById('addMachineForm').reset();
            alert('המכונה נוספה בהצלחה!');
            await fetchMachines();
            updateStats();
        } else {
            alert(data.error || 'שגיאה בהוספת מכונה');
        }
    } catch (err) {
        alert('שגיאת תקשורת');
    }
}

// Admin Override Modal
function openAdminOverrideModal(logId) {
    currentOverrideLogId = logId;
    document.getElementById('overrideLogId').value = logId;
    document.getElementById('overrideReason').value = '';
    document.getElementById('overrideNotes').value = '';
    document.getElementById('adminOverrideModal').classList.remove('hidden');
}

async function handleAdminOverrideSubmit(e) {
    e.preventDefault();
    const override_reason = document.getElementById('overrideReason').value.trim();
    const correction_notes = document.getElementById('overrideNotes').value.trim();

    try {
        const res = await fetch('/api/audit-logs/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                log_id: currentOverrideLogId,
                admin_password: 'admin123',
                override_reason,
                correction_notes
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            closeModal('adminOverrideModal');
            alert('תיקון המנהל נרשם בהצלחה ביומן הפעילויות.');
            await fetchAuditLogs();
        } else {
            alert(data.error || 'שגיאה');
        }
    } catch (err) {
        alert('שגיאת תקשורת');
    }
}
