(function() {
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
