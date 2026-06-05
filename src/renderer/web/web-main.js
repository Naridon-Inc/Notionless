import { fileSystem } from '../src/filesystem-proxy'
import { ensureAccount } from './account-gate'

/**
 * Web Platform Bootstrap
 *
 * On Web, there is no Electron main process or native filesystem.
 * This module creates a `window.api` mock that:
 *   - Uses localStorage for settings and virtual files
 *   - Uses IndexedDB for snapshots (binary blobs, survives quota better than localStorage)
 *   - Delegates cloud filesystem operations to the backend API
 *   - P2P (WebRTC) works natively in browsers via y-webrtc
 *   - E2EE (libsodium) works natively in browsers via libsodium-wrappers
 *   - IndexedDB persistence (y-indexeddb) works natively in browsers
 *
 * The private key for E2EE is stored in sessionStorage (cleared on tab close)
 * with an option to persist to IndexedDB (encrypted with the user's password).
 */

// IndexedDB helper for binary snapshot storage
const snapshotDB = {
    _db: null,
    async open() {
        if (this._db) return this._db
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('notionless-snapshots', 1)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains('snapshots')) {
                    db.createObjectStore('snapshots', { keyPath: ['docId', 'snapshotId'] })
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: ['docId', 'snapshotId'] })
                }
            }
            req.onsuccess = () => { this._db = req.result; resolve(this._db) }
            req.onerror = () => reject(req.error)
        })
    },
    async saveSnapshot(docId, metadata, data) {
        const db = await this.open()
        const tx = db.transaction(['snapshots', 'metadata'], 'readwrite')
        tx.objectStore('snapshots').put({ docId, snapshotId: metadata.id, data })
        tx.objectStore('metadata').put({ docId, snapshotId: metadata.id, ...metadata })
        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve
            tx.onerror = () => reject(tx.error)
        })
    },
    async loadSnapshot(docId, snapshotId) {
        const db = await this.open()
        const tx = db.transaction('snapshots', 'readonly')
        const req = tx.objectStore('snapshots').get([docId, snapshotId])
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result?.data || null)
            req.onerror = () => reject(req.error)
        })
    },
    async getHistory(docId) {
        const db = await this.open()
        const tx = db.transaction('metadata', 'readonly')
        const store = tx.objectStore('metadata')
        const results = []
        return new Promise((resolve, reject) => {
            const cursor = store.openCursor()
            cursor.onsuccess = () => {
                const c = cursor.result
                if (c) {
                    if (c.value.docId === docId) results.push(c.value)
                    c.continue()
                } else {
                    resolve(results)
                }
            }
            cursor.onerror = () => reject(cursor.error)
        })
    },
    async deleteSnapshot(docId, snapshotId) {
        const db = await this.open()
        const tx = db.transaction(['snapshots', 'metadata'], 'readwrite')
        tx.objectStore('snapshots').delete([docId, snapshotId])
        tx.objectStore('metadata').delete([docId, snapshotId])
    }
}

// Simple UUID v4 generator for web
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// Cloud doc registry (maps docId -> metadata, stored in localStorage)
const cloudDocRegistry = {
    _key: 'notionless_cloud_docs',
    _load() {
        try { return JSON.parse(localStorage.getItem(this._key) || '{}') } catch { return {} }
    },
    _save(data) {
        localStorage.setItem(this._key, JSON.stringify(data))
    },
    register(docId, path) {
        const data = this._load()
        data[docId] = { path, tags: ['cloud'], registeredAt: Date.now() }
        this._save(data)
    },
    getDocId(path) {
        if (path.startsWith('cloud:')) return path.replace('cloud:', '')
        const data = this._load()
        for (const [id, entry] of Object.entries(data)) {
            if (entry.path === path) return id
        }
        return null
    },
    getPath(docId) {
        const data = this._load()
        return data[docId]?.path || ('cloud:' + docId)
    },
    isCloudDoc(docId) {
        const data = this._load()
        return !!(data[docId]?.tags?.includes('cloud'))
    },
    tagCloud(docId) {
        const data = this._load()
        if (data[docId]) {
            data[docId].tags = data[docId].tags || []
            if (!data[docId].tags.includes('cloud')) data[docId].tags.push('cloud')
            this._save(data)
        }
    }
}

// 1. Comprehensive Mock for Web Parity
window.api = {
    getSettings: async (key) => {
        const val = localStorage.getItem('setting_' + key);
        if (val === null) return null;
        try { return JSON.parse(val); } catch { return val; }
    },
    setSettings: async (key, value) => {
        localStorage.setItem('setting_' + key, JSON.stringify(value));
    },
    getAppVersion: async () => {
        return localStorage.getItem('setting_appVersion') || '1.0.6';
    },
    pathExists: async (p) => {
        if (!p) return false;
        if (p.startsWith('cloud:') && !p.includes('/')) return true;
        if (p.startsWith('folder:') && !p.includes('/')) return true;

        if (p.startsWith('root/') || (p.includes('/') && p.endsWith('.md'))) {
            const knownFiles = JSON.parse(localStorage.getItem('setting_knownFiles') || '[]');
            if (knownFiles.includes(p)) return true;
        }

        return false;
    },
    basename: async (p) => {
        if (!p) return '';
        const parts = p.split('/');
        return parts[parts.length - 1];
    },
    dirname: async (p) => {
        if (!p) return 'root';
        const parts = p.split('/');
        if (parts.length <= 1) return 'root';
        return parts.slice(0, -1).join('/');
    },
    extname: async (p) => {
        if (!p) return '';
        const idx = p.lastIndexOf('.');
        return idx > -1 ? p.substring(idx) : '';
    },
    readFile: async (p) => {
        return localStorage.getItem('vfs_' + p) || '';
    },
    writeFile: async (p, content) => {
        localStorage.setItem('vfs_' + p, content);
        const knownFiles = JSON.parse(localStorage.getItem('setting_knownFiles') || '[]');
        if (!knownFiles.includes(p)) {
            knownFiles.push(p);
            localStorage.setItem('setting_knownFiles', JSON.stringify(knownFiles));
        }
    },
    ensureDir: async () => true,
    invoke: async (channel, ...args) => {
        // Document identity
        if (channel === 'fs:getDocId') {
            const path = args[0]
            // Check registry first
            const existing = cloudDocRegistry.getDocId(path)
            if (existing) return existing
            // For cloud: paths, extract the ID
            if (path && path.startsWith('cloud:')) return path.replace('cloud:', '').split(':')[0]
            // For local-style paths (e.g. root/Untitled_7.md), generate a UUID and register it
            if (path) {
                const newId = generateUUID()
                cloudDocRegistry.register(newId, path)
                return newId
            }
            return null
        }
        if (channel === 'fs:getPathByDocId') {
            return cloudDocRegistry.getPath(args[0])
        }
        if (channel === 'fs:isCloudDoc') {
            return cloudDocRegistry.isCloudDoc(args[0])
        }
        if (channel === 'fs:tagCloudDoc') {
            cloudDocRegistry.tagCloud(args[0])
            return true
        }
        if (channel === 'fs:registerCloudFile') {
            const { path, docId } = args[0]
            cloudDocRegistry.register(docId, path)
            return docId
        }

        // Path utilities
        if (channel === 'path:dirname') return args[0].split('/').slice(0, -1).join('/');
        if (channel === 'path:extname') {
            const p = args[0] || '';
            const idx = p.lastIndexOf('.');
            return idx > -1 ? p.substring(idx) : '';
        }

        // File operations
        if (channel === 'fs:rename') {
            const oldPath = args[0];
            const newPath = args[1];
            const content = localStorage.getItem('vfs_' + oldPath);
            if (content !== null) {
                localStorage.setItem('vfs_' + newPath, content);
                localStorage.removeItem('vfs_' + oldPath);
            }
            const knownFiles = JSON.parse(localStorage.getItem('setting_knownFiles') || '[]');
            const idx = knownFiles.indexOf(oldPath);
            if (idx > -1) {
                knownFiles[idx] = newPath;
                localStorage.setItem('setting_knownFiles', JSON.stringify(knownFiles));
            }
            return true;
        }
        if (channel === 'fs:delete') {
            const path = args[0];
            localStorage.removeItem('vfs_' + path);
            const knownFiles = JSON.parse(localStorage.getItem('setting_knownFiles') || '[]');
            const idx = knownFiles.indexOf(path);
            if (idx > -1) {
                knownFiles.splice(idx, 1);
                localStorage.setItem('setting_knownFiles', JSON.stringify(knownFiles));
            }
            return true;
        }
        if (channel === 'fs:writeFile') {
            const path = args[0];
            const content = args[1];
            localStorage.setItem('vfs_' + path, content);
            return true;
        }
        if (channel === 'fs:stat') {
            return null; // No physical filesystem on web
        }
        if (channel === 'fs:updateLinks') return true;

        // Snapshots — stored in IndexedDB for binary data
        if (channel === 'fs:saveSnapshot') {
            const { docId, metadata, data } = args[0]
            await snapshotDB.saveSnapshot(docId, metadata, data)
            return true
        }
        if (channel === 'fs:loadSnapshot') {
            const { docId, snapshotId } = args[0]
            return await snapshotDB.loadSnapshot(docId, snapshotId)
        }
        if (channel === 'fs:getHistory') {
            return await snapshotDB.getHistory(args[0])
        }
        if (channel === 'fs:deleteSnapshot') {
            const { docId, snapshotId } = args[0]
            await snapshotDB.deleteSnapshot(docId, snapshotId)
            return true
        }

        // Window
        if (channel === 'win:isFullScreen') return false;

        // Auth/Biometrics — not available on web
        if (channel === 'auth:can-prompt-touch-id') return false;
        if (channel === 'auth:prompt-touch-id') return false;
        if (channel === 'auth:secure-save') {
            // On web, use sessionStorage for sensitive data (cleared on tab close)
            const [key, value] = [args[0], args[1]]
            sessionStorage.setItem('secure_' + key, typeof value === 'string' ? value : JSON.stringify(value))
            return true
        }
        if (channel === 'auth:secure-load') {
            const val = sessionStorage.getItem('secure_' + args[0])
            if (val === null) return null
            try { return JSON.parse(val) } catch { return val }
        }

        return null;
    },
    showOpenDialog: async (options) => {
        // Web fallback: use native file picker via <input type="file">
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (options?.filters) {
                const exts = options.filters.flatMap(f => f.extensions || []);
                if (exts.length) input.accept = exts.map(e => '.' + e).join(',');
            }
            if (options?.properties?.includes('multiSelections')) input.multiple = true;
            input.onchange = () => {
                if (input.files && input.files.length > 0) {
                    const paths = Array.from(input.files).map(f => f.name);
                    resolve({ canceled: false, filePaths: paths, files: Array.from(input.files) });
                } else {
                    resolve({ canceled: true, filePaths: [] });
                }
            };
            input.oncancel = () => resolve({ canceled: true, filePaths: [] });
            input.click();
        });
    },
    onMessage: (cb) => {
        // No-op for web — no IPC messages from main process
    }
};

// 1b. Git Sync shim (web build)
//
// The Git Sync settings panel (team.js) and the background auto-sync loop
// (git-autosync.js) both look for `window.api.git`. On Electron this is a Node
// module in the main process; on web we back it with an in-browser engine
// (isomorphic-git + lightning-fs) loaded lazily so it doesn't bloat startup.
//
// `_gitDir()` in team.js derives the workspace from `knownProjects`; on web the
// notes live in the cloud, so we seed a virtual sentinel ('/repo', which the
// web git engine ignores) the first time so the panel becomes usable. The shim
// methods accept the `dir` argument for signature parity but ignore it.
if (typeof window !== 'undefined' && window.api && !window.api.git) {
    let _gitEnginePromise = null;
    const getEngine = () => {
        if (!_gitEnginePromise) _gitEnginePromise = import('../src/git-sync-web');
        return _gitEnginePromise.then((m) => m.gitApiShim || m.default);
    };

    // Collect the user's cloud markdown notes as { path, content } so the manual
    // "Sync Now" button (team.js) — which doesn't pass opts.files — still pushes
    // real notes. Returns null if collection isn't feasible (caller logs it).
    const collectCloudNotes = async () => {
        try {
            const fsp = fileSystem && fileSystem.current;
            if (!fsp || typeof fsp.getDirectoryTree !== 'function') return null;
            const files = [];
            const seen = new Set();
            const walk = async (nodePath) => {
                const tree = await fsp.getDirectoryTree(nodePath).catch(() => null);
                if (!tree || !Array.isArray(tree.children)) return;
                for (const child of tree.children) {
                    if (child.type === 'directory') {
                        if (!seen.has(child.path)) { seen.add(child.path); await walk(child.path); }
                    } else if (child.type === 'file') {
                        if (seen.has(child.path)) continue;
                        seen.add(child.path);
                        const content = await fsp.readFile(child.path).catch(() => '');
                        const rel = String(child.name || child.path).replace(/^(cloud:|folder:)/, '');
                        const safe = /\.md$/i.test(rel) ? rel : rel + '.md';
                        files.push({ path: safe, content: content || '' });
                    }
                }
            };
            await walk('root');
            return files;
        } catch (e) { return null; }
    };

    window.api.git = {
        status: async (dir) => (await getEngine()).status(dir),
        init: async (dir, remoteUrl) => (await getEngine()).init(dir, remoteUrl),
        setRemote: async (dir, url) => (await getEngine()).setRemote(dir, url),
        sync: async (dir, opts = {}) => {
            // If the caller didn't supply files, try to gather the cloud notes.
            if (!opts.files) {
                const files = await collectCloudNotes();
                if (files == null) console.warn('[git-web] could not collect cloud notes; syncing repo state only');
                else opts = { ...opts, files };
            }
            return (await getEngine()).sync(dir, opts);
        },
        clone: async (dir, url, token) => (await getEngine()).clone(dir, url, token),
    };

    // Seed a virtual workspace sentinel so the Git Sync panel is usable on web.
    try {
        if (localStorage.getItem('setting_knownProjects') === null) {
            localStorage.setItem('setting_knownProjects', JSON.stringify(['/repo']));
        }
    } catch (e) { /* ignore */ }
}

// 2. Initialize FS and Import Main App
async function bootstrap() {
    document.body.classList.add('is-web'); // Mark as web

    // This web build is the SELF-HOST surface: the same renderer the desktop app
    // ships, served by the relay container so a team can run Notionless on their
    // own domain (docs.example.com) with one `docker compose up`. It also doubles
    // as the local collaboration/sync test client during development.

    // Optional account gate. No-op unless this instance runs with accounts on
    // (relay ACCOUNTS_ENABLED); then it blocks here until the visitor signs in.
    // Notes stay E2EE regardless — this only controls instance access.
    await ensureAccount();

    // Clear skeleton if exists
    const app = document.getElementById('app');
    if (app) app.innerHTML = '';

    await fileSystem.init();
    await import('../src/main.js');
    console.log('[Web] Notionless Bootstrapped with Full Feature Parity');
}

bootstrap();
