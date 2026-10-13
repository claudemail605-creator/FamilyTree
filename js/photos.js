/* =====================================================================
   Photos (Phase 9) — Supabase Storage helper for the private "photos" bucket.
   Database rules this respects (database/03_storage.sql):
     * object keys are  <person-uuid>/<filename>   (bucket "photos" is private)
     * any ACTIVE signed-in user may read
     * only someone who may edit that person may upload / replace / remove
   Nothing here decides permissions — it only builds the requests. RLS rejects
   what isn't allowed and the error is passed back to the caller.
   Plain UMD-style global (window.Photos); no build step.
   ===================================================================== */

(function () {
  'use strict';

  const BUCKET = 'photos';
  const SIGNED_TTL = 60 * 60;           // signed URL lifetime, seconds
  const MAX_BYTES = 3 * 1024 * 1024;    // 3 MB per photo (Phase 4)
  const MAX_MB = MAX_BYTES / (1024 * 1024);
  const MAX_WIDTH = 800;                // photos are scaled down to this width before upload

  // MIME type -> extension, and the reverse for files the browser reports without a type.
  const TYPE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const EXT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

  const urlCache = new Map();   // object key -> { url, expiresAt }

  function client() { return (window.Auth && window.Auth.client) || null; }

  // Accept "<uuid>/<file>", "/<uuid>/<file>" or "photos/<uuid>/<file>" and return the
  // object key inside the bucket (the bucket name is not part of the key).
  function toKey(path) {
    if (!path) return null;
    let k = String(path).trim().replace(/^\/+/, '');
    if (k === BUCKET) return null;
    if (k.slice(0, BUCKET.length + 1) === BUCKET + '/') k = k.slice(BUCKET.length + 1);
    return k || null;
  }

  function extFor(file) {
    if (!file) return null;
    if (TYPE_EXT[file.type]) return TYPE_EXT[file.type];
    const m = /\.([a-z0-9]+)\s*$/i.exec(file.name || '');
    const e = m ? m[1].toLowerCase() : '';
    return (e && EXT_TYPE[e]) ? e : null;
  }

  // Returns { ok: true } or { ok: false, error: '<i18n key>', max? }.
  function validate(file) {
    if (!file) return { ok: false, error: 'photos.errNoFile' };
    if (!extFor(file)) return { ok: false, error: 'photos.errType' };
    if (file.size > MAX_BYTES) return { ok: false, error: 'photos.errSize', max: MAX_MB };
    return { ok: true };
  }

  // Object name inside the person's folder: <timestamp>.<ext>. A new name on every
  // upload keeps replaces from fighting the browser cache, and the timestamp makes the
  // folder sortable by when each photo was added.
  function objectName(ext, bump) {
    return (Date.now() + (bump || 0)) + '.' + ext;
  }

  // Scale a chosen photo down to at most MAX_WIDTH px wide before it leaves the browser.
  // Returns { blob, ext, type, name, width, height, changed } or null when the browser
  // cannot decode the file (the caller then falls back to uploading the original).
  async function prepareFile(file) {
    const ext = extFor(file);
    if (!ext || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch (e) {
      return null;
    }
    const scale = Math.min(1, MAX_WIDTH / (bmp.width || MAX_WIDTH));
    const w = Math.max(1, Math.round((bmp.width || MAX_WIDTH) * scale));
    const h = Math.max(1, Math.round((bmp.height || MAX_WIDTH) * scale));
    if (scale === 1) { bmp.close && bmp.close(); return null; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close && bmp.close(); return null; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const type = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise(res => canvas.toBlob(b => res(b), type, 0.9));
    if (!blob) return null;
    return { blob: blob, ext: ext, type: type, name: file.name || ('photo.' + ext), width: w, height: h, changed: true };
  }

  // Signed URL for displaying a stored photo; cached until shortly before it expires.
  // Returns null when there is nothing to show or we're not connected.
  async function signedUrl(path) {
    const key = toKey(path);
    const c = client();
    if (!key || !c) return null;
    const hit = urlCache.get(key);
    if (hit && hit.expiresAt > Date.now() + 30000) return hit.url;
    const { data, error } = await c.storage.from(BUCKET).createSignedUrl(key, SIGNED_TTL);
    if (error) throw error;
    const url = data && data.signedUrl;
    if (!url) return null;
    urlCache.set(key, { url: url, expiresAt: Date.now() + SIGNED_TTL * 1000 });
    return url;
  }

  function invalidate(path) {
    const key = toKey(path);
    if (key) urlCache.delete(key);
  }

  // Signed URLs for many objects in ONE request — the tree cards can hold hundreds of
  // photos, and one createSignedUrl per card would be hundreds of round trips.
  // Returns a Map of object key -> url, reusing anything still in the cache.
  async function signedUrls(paths) {
    const c = client();
    const out = new Map();
    if (!c || !paths || !paths.length) return out;
    const need = [];
    paths.forEach(p => {
      const key = toKey(p);
      if (!key) return;
      const hit = urlCache.get(key);
      if (hit && hit.expiresAt > Date.now() + 30000) out.set(key, hit.url);
      else if (need.indexOf(key) < 0) need.push(key);
    });
    if (!need.length) return out;
    const { data, error } = await c.storage.from(BUCKET).createSignedUrls(need, SIGNED_TTL);
    if (error) throw error;
    (data || []).forEach((item, i) => {
      if (!item || !item.signedUrl) return;
      const key = item.path || need[i];
      urlCache.set(key, { url: item.signedUrl, expiresAt: Date.now() + SIGNED_TTL * 1000 });
      out.set(key, item.signedUrl);
    });
    return out;
  }

  // Upload a photo for a person and point people.photo_path at it. Returns the new
  // object key. The previous object (if any) is deleted afterwards, best effort.
  // `file` is a File from an <input>, or the object returned by prepareFile().
  async function upload(personId, file, prevPath) {
    const c = client();
    if (!c) { const e = new Error('not connected'); e.code = 'photos.notConnected'; throw e; }
    const v = validate(file);
    if (!v.ok && !(file && file.blob)) { const e = new Error(v.error); e.code = v.error; e.max = v.max; throw e; }

    const payload = (file && file.blob) ? file.blob : file;
    const ext = (file && file.blob) ? (file.ext || extFor(file)) : extFor(file);
    const type = (file && file.blob) ? (file.type || EXT_TYPE[ext]) : (file.type || EXT_TYPE[ext]);
    let key = objectName(ext);
    let { error: upErr } = await c.storage.from(BUCKET).upload(personId + '/' + key, payload, {
      cacheControl: '3600',
      upsert: false,
      contentType: type
    });
    if (upErr) {
      // "already exists" only happens when two uploads land in the same millisecond.
      if (/exists/i.test(upErr.message || '')) {
        key = objectName(ext, 1);
        const retry = await c.storage.from(BUCKET).upload(personId + '/' + key, payload, {
          cacheControl: '3600',
          upsert: false,
          contentType: type
        });
        upErr = retry.error;
      }
      if (upErr) throw upErr;
    }
    key = personId + '/' + key;

    const { error: dbErr } = await c.from('people').update({ photo_path: key }).eq('id', personId);
    if (dbErr) {
      // Don't leave behind an object the database doesn't reference.
      try { await c.storage.from(BUCKET).remove([key]); } catch (e) { /* best effort */ }
      throw dbErr;
    }

    const prevKey = toKey(prevPath);
    if (prevKey && prevKey !== key) {
      try { await c.storage.from(BUCKET).remove([prevKey]); } catch (e) { /* best effort */ }
      invalidate(prevKey);
    }
    return key;
  }

  // Clear people.photo_path, then delete the object (best effort).
  async function remove(personId, path) {
    const c = client();
    if (!c) { const e = new Error('not connected'); e.code = 'photos.notConnected'; throw e; }
    const key = toKey(path);
    const { error: dbErr } = await c.from('people').update({ photo_path: '' }).eq('id', personId);
    if (dbErr) throw dbErr;
    if (key) {
      try {
        const { error: stErr } = await c.storage.from(BUCKET).remove([key]);
        if (stErr) console.warn('Photo object was not deleted:', stErr.message);
      } catch (e) { console.warn('Photo object was not deleted:', e && e.message); }
      invalidate(key);
    }
    return true;
  }

  window.Photos = {
    BUCKET: BUCKET,
    MAX_MB: MAX_MB,
    MAX_WIDTH: MAX_WIDTH,
    toKey: toKey,
    validate: validate,
    prepareFile: prepareFile,
    signedUrl: signedUrl,
    signedUrls: signedUrls,
    invalidate: invalidate,
    upload: upload,
    remove: remove,
    clearCache: function () { urlCache.clear(); }
  };
})();
