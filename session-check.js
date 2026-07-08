(function() {
    // Forward iframe errors to parent window console for debugging
    window.addEventListener('error', function(e) {
        const errorMsg = e.error ? (e.error.stack || e.error.message) : e.message;
        console.error("UNHANDLED ERROR IN IFRAME (" + window.location.pathname + "):", errorMsg);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME ERROR (" + window.location.pathname + "):", errorMsg);
        }
    });

    window.addEventListener('unhandledrejection', function(e) {
        const reason = e.reason ? (e.reason.stack || e.reason.message || e.reason) : "Unknown rejection";
        console.error("UNHANDLED PROMISE REJECTION IN IFRAME (" + window.location.pathname + "):", reason);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME PROMISE REJECTION (" + window.location.pathname + "):", reason);
        }
    });

    // Forward iframe console logs to parent window for debugging
    const originalConsoleError = console.error;
    console.error = function(...args) {
        originalConsoleError.apply(console, args);
        if (window.parent && window.parent !== window) {
            window.parent.console.error("IFRAME CONSOLE.ERROR (" + window.location.pathname + "):", ...args);
        }
    };

    const originalConsoleWarn = console.warn;
    console.warn = function(...args) {
        originalConsoleWarn.apply(console, args);
        if (window.parent && window.parent !== window) {
            window.parent.console.warn("IFRAME CONSOLE.WARN (" + window.location.pathname + "):", ...args);
        }
    };

    // If the path contains login.html or login-google.html, do nothing
    if (window.location.pathname.includes('login.html') || window.location.pathname.includes('login-google.html')) {
        return;
    }

    const sessionStr = localStorage.getItem('sessionUser');
    const now = Date.now();
    let session = null;
    if (sessionStr) {
        try {
            session = JSON.parse(sessionStr);
        } catch(e) {}
    }
    
    // If not logged in or expired, redirect to login
    if (!session || !session.expiry || now >= session.expiry) {
        localStorage.removeItem('sessionUser');
        const rootPath = window.location.pathname.toLowerCase().startsWith('/internal-app') ? '/Internal-App' : '';
        if (window.self !== window.top) {
            window.top.location.href = rootPath + '/login.html';
        } else {
            window.location.href = rootPath + '/login.html';
        }
        return;
    }

    window.getSessionActor = function() {
        return {
            name: session ? (session.name || 'A Team Member') : 'A Team Member',
            email: session ? (session.email || '') : ''
        };
    };
    
    // Pre-populate and secure author/name fields
    function secureNameFields() {
        const nameFields = [
            'termAuthor', 'editTermAuthor', // glossary
            'contribName', 'editSkillAuthor', // skills
            'mAuthor', 'editMAuthor', // meetings and messages
            'procAuthor', 'editProcAuthor', // procedures
            'editMsgAuthor', // messages edit
            'userId', // goals
            'evAuthor', 'editEvAuthor' // calendar
        ];
        
        nameFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Hide input and label
                el.style.setProperty('display', 'none', 'important');
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) {
                    label.style.setProperty('display', 'none', 'important');
                }
                
                // Define immutable value getter for the input element
                try {
                    Object.defineProperty(el, 'value', {
                        get: function() {
                            return session.name || 'Anonymous';
                        },
                        set: function(val) {
                            // Do nothing so it cannot be cleared
                        },
                        configurable: true
                    });
                } catch (e) {
                    el.value = session.name || 'Anonymous';
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            secureNameFields();
            observeChanges();
        });
    } else {
        secureNameFields();
        observeChanges();
    }

    function observeChanges() {
        const observer = new MutationObserver(secureNameFields);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
})();
