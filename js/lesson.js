import { supabase } from "./supabase-config.js";

let currentStudentId = null;
let currentLessonData = null;

document.addEventListener('DOMContentLoaded', () => {
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if(user) {
            currentStudentId = user.id;
            initLessonSync();
        } else {
            window.location.href = 'login.html';
        }
    });
});

async function initLessonSync() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    try {
        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            document.getElementById('lesson-breadcrumb').textContent = data.title;
            document.getElementById('lesson-h1').textContent = data.title;
            
            
            let contentHTML = '';

            
            if (data.content && !data.blocks) {
                const paragraphs = data.content.split('\n').filter(p => p.trim() !== '').map(p => `<p style="margin-bottom:1rem; line-height: 1.6; font-size: 1.05rem;">${p}</p>`).join('');
                contentHTML += paragraphs;
            }

            
            if (data.blocks && Array.isArray(data.blocks)) {
                data.blocks.forEach(block => {
                    if (block.type === 'text') {
                        
                        let parsed = block.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .split('\n')
                            .filter(p => p.trim() !== '')
                            .map(p => `<p style="margin-bottom:1.5rem; line-height: 1.7; font-size: 1.1rem; color: var(--text-secondary);">${p}</p>`)
                            .join('');
                        contentHTML += `<div class="lesson-text-block" style="margin-bottom: 2rem;">${parsed}</div>`;
                    } else if (block.type === 'video') {
                        
                        let videoId = '';
                        const urlMatch = block.content.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
                        if (urlMatch && urlMatch[1]) {
                            videoId = urlMatch[1];
                            contentHTML += `
                                <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; margin: 2.5rem 0; box-shadow: var(--shadow-md); border: 1px solid var(--border-subtle);">
                                    <iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border:0;" allowfullscreen title="YouTube Video Player"></iframe>
                                </div>
                            `;
                        } else {
                            contentHTML += `<p style="color: var(--accent-red); padding: 1rem; background: rgba(217, 41, 22, 0.1); border-radius: 8px;">Invalid YouTube URL provided by instructor.</p>`;
                        }
                    }
                });
            }
            
            let handoutLink = '';
            if (data.handoutUrl) {
                handoutLink = `<div style="margin-top: 3rem; padding: 1.5rem; background: rgba(24, 101, 242, 0.05); border-radius: 8px; border-left: 4px solid var(--accent-blue);">
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-primary); font-family: var(--font-heading);">📥 Teacher Resource</h3>
                    <a href="${data.handoutUrl}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600;">Open Handout / Image Attached to this Lesson</a>
                </div>`;
            }
            
            document.getElementById('lesson-dynamic-text').innerHTML = contentHTML + handoutLink;
            document.getElementById('lesson-subtitle').innerHTML = `<span style="font-size: 0.8rem; font-weight: 600; color: var(--brand-secondary); background: rgba(20, 191, 150, 0.1); padding: 0.3rem 0.6rem; border-radius: 4px; text-transform: uppercase;">${data.branch || "CHEMISTRY"}</span> <span style="margin-left: 1rem;">⏱️ ${data.estimatedTimeMins || "--"} mins</span>`;

            currentLessonData = { id, ...data };
            document.getElementById('completion-container').style.display = 'block';

            
            const { data: quizDataArray, error: quizError } = await supabase
                .from('quizzes')
                .select('*')
                .eq('lesson_id', id);

            
            const quizLink = document.getElementById('quiz-link');
            if (quizLink) {
                let hasQuestions = false;
                if (quizDataArray && quizDataArray.length > 0) {
                    hasQuestions = quizDataArray.some(q => q.questions && q.questions.length > 0);
                }

                if (hasQuestions) {
                    quizLink.href = `quiz.html?lesson_id=${id}`;
                    quizLink.style.display = 'block';
                } else {
                    quizLink.style.display = 'none';
                }
            }

            
            const { data: progressData, error: progressError } = await supabase
                .from('progress')
                .select('*')
                .eq('student_id', currentStudentId)
                .eq('lesson_id', id)
                .maybeSingle();

            if (progressError) throw progressError;

            if (progressData) {
                const btn = document.getElementById('btn-mark-completed');
                btn.textContent = "Previously Completed ✅";
                btn.style.background = "var(--bg-card)";
                btn.style.color = "var(--accent-green)";
                btn.style.border = "1px solid var(--accent-green)";
                btn.style.boxShadow = "none";
                btn.disabled = true;
            } else {
                setupCompletionButton(id);
            }

        } else {
            document.getElementById('lesson-h1').textContent = "Lesson Not Found";
            document.getElementById('lesson-subtitle').textContent = "This lesson may have been deleted.";
            document.getElementById('lesson-dynamic-text').innerHTML = "";
        }
    } catch(err) {
        console.error("Error fetching lesson:", err);
    }
}

function setupCompletionButton(lessonId) {
    const btn = document.getElementById('btn-mark-completed');
    const status = document.getElementById('completion-status');

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = "Saving...";
        btn.style.boxShadow = "none";
        
        try {
            const { error } = await supabase
                .from('progress')
                .insert([{
                    student_id: currentStudentId,
                    lesson_id: lessonId,
                    branch: currentLessonData.branch || "General Chemistry",
                    title: currentLessonData.title || "Lesson"
                }]);

            if (error) throw error;

            btn.textContent = "Completed Successfully ✓";
            btn.style.background = "rgba(20, 191, 150, 0.1)";
            btn.style.color = "var(--accent-green)";
            btn.style.border = "1px solid var(--accent-green)";
            
            status.textContent = "Taking you back to Dashboard...";
            status.style.color = "var(--accent-green)";

            setTimeout(() => {
                window.location.href = "index.html";
            }, 1000);
        } catch(err) {
            console.error("Error setting progress", err);
            status.textContent = "Error saving progress. Please try again.";
            status.style.color = "var(--accent-red)";
            btn.disabled = false;
            btn.textContent = "Mark as Completed ✓";
        }
    });
}
