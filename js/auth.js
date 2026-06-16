import { supabase } from "./supabase-config.js";


if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
        window.trustedTypes.createPolicy('default', {
            createHTML: (string) => string,
            createScript: (string) => string,
            createScriptURL: (string) => string,
        });
        console.log("[ChemoWeb Auth] Trusted Types bypass successfully registered.");
    } catch (e) {
        console.warn("[ChemoWeb Auth] Trusted Types default policy could not be registered:", e);
    }
}


const pathname = window.location.pathname.toLowerCase();
const isAuthPage = pathname.endsWith('login.html') || pathname.endsWith('/login') || pathname.endsWith('/login/');
const isTeacherPage = pathname.endsWith('teacher.html') || pathname.endsWith('/teacher') || pathname.endsWith('/teacher/');

console.log("[ChemoWeb Auth] Current page configuration:", {
    pathname: window.location.pathname,
    isAuthPage,
    isTeacherPage,
    hashPresent: !!window.location.hash
});

let isAuthInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!isAuthPage) setupLogout();
    if (isAuthPage) setupLoginUI();

    
    const initializeAuth = async () => {
        console.log("[ChemoWeb Auth] Starting initializeAuth()...");
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error("[ChemoWeb Auth] Session recovery error:", error);
            }

            console.log("[ChemoWeb Auth] initializeAuth() getSession result:", {
                hasSession: !!session,
                email: session?.user?.email
            });

            if (session?.user) {
                await handleUserSession(session.user);
            } else {
                
                const isCallback = window.location.hash.includes('access_token=') ||
                    window.location.hash.includes('id_token=') ||
                    window.location.hash.includes('error=');

                console.log("[ChemoWeb Auth] No session found. isAuthPage:", isAuthPage, "isCallback:", isCallback);
                if (!isAuthPage && !isCallback) {
                    console.log("[ChemoWeb Auth] Redirecting to login.html because no session was found on a protected page.");
                    window.location.href = 'login.html';
                }
            }
        } catch (e) {
            console.error("[ChemoWeb Auth] Exception in initializeAuth:", e);
        } finally {
            isAuthInitialized = true;
            console.log("[ChemoWeb Auth] isAuthInitialized flag set to true.");
        }
    };

    initializeAuth();

    
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("[ChemoWeb Auth] onAuthStateChange event fired:", {
            event,
            hasSession: !!session,
            email: session?.user?.email,
            isAuthInitialized
        });

        const user = session?.user;

        if (event === 'SIGNED_IN' && user) {
            console.log("[ChemoWeb Auth] SIGNED_IN event triggered user session handle.");
            await handleUserSession(user);
        } else if (event === 'SIGNED_OUT') {
            console.log("[ChemoWeb Auth] SIGNED_OUT event triggered. isAuthInitialized:", isAuthInitialized, "isAuthPage:", isAuthPage);
            if (isAuthInitialized && !isAuthPage) {
                console.log("[ChemoWeb Auth] Redirecting to login.html due to SIGNED_OUT event.");
                window.location.href = 'login.html';
            }
        }
    });
});

async function handleUserSession(user) {
    console.log("[ChemoWeb Auth] handleUserSession called for user:", user.email);
    const name = user.user_metadata?.name || user.user_metadata?.full_name || "Student";

    try {
        console.log("[ChemoWeb Auth] Upserting student record to 'users' table...");
        const { error: upsertErr } = await supabase.from('users').upsert({
            id: user.id,
            email: user.email,
            name: name,
            last_login_at: new Date().toISOString()
        });
        if (upsertErr) {
            console.error("[ChemoWeb Auth] Upsert failed:", upsertErr);
        } else {
            console.log("[ChemoWeb Auth] Student record upserted successfully.");
        }
    } catch (e) {
        console.error("[ChemoWeb Auth] Exception during student record upsert:", e);
    }

    const isAdmin = await checkAdminStatus(user.email);
    console.log("[ChemoWeb Auth] Admin verification status:", { email: user.email, isAdmin });

    
    if (!isAdmin) {
        const trackPresence = async () => {
            try {
                const { error } = await supabase.from('users').update({
                    last_active_at: new Date().toISOString()
                }).eq('id', user.id);
                if (error) console.error("[ChemoWeb Auth] Presence tracking failed:", error);
            } catch (e) {
                console.error("[ChemoWeb Auth] Exception during presence update:", e);
            }
        };

        trackPresence();
        const presenceInterval = setInterval(trackPresence, 20000);
        window.addEventListener('beforeunload', () => clearInterval(presenceInterval));
    }

    console.log("[ChemoWeb Auth] Evaluating page redirection rules. isAuthPage:", isAuthPage, "isAdmin:", isAdmin);
    if (isAuthPage) {
        if (isAdmin) {
            console.log("[ChemoWeb Auth] Redirecting teacher to teacher.html");
            window.location.href = 'teacher.html';
        } else {
            console.log("[ChemoWeb Auth] Redirecting student to index.html");
            window.location.href = 'index.html';
        }
    } else {
        if (isTeacherPage && !isAdmin) {
            console.log("[ChemoWeb Auth] Teacher page access denied for student. Redirecting to index.html");
            window.location.href = 'index.html';
        } else {
            console.log("[ChemoWeb Auth] Already on matching page. Updating UI components.");
            updateUIWithUser(user, isAdmin);
        }
    }
}

async function checkAdminStatus(email) {
    if (email === 'debugadmin@example.com') return true;
    if (!email) return false;
    try {
        const { data, error } = await supabase.from("admins").select("*").eq("email", email).maybeSingle();
        if (error) {
            console.error("[ChemoWeb Auth] Error in checkAdminStatus query:", error);
            return false;
        }
        return !!data;
    } catch (err) {
        console.error("[ChemoWeb Auth] Exception checking admin status:", err);
        return false;
    }
}

function updateUIWithUser(user, isAdmin) {
    const highlightSpan = document.querySelector('.greeting h1 .highlight');
    if (highlightSpan && !isTeacherPage) {
        const displayName = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0];
        highlightSpan.textContent = displayName + "!";
    }
}

function setupLogout() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) {
        console.warn('[ChemoWeb Auth] No .nav-links element found – logout button not added.');
        return;
    }
    const li = document.createElement('li');
    li.innerHTML = `
        <a href="#" class="nav-item" id="logout-btn" style="color: var(--accent-red);">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
            Logout
        </a>
    `;
    navLinks.appendChild(li);

    const logoutBtn = li.querySelector('#logout-btn');
    if (!logoutBtn) {
        console.warn('[ChemoWeb Auth] Logout button not found after insertion.');
        return;
    }
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        logoutBtn.style.pointerEvents = 'none';
        logoutBtn.style.opacity = '0.7';
        logoutBtn.textContent = 'Logging out...';

        try {
            await Promise.race([
                supabase.auth.signOut(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Sign out timeout')), 2000))
            ]);
        } catch (err) {
            console.warn('[ChemoWeb Auth] Supabase remote sign out failed or timed out:', err);
        } finally {
            for (let key in localStorage) {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            }

            sessionStorage.clear();

            window.location.href = 'login.html';
        }
    });
}
function setupLoginUI() {
    let currentMode = 'login';

    const authBox = document.getElementById('auth-box');
    const switchBtn = document.getElementById('auth-switch-btn');
    const switchText = document.getElementById('auth-switch-text');
    const submitBtn = document.getElementById('auth-submit-btn');
    const titleText = document.getElementById('auth-subtitle');
    const teacherLink = document.getElementById('teacher-portal-link');

    const form = document.getElementById('auth-form');
    const displayNameInput = document.getElementById('display-name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorDisplay = document.getElementById('auth-error');

    
    switchBtn.addEventListener('click', () => {
        if (currentMode === 'login' || currentMode === 'admin') {
            currentMode = 'signup';
            authBox.className = "auth-container mode-signup";
            switchText.textContent = "Already have an account?";
            switchBtn.textContent = "Sign in";
            submitBtn.textContent = "Sign Up";
            titleText.textContent = "Create an account to track your progress";
            displayNameInput.required = true;
        } else {
            currentMode = 'login';
            authBox.className = "auth-container mode-login";
            switchText.textContent = "Don't have an account?";
            switchBtn.textContent = "Sign up";
            submitBtn.textContent = "Sign In";
            titleText.textContent = "Sign in to continue your learning journey";
            displayNameInput.required = false;
        }
        errorDisplay.textContent = "";
    });

    if (teacherLink) {
        teacherLink.addEventListener('click', () => {
            currentMode = 'admin';
            authBox.className = "auth-container mode-admin";
            titleText.textContent = "Admin - Secure Login";
            submitBtn.textContent = "Authenticate as Teacher";
            switchText.textContent = "Return to Student View";
            switchBtn.textContent = "Go back";
            displayNameInput.required = false;
            errorDisplay.textContent = "";
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const displayName = displayNameInput.value.trim();

        console.log("[ChemoWeb Auth] Submit clicked in mode:", currentMode);
        if (currentMode === 'login' || currentMode === 'admin') {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) showError(error);
        } else {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: displayName
                    }
                }
            });
            if (error) {
                if (error.message && error.message.toLowerCase().includes('already registered')) {
                    console.warn('[ChemoWeb Auth] Email already registered, attempting sign‑in instead.');
                    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
                    if (signInErr) showError(signInErr);
                } else {
                    showError(error);
                }
            }
        }
    });

    document.getElementById('btn-google').addEventListener('click', async () => {
        console.log("[ChemoWeb Auth] Google Sign-In initiated...");
        const { error } = await supabase.auth.signInWithOAuth({ 
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) showError(error);
    });

    function showError(error) {
        let msg = error.message || "An error occurred";
        msg = msg.charAt(0).toUpperCase() + msg.slice(1);

        if (msg.includes("Invalid login credentials") && currentMode === 'admin') {
            msg += " (Make sure you have Signed Up)";
        }

        errorDisplay.textContent = msg;
        console.error("[ChemoWeb Auth] Login form error:", error);
    }
}
