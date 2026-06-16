import { supabase } from "./supabase-config.js";

let currentQuiz = null;
let currentQuestionIndex = 0;
let score = 0;
let currentStudentId = null;

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("feedback-modal");
    const modalIcon = document.getElementById("modal-icon");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    const continueBtn = document.getElementById("continue-btn");

    
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if(user) {
            currentStudentId = user.id;
            loadQuiz();
        } else {
            window.location.href = 'login.html';
        }
    });

    continueBtn.addEventListener("click", () => {
        modal.classList.remove("show");
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuiz.questions.length) {
            renderQuestion();
        } else {
            showQuizComplete();
        }
    });
});

async function loadQuiz() {
    const params = new URLSearchParams(window.location.search);
    const lessonId = params.get('lesson_id');
    
    if (!lessonId) {
        showNoQuiz();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('quizzes')
            .select('*')
            .eq('lesson_id', lessonId);

        if (error) throw error;

        let allQuestions = [];
        let passingScore = 50;
        if (data && data.length > 0) {
            passingScore = data[0].passing_score || 50;
            data.forEach(q => {
                if (q.questions && q.questions.length > 0) {
                    allQuestions = allQuestions.concat(q.questions);
                }
            });
        }

        if (allQuestions.length > 0) {
            currentQuiz = { ...data[0], questions: allQuestions, passing_score: passingScore };
            currentQuestionIndex = 0;
            score = 0;
            
            
            const backLink = document.getElementById('back-to-lesson');
            if (backLink) {
                backLink.href = `lesson.html?id=${lessonId}`;
            }
            
            renderQuestion();
        } else {
            showNoQuiz();
        }
    } catch (err) {
        console.error("Error loading quiz:", err);
        showNoQuiz();
    }
}

function renderQuestion() {
    const loadingState = document.getElementById('loading-state');
    const noQuizState = document.getElementById('no-quiz-state');
    const quizQuestions = document.getElementById('quiz-questions');
    const questionPrompt = document.getElementById('question-prompt');
    const interactiveArea = document.getElementById('interactive-area');
    const progressFill = document.getElementById('progress-fill');
    const questionCounter = document.getElementById('question-counter');

    loadingState.style.display = 'none';
    noQuizState.style.display = 'none';
    quizQuestions.style.display = 'block';

    const question = currentQuiz.questions[currentQuestionIndex];
    const totalQuestions = currentQuiz.questions.length;
    const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

    progressFill.style.width = `${progress}%`;
    questionCounter.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;

    questionPrompt.innerHTML = `<p style="font-size: 1.2rem; color: var(--text-primary); margin: 0;">${question.prompt}</p>`;

    if (question.type === 'mcq') {
        let choicesHtml = '<div style="display: flex; flex-direction: column; gap: 0.8rem; margin-top: 1.5rem;">';
        question.choices.forEach((choice, index) => {
            choicesHtml += `
                <button class="quiz-choice-btn" data-index="${index}" style="
                    padding: 1rem 1.5rem;
                    background: var(--bg-card);
                    border: 2px solid var(--border-subtle);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                ">
                    <span style="font-weight: 600; margin-right: 0.5rem;">${String.fromCharCode(65 + index)}.</span> ${choice}
                </button>
            `;
        });
        choicesHtml += '</div>';
        interactiveArea.innerHTML = choicesHtml;

        document.querySelectorAll('.quiz-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedIndex = parseInt(btn.dataset.index);
                checkAnswer(selectedIndex);
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = 'var(--brand-primary)';
                btn.style.background = 'rgba(24, 101, 242, 0.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'var(--border-subtle)';
                btn.style.background = 'var(--bg-card)';
            });
        });
    } else if (question.type === 'tf') {
        interactiveArea.innerHTML = `
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button class="quiz-choice-btn" data-value="true" style="
                    flex: 1;
                    padding: 1.5rem;
                    background: var(--bg-card);
                    border: 2px solid var(--border-subtle);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-size: 1.2rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">True</button>
                <button class="quiz-choice-btn" data-value="false" style="
                    flex: 1;
                    padding: 1.5rem;
                    background: var(--bg-card);
                    border: 2px solid var(--border-subtle);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-size: 1.2rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">False</button>
            </div>
        `;

        document.querySelectorAll('.quiz-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedValue = btn.dataset.value;
                checkAnswer(selectedValue);
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = 'var(--brand-primary)';
                btn.style.background = 'rgba(24, 101, 242, 0.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'var(--border-subtle)';
                btn.style.background = 'var(--bg-card)';
            });
        });
    }
}

function checkAnswer(selectedAnswer) {
    const question = currentQuiz.questions[currentQuestionIndex];
    const isCorrect = String(selectedAnswer) === String(question.correctAnswer);

    if (isCorrect) {
        score++;
    }

    showFeedback(isCorrect, question);
}

function showFeedback(isCorrect, question) {
    const modal = document.getElementById("feedback-modal");
    const modalIcon = document.getElementById("modal-icon");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    const continueBtn = document.getElementById("continue-btn");

    modal.classList.remove("correct", "incorrect", "show");

    if (isCorrect) {
        modal.classList.add("correct");
        modalIcon.innerHTML = "✓";
        modalTitle.innerText = "Correct!";
        modalBody.innerText = "Great job! You got this question right.";
    } else {
        modal.classList.add("incorrect");
        modalIcon.innerHTML = "✗";
        modalTitle.innerText = "Not quite.";
        
        let correctAnswerText = '';
        if (question.type === 'mcq') {
            correctAnswerText = `The correct answer was: ${question.choices[question.correctAnswer]}`;
        } else {
            correctAnswerText = `The correct answer was: ${question.correctAnswer === 'true' ? 'True' : 'False'}`;
        }
        modalBody.innerText = correctAnswerText;
    }

    modal.classList.add("show");
    continueBtn.style.display = "block";
}

function showQuizComplete() {
    const quizQuestions = document.getElementById('quiz-questions');
    const questionPrompt = document.getElementById('question-prompt');
    const interactiveArea = document.getElementById('interactive-area');
    const progressFill = document.getElementById('progress-fill');
    const questionCounter = document.getElementById('question-counter');

    progressFill.style.width = '100%';
    questionCounter.textContent = 'Quiz Complete';

    const totalQuestions = currentQuiz.questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= currentQuiz.passing_score;

    questionPrompt.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <h2 style="font-size: 2rem; margin-bottom: 1rem; color: ${passed ? 'var(--accent-green)' : 'var(--accent-red)'};">
                ${passed ? '🎉 Passed!' : '❌ Not Passed'}
            </h2>
            <p style="font-size: 1.2rem; color: var(--text-primary); margin-bottom: 0.5rem;">
                You scored ${score} out of ${totalQuestions}
            </p>
            <p style="font-size: 1rem; color: var(--text-muted);">
                ${percentage}% (Passing score: ${currentQuiz.passing_score}%)
            </p>
        </div>
    `;

    interactiveArea.innerHTML = `
        <div style="text-align: center; margin-top: 2rem;">
            <a href="lesson.html?lesson_id=${currentQuiz.lesson_id}" class="btn" style="
                display: inline-block;
                background: var(--grad-primary);
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">Back to Lesson</a>
        </div>
    `;
}

function showNoQuiz() {
    const loadingState = document.getElementById('loading-state');
    const noQuizState = document.getElementById('no-quiz-state');
    const quizQuestions = document.getElementById('quiz-questions');

    loadingState.style.display = 'none';
    quizQuestions.style.display = 'none';
    noQuizState.style.display = 'block';
}
