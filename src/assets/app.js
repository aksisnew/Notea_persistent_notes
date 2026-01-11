
    const DB_NAME = 'NotepadDB';
    const DB_VERSION = 1;
    let db;
    let currentFileId = null;
    let currentFolderId = 0; 
    let saveTimeout;
    let lastSavedSelection = null; 
    
    let clipboard = { id: null, mode: null, isFolder: false, name: '' };
    const CONFIG = { historyEnabled: true };
    const expandedFolders = new Set();
    
    let searchState = { active: false, query: '', matches: [], currentIndex: -1, timer: null };

    function initDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    const store = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('parentId', 'parentId', { unique: false });
                }
            };
            req.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            req.onerror = (e) => reject(e);
        });
    }

    function dbOp(mode, callback) {
        return new Promise((resolve, reject) => {
            if(!db) return reject("DB not init");
            const tx = db.transaction('files', mode);
            const store = tx.objectStore('files');
            const req = callback(store);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getAllFiles() { return dbOp('readonly', s => s.getAll()); }
    async function getFile(id) { return dbOp('readonly', s => s.get(Number(id))); }
    async function deleteFileRecord(id) { return dbOp('readwrite', s => s.delete(Number(id))); }
    async function saveFileRecord(file) {
        file.lastModified = Date.now();
        file.parentId = Number(file.parentId);
        return dbOp('readwrite', s => s.put(file));
    }

    window.onload = async () => {
        try {
            await initDB();
            loadSettings();
            await renderFileTree();
            const lastId = localStorage.getItem('last_open_file');
            if(lastId) loadFile(lastId);
            if(CONFIG.historyEnabled) pruneHistory();
            
            // Image Optimizer Listeners
            document.getElementById('opt-quality').oninput = function() {
                document.getElementById('opt-qual-val').innerText = this.value;
            };
        } catch(e) { console.error("Init failed", e); }
    };

    async function renderFileTree() {
        const files = await getAllFiles();
        const container = document.getElementById('file-tree');
        const query = document.getElementById('search-box').value.toLowerCase();
        
        container.innerHTML = '';

        if(query) {
            files.filter(f => f.name.toLowerCase().includes(query)).forEach(f => {
                container.appendChild(createNodeElement(f, 0, false));
            });
            return;
        }

        function buildTree(parentId, targetEl, level) {
            const children = files.filter(f => f.parentId == parentId).sort((a,b) => {
                if(a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
                return a.isFolder ? -1 : 1;
            });

            children.forEach(file => {
                const node = createNodeElement(file, level, true);
                targetEl.appendChild(node);
                if(file.isFolder) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = `node-indent ${expandedFolders.has(file.id) ? 'expanded' : ''}`;
                    targetEl.appendChild(childrenContainer);
                    buildTree(file.id, childrenContainer, level + 1);
                }
            });
        }
        buildTree(0, container, 0);
    }

    function createNodeElement(file, level, isTree) {
        const div = document.createElement('div');
        div.className = 'tree-node';
        const contentDiv = document.createElement('div');
        contentDiv.className = `tree-content ${currentFileId == file.id ? 'active' : ''} ${clipboard.id == file.id && clipboard.mode == 'cut' ? 'cut-mode' : ''}`;
        contentDiv.style.paddingLeft = '12px';

        const icon = file.isFolder ? '📁' : (file.isEncrypted ? '🔒' : '📄');
        const caret = file.isFolder ? `<span class="folder-caret ${expandedFolders.has(file.id)?'open':''}">▶</span>` : `<span style="width:14px"></span>`;

        contentDiv.innerHTML = `
            ${caret}
            <div class="node-label" onclick="handleNodeClick(${file.id}, ${file.isFolder})">
                <span class="icon">${icon}</span> ${file.name}
            </div>
            <div class="node-actions" onclick="showContext(event, ${file.id}, ${file.isFolder})">⋮</div>
        `;
        div.appendChild(contentDiv);
        return div;
    }

    function handleNodeClick(id, isFolder) {
        if(isFolder) {
            if(expandedFolders.has(id)) expandedFolders.delete(id);
            else expandedFolders.add(id);
            currentFolderId = id;
            renderFileTree();
        } else {
            loadFile(id);
        }
    }
    
    function resetTreeSelection() { currentFolderId = 0; renderFileTree(); }

    async function createNewFile(parentId = 0) {
        const name = prompt("New File Name:", "Untitled");
        if(!name) return;
        const id = await saveFileRecord({ parentId: parentId, name: name, content: "", isFolder: false, isEncrypted: false });
        await renderFileTree();
        loadFile(id);
    }

    async function createNewFolder(parentId = 0) {
        const name = prompt("New Folder Name:", "New Folder");
        if(!name) return;
        await saveFileRecord({ parentId: parentId, name: name, isFolder: true, isEncrypted: false });
        expandedFolders.add(parentId);
        await renderFileTree();
    }

    function showContext(e, id, isFolder) {
        e.stopPropagation();
        const modal = document.getElementById('generic-modal');
        document.getElementById('modal-title').innerText = isFolder ? "Folder Actions" : "File Actions";
        let html = `
            <button class="btn ctx-menu-btn" onclick="renameItem(${id})">✏️ Rename</button>
            <button class="btn ctx-menu-btn" onclick="setClipboard(${id}, ${isFolder}, 'cut')">✂️ Cut</button>
            <button class="btn ctx-menu-btn" onclick="setClipboard(${id}, ${isFolder}, 'copy')">📋 Copy</button>
            <button class="btn btn-danger ctx-menu-btn" onclick="deleteItem(${id})">🗑️ Delete</button>
        `;
        if(isFolder && clipboard.id) html += `<hr style="margin:5px 0"><button class="btn btn-primary ctx-menu-btn" onclick="pasteItem(${id})">⬇️ Paste Inside</button>`;
        if(!isFolder) html += `<button class="btn ctx-menu-btn" onclick="handleEncryptionOpt(${id})">🔐 Encrypt/Decrypt</button>`;
        
        document.getElementById('modal-content').innerHTML = html;
        document.getElementById('modal-actions').innerHTML = `<button class="btn" onclick="closeModal()">Cancel</button>`;
        modal.style.display = 'flex';
    }

    async function renameItem(id) {
        closeModal();
        const file = await getFile(id);
        const name = prompt("Rename:", file.name);
        if(name) { file.name = name; await saveFileRecord(file); renderFileTree(); }
    }

    async function deleteItem(id) {
        if(!confirm("Delete?")) return;
        closeModal();
        async function del(tid) {
            const files = await getAllFiles();
            const children = files.filter(f => f.parentId == tid);
            for(let c of children) await del(c.id);
            await deleteFileRecord(tid);
        }
        await del(id);
        if(currentFileId == id) { 
            document.getElementById('editor').innerHTML = ""; 
            currentFileId = null; 
            updateStatusBar();
        }
        renderFileTree();
    }

    function setClipboard(id, isFolder, mode) {
        closeModal();
        getFile(id).then(f => {
            clipboard = { id, isFolder, mode, name: f.name };
            document.getElementById('clipboard-bar').style.display = 'flex';
            document.getElementById('clipboard-text').innerText = `${mode=='cut'?'Move':'Copy'}: ${f.name}`;
            renderFileTree();
        });
    }

    function clearClipboard() {
        clipboard = { id: null, mode: null };
        document.getElementById('clipboard-bar').style.display = 'none';
        renderFileTree();
    }

    async function pasteItem(targetFolderId) {
        closeModal();
        if(!clipboard.id) return;
        if(clipboard.isFolder && clipboard.mode === 'cut') {
            if(targetFolderId == clipboard.id) return alert("Cannot paste into itself.");
            let parent = await getFile(targetFolderId);
            while(parent && parent.parentId !== 0) {
                if(parent.parentId == clipboard.id) return alert("Loop detected.");
                parent = await getFile(parent.parentId);
            }
        }
        if(clipboard.mode === 'cut') {
            const file = await getFile(clipboard.id);
            file.parentId = targetFolderId;
            await saveFileRecord(file);
        } else {
            await copyRecursive(clipboard.id, targetFolderId);
        }
        clearClipboard();
        expandedFolders.add(targetFolderId);
        renderFileTree();
    }

    async function copyRecursive(sid, tid) {
        const src = await getFile(sid);
        const newRecord = { ...src, parentId: tid, name: src.name + (tid == src.parentId ? " (Copy)" : "") };
        delete newRecord.id;
        const newId = await saveFileRecord(newRecord);
        if(src.isFolder) {
            const files = await getAllFiles();
            files.filter(f => f.parentId == sid).forEach(c => copyRecursive(c.id, newId));
        }
    }

    async function loadFile(id) {
        const file = await getFile(id);
        if (!file || file.isFolder) return;

        currentFileId = id;
        localStorage.setItem('last_open_file', id);
        closeFindBar();
        
        const editor = document.getElementById('editor');
        const encBtn = document.getElementById('encrypt-btn');
        encBtn.classList.remove('hidden');

        if (file.isEncrypted) {
            editor.contentEditable = "false";
            editor.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted); border:1px dashed var(--border);"><h3>🔒 Encrypted</h3><button class="btn btn-primary" style="margin-top:15px" onclick="handleEncryptionOpt(${id})">Unlock</button></div>`;
            encBtn.innerText = "🔓 Decrypt";
        } else {
            editor.contentEditable = "true";
            editor.innerHTML = file.content || "";
            encBtn.innerText = "🔒 Encrypt";
        }
        renderFileTree();
        updateStatusBar();
    }

    function handleEditorInput() {
        updateStatusBar();
        if(!currentFileId) return;
        document.getElementById('save-status').innerText = "Saving...";
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const file = await getFile(currentFileId);
            if(file.isEncrypted) return;

            // STRIP SEARCH HIGHLIGHTS
            let content = document.getElementById('editor').innerHTML;
            content = content.replace(/<span class="search-hit[^>]*>(.*?)<\/span>/g, '$1');

            file.content = content;
            await saveFileRecord(file);
            document.getElementById('save-status').innerText = "Saved";
            if(CONFIG.historyEnabled) logHistory(currentFileId, file.content);
        }, 800);
    }

    function execCmd(cmd, val) {
        document.execCommand(cmd, false, val);
        document.getElementById('editor').focus();
    }
    
    function insertCodeBlock() {
        const sel = window.getSelection();
        if(!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.innerText = sel.toString() || "Code block";
        pre.appendChild(code);
        range.deleteContents();
        range.insertNode(pre);
    }

    function insertTable() {
        const rows = prompt("Rows:", 3);
        const cols = prompt("Columns:", 3);
        if(!rows || !cols) return;
        let html = '<table style="width:100%; border-collapse:collapse; margin:15px 0;"><tbody>';
        for(let r=0; r<rows; r++) {
            html += '<tr>';
            for(let c=0; c<cols; c++) html += `<td style="border:1px solid var(--border); padding:8px;">Cell</td>`;
            html += '</tr>';
        }
        html += '</tbody></table><p><br></p>'; 
        document.getElementById('editor').focus();
        document.execCommand('insertHTML', false, html);
    }

    function insertFooter() {
        const editor = document.getElementById('editor');
        editor.focus();
        const html = `<div style="margin-top:2em; padding-top:1em; border-top:1px solid var(--border); color:var(--text-muted); font-size:0.85em;">Footer...</div><p><br></p>`;
        if (!document.execCommand('insertHTML', false, html)) {
            const sel = window.getSelection();
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                const div = document.createElement('div');
                div.innerHTML = html;
                range.deleteContents();
                while (div.firstChild) range.insertNode(div.firstChild);
                range.collapse(false);
            } else editor.insertAdjacentHTML('beforeend', html);
        }
        handleEditorInput();
    }

    function insertFontWeight(weight) {
        if(!weight) return;
        const sel = window.getSelection();
        if(!sel.rangeCount) return;
        const html = `<span style="font-weight:${weight}">${sel.toString()}</span>`;
        document.execCommand('insertHTML', false, html);
    }

    function toggleRightSidebar() {
        document.getElementById('right-sidebar').classList.toggle('open');
    }

    function saveSelectionState() {
        const sel = window.getSelection();
        if(sel.rangeCount > 0 && document.getElementById('editor').contains(sel.anchorNode)) {
            lastSavedSelection = sel.getRangeAt(0);
        }
    }

    function processAndInsertImage() {
        const input = document.getElementById('opt-img-input');
        const file = input.files[0];
        if(!file) return alert("Select an image first.");

        const maxWidth = parseInt(document.getElementById('opt-width').value) || 800;
        const quality = parseFloat(document.getElementById('opt-quality').value) || 0.7;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality);
                insertImageAtCursor(compressedBase64);
                
                // Clear input
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    function insertImageAtCursor(base64) {
        const editor = document.getElementById('editor');
        editor.focus();
        
        // Restore selection if saved
        if (lastSavedSelection) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(lastSavedSelection);
        }

        if(!document.execCommand('insertImage', false, base64)) {
            const img = document.createElement('img');
            img.src = base64;
            editor.appendChild(img);
        }
        handleEditorInput();
    }

    function triggerImageUpload() {
        saveSelectionState();
        document.getElementById('img-upload-input').click();
    }
    function handleImageFile(input) {
        const f = input.files[0];
        if(!f) return;
        const r = new FileReader();
        r.onload = (e) => insertImageAtCursor(e.target.result);
        r.readAsDataURL(f);
        input.value = ''; 
    }

    /* --- STATUS BAR --- */
    function updateStatusBar() {
        const editor = document.getElementById('editor');
        const text = editor.innerText || "";
        const html = editor.innerHTML || "";
        
        const charCount = text.length;
        const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
        
        // Estimate Size
        const bytes = new Blob([html]).size;
        let sizeStr = bytes + " B";
        if(bytes > 1024) sizeStr = (bytes/1024).toFixed(1) + " KB";
        if(bytes > 1024*1024) sizeStr = (bytes/(1024*1024)).toFixed(2) + " MB";

        document.getElementById('status-chars').innerText = `${charCount} Chars`;
        document.getElementById('status-words').innerText = `${wordCount} Words`;
        document.getElementById('status-size').innerText = sizeStr;
    }

    /* --- FIND --- */
    function toggleFindBar() {
        const bar = document.getElementById('find-bar');
        if (searchState.active) closeFindBar();
        else {
            searchState.active = true;
            bar.style.display = 'flex';
            document.getElementById('find-input').focus();
        }
    }

    function closeFindBar() {
        document.getElementById('find-bar').style.display = 'none';
        searchState.active = false;
        clearHighlights();
    }

    function handleFindInput(e) {
        if (e.key === 'Enter') { findNext(); return; }
        clearTimeout(searchState.timer);
        searchState.timer = setTimeout(() => performSearch(e.target.value), 300);
    }

    function clearHighlights() {
        const editor = document.getElementById('editor');
        editor.innerHTML = editor.innerHTML.replace(/<span class="search-hit[^>]*>(.*?)<\/span>/g, '$1');
    }

    function performSearch(query) {
        clearHighlights();
        if (!query) { document.getElementById('find-counts').innerText = "0/0"; return; }
        const editor = document.getElementById('editor');
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let n;
        while(n = walker.nextNode()) { if(n.nodeValue.match(regex)) nodes.push(n); }

        nodes.forEach(node => {
            const span = document.createElement('span');
            span.innerHTML = node.nodeValue
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(regex, '<span class="search-hit">$1</span>');
            const wrap = document.createElement('div');
            wrap.innerHTML = span.innerHTML;
            const p = node.parentNode;
            while(wrap.firstChild) p.insertBefore(wrap.firstChild, node);
            p.removeChild(node);
        });

        searchState.matches = Array.from(document.querySelectorAll('.search-hit'));
        document.getElementById('find-counts').innerText = searchState.matches.length > 0 ? `1/${searchState.matches.length}` : "0/0";
        if (searchState.matches.length > 0) highlightMatch(0);
    }

    function highlightMatch(i) {
        if (!searchState.matches.length) return;
        if (searchState.currentIndex >= 0 && searchState.matches[searchState.currentIndex]) 
            searchState.matches[searchState.currentIndex].classList.remove('active');
        searchState.currentIndex = i;
        const el = searchState.matches[i];
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('find-counts').innerText = `${i+1}/${searchState.matches.length}`;
    }

    function findNext() {
        if (!searchState.matches.length) return;
        let next = searchState.currentIndex + 1;
        if (next >= searchState.matches.length) next = 0;
        highlightMatch(next);
    }

    function findPrev() {
        if (!searchState.matches.length) return;
        let prev = searchState.currentIndex - 1;
        if (prev < 0) prev = searchState.matches.length - 1;
        highlightMatch(prev);
    }

    /* --- ENCRYPTION & UTIL --- */
    async function handleEncryptionOpt(id) {
        closeModal();
        const file = await getFile(id);
        if(file.isEncrypted) {
            const pass = prompt("Enter Password:");
            if(!pass) return;
            try {
                const data = JSON.parse(file.content);
                file.content = await decryptContent(data, pass);
                file.isEncrypted = false;
                await saveFileRecord(file);
                loadFile(id);
            } catch(e) { alert("Decryption Failed."); }
        } else {
            const pass = prompt("Set Password:");
            if(!pass) return;
            if(pass !== prompt("Confirm:")) return alert("Mismatch");
            try {
                clearHighlights(); 
                const data = await encryptContent(document.getElementById('editor').innerHTML, pass);
                file.content = JSON.stringify(data);
                file.isEncrypted = true;
                await saveFileRecord(file);
                loadFile(id);
            } catch(e) { alert("Encryption Failed"); }
        }
    }

    async function encryptContent(text, password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const k = await window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
        const key = await window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
        const c = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(text));
        return { c: bufToB64(c), iv: bufToB64(iv), s: bufToB64(salt) };
    }

    async function decryptContent(obj, password) {
        const k = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
        const key = await window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64ToBuf(obj.s), iterations: 100000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        const d = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(obj.iv) }, key, b64ToBuf(obj.c));
        return new TextDecoder().decode(d);
    }

    function bufToB64(b) { return window.btoa(String.fromCharCode(...new Uint8Array(b))); }
    function b64ToBuf(a) { return Uint8Array.from(atob(a), c => c.charCodeAt(0)).buffer; }

    /* --- COMMON --- */
    function loadSettings() {
        const s = localStorage.getItem('notepad_config');
        if(s) Object.assign(CONFIG, JSON.parse(s));
        document.getElementById('setting-history-enabled').checked = CONFIG.historyEnabled;
    }
    function toggleHistorySetting() {
        CONFIG.historyEnabled = document.getElementById('setting-history-enabled').checked;
        localStorage.setItem('notepad_config', JSON.stringify(CONFIG));
    }
    async function clearDatabase() {
        if(!confirm("⚠️ DELETE ALL DATA?")) return;
        db.close();
        indexedDB.deleteDatabase(DB_NAME).onsuccess = () => location.reload();
    }
    function logHistory(id, content) {
        let h = JSON.parse(localStorage.getItem('history_log') || '[]');
        h.push({ t: Date.now(), id: id, c: content });
        localStorage.setItem('history_log', JSON.stringify(h));
    }
    function pruneHistory() {
        let h = JSON.parse(localStorage.getItem('history_log') || '[]');
        const cutoff = Date.now() - (4 * 86400000);
        const clean = h.filter(x => x.t > cutoff);
        if(clean.length !== h.length) localStorage.setItem('history_log', JSON.stringify(clean));
    }
    function downloadHistory() {
        const b = new Blob([localStorage.getItem('history_log')||'[]'], {type: 'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `hist.json`; a.click();
    }
    function downloadCurrentFile() {
        if(!currentFileId) return;
        getFile(currentFileId).then(f => {
            if(f.isEncrypted) return alert("Decrypt first");
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([f.content], {type: 'text/html'}));
            a.download = f.name + ".html"; a.click();
        });
    }
    function handleFileUpload(input) {
        const f = input.files[0]; if(!f) return;
        const r = new FileReader();
        r.onload = async (e) => {
            await saveFileRecord({ parentId: currentFolderId || 0, name: f.name, content: e.target.result, isFolder: false, isEncrypted: false });
            renderFileTree();
        }; r.readAsText(f);
    }
    async function openSettings() {
        document.getElementById('settings-modal').style.display = 'flex';
        const txt = document.getElementById('storage-usage-text');
        const bar = document.getElementById('storage-bar');
        if (navigator.storage && navigator.storage.estimate) {
            const e = await navigator.storage.estimate();
            const u = (e.usage/(1024*1024)).toFixed(2);
            const p = e.quota ? Math.round((e.usage/e.quota)*100) : 1;
            txt.innerText = `${u} MB used`; bar.style.width = (p<1?1:p)+"%";
        } else txt.innerText = "Not supported";
    }
    function closeModal() { document.querySelectorAll('.modal-overlay').forEach(e=>e.style.display='none'); }
    window.onclick = e => { if(e.target.className.includes('modal-overlay')) closeModal(); };

