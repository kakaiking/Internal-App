const API_URL = '/api/glossary';
let selectedLetter = 'All';

async function getTerms() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API failure');
        return await response.json();
    } catch (e) {
        console.error('Error fetching glossary:', e);
        return [];
    }
}

async function saveTerms(db) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });
        if (!response.ok) throw new Error('API failure');
        await render();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving glossary:', e);
        alert('Failed to save glossary term to database.');
    }
}

async function addTerm() {
    const term = document.getElementById('termWord').value.trim();
    const def = document.getElementById('termDefinition').value.trim();

    if (!term || !def) return alert('Define the term explicitly');

    const db = await getTerms();
    db.push({ id: Date.now(), term, def });
    await saveTerms(db);

    // Reset inputs
    document.getElementById('termWord').value = '';
    document.getElementById('termDefinition').value = '';

    closeGlossaryModal();
}

async function deleteTerm(id) {
    if (!confirm('Are you sure you want to remove this term from the glossary?')) return;
    const db = await getTerms();
    const filtered = db.filter(item => item.id !== id);
    await saveTerms(filtered);
}

function selectAlphabet(letter) {
    selectedLetter = letter;
    render();
}

async function renderAlphabetBar(list) {
    const bar = document.getElementById('alphabetBar');
    if (!bar) return;
    bar.innerHTML = '';

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const firstLetters = new Set(list.map(item => item.term.charAt(0).toUpperCase()));

    // Create 'All' button
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.style.cssText = `padding: 4px 8px; font-size: 0.75rem; width: auto; margin-bottom: 0; border-radius: 4px; ${selectedLetter === 'All' ? 'background:#2dd4bf; color:black;' : 'background:transparent; color:#9ca3af; border:none;'}`;
    allBtn.onclick = () => selectAlphabet('All');
    bar.appendChild(allBtn);

    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        const hasTerms = firstLetters.has(letter);
        
        let btnStyle = `padding: 4px 8px; font-size: 0.75rem; width: auto; margin-bottom: 0; border-radius: 4px; border: none;`;
        
        if (selectedLetter === letter) {
            btnStyle += `background:#2dd4bf; color:black; font-weight:bold;`;
        } else if (hasTerms) {
            btnStyle += `background:rgba(255,255,255,0.06); color:white; cursor:pointer;`;
        } else {
            btnStyle += `background:transparent; color:rgba(255,255,255,0.15); cursor:default; pointer-events:none;`;
        }
        
        btn.style.cssText = btnStyle;
        btn.onclick = () => selectAlphabet(letter);
        bar.appendChild(btn);
    });
}

async function render() {
    const container = document.getElementById('glossaryList');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#2dd4bf;"></i></div>';

    const list = await getTerms();
    
    // Sort terms alphabetically
    list.sort((a,b) => a.term.localeCompare(b.term));

    // Render A-Z Navigation Header
    renderAlphabetBar(list);

    // Apply Search Query & Alphabet Filters
    const query = document.getElementById('searchBar').value.toLowerCase();
    
    let filtered = list.filter(item => 
        item.term.toLowerCase().includes(query) || 
        item.def.toLowerCase().includes(query)
    );

    if (selectedLetter !== 'All') {
        filtered = filtered.filter(item => item.term.charAt(0).toUpperCase() === selectedLetter);
    }

    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-font"></i>
                <p>No terminology matches your current search or alphabet selections.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '16px';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <strong style="font-size: 1.15rem; color:#2dd4bf; font-family:'Outfit', sans-serif;"><i class="fa-solid fa-quote-left" style="font-size:0.8rem; opacity:0.5; margin-right:6px;"></i>${item.term}</strong>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteTerm(${item.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <p style="margin: 6px 0 0 0; color:#cbd5e1; line-height:1.5; font-size:0.92rem;">${item.def}</p>
        `;
        container.appendChild(card);
    });
}

// Modal handling functions
window.openGlossaryModal = function () {
    const modal = document.getElementById('glossaryModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeGlossaryModal = function () {
    const modal = document.getElementById('glossaryModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when user clicks outside the modal boundary box
window.onclick = function (event) {
    const modal = document.getElementById('glossaryModal');
    if (event.target === modal) {
        closeGlossaryModal();
    }
};

document.addEventListener('DOMContentLoaded', render);