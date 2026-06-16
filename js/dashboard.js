import { supabase } from "./supabase-config.js";

let studentUserId = null;
let activeChatListener = null;

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();

    
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if (user) {
            studentUserId = user.id;
            
            const nameEl = document.getElementById('student-name-display');
            if(nameEl) {
                nameEl.textContent = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0];
            }

            setupStudentChatSystem();
            fetchLessons(user.id);
        }
    });
});


function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard') || document.querySelectorAll('.nav-links .nav-item')[0]; 
    const navLessons = document.getElementById('nav-lessons');
    const navMessages = document.getElementById('nav-messages');

    const tabDashboard = document.getElementById('tab-dashboard');
    const tabLessons = document.getElementById('tab-lessons');
    const tabMessages = document.getElementById('tab-messages');
    const subtitle = document.getElementById('student-subtitle');

    const allNavs = [navDashboard, navLessons, navMessages];
    const allTabs = [tabDashboard, tabLessons, tabMessages];

    window.switchTab = (targetNavEl, targetTabEl, subtitleText) => {
        allNavs.forEach(nav => {
            if(nav) nav.classList.remove('active');
        });
        allTabs.forEach(tab => {
            if(tab) tab.style.display = 'none';
        });
        
        if(targetNavEl) targetNavEl.classList.add('active');
        if(targetTabEl) targetTabEl.style.display = 'block';
        if(subtitle && subtitleText) subtitle.textContent = subtitleText;
    };

    if(navDashboard) {
        navDashboard.addEventListener('click', (e) => {
            if(navDashboard.getAttribute('href') === 'index.html' || navDashboard.getAttribute('href') === '#') {
                e.preventDefault();
                window.switchTab(navDashboard, tabDashboard, "Let's continue mastering chemistry.");
            }
        });
    }

    if(navLessons) {
        navLessons.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(navLessons, tabLessons, "Explore the complete chemistry curriculum.");
        });
    }

    const viewAllBtn = document.getElementById('view-all-lessons-btn');
    if(viewAllBtn) {
        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(navLessons, tabLessons, "Explore the complete chemistry curriculum.");
        });
    }

    if(navMessages) {
        navMessages.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(navMessages, tabMessages, "Direct communications with your instructor.");
        });
    }
}

async function fetchLessons(userId) {
    const dashContainer = document.getElementById('lessons-container');
    const allContainer = document.getElementById('all-lessons-container');
    if (!dashContainer && !allContainer) return;
    
    try {
        
        const { data: progList, error: progErr } = await supabase
            .from('progress')
            .select('lesson_id')
            .eq('student_id', userId);
        
        if (progErr) throw progErr;
        const completedLessonIds = new Set(progList.map(p => p.lesson_id));

        const { data: lessons, error: lessErr } = await supabase
            .from('lessons')
            .select('*')
            .order('created_at', { ascending: false });

        if (lessErr) throw lessErr;
        
        if (dashContainer) dashContainer.innerHTML = '';
        if (allContainer) allContainer.innerHTML = '';

        if (lessons.length === 0) {
            const emptyState = '<p style="color: var(--text-muted); grid-column: 1 / -1; padding: 2rem; background: rgba(0,0,0,0.2); text-align: center; border-radius: 12px; border: 1px dashed var(--border-subtle);">No lessons have been posted by your teacher yet. Please check back later!</p>';
            if (dashContainer) dashContainer.innerHTML = emptyState;
            if (allContainer) allContainer.innerHTML = emptyState;
            return;
        }

        const createCard = (doc) => {
            const branch = doc.branch || "General Chemistry";
            const timeObj = doc.estimated_time_mins ? `⏱️ ${doc.estimated_time_mins} mins` : "New Module";
            const tags = doc.tags || [];
            
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.cssText = "display: flex; flex-direction: column; justify-content: space-between; min-height: 250px; transition: transform 0.2s, box-shadow 0.2s;";
            card.onmouseover = () => { card.style.transform = "translateY(-4px)"; card.style.boxShadow = "var(--shadow-md)"; };
            card.onmouseout = () => { card.style.transform = "none"; card.style.boxShadow = "var(--shadow-sm)"; };

            const tagHTML = tags.map(t => `<span style="font-size: 0.75rem; color: var(--accent-blue); background: rgba(24, 101, 242, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;">#${t.toLowerCase().replace(/ /g, '-')}</span>`).join('');
            const isCompleted = completedLessonIds.has(doc.id);
            const statusBadge = isCompleted ? `<span style="font-size: 0.75rem; font-weight: 600; color: var(--accent-green); background: rgba(20, 191, 150, 0.1); padding: 0.3rem 0.6rem; border-radius: 4px; text-transform: uppercase; border: 1px solid var(--accent-green);">✓ Mastered</span>` 
                                            : `<span style="font-size: 0.75rem; font-weight: 600; color: var(--brand-secondary); background: rgba(20, 191, 150, 0.1); padding: 0.3rem 0.6rem; border-radius: 4px; text-transform: uppercase;">${branch}</span>`;

            card.innerHTML = `
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        ${statusBadge}
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${timeObj}</span>
                    </div>

                    <h3 style="margin: 0 0 1rem 0; color: var(--text-primary); font-family: var(--font-heading); font-size: 1.3rem; line-height: 1.3; ${isCompleted ? 'opacity: 0.7;' : ''}">${doc.title}</h3>
                    
                    <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.5rem; ${isCompleted ? 'opacity: 0.6;' : ''}">
                        ${tagHTML}
                    </div>
                </div>

                <div>
                    <a href="lesson.html?id=${doc.id}" class="btn" style="width: 100%; padding: 0.6rem 1.2rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; text-align: center; ${isCompleted ? 'background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border-subtle); box-shadow: none;' : 'background: var(--grad-primary); color: white;'}">${isCompleted ? 'Review Material' : 'Start Module'}</a>
                </div>
            `;
            return card;
        };

        lessons.forEach((doc, idx) => {
            
            if (idx < 6 && dashContainer) {
                dashContainer.appendChild(createCard(doc));
            }
            
            
            if (allContainer) {
                allContainer.appendChild(createCard(doc));
            }
        });
    } catch(err) {
        console.error(err);
        const errMsg = `<p style="color:var(--accent-red); grid-column: 1/-1;">Error loading lessons: ${err.message}</p>`;
        if (dashContainer) dashContainer.innerHTML = errMsg;
        if (allContainer) allContainer.innerHTML = errMsg;
    }
}

function setupStudentChatSystem() {
    const sendBtn = document.getElementById('btn-student-chat-send');
    const inputTxt = document.getElementById('student-chat-input');
    const historyBox = document.getElementById('student-chat-history');

    if(!sendBtn || !inputTxt || !historyBox) return;

    const sendMessage = async () => {
        if(!studentUserId) return;
        const text = inputTxt.value.trim();
        if(!text) return;

        sendBtn.disabled = true;
        sendBtn.textContent = '...';

        try {
            const { error } = await supabase
                .from('messages')
                .insert([{
                    room_id: studentUserId,
                    sender_id: studentUserId,
                    text: text
                }]);

            if (error) throw error;
            inputTxt.value = '';
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

    if (activeChatListener) {
        activeChatListener(); 
    }

    const loadMessages = async () => {
        const { data: msgs, error } = await supabase
            .from('messages')
            .select('*')
            .eq('room_id', studentUserId)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error("Error loading messages:", error);
            return;
        }

        historyBox.innerHTML = '';
        if(msgs.length === 0) {
            historyBox.innerHTML = '<div style="display: flex; justify-content: center; height: 100%; align-items: center; color: var(--text-muted); font-size: 0.9rem;">Start the conversation with your instructor.</div>';
            return;
        }

        msgs.forEach(msg => {
            const isStudent = msg.sender_id === studentUserId;
            const align = isStudent ? "flex-end" : "flex-start";
            const bgClass = isStudent ? "background: var(--brand-primary); color: white;" : "background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);";
            
            const bbl = document.createElement('div');
            bbl.style.cssText = `display: flex; flex-direction: column; align-items: ${align}; max-width: 70%; align-self: ${align};`;
            
            let attachHtml = '';
            if(msg.attachment_url) {
                attachHtml = `<a href="${msg.attachment_url}" target="_blank" style="color: ${isStudent ? '#e0f2fe' : 'var(--accent-blue)'}; font-size: 0.8rem; margin-top: 0.5rem; display: inline-block; word-break: break-all; text-decoration: underline;">🔗 Attachment Link</a>`;
            }

            let deleteBtnHtml = '';
            if(isStudent) {
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
                        const { error } = await supabase.from('messages').delete().eq('id', docId);
                        if (error) throw error;
                    } catch(err) {
                        console.error('Failed to delete message', err);
                    }
                }
            });
        });

        historyBox.scrollTop = historyBox.scrollHeight;
    };

    
    loadMessages();

    
    const channel = supabase
        .channel(`room:${studentUserId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${studentUserId}` },
            async () => {
                await loadMessages();
            }
        )
        .subscribe();

    activeChatListener = () => {
        supabase.removeChannel(channel);
    };
}
