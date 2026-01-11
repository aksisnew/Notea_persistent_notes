// --- DATABASE STATE MANAGEMENT ---
    if (!localStorage.getItem('db_list')) {
        localStorage.setItem('db_list', JSON.stringify(['NotepadDB']));
    }
    let DB_NAME = localStorage.getItem('active_db_name') || 'NotepadDB';
    const DB_VERSION = 1;
    let db;
    let currentFileId = null;
    let currentFolderId = 0; 
    let saveTimeout;
    let lastSavedSelection = null; 
    
    // Tab State
    let openTabs = []; 
    
    // Undo/Redo State (Per File)
    let fileHistory = {}; // { fileId: { past: [], future: [] } }
    
    let clipboard = { id: null, mode: null, isFolder: false, name: '' };
    const CONFIG = { historyEnabled: true };
    const expandedFolders = new Set();
    
    let searchState = { active: false, query: '', matches: [], currentIndex: -1, timer: null };

    // --- FUNCTION BAR REGISTRY ---
    const CMD_REGISTRY = {
        'SUM': (args) => args.reduce((a, b) => a + b, 0),
        'AVG': (args) => args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0,
        'MIN': (args) => Math.min(...args),
        'MAX': (args) => Math.max(...args),
        'COUNT': (args) => args.length,
        'UPPER': (str) => str.toUpperCase(),
        'LOWER': (str) => str.toLowerCase(),
        'LEN': (str) => str.length,
        'NOW': () => new Date().toLocaleString(),
        'ABS': (args) => Math.abs(args[0]),
'ROUND': (args) => Math.round(args[0]),
'FLOOR': (args) => Math.floor(args[0]),
'CEIL': (args) => Math.ceil(args[0]),
'RAND': () => Math.random(),
'RANDINT': (args) => {
  const min = args[0] || 0;
  const max = args[1] || 100;
  return Math.floor(Math.random() * (max - min + 1)) + min;
},
'TRIM': (str) => str.trim(),
'REVERSE': (str) => str.split('').reverse().join(''),
'WORDS': (str) => str.trim().split(/\s+/).length,
'CHARS': (str) => str.length,
'REPEAT': (args) => args[0].repeat(args[1] || 1),
'TODAY': () => new Date().toDateString(),
'TIME': () => new Date().toLocaleTimeString(),
'YEAR': () => new Date().getFullYear(),
'ADD_DAYS': (args) => {
  const d = new Date();
  d.setDate(d.getDate() + (args[0] || 0));
  return d.toDateString();
},
'MEAN': (args) => {
  if (!args.length) return 0;
  return args.reduce((a, b) => a + b, 0) / args.length;
},

'MEDIAN': (args) => {
  if (!args.length) return 0;
  const nums = [...args].sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 !== 0
    ? nums[mid]
    : (nums[mid - 1] + nums[mid]) / 2;
},

'MODE': (args) => {
  if (!args.length) return 0;
  const freq = {};
  let maxFreq = 0;
  let mode = args[0];

  args.forEach(n => {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > maxFreq) {
      maxFreq = freq[n];
      mode = n;
    }
  });
  return mode;
},

'RANGE': (args) => {
  if (!args.length) return 0;
  return Math.max(...args) - Math.min(...args);
},

'VARIANCE': (args) => {
  if (!args.length) return 0;
  const mean = args.reduce((a, b) => a + b, 0) / args.length;
  return args.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / args.length;
},

'STDDEV': (args) => {
  if (!args.length) return 0;
  const mean = args.reduce((a, b) => a + b, 0) / args.length;
  const variance = args.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / args.length;
  return Math.sqrt(variance);
},

'SUMSQ': (args) => {
  return args.reduce((a, b) => a + (b * b), 0);
},

'PROD': (args) => {
  if (!args.length) return 0;
  return args.reduce((a, b) => a * b, 1);
},

'PERCENT': (args) => {
  const value = args[0] || 0;
  const total = args[1] || 1;
  return (value / total) * 100;
},

'NORM': (args) => {
  const value = args[0] || 0;
  const min = args[1] || 0;
  const max = args[2] || 1;
  if (max === min) return 0;
  return (value - min) / (max - min);
},
'BIN': (args) => {
  const n = args[0] || 0;
  return Number(n).toString(2);
},

'OCT': (args) => {
  const n = args[0] || 0;
  return Number(n).toString(8);
},

'HEX': (args) => {
  const n = args[0] || 0;
  return Number(n).toString(16).toUpperCase();
},

'DEC': (args) => {
  const n = String(args[0] || 0);
  const base = args[1] || 10;
  return parseInt(n, base);
},
'DIST': (args) => {
  const x1 = args[0] || 0;
  const y1 = args[1] || 0;
  const x2 = args[2] || 0;
  const y2 = args[3] || 0;
  return Math.hypot(x2 - x1, y2 - y1);
},

'HYPOT': (args) => {
  const a = args[0] || 0;
  const b = args[1] || 0;
  return Math.hypot(a, b);
},

'CIRCLE_AREA': (args) => {
  const r = args[0] || 0;
  return Math.PI * r * r;
},

'CIRCLE_PERIM': (args) => {
  const r = args[0] || 0;
  return 2 * Math.PI * r;
},

'RECT_AREA': (args) => {
  const w = args[0] || 0;
  const h = args[1] || 0;
  return w * h;
},

'TRI_AREA': (args) => {
  const b = args[0] || 0;
  const h = args[1] || 0;
  return 0.5 * b * h;
},
'Q1': (args) => {
  if (!args.length) return 0;
  const n = [...args].sort((a, b) => a - b);
  const mid = Math.floor(n.length / 2);
  const lower = n.slice(0, mid);
  return lower.length % 2
    ? lower[Math.floor(lower.length / 2)]
    : (lower[lower.length / 2 - 1] + lower[lower.length / 2]) / 2;
},

'Q3': (args) => {
  if (!args.length) return 0;
  const n = [...args].sort((a, b) => a - b);
  const mid = Math.ceil(n.length / 2);
  const upper = n.slice(mid);
  return upper.length % 2
    ? upper[Math.floor(upper.length / 2)]
    : (upper[upper.length / 2 - 1] + upper[upper.length / 2]) / 2;
},

'IQR': (args) => {
  if (!args.length) return 0;
  const n = [...args].sort((a, b) => a - b);

  const q1 = (() => {
    const lower = n.slice(0, Math.floor(n.length / 2));
    return lower.length % 2
      ? lower[Math.floor(lower.length / 2)]
      : (lower[lower.length / 2 - 1] + lower[lower.length / 2]) / 2;
  })();

  const q3 = (() => {
    const upper = n.slice(Math.ceil(n.length / 2));
    return upper.length % 2
      ? upper[Math.floor(upper.length / 2)]
      : (upper[upper.length / 2 - 1] + upper[upper.length / 2]) / 2;
  })();

  return q3 - q1;
},
'FACT': (args) => {
  const n = Math.floor(args[0] || 0);
  if (n < 0) return 0;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
},

'PERM': (args) => {
  const n = Math.floor(args[0] || 0);
  const r = Math.floor(args[1] || 0);
  if (n < 0 || r < 0 || r > n) return 0;
  let res = 1;
  for (let i = n; i > n - r; i--) res *= i;
  return res;
},

'COMB': (args) => {
  const n = Math.floor(args[0] || 0);
  const r = Math.floor(args[1] || 0);
  if (n < 0 || r < 0 || r > n) return 0;
  let num = 1, den = 1;
  for (let i = 1; i <= r; i++) {
    num *= (n - r + i);
    den *= i;
  }
  return num / den;
},
'GCD': (args) => {
  let a = Math.abs(args[0] || 0);
  let b = Math.abs(args[1] || 0);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
},

'LCM': (args) => {
  const a = Math.abs(args[0] || 0);
  const b = Math.abs(args[1] || 0);
  if (a === 0 || b === 0) return 0;
  const gcd = ((x, y) => {
    while (y !== 0) [x, y] = [y, x % y];
    return x;
  })(a, b);
  return (a * b) / gcd;
},

'PRIME': (args) => {
  const n = Math.floor(args[0] || 0);
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}








    };

    // --- DB MANAGEMENT HELPERS ---
    function getDBList() {
        return JSON.parse(localStorage.getItem('db_list') || "['NotepadDB']");
    }

    function createNewDatabase(name) {
        if (!name) return;
        let list = getDBList();
        if (list.includes(name)) {
            alert("Database already exists!");
            return;
        }
        list.push(name);
        localStorage.setItem('db_list', JSON.stringify(list));
        switchDatabase(name);
    }

    function deleteDatabaseByName(name) {
        if (!confirm(`Are you sure you want to delete database "${name}" permanently?`)) return;
        
        let list = getDBList();
        list = list.filter(n => n !== name);
        if (list.length === 0) list.push('NotepadDB');
        localStorage.setItem('db_list', JSON.stringify(list));

        const req = indexedDB.deleteDatabase(name);
        
        req.onsuccess = () => {
            if (name === DB_NAME) {
                switchDatabase(list[0]);
            } else {
                renderDBSettings(); 
            }
        };
        req.onerror = () => alert("Error deleting database.");
    }

    function switchDatabase(name) {
        localStorage.setItem('active_db_name', name);
        localStorage.removeItem('last_open_file'); 
        localStorage.removeItem('open_tabs'); 
        location.reload(); 
    }

    // --- CORE DB FUNCTIONS ---
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
            initTabSystem(); 
            initActionBar(); // NEW: Inject Undo/Redo & Func Bar
            loadSettings();
            await renderFileTree();
            
            const storedTabs = localStorage.getItem('open_tabs');
            if (storedTabs) {
                openTabs = JSON.parse(storedTabs);
                renderTabs();
            }

            const lastId = localStorage.getItem('last_open_file');
            if(lastId) {
                const file = await getFile(lastId);
                if(file) loadFile(lastId);
                else if(openTabs.length > 0) loadFile(openTabs[0].id);
            }

            if(CONFIG.historyEnabled) pruneHistory();
            
            const qualityInput = document.getElementById('opt-quality');
            if(qualityInput) {
                qualityInput.oninput = function() {
                    document.getElementById('opt-qual-val').innerText = this.value;
                };
            }
        } catch(e) { console.error("Init failed", e); }
    };

    // --- NEW: ACTION BAR (UNDO/REDO + FUNCTIONS) ---
    function initActionBar() {
        const style = document.createElement('style');
        style.innerHTML = `
            #action-bar { display: flex; background: var(--bg-panel); border-bottom: 1px solid var(--border); height: 38px; align-items: center; padding: 0 10px; gap: 10px; }
            .ab-group { display: flex; align-items: center; gap: 2px; border-right: 1px solid var(--border); padding-right: 8px; }
            .ab-group:last-child { border: none; }
            .func-box { flex: 1; display: flex; gap: 5px; align-items: center; }
            #func-input { background: var(--bg-main); border: 1px solid var(--border); color: var(--text-main); border-radius: 4px; padding: 4px 8px; flex: 1; font-family: var(--font-mono); font-size: 0.85rem; }
            #func-result { background: var(--bg-hover); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; min-width: 60px; text-align: right; font-family: var(--font-mono); font-size: 0.85rem; overflow: hidden; white-space: nowrap; }
            .calc-btn { font-size: 0.8rem; padding: 2px 8px; height: 28px; }
        `;
        document.head.appendChild(style);

        const mainWrapper = document.getElementById('main-wrapper');
        const toolbar = document.getElementById('editor-toolbar');
        const actionBar = document.createElement('div');
        actionBar.id = 'action-bar';
        
        actionBar.innerHTML = `
            <div class="ab-group">
                <button class="btn btn-icon" onclick="performUndo()" title="Undo (Ctrl+Z)">↩</button>
                <button class="btn btn-icon" onclick="performRedo()" title="Redo (Ctrl+Y)">↪</button>
            </div>
            <div class="func-box">
                <span style="font-weight:bold; color:var(--accent); font-family:serif; font-style:italic;">fx</span>
                <input type="text" id="func-input" placeholder="e.g. SUM 4 + 6 or 10 * 5" onkeyup="if(event.key==='Enter') calculateExpression()">
                <div id="func-result" title="Result Preview"></div>
                <button class="btn calc-btn" onclick="calculateExpression()">Calculate</button>
                <button class="btn calc-btn btn-primary" onclick="insertCalculation()">+ Add</button>
            </div>
        `;

        if(mainWrapper && toolbar) {
            mainWrapper.insertBefore(actionBar, toolbar);
        }
    }

    // --- UNDO/REDO LOGIC ---
    function snapshotHistory(id, content) {
        if(!id) return;
        if(!fileHistory[id]) fileHistory[id] = { past: [], future: [] };
        
        const h = fileHistory[id];
        // Don't push if same as last
        if(h.past.length > 0 && h.past[h.past.length - 1] === content) return;
        
        h.past.push(content);
        if(h.past.length > 50) h.past.shift(); // Limit limit
        h.future = []; // Clear future on new change
    }

    function performUndo() {
        if(!currentFileId || !fileHistory[currentFileId]) return;
        const h = fileHistory[currentFileId];
        if(h.past.length < 2) return; // Need at least current state and one previous

        const current = h.past.pop();
        h.future.push(current);
        
        const previous = h.past[h.past.length - 1];
        document.getElementById('editor').innerHTML = previous;
        
        // Prevent auto-save loop triggering new snapshot
        isUndoing = true;
        handleEditorInput(true); // true = skip snapshot
        isUndoing = false;
    }

    function performRedo() {
        if(!currentFileId || !fileHistory[currentFileId]) return;
        const h = fileHistory[currentFileId];
        if(h.future.length === 0) return;

        const next = h.future.pop();
        h.past.push(next);
        document.getElementById('editor').innerHTML = next;

        isUndoing = true;
        handleEditorInput(true);
        isUndoing = false;
    }

    // --- FUNCTION BAR LOGIC ---
    function calculateExpression() {
        const input = document.getElementById('func-input').value.trim();
        const resBox = document.getElementById('func-result');
        
        if(!input) { resBox.innerText = ""; return; }

        let result = "Error";
        try {
            // Check for Command Format (CMD Arg1 Arg2...)
            const parts = input.split(/\s+|(?=[+*/()-])/).filter(x => x.trim() !== ''); // Basic tokenizer
            const cmd = parts[0].toUpperCase();

            if (CMD_REGISTRY[cmd]) {
                // It's a registered command
                // Extract args. If math, convert to numbers. If string, join remainder.
                const rawArgs = input.substring(cmd.length).trim();
                
                // Heuristic: Try to match numbers
                const numArgs = rawArgs.match(/-?\d+(\.\d+)?/g);
                
                if (['UPPER', 'LOWER', 'LEN'].includes(cmd)) {
                   result = CMD_REGISTRY[cmd](rawArgs);
                } else if(numArgs) {
                   const nums = numArgs.map(Number);
                   result = CMD_REGISTRY[cmd](nums);
                } else {
                   result = CMD_REGISTRY[cmd](rawArgs); // Fallback
                }
            } else {
                // Try Basic Math Evaluation
                // Security: Don't use raw eval. Use Function constructor with strict limits or regex validation
                if (/^[\d\s+\-*/.()]+$/.test(input)) {
                    // Safe math string
                    result = new Function('return ' + input)();
                } else {
                    result = "Invalid";
                }
            }
        } catch (e) {
            result = "Err";
        }
        
        // Round to 4 decimal places if number
        if(typeof result === 'number' && !Number.isInteger(result)) result = result.toFixed(4);
        
        resBox.innerText = result;
        resBox.setAttribute('data-val', result);
    }

    function insertCalculation() {
        const resBox = document.getElementById('func-result');
        const val = resBox.innerText;
        if(!val || val === "Error") return;
        
        const editor = document.getElementById('editor');
        editor.focus();
        
        // Insert at cursor
        if (!document.execCommand('insertText', false, val)) {
            editor.innerHTML += val;
        }
        
        handleEditorInput();
    }

    // --- TAB SYSTEM LOGIC & UI ---
    function initTabSystem() {
        const style = document.createElement('style');
        style.innerHTML = `
            #tab-strip { display: flex; background: var(--bg-main); border-bottom: 1px solid var(--border); overflow-x: auto; flex-shrink: 0; height: 35px; align-items: flex-end; }
            #tab-strip::-webkit-scrollbar { height: 4px; }
            .tab { 
                padding: 6px 12px; border-right: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; gap: 8px; 
                min-width: 120px; max-width: 200px; user-select: none; color: var(--text-muted); background: var(--bg-panel); height: 100%; font-size: 0.85rem;
                transition: background 0.1s;
            }
            .tab:hover { background: var(--bg-hover); }
            .tab.active { background: var(--bg-main); color: var(--text-main); border-top: 2px solid var(--accent); border-bottom: 1px solid var(--bg-main); font-weight: 500; }
            .tab-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
            .tab-close { opacity: 0.6; font-size: 14px; padding: 0 4px; border-radius: 4px; line-height: 1; }
            .tab-close:hover { opacity: 1; background: var(--danger); color: white; }
            .tab-add-btn { width: 35px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted); height: 100%; border-right: 1px solid var(--border); }
            .tab-add-btn:hover { background: var(--bg-hover); color: var(--text-main); }
        `;
        document.head.appendChild(style);

        const mainWrapper = document.getElementById('main-wrapper');
        const toolbar = document.getElementById('editor-toolbar');
        const tabStrip = document.createElement('div');
        tabStrip.id = 'tab-strip';
        if(mainWrapper && toolbar) {
            mainWrapper.insertBefore(tabStrip, toolbar);
        }
        renderTabs();
    }

    function renderTabs() {
        const strip = document.getElementById('tab-strip');
        if(!strip) return;
        strip.innerHTML = '';

        openTabs.forEach(tab => {
            const div = document.createElement('div');
            div.className = `tab ${currentFileId == tab.id ? 'active' : ''}`;
            div.onclick = () => loadFile(tab.id);
            div.title = tab.name;
            div.onmouseup = (e) => { if(e.button === 1) closeTab(e, tab.id); };

            div.innerHTML = `
                <span class="tab-name">${tab.name}</span>
                <span class="tab-close" onclick="closeTab(event, ${tab.id})">×</span>
            `;
            strip.appendChild(div);
            
            if(currentFileId == tab.id) {
                div.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });

        const addBtn = document.createElement('div');
        addBtn.className = 'tab-add-btn';
        addBtn.innerHTML = '+';
        addBtn.title = "New File";
        addBtn.onclick = () => createNewFile(currentFolderId);
        strip.appendChild(addBtn);

        localStorage.setItem('open_tabs', JSON.stringify(openTabs));
    }

    function closeTab(e, id) {
        if(e) e.stopPropagation();
        const index = openTabs.findIndex(t => t.id == id);
        if(index === -1) return;
        
        openTabs.splice(index, 1);
        // Clear history for closed tab to save memory
        if(fileHistory[id]) delete fileHistory[id];
        
        if (id == currentFileId) {
            if (openTabs.length > 0) {
                const newIndex = Math.max(0, index - 1);
                loadFile(openTabs[newIndex].id);
            } else {
                currentFileId = null;
                document.getElementById('editor').innerHTML = "";
                document.getElementById('encrypt-btn').classList.add('hidden');
                localStorage.removeItem('last_open_file');
                renderFileTree();
                updateStatusBar();
            }
        }
        renderTabs();
    }

    // --- FILE SYSTEM ---
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
        if(name && name !== file.name) { 
            file.name = name; 
            await saveFileRecord(file); 
            const tab = openTabs.find(t => t.id == id);
            if(tab) { tab.name = name; renderTabs(); }
            renderFileTree(); 
        }
    }

    async function deleteItem(id) {
        if(!confirm("Delete?")) return;
        closeModal();
        async function del(tid) {
            const files = await getAllFiles();
            const children = files.filter(f => f.parentId == tid);
            for(let c of children) await del(c.id);
            await deleteFileRecord(tid);
            if (openTabs.find(t => t.id == tid)) closeTab(null, tid);
        }
        await del(id);
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
        if (!file || file.isFolder) {
            if(!file && openTabs.find(t => t.id == id)) closeTab(null, id);
            return;
        }

        currentFileId = id;
        localStorage.setItem('last_open_file', id);
        
        if(!openTabs.find(t => t.id == id)) {
            openTabs.push({ id: id, name: file.name });
        }
        
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
            // Initialize history snapshot for this file if empty
            if(!fileHistory[id]) snapshotHistory(id, file.content || "");
        }
        
        renderTabs(); 
        renderFileTree(); 
        updateStatusBar();
    }

    let isUndoing = false;
    function handleEditorInput(skipSnapshot = false) {
        updateStatusBar();
        if(!currentFileId) return;
        document.getElementById('save-status').innerText = "Saving...";
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const file = await getFile(currentFileId);
            if(file && !file.isEncrypted) {
                let content = document.getElementById('editor').innerHTML;
                content = content.replace(/<span class="search-hit[^>]*>(.*?)<\/span>/g, '$1');

                file.content = content;
                await saveFileRecord(file);
                document.getElementById('save-status').innerText = "Saved";
                
                if(CONFIG.historyEnabled) logHistory(currentFileId, file.content);
                if(!skipSnapshot && !isUndoing) snapshotHistory(currentFileId, content);
            }
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
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    function insertImageAtCursor(base64) {
        const editor = document.getElementById('editor');
        editor.focus();
        
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
        if(!confirm("⚠️ DELETE CURRENT DATABASE DATA?")) return;
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
    
    // --- DB MANAGEMENT UI INJECTION ---
    async function openSettings() {
        const modalBody = document.querySelector('#settings-modal .modal-body');
        
        if(!document.getElementById('db-settings-container')) {
            const hr = modalBody.querySelector('hr');
            const container = document.createElement('div');
            container.id = 'db-settings-container';
            container.style.marginTop = '15px';
            container.style.marginBottom = '15px';
            container.style.borderTop = '1px solid var(--border)';
            container.style.paddingTop = '10px';
            
            if(hr) modalBody.insertBefore(container, hr);
            else modalBody.appendChild(container);
        }

        document.getElementById('settings-modal').style.display = 'flex';
        renderDBSettings();

        const txt = document.getElementById('storage-usage-text');
        const bar = document.getElementById('storage-bar');
        if (navigator.storage && navigator.storage.estimate) {
            const e = await navigator.storage.estimate();
            const u = (e.usage/(1024*1024)).toFixed(2);
            const p = e.quota ? Math.round((e.usage/e.quota)*100) : 1;
            txt.innerText = `${u} MB used`; bar.style.width = (p<1?1:p)+"%";
        } else txt.innerText = "Not supported";
    }

    function renderDBSettings() {
        const container = document.getElementById('db-settings-container');
        if(!container) return;
        container.innerHTML = '<h4>Database Management</h4>';
        
        const list = getDBList();
        
        list.forEach(dbName => {
            const row = document.createElement('div');
            row.className = 'flex-between';
            row.style.marginBottom = '5px';
            row.style.padding = '8px';
            row.style.border = '1px solid var(--border)';
            row.style.borderRadius = '4px';
            row.style.background = 'var(--bg-main)';
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = dbName;
            if(dbName === DB_NAME) {
                nameSpan.style.color = 'var(--success)';
                nameSpan.style.fontWeight = 'bold';
                nameSpan.innerText += ' (Active)';
            }
            
            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '5px';

            if(dbName !== DB_NAME) {
                const switchBtn = document.createElement('button');
                switchBtn.className = 'btn';
                switchBtn.innerText = 'Switch';
                switchBtn.onclick = () => switchDatabase(dbName);
                actions.appendChild(switchBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger';
                delBtn.innerText = '✖';
                delBtn.title = "Delete Database";
                delBtn.onclick = () => deleteDatabaseByName(dbName);
                actions.appendChild(delBtn);
            }

            row.appendChild(nameSpan);
            row.appendChild(actions);
            container.appendChild(row);
        });

        const newDiv = document.createElement('div');
        newDiv.style.marginTop = '10px';
        newDiv.style.display = 'flex';
        newDiv.style.gap = '5px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New DB Name...';
        input.className = 'input-text';
        input.style.flex = '1';

        const createBtn = document.createElement('button');
        createBtn.className = 'btn btn-primary';
        createBtn.innerText = '+ Create';
        createBtn.onclick = () => {
            if(input.value.trim()) createNewDatabase(input.value.trim());
        };

        newDiv.appendChild(input);
        newDiv.appendChild(createBtn);
        container.appendChild(newDiv);
    }

    function closeModal() { document.querySelectorAll('.modal-overlay').forEach(e=>e.style.display='none'); }
    window.onclick = e => { if(e.target.className.includes('modal-overlay')) closeModal(); };