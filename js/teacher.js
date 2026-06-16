import { supabase } from "./supabase-config.js";

let contentBlocks = [];
let editingLessonId = null;
let selectedUserId = null;
let allLessonsCache = []; 


let quizQuestions = [];
let editingQuizId = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    setupLivePreview();
    setupOutlineBuilder();
    setupNavigation();
    setupDrawer();
    setupMessaging();
    setupQuizBuilder();
    setupRiskCardFilter();
    document.getElementById('create-lesson-form').addEventListener('submit', handlePublish);
    document.getElementById('refresh-lessons-btn').addEventListener('click', loadManageLessons);
    document.getElementById('refresh-quizzes-btn').addEventListener('click', loadManageQuizzes);
});


function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const navManage = document.getElementById('nav-manage');
    const navStudents = document.getElementById('nav-students');
    const navMessages = document.getElementById('nav-messages');

    const tabDashboard = document.getElementById('tab-dashboard');
    const tabManage = document.getElementById('tab-manage');
    const tabStudents = document.getElementById('tab-students');
    const tabMessages = document.getElementById('tab-messages');
    const subtitle = document.getElementById('teacher-subtitle');

    const navQuizzes = document.getElementById('nav-quizzes');
    const tabQuizzes = document.getElementById('tab-quizzes');

    const allNavs = [navDashboard, navManage, navStudents, navMessages, navQuizzes];
    const allTabs = [tabDashboard, tabManage, tabStudents, tabMessages, tabQuizzes];

    window.switchTab = (targetNavId, targetTabId, subtitleText) => {
        allNavs.forEach(nav => {
            if(nav) { nav.classList.remove('active'); nav.style.color = ''; }
        });
        allTabs.forEach(tab => {
            if(tab) tab.style.display = 'none';
        });
        
        const activeNav = document.getElementById(targetNavId);
        const activeTab = document.getElementById(targetTabId);

        if(activeNav) {
            activeNav.classList.add('active');
            activeNav.style.color = 'var(--admin-accent)';
        }
        if(activeTab) {
            activeTab.style.display = 'block';
        }
        subtitle.textContent = subtitleText;
    };

    navDashboard.addEventListener('click', (e) => {
        e.preventDefault();
        window.switchTab('nav-dashboard', 'tab-dashboard', "Manage your students and deploy new chemistry lessons seamlessly.");
    });

    navManage.addEventListener('click', (e) => {
        e.preventDefault();
        window.switchTab('nav-manage', 'tab-manage', "Review, edit, and safely drop existing assignments.");
        loadManageLessons();
    });

    navStudents.addEventListener('click', (e) => {
        e.preventDefault();
        window.switchTab('nav-students', 'tab-students', "Deep-dive into individual classroom mastery statistics.");
        loadStudents();
    });

    navMessages.addEventListener('click', (e) => {
        e.preventDefault();
        window.switchTab('nav-messages', 'tab-messages', "Direct Two-Way Communication with your classroom.");
        loadChatContacts();
    });

    navQuizzes.addEventListener('click', (e) => {
        e.preventDefault();
        window.switchTab('nav-quizzes', 'tab-quizzes', "Build and manage knowledge-check quizzes for your lessons.");
        loadManageQuizzes();
    });
}


function setupDrawer() {
    const drawer = document.getElementById('student-drawer');
    const closeBtn = document.getElementById('close-drawer-btn');

    closeBtn.addEventListener('click', () => {
        drawer.style.right = '-500px';
    });

    
    document.getElementById('btn-open-dm').addEventListener('click', () => {
        const studentData = drawer._currentStudent;
        if (!studentData) return;
        drawer.style.right = '-500px';
        window.switchTab('nav-messages', 'tab-messages', 'Direct Two-Way Communication with your classroom.');
        setTimeout(() => {
            loadChatContacts(studentData.id);
        }, 100);
    });

    
    document.getElementById('btn-reset-progress').addEventListener('click', async () => {
        const studentData = drawer._currentStudent;
        if (!studentData) return;

        const confirmed = confirm(
            `Reset ALL lesson progress for ${studentData.name || 'this student'}?\n\nThis will remove every completion mark and cannot be undone.`
        );
        if (!confirmed) return;

        const btn = document.getElementById('btn-reset-progress');
        btn.textContent = 'Resetting...';
        btn.disabled = true;

        try {
            const { error } = await supabase
                .from('progress')
                .delete()
                .eq('student_id', studentData.id);

            if (error) throw error;
            
            btn.textContent = 'Progress Reset ✓';
            btn.style.color = 'var(--accent-green)';
            setTimeout(() => openStudentDrawer(studentData), 800);
            fetchStats();
        } catch(err) {
            console.error('Error resetting progress', err);
            alert('Failed to reset progress: ' + err.message);
        } finally {
            setTimeout(() => {
                btn.textContent = '🔄 Reset Lesson Progress';
                btn.style.color = 'var(--accent-red)';
                btn.disabled = false;
            }, 1500);
        }
    });
}

let activeChatListener = null;
let currentChatStudentId = null;

function setupMessaging() {
    const sendBtn = document.getElementById('btn-chat-send');
    const inputTxt = document.getElementById('chat-input-text');
    const inputUrl = document.getElementById('chat-input-url');

    const sendMessage = async () => {
        if(!currentChatStudentId) return;
        const text = inputTxt.value.trim();
        const url = inputUrl.value.trim();
        
        if(!text && !url) return;

        sendBtn.disabled = true;
        sendBtn.textContent = '...';

        try {
            const { error } = await supabase
                .from('messages')
                .insert([{
                    room_id: currentChatStudentId,
                    sender_id: "admin", 
                    text: text,
                    attachment_url: url || null
                }]);

            if (error) throw error;

            inputTxt.value = '';
            inputUrl.value = '';
        } catch (err) {
            console.error("Error sending message:", err);
            alert("Failed to send message.");
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    inputTxt.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendMessage();
    });
}

async function loadChatContacts(preselectUid = null) {
    const contactsList = document.getElementById('chat-contacts-list');
    contactsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 0.9rem;">Loading contacts...</p>';

    try {
        const [{ data: users, error }, { data: admins }] = await Promise.all([
            supabase.from('users').select('*').order('last_login_at', { ascending: false }),
            supabase.from('admins').select('email')
        ]);

        if (error) throw error;

        const adminEmails = admins ? admins.map(a => a.email) : [];
        const filteredUsers = users.filter(u => !adminEmails.includes(u.email) && u.email !== 'debugadmin@example.com');
        
        contactsList.innerHTML = '';
        let preselectDiv = null;
        let preselectArgs = null;

        filteredUsers.forEach(data => {
            const uid = data.id;
            const name = data.name || "Student";
            
            const div = document.createElement('div');
            div.style.cssText = "display: flex; align-items: center; gap: 0.8rem; padding: 0.8rem; border-radius: 8px; cursor: pointer; transition: background 0.2s;";
            div.onmouseover = () => div.style.background = "rgba(0,0,0,0.05)";
            div.onmouseout = () => div.style.background = "transparent";
            
            div.innerHTML = `
                <div style="width: 35px; height: 35px; border-radius: 50%; background: var(--grad-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">${name.charAt(0).toUpperCase()}</div>
                <div style="overflow: hidden;">
                    <div style="font-weight: 500; font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${data.email || ''}</div>
                </div>
            `;
            
            div.addEventListener('click', () => {
                Array.from(contactsList.children).forEach(child => {
                    child.style.background = "transparent";
                    child.onmouseout = () => child.style.background = "transparent";
                });
                div.style.background = "rgba(24, 101, 242, 0.1)";
                div.onmouseout = null;
                openChatThread(uid, name, data.email);
            });

            if (preselectUid && uid === preselectUid) {
                preselectDiv = div;
                preselectArgs = [uid, name, data.email];
            }

            contactsList.appendChild(div);
        });

        if (preselectDiv && preselectArgs) {
            preselectDiv.click();
        }

    } catch(err) {
        console.error(err);
        contactsList.innerHTML = `<p style="color:var(--accent-red);">Error loading users.</p>`;
    }
}

async function openChatThread(studentUid, studentName, studentEmail) {
    currentChatStudentId = studentUid;
    document.getElementById('chat-thread-name').textContent = studentName;
    document.getElementById('chat-thread-email').textContent = studentEmail || '';
    
    document.getElementById('chat-input-text').disabled = false;
    document.getElementById('chat-input-url').disabled = false;
    document.getElementById('btn-chat-send').disabled = false;
    
    document.getElementById('chat-input-text').focus();

    const historyBox = document.getElementById('chat-thread-history');
    
    if (activeChatListener) {
        activeChatListener(); 
    }

    const loadMessages = async () => {
        const { data: msgs, error } = await supabase
            .from('messages')
            .select('*')
            .eq('room_id', studentUid)
            .order('timestamp', { ascending: true });
        
        if (error) {
            console.error("Error fetching messages", error);
            return;
        }

        historyBox.innerHTML = '';
        if(msgs.length === 0) {
            historyBox.innerHTML = '<div style="display: flex; justify-content: center; height: 100%; align-items: center; color: var(--text-muted); font-size: 0.9rem;">Send a message to start the conversation.</div>';
            return;
        }

        msgs.forEach(msg => {
            const isAdmin = msg.sender_id === "admin";
            const align = isAdmin ? "flex-end" : "flex-start";
            const bgClass = isAdmin ? "background: var(--brand-primary); color: white;" : "background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);";
            
            const bbl = document.createElement('div');
            bbl.style.cssText = `display: flex; flex-direction: column; align-items: ${align}; max-width: 70%; align-self: ${align};`;
            
            let attachHtml = '';
            if(msg.attachment_url) {
                attachHtml = `<a href="${msg.attachment_url}" target="_blank" style="color: ${isAdmin ? '#e0f2fe' : 'var(--accent-blue)'}; font-size: 0.8rem; margin-top: 0.5rem; display: inline-block; word-break: break-all; text-decoration: underline;">🔗 Attachment Link</a>`;
            }
            
            let deleteBtnHtml = '';
            if(isAdmin) {
                deleteBtnHtml = `<div style="text-align: right; margin-top: 0.4rem;"><button class="btn-del-msg" data-id="${msg.id}" style="background: none; border: none; font-size: 0.75rem; color: rgba(255,255,255,0.7); cursor: pointer; padding: 0;">Delete 🗑️</button></div>`;
            }

            bbl.innerHTML = `
                <div style="padding: 0.8rem 1.2rem; border-radius: 12px; font-size: 0.9rem; line-height: 1.4; ${bgClass}">
                    ${msg.text || ''}
                    ${attachHtml}
                    ${deleteBtnHtml}
                </div>
            `;
            historyBox.appendChild(bbl);
        });
        
        
        document.querySelectorAll('.btn-del-msg').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm("Permanently delete this message?")) {
                    const docId = e.target.getAttribute('data-id');
                    try {
                        const { error } = await supabase.from("messages").delete().eq("id", docId);
                        if (error) throw error;
                    } catch(err) {
                        console.error('Failed to delete message', err);
                    }
                }
            });
        });

        historyBox.scrollTop = historyBox.scrollHeight;
    };

    
    await loadMessages();

    
    const channel = supabase
        .channel(`room:${studentUid}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${studentUid}` },
            async () => {
                await loadMessages();
            }
        )
        .subscribe();

    activeChatListener = () => {
        supabase.removeChannel(channel);
    };
}

async function openStudentDrawer(studentData) {
    const drawer = document.getElementById('student-drawer');
    drawer._currentStudent = studentData;

    const nameStr = studentData.name || "Unknown Student";
    document.getElementById('drawer-name').textContent = nameStr;
    document.getElementById('drawer-email').textContent = studentData.email || "No Email";
    document.getElementById('drawer-avatar').textContent = nameStr.charAt(0).toUpperCase();
    
    
    let isOnline = false;
    if (studentData.last_active_at) {
        const diffActiveMs = new Date() - new Date(studentData.last_active_at);
        if (diffActiveMs < 45000) {
            isOnline = true;
        }
    }
    
    const drawerIndicator = document.getElementById('drawer-status-indicator');
    if (drawerIndicator) {
        drawerIndicator.className = `avatar-status-indicator ${isOnline ? 'online' : 'offline'}`;
    }
    
    let agoStr = "Never logged in";
    let isAtRisk = false;
    const activeTime = studentData.last_active_at || studentData.last_login_at;
    if (activeTime) {
        const diffMs = new Date() - new Date(activeTime);
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) agoStr = `${diffMins}m ago`;
        else if (diffMins < 1440) agoStr = `${Math.floor(diffMins/60)}h ago`;
        else {
            const days = Math.floor(diffMins/1440);
            agoStr = `${days}d ago`;
            if (days > 7 && !isOnline) {
                isAtRisk = true;
            }
        }
    } else {
        isAtRisk = true;
    }
    document.getElementById('drawer-active-ago').textContent = isOnline ? "Online Now" : `Active ${agoStr}`;

    const drawerRiskIndicator = document.getElementById('drawer-risk-indicator');
    if (drawerRiskIndicator) {
        drawerRiskIndicator.style.display = isAtRisk ? 'block' : 'none';
    }

    const masteryContainer = document.querySelector('#student-drawer [data-mastery-container]');
    const activityLog = document.getElementById('drawer-activity-log');

    if (masteryContainer) masteryContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Loading...</p>';
    if (activityLog) {
        Array.from(activityLog.children).slice(1).forEach(el => el.remove());
    }

    try {
        const [allLessonsRes, progRes] = await Promise.all([
            supabase.from('lessons').select('*'),
            supabase.from('progress').select('*').eq('student_id', studentData.id)
        ]);

        if (allLessonsRes.error) throw allLessonsRes.error;
        if (progRes.error) throw progRes.error;

        const allLessons = allLessonsRes.data;
        const progressList = progRes.data;

        
        const branchMap = {};
        allLessons.forEach(d => {
            const branch = d.branch || "General Chemistry";
            if (!branchMap[branch]) branchMap[branch] = { total: 0, completed: 0 };
            branchMap[branch].total++;
        });

        progressList.forEach(pd => {
            const branch = pd.branch || "General Chemistry";
            if (!branchMap[branch]) branchMap[branch] = { total: 0, completed: 0 };
            branchMap[branch].completed++;
        });

        if (masteryContainer) {
            masteryContainer.innerHTML = '';
            const branches = Object.keys(branchMap);
            if (branches.length === 0) {
                masteryContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No lessons published yet.</p>';
            } else {
                branches.forEach(branch => {
                    const { total, completed } = branchMap[branch];
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    const color = pct >= 75 ? 'var(--accent-green)' : pct >= 40 ? 'var(--brand-secondary)' : 'var(--accent-red)';
                    const emoji = pct >= 75 ? '🟢' : pct >= 40 ? '🟡' : '🔴';
                    masteryContainer.innerHTML += `
                        <div style="margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.4rem;">
                                <span style="font-weight: 500;">${branch}</span>
                                <span style="color: ${color};">${emoji} ${pct}% <span style="color:var(--text-muted);font-weight:400;">(${completed}/${total})</span></span>
                            </div>
                            <div style="width:100%; height:6px; background:rgba(0,0,0,0.1); border-radius:3px;">
                                <div style="width:${pct}%; height:100%; background:${color}; border-radius:3px; transition: width 0.5s ease;"></div>
                            </div>
                        </div>`;
                });
            }
        }

        
        if (activityLog) {
            if (progressList.length === 0) {
                activityLog.insertAdjacentHTML('beforeend', '<p style="color:var(--text-muted);font-size:0.85rem;margin-top:0.5rem;">No lessons completed yet.</p>');
            } else {
                progressList.sort((a,b) => new Date(b.completed_at) - new Date(a.completed_at));
                
                progressList.slice(0, 5).forEach((lesson, i) => {
                    const dotColor = i === 0 ? 'var(--accent-green)' : 'var(--border-subtle)';
                    let timeStr = 'Recently';
                    if (lesson.completed_at) {
                        const diffMs = new Date() - new Date(lesson.completed_at);
                        const diffMins = Math.floor(diffMs / 60000);
                        if (diffMins < 60) timeStr = `${diffMins}m ago`;
                        else if (diffMins < 1440) timeStr = `${Math.floor(diffMins/60)}h ago`;
                        else timeStr = `${Math.floor(diffMins/1440)}d ago`;
                    }
                    activityLog.insertAdjacentHTML('beforeend', `
                        <div style="position: relative;">
                            <div style="position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; border: 2px solid var(--bg-card);"></div>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Completed: <strong>${lesson.title || 'Lesson'}</strong></p>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr}</span>
                        </div>`);
                });
            }
        }

    } catch(e) {
        console.error("Error loading drawer data", e);
        if (masteryContainer) masteryContainer.innerHTML = '<p style="color:var(--accent-red);font-size:0.85rem;">Could not load data.</p>';
    }

    drawer.style.right = '0';
}


async function loadManageLessons() {
    const tbody = document.getElementById('manage-lessons-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading lessons...</td></tr>';
    
    try {
        const { data: lessons, error } = await supabase
            .from('lessons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        allLessonsCache = lessons;

        if (lessons.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No lessons published yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        lessons.forEach(data => {
            const dateStr = data.created_at ? new Date(data.created_at).toLocaleDateString() : 'New';
            
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--border-subtle)";
            tr.innerHTML = `
                <td style="padding: 1rem; font-weight: 500; color: var(--text-primary); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.title}</td>
                <td style="padding: 1rem; color: var(--text-secondary);"><span style="font-size: 0.75rem; color: var(--brand-secondary); background: rgba(20, 191, 150, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;">${data.branch || "N/A"}</span></td>
                <td style="padding: 1rem; color: var(--text-muted);">${data.estimated_time_mins ? data.estimated_time_mins + 'm' : '--'}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${dateStr}</td>
                <td style="padding: 1rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn-edit-lesson" data-id="${data.id}" style="background: rgba(24, 101, 242, 0.1); border: 1px solid rgba(24, 101, 242, 0.2); color: var(--accent-blue); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;">✏️ Edit</button>
                    <button class="btn-delete-lesson" data-id="${data.id}" data-title="${data.title}" style="background: rgba(250, 62, 62, 0.1); border: 1px solid rgba(250, 62, 62, 0.2); color: var(--accent-red); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;">🗑️ Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        
        document.querySelectorAll('.btn-edit-lesson').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const lessonData = allLessonsCache.find(l => l.id === id);
                if(lessonData) {
                    editLesson(lessonData);
                }
            });
        });

        
        document.querySelectorAll('.btn-delete-lesson').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const title = e.target.getAttribute('data-title');
                
                if (confirm(`\nAre you sure you want to permanently delete the lesson:\n"${title}"?\n\nThis will instantly remove it from all student dashboards. This cannot be undone.`)) {
                    e.target.textContent = "Deleting...";
                    e.target.disabled = true;
                    try {
                        const { error } = await supabase.from('lessons').delete().eq('id', id);
                        if (error) throw error;
                        
                        loadManageLessons();
                        fetchStats();
                    } catch(err) {
                        console.error("Error deleting document:", err);
                        alert("Failed to delete lesson.");
                        e.target.textContent = "🗑️ Delete";
                        e.target.disabled = false;
                    }
                }
            });
        });

    } catch(err) {
        console.error("Error loading manage lessons", err);
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 2rem; color: var(--accent-red); text-align: center;">Error loading lessons: ${err.message}</td></tr>`;
    }
}


function editLesson(lessonData) {
    editingLessonId = lessonData.id;

    window.switchTab('nav-dashboard', 'tab-dashboard', "Updating published lesson module...");

    document.getElementById('lesson-title').value = lessonData.title || "";
    document.getElementById('lesson-branch').value = lessonData.branch || "";
    document.getElementById('lesson-time').value = lessonData.estimated_time_mins || "";
    document.getElementById('lesson-file-url').value = lessonData.handout_url || "";
    document.getElementById('lesson-tags-input').value = (lessonData.tags || []).join(", ");
    
    document.getElementById('lesson-title').dispatchEvent(new Event('input'));
    document.getElementById('lesson-branch').dispatchEvent(new Event('change'));
    document.getElementById('lesson-time').dispatchEvent(new Event('input'));
    document.getElementById('lesson-tags-input').dispatchEvent(new Event('input'));
    
    contentBlocks = lessonData.blocks || [];
    window.renderBlocksUI(); 

    const pubBtn = document.getElementById('publish-btn');
    pubBtn.textContent = "Update Lesson";
    pubBtn.style.background = "var(--accent-blue)";
    document.getElementById('publish-status').textContent = "Editing Mode Active.";
}


async function loadStudents() {
    const tbody = document.getElementById('students-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading roster...</td></tr>';
    
    const riskCard = document.getElementById('risk-card');
    if (riskCard) {
        riskCard.style.borderColor = '';
        riskCard.style.boxShadow = '';
    }
    window.isRiskFiltered = false;
    
    try {
        const [{ data: users, error }, { data: admins }] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('admins').select('email')
        ]);

        if (error) throw error;

        const adminEmails = admins ? admins.map(a => a.email) : [];
        const filteredUsers = users.filter(u => !adminEmails.includes(u.email) && u.email !== 'debugadmin@example.com');
        
        let atRiskCount = 0;
        let atRiskNames = [];

        if (filteredUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No students have registered yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        
        filteredUsers.sort((a, b) => new Date(b.last_login_at || 0) - new Date(a.last_login_at || 0));

        for (const data of filteredUsers) {
            const name = data.name || "Student";
            const initial = name.charAt(0).toUpperCase();

            
            let isOnline = false;
            if (data.last_active_at) {
                const diffActiveMs = new Date() - new Date(data.last_active_at);
                if (diffActiveMs < 45000) {
                    isOnline = true;
                }
            }
            const statusClass = isOnline ? 'online' : 'offline';

            let agoStr = "Never logged in";
            let isAtRisk = false;
            const activeTime = data.last_active_at || data.last_login_at;
            if (activeTime) {
                const diffMs = new Date() - new Date(activeTime);
                const diffMins = Math.floor(diffMs / 60000);
                if (diffMins < 60) {
                    agoStr = `${diffMins}m ago`;
                } else if (diffMins < 1440) {
                    agoStr = `${Math.floor(diffMins/60)}h ago`;
                } else {
                    const days = Math.floor(diffMins/1440);
                    agoStr = `${days}d ago`;
                    if (days > 7 && !isOnline) { 
                        atRiskCount++; 
                        isAtRisk = true; 
                        atRiskNames.push(name);
                    }
                }
            } else {
                atRiskCount++; 
                isAtRisk = true;
                atRiskNames.push(name);
            }

            
            let focusHtml = '<span style="color: var(--text-muted); font-style: italic;">No lessons completed yet</span>';
            try {
                const { data: prog, error: pError } = await supabase
                    .from('progress')
                    .select('*')
                    .eq('student_id', data.id)
                    .order('completed_at', { ascending: false })
                    .limit(1);

                if (pError) throw pError;

                if (prog && prog.length > 0) {
                    focusHtml = `Last completed: <strong style="color: var(--text-primary); font-weight: 500;">${prog[0].title || 'Lesson'}</strong>`;
                }
            } catch(e) {
                console.error("Progress fetch error for", data.id, e);
            }

            const riskBadge = isAtRisk ? `<span style="font-size: 0.65rem; background: rgba(250,62,62,0.1); color: var(--accent-red); border: 1px solid rgba(250,62,62,0.3); padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600; margin-left: 0.5rem;">AT RISK</span>` : '';

            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--border-subtle)";
            tr.style.cursor = "pointer";
            tr.className = "student-row";
            if (isAtRisk) {
                tr.classList.add('at-risk-row');
            }
            tr.innerHTML = `
                <td style="padding: 1rem;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div class="avatar-container">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--grad-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>
                            <span class="avatar-status-indicator ${statusClass}"></span>
                            ${isAtRisk ? '<div style="position: absolute; top: -5px; left: -5px; font-size: 1rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); z-index: 2;">⚠️</div>' : ''}
                        </div>
                        <div>
                            <div style="font-weight: 500; color: var(--text-primary);">${name}${riskBadge}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${data.email || 'No Email'}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.9rem;">${focusHtml}</td>
                <td style="padding: 1rem; font-size: 0.9rem;">
                    <span class="status-badge ${statusClass}">
                        <span class="status-dot ${statusClass}"></span>
                        ${isOnline ? 'Online' : agoStr}
                    </span>
                </td>
                <td style="padding: 1rem; text-align: right;">
                    <button style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; padding: 0.5rem; transition: color 0.2s;" onmouseover="this.style.color='var(--admin-accent)'" onmouseout="this.style.color='var(--text-muted)'">...</button>
                </td>
            `;

            tr.addEventListener('click', () => openStudentDrawer(data));
            tbody.appendChild(tr);
        }

        document.getElementById('at-risk-count').textContent = atRiskCount;
        window.atRiskStudentNames = atRiskNames;
        
        const updateRiskCardSubtitle = () => {
            const riskStatus = document.getElementById('at-risk-status');
            if (riskStatus) {
                if (atRiskNames.length > 0) {
                    riskStatus.innerHTML = `Lagging: <strong style="color: var(--accent-red);">${atRiskNames.join(', ')}</strong>`;
                } else {
                    riskStatus.innerHTML = `No low activity detected`;
                }
            }
        };
        
        updateRiskCardSubtitle();
        window.updateRiskCardSubtitle = updateRiskCardSubtitle;

    } catch(err) {
        console.error("Error loading students", err);
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; color: var(--accent-red); text-align: center;">Error loading students: ${err.message}</td></tr>`;
    }
}


async function fetchStats() {
    try {
        const [lessonsRes, usersRes, progressRes, adminsRes] = await Promise.all([
            supabase.from('lessons').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*'),
            supabase.from('progress').select('*', { count: 'exact', head: true }),
            supabase.from('admins').select('email')
        ]);

        if (lessonsRes.error) throw lessonsRes.error;
        if (usersRes.error) throw usersRes.error;
        if (progressRes.error) throw progressRes.error;

        const adminEmails = adminsRes.data ? adminsRes.data.map(a => a.email) : [];
        const validUsers = usersRes.data.filter(u => !adminEmails.includes(u.email) && u.email !== 'debugadmin@example.com');

        const totalStudents = validUsers.length;
        const totalLessons = lessonsRes.count || 0;
        const totalCompletions = progressRes.count || 0;

        document.getElementById('stat-lessons').textContent = totalLessons;
        document.getElementById('stat-students').textContent = totalStudents;

        const totalPossible = totalStudents * totalLessons;
        const avgPct = totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0;
        
        const donutEl = document.getElementById('class-avg-donut');
        const donutPctEl = document.getElementById('class-avg-pct');
        if (donutEl) donutEl.style.background = `conic-gradient(var(--brand-primary) ${avgPct}%, rgba(255,255,255,0.1) 0)`;
        if (donutPctEl) donutPctEl.textContent = `${avgPct}%`;
    } catch(err) {
        console.error("Failed fetching stats", err);
    }
}

function setupLivePreview() {
    const titleInput = document.getElementById('lesson-title');
    const branchInput = document.getElementById('lesson-branch');
    const timeInput = document.getElementById('lesson-time');
    const tagsInput = document.getElementById('lesson-tags-input');

    const previewTitle = document.getElementById('preview-title');
    const previewBranch = document.getElementById('preview-branch');
    const previewTime = document.getElementById('preview-time');
    const tagsContainer = document.getElementById('tags-container');
    const previewTags = document.getElementById('preview-tags');

    titleInput.addEventListener('input', (e) => {
        previewTitle.textContent = e.target.value || "Lesson Title";
    });

    branchInput.addEventListener('change', (e) => {
        previewBranch.textContent = e.target.value.toUpperCase() || "CHEMISTRY";
    });

    timeInput.addEventListener('input', (e) => {
        previewTime.textContent = e.target.value || "--";
    });

    tagsInput.addEventListener('input', (e) => {
        const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
        
        tagsContainer.innerHTML = '';
        previewTags.innerHTML = '';

        if (tags.length === 0) {
            previewTags.innerHTML = '<span style="font-size: 0.75rem; color: var(--accent-blue); background: rgba(24, 101, 242, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;">#concept</span>';
            return;
        }

        tags.forEach(tag => {
            const formPill = document.createElement('span');
            formPill.textContent = tag;
            formPill.style.cssText = "font-size: 0.75rem; color: var(--text-primary); background: var(--border-subtle); padding: 0.2rem 0.5rem; border-radius: 4px;";
            tagsContainer.appendChild(formPill);

            const previewPill = document.createElement('span');
            previewPill.textContent = "#" + tag.toLowerCase().replace(/ /g, '-');
            previewPill.style.cssText = "font-size: 0.75rem; color: var(--accent-blue); background: rgba(24, 101, 242, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;";
            previewTags.appendChild(previewPill);
        });
    });
}

function setupOutlineBuilder() {
    const container = document.getElementById('content-blocks-container');
    const btnText = document.getElementById('btn-add-text');
    const btnVideo = document.getElementById('btn-add-video');
    const warning = document.getElementById('no-blocks-warning');

    const renderBlocks = () => {
        container.innerHTML = '';
        if (contentBlocks.length === 0) {
            warning.style.display = 'block';
            return;
        }
        warning.style.display = 'none';

        contentBlocks.forEach((block, index) => {
            const blockEl = document.createElement('div');
            blockEl.style.cssText = "background: rgba(33, 36, 44, 0.02); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 1rem;";

            const header = document.createElement('div');
            header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;";
            header.innerHTML = `
                <strong style="color: var(--text-primary); font-size: 0.85rem; text-transform: uppercase;">Step ${index + 1}: ${block.type === 'text' ? 'Markdown' : 'YouTube Video'}</strong>
                <button type="button" class="btn-remove-block" data-index="${index}" style="background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 0.8rem; font-weight: bold;">✕</button>
            `;

            const input = block.type === 'text' 
                ? `<textarea class="admin-input admin-textarea block-input" data-index="${index}" placeholder="Type your markdown lesson content here..." required>${block.content}</textarea>`
                : `<input type="url" class="admin-input block-input" data-index="${index}" placeholder="Paste YouTube link here..." value="${block.content}" required>`;

            blockEl.appendChild(header);
            blockEl.insertAdjacentHTML('beforeend', input);
            container.appendChild(blockEl);
        });

        document.querySelectorAll('.btn-remove-block').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                contentBlocks.splice(idx, 1);
                renderBlocks();
            });
        });

        document.querySelectorAll('.block-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.index);
                contentBlocks[idx].content = e.target.value;
            });
        });
    };

    window.renderBlocksUI = renderBlocks;

    btnText.addEventListener('click', () => {
        contentBlocks.push({ type: 'text', content: '' });
        renderBlocks();
    });

    btnVideo.addEventListener('click', () => {
        contentBlocks.push({ type: 'video', content: '' });
        renderBlocks();
    });

    renderBlocks();
}

async function handlePublish(e) {
    e.preventDefault();
    if (contentBlocks.length === 0) {
        document.getElementById('no-blocks-warning').style.display = 'block';
        return;
    }

    const btn = document.getElementById('publish-btn');
    const status = document.getElementById('publish-status');
    const title = document.getElementById('lesson-title').value;
    const branch = document.getElementById('lesson-branch').value;
    const time = parseInt(document.getElementById('lesson-time').value);
    const tagsRaw = document.getElementById('lesson-tags-input').value;
    const fileUrl = document.getElementById('lesson-file-url').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
    
    btn.disabled = true;
    btn.textContent = editingLessonId ? "Updating..." : "Publishing...";
    status.style.color = "var(--text-muted)";
    status.textContent = "Committing to database...";

    try {
        console.log("[DEBUG] Starting publish payload generation...");
        const payload = {
            title: title,
            branch: branch,
            estimated_time_mins: time,
            handout_url: fileUrl || null,
            tags: tags,
            blocks: contentBlocks
        };
        console.log("[DEBUG] Payload generated:", payload);

        console.log("[DEBUG] Sending direct native fetch request to Supabase...");
        const sessionStr = localStorage.getItem('sb-xboyefxywyhthczuqzpk-auth-token');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        const token = session?.access_token || '';

        const url = editingLessonId 
            ? `https://xboyefxywyhthczuqzpk.supabase.co/rest/v1/lessons?id=eq.${editingLessonId}` 
            : `https://xboyefxywyhthczuqzpk.supabase.co/rest/v1/lessons`;

        const method = editingLessonId ? 'PATCH' : 'POST';

        const fetchPromise = window.fetch(url, {
            method: method,
            headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhib3llZnh5d3lodGhjenVxenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjkwODgsImV4cCI6MjA5NDcwNTA4OH0.TN16_kQtKBnZQlAp8cexL3TewdRVtG2KF68_MPIs2yo',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(editingLessonId ? payload : [payload])
        });

        
        const response = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Network timeout (Preflight blocked)")), 8000))
        ]);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`${response.status} - ${errText}`);
        }

        console.log("[DEBUG] Request finished successfully.");
        status.style.color = "var(--accent-green)";
        status.textContent = editingLessonId ? "Lesson successfully updated!" : "Lesson successfully deployed to classroom!";
        btn.style.background = ""; 

        console.log("[DEBUG] Publish complete. Resetting form...");
        editingLessonId = null;
        document.getElementById('create-lesson-form').reset();
        contentBlocks = [];
        document.getElementById('lesson-tags-input').dispatchEvent(new Event('input')); 
        document.getElementById('lesson-title').dispatchEvent(new Event('input')); 
        window.renderBlocksUI(); 
        fetchStats(); 
    } catch(error) {
        console.error(error);
        status.style.color = "var(--accent-red)";
        status.textContent = "Error: " + error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = "Deploy to Classroom";
    }
}


async function loadManageQuizzes() {
    const tbody = document.getElementById('quizzes-tbody');
    const lessonSelect = document.getElementById('quiz-lesson-select');
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading quizzes...</td></tr>';
    
    try {
        
        const { data: lessons, error: lErr } = await supabase
            .from('lessons')
            .select('id, title')
            .order('title', { ascending: true });

        if (lErr) throw lErr;

        lessonSelect.innerHTML = '<option value="">— Select a lesson —</option>';
        lessons.forEach(l => {
            lessonSelect.innerHTML += `<option value="${l.id}">${l.title}</option>`;
        });

        
        const { data: quizzes, error: qErr } = await supabase
            .from('quizzes')
            .select(`
                id,
                passing_score,
                questions,
                lesson_id,
                lessons (
                    title
                )
            `)
            .order('created_at', { ascending: false });

        if (qErr) throw qErr;

        if (quizzes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No quizzes published yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        quizzes.forEach(q => {
            const lessonTitle = q.lessons?.title || 'Unknown Lesson';
            const questionCount = Array.isArray(q.questions) ? q.questions.length : 0;
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--border-subtle)";
            tr.innerHTML = `
                <td style="padding: 1rem 1.5rem; font-weight: 500; color: var(--text-primary);">${lessonTitle}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${questionCount} Qs</td>
                <td style="padding: 1rem; color: var(--text-muted);">${q.passing_score}%</td>
                <td style="padding: 1rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn-edit-quiz" data-id="${q.id}" style="background: rgba(24, 101, 242, 0.1); border: 1px solid rgba(24, 101, 242, 0.2); color: var(--accent-blue); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">✏️ Edit</button>
                    <button class="btn-delete-quiz" data-id="${q.id}" style="background: rgba(250, 62, 62, 0.1); border: 1px solid rgba(250, 62, 62, 0.2); color: var(--accent-red); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">🗑️ Delete</button>
                </td>
            `;
            
            
            tr.querySelector('.btn-edit-quiz').addEventListener('click', () => {
                editQuiz(q);
            });

            
            tr.querySelector('.btn-delete-quiz').addEventListener('click', async () => {
                if (confirm("Are you sure you want to delete this quiz?")) {
                    try {
                        const { error } = await supabase.from('quizzes').delete().eq('id', q.id);
                        if (error) throw error;
                        loadManageQuizzes();
                    } catch(err) {
                        alert("Error deleting quiz: " + err.message);
                    }
                }
            });

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Error loading quizzes:", err);
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; color: var(--accent-red); text-align: center;">Error loading quizzes: ${err.message}</td></tr>`;
    }
}

function setupQuizBuilder() {
    const container = document.getElementById('quiz-questions-container');
    const btnMcq = document.getElementById('btn-add-mcq');
    const btnTf = document.getElementById('btn-add-tf');
    const warning = document.getElementById('no-questions-warning');
    const saveBtn = document.getElementById('btn-save-quiz');
    const cancelBtn = document.getElementById('btn-cancel-quiz-edit');

    const renderQuestions = () => {
        container.innerHTML = '';
        if (quizQuestions.length === 0) {
            warning.style.display = 'block';
            return;
        }
        warning.style.display = 'none';

        quizQuestions.forEach((q, index) => {
            const qEl = document.createElement('div');
            qEl.style.cssText = "background: rgba(33, 36, 44, 0.02); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;";
            
            let choicesHtml = '';
            if (q.type === 'mcq') {
                choicesHtml = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
                        <input type="text" class="admin-input q-choice" data-qindex="${index}" data-cindex="0" placeholder="Option A" value="${q.choices[0] || ''}" required>
                        <input type="text" class="admin-input q-choice" data-qindex="${index}" data-cindex="1" placeholder="Option B" value="${q.choices[1] || ''}" required>
                        <input type="text" class="admin-input q-choice" data-qindex="${index}" data-cindex="2" placeholder="Option C" value="${q.choices[2] || ''}" required>
                        <input type="text" class="admin-input q-choice" data-qindex="${index}" data-cindex="3" placeholder="Option D" value="${q.choices[3] || ''}" required>
                    </div>
                    <div style="margin-top: 0.5rem;">
                        <label style="font-size:0.75rem; color:var(--text-muted);">Correct Option Index (0-3)</label>
                        <input type="number" class="admin-input q-correct" data-index="${index}" min="0" max="3" value="${q.correctAnswer}" style="width: 60px;" required>
                    </div>
                `;
            } else {
                choicesHtml = `
                    <div style="margin-top: 0.5rem;">
                        <label style="font-size:0.75rem; color:var(--text-muted);">Correct Answer</label>
                        <select class="admin-input q-correct" data-index="${index}" style="width: 100px;">
                            <option value="true" ${q.correctAnswer === 'true' ? 'selected' : ''}>True</option>
                            <option value="false" ${q.correctAnswer === 'false' ? 'selected' : ''}>False</option>
                        </select>
                    </div>
                `;
            }

            qEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; font-weight: bold; color:var(--brand-secondary);">Q${index+1} (${q.type.toUpperCase()})</span>
                    <button type="button" class="btn-remove-q" data-index="${index}" style="background: none; border: none; color: var(--accent-red); cursor: pointer; font-weight: bold;">✕</button>
                </div>
                <input type="text" class="admin-input q-prompt" data-index="${index}" placeholder="Type the question prompt here..." value="${q.prompt}" style="width:100%; margin-bottom:0.5rem;" required>
                ${choicesHtml}
            `;

            container.appendChild(qEl);
        });

        
        document.querySelectorAll('.btn-remove-q').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                quizQuestions.splice(idx, 1);
                renderQuestions();
            });
        });

        
        document.querySelectorAll('.q-prompt').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.index);
                quizQuestions[idx].prompt = e.target.value;
            });
        });

        
        document.querySelectorAll('.q-choice').forEach(input => {
            input.addEventListener('input', (e) => {
                const qIdx = parseInt(e.target.dataset.qindex);
                const cIdx = parseInt(e.target.dataset.cindex);
                quizQuestions[qIdx].choices[cIdx] = e.target.value;
            });
        });

        
        document.querySelectorAll('.q-correct').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                quizQuestions[idx].correctAnswer = e.target.value;
            });
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.index);
                quizQuestions[idx].correctAnswer = e.target.value;
            });
        });
    };

    btnMcq.addEventListener('click', () => {
        quizQuestions.push({
            type: 'mcq',
            prompt: '',
            choices: ['', '', '', ''],
            correctAnswer: 0
        });
        renderQuestions();
    });

    btnTf.addEventListener('click', () => {
        quizQuestions.push({
            type: 'tf',
            prompt: '',
            choices: ['True', 'False'],
            correctAnswer: 'true'
        });
        renderQuestions();
    });

    saveBtn.addEventListener('click', async () => {
        const lessonId = document.getElementById('quiz-lesson-select').value;
        const passingScore = parseInt(document.getElementById('quiz-passing-score').value);
        const status = document.getElementById('quiz-save-status');

        if (!lessonId) {
            alert("Please select an attached lesson.");
            return;
        }
        if (quizQuestions.length === 0) {
            alert("Please add at least one question.");
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const payload = {
                lesson_id: lessonId,
                passing_score: passingScore,
                questions: quizQuestions
            };

            if (editingQuizId) {
                const { error } = await supabase
                    .from('quizzes')
                    .update(payload)
                    .eq('id', editingQuizId);
                if (error) throw error;
                status.textContent = "Quiz updated successfully!";
            } else {
                const { error } = await supabase
                    .from('quizzes')
                    .insert([payload]);
                if (error) throw error;
                status.textContent = "Quiz published successfully!";
            }

            
            editingQuizId = null;
            quizQuestions = [];
            document.getElementById('quiz-lesson-select').value = "";
            document.getElementById('quiz-passing-score').value = 70;
            document.getElementById('quiz-form-title').textContent = "Create New Quiz";
            saveBtn.textContent = "Publish Quiz";
            cancelBtn.style.display = "none";
            renderQuestions();
            loadManageQuizzes();
        } catch(err) {
            console.error("Error saving quiz:", err);
            status.textContent = "Error saving quiz: " + err.message;
        } finally {
            saveBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', () => {
        editingQuizId = null;
        quizQuestions = [];
        document.getElementById('quiz-lesson-select').value = "";
        document.getElementById('quiz-passing-score').value = 70;
        document.getElementById('quiz-form-title').textContent = "Create New Quiz";
        saveBtn.textContent = "Publish Quiz";
        cancelBtn.style.display = "none";
        renderQuestions();
    });

    window.renderQuizQuestionsUI = renderQuestions;
}

function editQuiz(quiz) {
    editingQuizId = quiz.id;
    document.getElementById('quiz-form-title').textContent = "Edit Quiz";
    document.getElementById('quiz-lesson-select').value = quiz.lesson_id;
    document.getElementById('quiz-passing-score').value = quiz.passing_score;
    document.getElementById('btn-save-quiz').textContent = "Update Quiz";
    document.getElementById('btn-cancel-quiz-edit').style.display = "inline-block";

    quizQuestions = quiz.questions || [];
    window.renderQuizQuestionsUI();
}


function setupRiskCardFilter() {
    window.isRiskFiltered = false;
    const riskCard = document.getElementById('risk-card');
    if (riskCard) {
        riskCard.style.transition = 'all 0.2s';
        riskCard.addEventListener('click', () => {
            const rows = document.querySelectorAll('.student-row');
            const riskStatus = document.getElementById('at-risk-status');
            
            if (rows.length === 0 || !window.atRiskStudentNames || window.atRiskStudentNames.length === 0) return;
            
            window.isRiskFiltered = !window.isRiskFiltered;
            
            if (window.isRiskFiltered) {
                riskCard.style.borderColor = 'var(--accent-red)';
                riskCard.style.boxShadow = '0 4px 12px rgba(250, 62, 62, 0.2)';
                if (riskStatus) riskStatus.innerHTML = `<span style="color: var(--accent-red); font-weight: 600;">Filtering active (Click to clear)</span>`;
                
                rows.forEach(row => {
                    if (row.classList.contains('at-risk-row')) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                });
            } else {
                riskCard.style.borderColor = '';
                riskCard.style.boxShadow = '';
                if (window.updateRiskCardSubtitle) {
                    window.updateRiskCardSubtitle();
                }
                
                rows.forEach(row => {
                    row.style.display = '';
                });
            }
        });
    }
}
